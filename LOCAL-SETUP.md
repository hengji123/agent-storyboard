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
当前 Windows 完整测试为 36 通过、0 失败、1 项因缺少 FFmpeg 跳过。Codex 模拟程序已改为通过 Node 显式启动，修复原有 Unix 脚本夹具的跨平台问题。另已在无头浏览器中验证批量静态图、批量调度图、单镜更新、自动回填与宽窄屏布局；真实生图质量和额度需以用户实际任务为准。

## MCP 接入

已通过 `codex mcp add agent-storyboard-local` 注册到当前 CODEX_HOME 的全局配置，使用本地 Node 绝对路径和修改过的 MCP 源码。原配置已在原目录留有带时间戳的备份。
全局连接设置 AGENT_STORYBOARD_DATA_DIR 和 AGENT_STORYBOARD_PORT；服务未运行时，MCP 可以按原项目逻辑启动插件内同步的服务副本。已有服务运行时直接连接。
已验证 initialize、tools/list 和 list_storyboard_projects，15 个工具可用，创建工具包含 projectFolder 参数。验证未修改任何项目。
重新打开 Codex 后在新聊天检查 open_storyboard、create_storyboard_project 等工具是否可见。旧聊天中的工具列表不会因配置写入而自动保证更新。
`mcp.local.example.json` 仍保留为通用 JSON 客户端配置示例；该示例显式指定服务 URL，使用时需先启动 HTTP 服务。Codex 实际配置使用 TOML，不要把此 JSON 直接粘贴进 TOML。

## 配音服务选择

在项目「脚本」页面展开「生成新版本」，配置此工作台共用的配音服务：

- 本地 Yovoice：默认地址 `http://127.0.0.1:8080/v1`。在 Yovoice 设置开启本机接口，将访问令牌粘贴进分镜台，保存并测试连接。
- 远程 Yovoice API：使用相同的 `/v1` 协议，填写 HTTPS 地址及对应访问令牌。暂未接入其他厂商的 TTS API 协议。
- VoxCPM 在线服务：保留原 Gradio 调用方式。

测试连接会读取已安装模型和已有音色，可选填模型 ID、音色 ID及预设说话人。留空模型时使用服务默认模型。音色 ID 优先；未填写音色 ID 时，上传的参考音频会导入 Yovoice 的音色库。不同模型对原文、说话人及声音描述有不同要求，以实际模型为准。
Yovoice 使用异步任务并下载 WAV，可直接生成配音，无需本机 FFmpeg；Whisper 台词对齐仍需独立的 FFmpeg 和 Whisper 环境。VoxCPM 仍沿用分段及 FFmpeg 转码流程。
全局设置保存在 `data/voice-settings.json`，访问令牌为本机文件中的明文；该文件及其临时文件已加入 Git 忽略，不写进分镜项目，不由设置读取接口返回。切换地址或服务时不会自动把旧令牌发送给新服务。
当前尚未提供其他云端厂商的通用 TTS 适配。接口由截图所示的本地 `/docs/openapi.json` 和 [Yovoice 官方协议](https://github.com/leemysw/yovoice/blob/main/docs/api.md) 核对。

## 自有 Skill 配合入口

### 静态参考图与调度图任务

顶栏分别提供「批量静态参考图」「批量镜头调度图」，可选择仅生成缺失/失败/待更新图片，或全部重新生成。每镜也可单独生成或更新两类图片，不受最终素材的手动/视频设置影响。
网页提交的图片任务由本机 Codex 后台串行执行，使用已有登录账号的生图额度；启动前检查登录，完成后自动回填，并由网页轮询同步。点击生成前显示数量及额度提示，不因编辑文本自动消耗额度。
静态参考图存放在 `referenceImageUrl`，调度图存放在 `blockingImageUrl`，均与最终视频/素材 `mediaUrl` 独立。`imageGeneration.reference` 与 `.blocking` 各自保存任务状态、内容哈希、版本及历史文件地址。
修改相关描述、动作、制作备注或视觉规范后，已有图片标记为待更新；旧任务的结果不再接受。静态参考图更新后，已有调度图也会标记待更新。两类任务同时排队时，尚未开始的调度任务会绑定刚生成的参考图。
每个完成版本使用新的文件地址，预览指向最新版，旧文件保留在版本记录中。上传替换同样记录新版本。后台写入与文字编辑使用独立内容版本校验，图片回填不会让正在编辑的文字被旧快照覆盖。
通过 MCP 的 `queue_storyboard_images` 可选择 `imageKind: reference|blocking`，传 `shotIds`、`force`；默认由当前 Agent 领取处理。`runLocally: true` 使用本机后台。完成图片仍使用对应 taskId 调用任务完成接口，不能将旧任务结果写到新任务。
新任务中 `taskType` 为 reference 或 blocking，`generator` 固定为 image-gen，`mediaType` 为 image。本机任务标记 `runner: local`，不重复认领；Agent 任务标记 runner: agent。后台任务在服务重启中断后会标记失败，可手动重试。

### 导演分镜字段与布局

分镜表合并为六列：镜号、镜头信息（类型/媒体/时长/生成方式）、旁白/对白、画面与导演设计、成品参考/素材、操作。
每镜「导演详情」可展开动作、调度图、调度说明和制作备注。详情有独立滚动区域，避免长文或大图无限拉长镜头行；窄窗口自动改为卡片。

- `visualPrompt`：成品静态画面与生成提示词。
- `actionDescription`：起始状态、主体动作与视线、动作节奏、结束状态。
- `blockingDescription`：机位/朝向、人物与关键物位置、路线、轴线及调度图提示词。
- `blockingImageUrl`：由服务管理的独立调度图地址，不与成品素材的 `mediaUrl` 混用。
- `notes`：制作备注、资产索引、跨镜连续性。

通过 create/update MCP 工具写入动作与调度文字；生成调度图后调用 `manage_storyboard_blocking_image`，传 `projectId`、`shotId`、`action: attach` 及本机 `sourcePath`。`action: remove` 移除调度图。
图像支持 PNG/JPEG/WebP/GIF，大小上限 20 MB；文件与项目素材保存在一起，重排不改变调度图关联。复制镜头保留文字，清空图像引用，避免删除其中一镜破坏另一镜。
搜索覆盖动作和调度说明。Markdown、纯文本、HTML、Word 导出包含相应文字；Word 嵌入调度图，HTML/Markdown 的图链接依赖本地服务仍可访问。

当前只准备部署与配置入口，尚未增加新的生成器类型。

1. storyboard-generator 产出台词、画面、时长，映射到 dialogue、visualPrompt、duration。
2. seedance-director 的角色、场景、道具、首尾帧、连续性台账仍保存在原有资产目录，通过 notes 记录引用；当前表结构没有独立资产实体。
3. dreamina-canvas-cli 生成素材后，可经 MCP 素材完成接口回填；正式队列支持需要增加生成器枚举与对应路由，不能把即梦任务冒充现有生成器。
4. 现有 Skill 的生成前审核与积分确认继续生效。

下一阶段建议先使用少量真实分镜验证字段映射，再开发即梦适配。
