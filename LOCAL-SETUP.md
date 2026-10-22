# 本地部署

源码目录：`F:\SEESEA\充电宝\agent-storyboard`。

## 启动与数据

在 PowerShell 运行 `./start-local.ps1`，或在本目录运行 `npm start`。
打开 http://127.0.0.1:43218 。前台启动时按 Ctrl+C 停止。
新建项目时可填写已有项目文件夹的绝对路径。该项目的 project.json、DESIGN.md、media（含配音）和 generation 均保存在 `<项目文件夹>/.agent-storyboard/<项目ID>/`，避免与原有脚本或其他分镜混用。
中央 `data/projects.json` 只登记项目目录等索引信息；备份时需要同时保留中央索引及各项目的 .agent-storyboard 目录。
留空时兼容原有存储方式，项目及素材仍保存在本目录 `data/`。旧项目不自动迁移。项目建立后不能通过普通编辑更改位置，以防路径改动导致数据分散。
删除分镜项目仅清理该项目ID对应的数据子目录，不删除外层项目文件夹或其他脚本文件。
通过 MCP 创建时传入 `projectFolder`，例如 `F:/视频项目/充电宝广告`；路径需预先存在且运行服务的账号拥有写入权限。项目目录在同一台电脑上，不能填写其他电脑的浏览器本地路径。
部署过程中后台启动的日志存放在 `local-run/stdout.log` 和 `local-run/stderr.log`。
未设置开机自启，未调用真实生图或配音服务。

## 修改记录

这是从上游 main ZIP 创建的本地独立 Git 仓库，基线为 package.json 0.8.0，未保留原仓库提交历史。
`upstream` 指向 https://github.com/Yuuhann1999/agent-storyboard.git 。该 remote 仅作为来源记录；后续更新应在分支中比较合并，不要直接覆盖本地修改。
代码已同步到 https://github.com/hengji123/agent-storyboard ，配置为 origin。项目数据和运行日志没有上传。

日常修改后运行 `npm run check` 和适用测试，再提交 Git。
根目录服务与 public 是开发入口；功能变更需同步插件 app 副本，`tests/plugin-parity.test.mjs` 检查一致性。
已有 Windows 测试结果为 27 通过、5 失败、1 跳过，详见项目分析中的技术报告；尚未修复上游测试夹具。

## MCP 接入

已通过 `codex mcp add agent-storyboard-local` 注册到当前 CODEX_HOME 的全局配置，使用本地 Node 绝对路径和修改过的 MCP 源码。原配置已在原目录留有带时间戳的备份。
全局连接设置 AGENT_STORYBOARD_DATA_DIR 和 AGENT_STORYBOARD_PORT；服务未运行时，MCP 可以按原项目逻辑启动插件内同步的服务副本。已有服务运行时直接连接。
已验证 initialize、tools/list 和 list_storyboard_projects，15 个工具可用，创建工具包含 projectFolder 参数。验证未修改任何项目。
重新打开 Codex 后在新聊天检查 open_storyboard、create_storyboard_project 等工具是否可见。旧聊天中的工具列表不会因配置写入而自动保证更新。
`mcp.local.example.json` 仍保留为通用 JSON 客户端配置示例；该示例显式指定服务 URL，使用时需先启动 HTTP 服务。Codex 实际配置使用 TOML，不要把此 JSON 直接粘贴进 TOML。

## 自有 Skill 配合入口

当前只准备部署与配置入口，尚未增加新的生成器类型。

1. storyboard-generator 产出台词、画面、时长，映射到 dialogue、visualPrompt、duration。
2. seedance-director 的角色、场景、道具、首尾帧、连续性台账仍保存在原有资产目录，通过 notes 记录引用；当前表结构没有独立资产实体。
3. dreamina-canvas-cli 生成素材后，可经 MCP 素材完成接口回填；正式队列支持需要增加生成器枚举与对应路由，不能把即梦任务冒充现有生成器。
4. 现有 Skill 的生成前审核与积分确认继续生效。

下一阶段建议先使用少量真实分镜验证字段映射，再开发即梦适配。
