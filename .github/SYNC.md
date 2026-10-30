# 源码同步与 bookis 自动部署

## 已确认的方案

- 真正上游：`https://github.com/cmliu/edgetunnel`，分支 `main`。
- 本仓库保留提交历史，通过新提交同步源码；不强推，也不导入上游 `.github/`。
- 目标：现有 Cloudflare Pages 项目 `bookis`、生产分支 `main`。
- 本仓库 `.github/` 中的部署流程、测试和本说明独立维护。
- 删除旧的打包工作流；上游已删除的旧文件（包括 `worker.zip`）会一并移除。

## 执行方式

打开本仓库 **Actions → Sync upstream and deploy bookis → Run workflow → main**。

工作流在手动运行、`main` 收到推送，以及每天北京时间约 **04:23** 时运行。
GitHub 定时任务可能延迟；公开仓库长期（60 天）无活动时，定时任务可能被停用，需要在 Actions 中重新启用。

1. 执行自动化测试。
2. 获取上游 main，保留本仓库 `.github/`，同步其他源码并检查 JavaScript 语法。
3. 有源码变化才创建新提交并推送。同步和部署在同一次工作流完成，不依赖 bot 提交触发另一条工作流。
4. 使用已保存的 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID` 读取 Pages 项目，记录原部署 ID 和配置项名称，不打印配置值。
5. 若生产部署的提交已经与本仓库一致，则跳过发布。部署失败后可以重新运行，即使源码没有新变化也会重试尚未发布的提交。
6. 从隔离目录上传 `_worker.js`，不使用上游面向 Workers 的 `wrangler.toml`，不写入生产环境变量或 KV 绑定。
7. 发布后检查生产提交和生产配置指纹。检查失败会使 Actions 标红，但不会擅自修改配置或删除数据。

## 安全与回滚

- Actions 的运行摘要记录发布前的部署 ID，可在 Cloudflare `bookis → 部署` 中找到旧生产部署并执行回滚。
- 若需暂时保持旧版，先在 GitHub Actions 中禁用此工作流，避免定时任务再次发布新版。
- 回滚代码不等于回滚 KV 数据；本流程不备份或修改 KV 内容。
- 个人配置放在 Cloudflare 环境变量 / 管理后台中，不能直接修改上游源码文件：下一次同步会以原作者版本为准。
- `.github/` 不接受上游自动覆盖，防止上游工作流获得本仓库的部署密钥。
- 本流程信任 `cmliu/edgetunnel:main` 的应用代码；语法检查不等于完整安全审计或代理协议测试。
- 当前上游可用单个 `_worker.js` 部署；若将来引入其他运行时文件，需调整上传目录。
- 本方案不会提高 Cloudflare 免费账户每日请求限额。

## 本地检查

```sh
node --test .github/tests/*.test.mjs
node --check --input-type=module < _worker.js
```
