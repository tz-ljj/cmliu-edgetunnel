import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { inspectProject } from '../scripts/pages-project.mjs';

const syncScript = resolve('.github/scripts/sync-upstream.sh').replaceAll('\\', '/');

test('sync replaces source, removes obsolete files, and preserves only our automation', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'edgetunnel-sync-'));
  const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: 'pipe' }).trim();
  const write = (path, text) => {
    mkdirSync(join(cwd, path, '..'), { recursive: true });
    writeFileSync(join(cwd, path), text);
  };
  const commit = (message) => { git('add', '.'); git('commit', '-m', message); };
  const sync = () => execFileSync('bash', [syncScript, 'upstream'], { cwd, stdio: 'pipe' });
  try {
    git('init', '-b', 'main');
    git('config', 'user.name', 'Sync test');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'core.autocrlf', 'false');
    write('_worker.js', 'export default {};\n');
    write('worker.zip', 'obsolete archive');
    write('.github/workflows/ours.yml', 'trusted automation');
    commit('old source');
    git('checkout', '-b', 'upstream');
    write('_worker.js', 'export default { fetch() {} };\n');
    write('CHANGELOG', 'new release');
    write('.github/workflows/ours.yml', 'untrusted replacement');
    write('.github/workflows/foreign.yml', 'must not execute');
    git('rm', 'worker.zip');
    commit('upstream release');
    git('checkout', 'main');
    sync();
    assert.equal(readFileSync(join(cwd, '_worker.js'), 'utf8'), 'export default { fetch() {} };\n');
    assert.equal(readFileSync(join(cwd, 'CHANGELOG'), 'utf8'), 'new release');
    assert.equal(readFileSync(join(cwd, '.github/workflows/ours.yml'), 'utf8'), 'trusted automation');
    assert.equal(existsSync(join(cwd, '.github/workflows/foreign.yml')), false);
    assert.equal(existsSync(join(cwd, 'worker.zip')), false);
    commit('synchronized');
    sync();
    assert.equal(git('status', '--porcelain'), '');
    write('_worker.js', 'uncommitted local change');
    assert.throws(sync);
    assert.equal(readFileSync(join(cwd, '_worker.js'), 'utf8'), 'uncommitted local change');
    git('restore', '_worker.js');
    git('checkout', 'upstream');
    git('rm', '_worker.js');
    commit('missing entrypoint');
    git('checkout', 'main');
    assert.throws(sync);
    assert.equal(git('status', '--porcelain'), '');
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
});

const project = () => ({ success: true, result: {
  name: 'bookis', production_branch: 'main',
  deployment_configs: { production: {
    env_vars: { ADMIN: { type: 'secret_text', value: 'test-only-secret' } },
    kv_namespaces: { KV: { namespace_id: 'test-only-namespace' } },
  } },
  canonical_deployment: { id: 'previous-deployment', deployment_trigger: { metadata: { commit_hash: 'abc' } } },
} });

test('configuration inspection omits secrets and ignores object-key ordering', () => {
  const body = project();
  const result = inspectProject(body);
  assert.deepEqual(result.environmentNames, ['ADMIN']);
  assert.deepEqual(result.kvNames, ['KV']);
  assert.equal(result.deployment, 'previous-deployment');
  assert.equal(result.commit, 'abc');
  assert.equal(JSON.stringify(result).includes('test-only-secret'), false);
  assert.equal(JSON.stringify(result).includes('test-only-namespace'), false);
  const config = body.result.deployment_configs.production;
  body.result.deployment_configs.production = { kv_namespaces: config.kv_namespaces, env_vars: config.env_vars };
  assert.equal(inspectProject(body).configuration, result.configuration);
  config.env_vars.ADMIN.value = 'changed-secret';
  assert.notEqual(inspectProject(body).configuration, result.configuration);
});

test('wrong project, wrong production branch, API errors, and missing config fail closed', () => {
  for (const change of [
    b => { b.success = false; },
    b => { b.result.name = 'another-project'; },
    b => { b.result.production_branch = 'preview'; },
    b => { delete b.result.deployment_configs; },
  ]) {
    const body = project();
    change(body);
    assert.throws(() => inspectProject(body));
  }
});
