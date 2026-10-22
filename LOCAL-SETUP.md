# 本地部署

源码目录：`F:\SEESEA\充电宝\agent-storyboard`。

## 启动与数据

在 PowerShell 运行 `./start-local.ps1`，或在本目录运行 `npm start`。
打开 http://127.0.0.1:43218 。前台启动时按 Ctrl+C 停止。
项目及素材保存在本目录 `data/`，已由原项目忽略规则排除在 Git 外。备份时请单独备份整个 data 目录。
部署过程中后台启动的日志存放在 `local-run/stdout.log` 和 `local-run/stderr.log`。
未设置开机自启，未调用真实生图或配音服务。

## 修改记录

这是从上游 main ZIP 创建的本地独立 Git 仓库，基线为 package.json 0.8.0，未保留原仓库提交历史。
`upstream` 指向 https://github.com/Yuuhann1999/agent-storyboard.git 。该 remote 仅作为来源记录；后续更新应在分支中比较合并，不要直接覆盖本地修改。
没有创建 GitHub 云端仓库，也没有上传代码或项目数据。

日常修改后运行 `npm run check` 和适用测试，再提交 Git。
根目录服务与 public 是开发入口；功能变更需同步插件 app 副本，`tests/plugin-parity.test.mjs` 检查一致性。
已有 Windows 测试结果为 27 通过、5 失败、1 跳过，详见项目分析中的技术报告；尚未修复上游测试夹具。

## MCP 接入

`mcp.local.example.json` 提供指向本地源码的配置片段，供支持 MCP 的客户端合并使用；尚未写入全局客户端配置。
该配置让 MCP 连接此部署的 HTTP 服务，因此先启动本地服务。
导入配置并重新加载客户端后，应检查 open_storyboard、create_storyboard_project 等工具是否可见。

## 自有 Skill 配合入口

当前只准备部署与配置入口，尚未增加新的生成器类型。

1. storyboard-generator 产出台词、画面、时长，映射到 dialogue、visualPrompt、duration。
2. seedance-director 的角色、场景、道具、首尾帧、连续性台账仍保存在原有资产目录，通过 notes 记录引用；当前表结构没有独立资产实体。
3. dreamina-canvas-cli 生成素材后，可经 MCP 素材完成接口回填；正式队列支持需要增加生成器枚举与对应路由，不能把即梦任务冒充现有生成器。
4. 现有 Skill 的生成前审核与积分确认继续生效。

下一阶段建议先使用少量真实分镜验证字段映射，再开发即梦适配。
