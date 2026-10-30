import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function inspectProject(body) {
  assert.equal(body.success, true, 'Cloudflare did not return a successful response');
  const project = body.result;
  assert.equal(project?.name, 'bookis', 'Wrong Pages project');
  assert.equal(project.production_branch, 'main', 'Unexpected production branch; refusing to change it');
  const config = project.deployment_configs?.production;
  assert.ok(config && typeof config === 'object', 'Missing production configuration');
  const sortedConfig = JSON.stringify(config, (_, value) =>
    value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value);
  return {
    configuration: createHash('sha256').update(sortedConfig).digest('hex'),
    deployment: project.canonical_deployment?.id ?? 'none',
    commit: project.canonical_deployment?.deployment_trigger?.metadata?.commit_hash ?? '',
    environmentNames: Object.keys(config.env_vars ?? {}).sort(),
    kvNames: Object.keys(config.kv_namespaces ?? {}).sort(),
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: account,
    TARGET_COMMIT: target, EXPECTED_CONFIGURATION: expected } = process.env;
  assert.ok(token, 'CLOUDFLARE_API_TOKEN is missing');
  assert.match(account ?? '', /^[a-f0-9]{32}$/, 'Invalid CLOUDFLARE_ACCOUNT_ID');
  assert.match(target ?? '', /^[a-f0-9]{40}$/, 'Invalid target commit');
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/bookis`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(30000),
  });
  assert.ok(response.ok, `Cloudflare API returned HTTP ${response.status}`);
  const info = inspectProject(await response.json());
  if (expected) {
    assert.equal(info.configuration, expected, 'Production configuration changed: review before continuing');
    assert.equal(info.commit, target, 'Production deployment does not match the synchronized commit');
  }
  // Do not print API response bodies: production configuration can contain secrets.
  console.log(JSON.stringify({ deployment: info.deployment, commit: info.commit,
    environmentNames: info.environmentNames, kvNames: info.kvNames }, null, 2));
  appendFileSync(process.env.GITHUB_OUTPUT,
    `configuration=${info.configuration}\ndeploy_needed=${info.commit !== target}\n`);
  appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `### ${expected ? 'Verified production' : 'Production before deployment'}\n` +
    `- Deployment: \`${info.deployment}\`\n- Commit: \`${info.commit || 'not recorded'}\`\n` +
    `- Environment variables (names only): ${info.environmentNames.join(', ') || 'none'}\n` +
    `- KV bindings (names only): ${info.kvNames.join(', ') || 'none'}\n` +
    (expected ? '- Production configuration unchanged.\n' : '- Keep this deployment ID for rollback.\n'));
}
