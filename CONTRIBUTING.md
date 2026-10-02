# 开发与验证

本 fork 基于 MichengAI/dsh-codex-pet 0.1.12，新增 Windows 原生浮窗。上游历史和许可保留。

使用 `npm ci --ignore-scripts` 安装开发依赖，运行 `npm run verify`、`npm run smoke`、`npm run smoke:desktop` 和 `node scripts/smoke-desktop-client.mjs`。Windows 浏览器烟测默认使用 Edge。测试只在独立夹具中验证会话、审批和窗口，不使用日常 Profile。

修改前端或宿主源代码后重新构建并提交 `lib/` 和 `native/electron/renderer.js`；分发前检查 `npm pack --dry-run --ignore-scripts`。发行内容包括编译后的宿主/客户端、独立 Electron helper、九只原始图集、Skill 与许可。Sharp 仅供开发烟测生成夹具使用，不进入运行依赖；生产图集由现有浏览器 Canvas 解码，插件安装阶段不编译源码、不下载 Electron。浮窗复用共享 Electron 或用户配置的可执行文件；不可引用其他插件的应用代码。父子进程通信使用认证的本机连接与 stdout 事件。

浮窗只能处理原始通知中带身份的操作，不能替用户批准请求或修改宿主权限。服务卸载、页面断线与父进程退出必须清理所有自有窗口。保留页内回退。

本 fork 通过 GitHub 推送维护，Actions 已禁用，不创建 Release 或 npm 发布，不要求上游 CI 发布门禁。
