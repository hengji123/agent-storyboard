# Agent 分镜台 · AI 导演工作台

把剧本、导演分镜、参考资产、静态图、镜头调度、配音和连续预览放在同一个本地工作台。通过 MCP 连接 Codex / Claude Code，由 Agent 写入分镜和处理任务，在网页中编辑、检查并验收结果。

当前版本：**0.9.0**。本仓库由 [Yuuhann1999/agent-storyboard](https://github.com/Yuuhann1999/agent-storyboard) 的 0.8.0 源码发展而来，由 [hengji123](https://github.com/hengji123) 持续维护。当前版本围绕导演设计、图片参考约束和声画时序进行了扩展；安装、反馈与更新请使用本仓库。

[快速开始](#快速开始) · [当前能力](#当前能力) · [相对原版的主要变化](#相对原版的主要变化) · [环境与依赖](#环境与依赖) · [文档](#文档) · [开发](#开发)

## 当前能力

### 导演分镜

- 每镜分别记录景别、镜头类型、媒体、时长、台词、静态画面、主体动作、镜头调度和制作备注。
- 静态画面描述、动作设计、机位与人物路线分开编辑；导演详情支持展开查看。
- 静态参考图、镜头调度图和最终图片 / 视频素材分别管理，避免相互覆盖。
- 支持批量修改镜头参数、重排、复制、插入、撤销删除与搜索；窄窗口切换为卡片布局。

### 参考资产与图片生成

- 逐镜附上人物、场景、道具或风格图片，并明确各图的用途和适用范围。
- 从提示词中的明确资产名称或编号同步引用；同项目有唯一匹配时复用，缺图或版本歧义时提示补齐。
- 生图前核对参考清单；无需参考图的镜头可以明确选择不使用图片参考。
- 静态参考图与调度图支持单镜、批量生成和上传替换，分别保留版本记录。
- 修改提示词、景别、动作、参考资产或视觉规范后，相关图片会标记待更新；过期任务不能覆盖新内容。
- 网页图片任务可由本机 Codex CLI 执行并自动回填；最高并发可设为 1–8，支持自动调节。

图片生成使用所连接账号的服务和额度。编辑文字不会自动重新生成图片。

### 配音与台词时间定位

- 选择本地 Yovoice、兼容协议的远程 Yovoice API，或 VoxCPM 在线服务。
- 根据服务和模型能力使用声音描述、音色 ID、参考音频和参考原文；模型选项按服务返回的能力展示。
- 配音支持多个版本，生成新版本沿用已保存设置。
- 用本地 Qwen3 Forced Aligner 对已知台词定位时间，按需自动应用有台词镜头的时长；无台词镜头保留原时长。
- 时间定位失败时保留已生成音频和镜头时长。字幕沿用原台词，对齐过程不改写文案。
- Whisper 仅用于独立的参考录音原文识别，不再承担镜头台词时间定位。

### 连续预览与交付

- 连续预览按镜头时长切换画面；有选中配音时以音频时钟播放，并显示已对齐台词。
- 节奏提示结合景别、动作、台词负荷和实际配音时间，供创作者复核。
- 支持素材总览、横竖版封面、视觉风格与项目 `DESIGN.md`。
- 导出 Markdown、HTML、Word 和纯文本；导演动作与调度说明随分镜导出，Word 可嵌入调度图。

连续预览用于检查分镜与声画关系，当前不提供一键导出完整剪辑成片。HyperFrames / Remotion 动效由 Agent 调用相应工具链完成。

## 快速开始

建议使用 **Node.js 22 或更高版本**。基础网页和本地服务没有运行时 npm 第三方依赖；图片、配音和对齐按需配置。

### 从源码启动

```bash
git clone https://github.com/hengji123/agent-storyboard.git
cd agent-storyboard
npm start
```

打开 [本地工作台](http://127.0.0.1:43218)。默认端口为 `43218`，源码启动的数据目录为 `./data`。不配置生成服务也可以先建立项目、编辑分镜和上传素材。

Windows 安装好 FFmpeg 后，也可以在 PowerShell 中运行 `./start-local.ps1`；该脚本会先检查 FFmpeg。

### 连接 Agent

仓库包含 Codex / Claude Code 插件清单、MCP 服务和配套 Skill。以下命令用于注册本地源码插件；插件加载方式以客户端支持情况为准。

```bash
# 在本仓库根目录执行，选择所用客户端的一组命令。
codex plugin marketplace add .
codex plugin add agent-storyboard@agent-storyboard
```

```bash
claude plugin marketplace add .
claude plugin install agent-storyboard@agent-storyboard
```

也可以通过 MCP 客户端直接启动 `plugins/agent-storyboard/mcp/server.mjs`。HTTP 服务已运行时，参考 [mcp.local.example.json](mcp.local.example.json) 设置本机绝对路径；示例目录必须改成你的实际路径。完整接入方式见 [本地部署](LOCAL-SETUP.md)。

加载插件或修改 MCP 配置后，新开聊天检查工具是否可见。可以这样开始：

```text
打开 Agent 分镜台。
创建一个 16:9 的产品广告项目，先写 8 个镜头。
每镜分别填写景别、台词、静态画面、人物动作、机位调度和时长。
先核对人物、场景、道具参考资产，再批量生成静态参考图和镜头调度图。
```

### 推荐工作顺序

1. 创建项目，确定画幅、项目文件夹和视觉规范。
2. 写入分镜，检查景别、台词、动作、调度与跨镜连续性。
3. 上传并核对每镜参考图片；无需图片参考时明确选择。
4. 生成静态参考图和调度图，检查结果后按镜头返修。
5. 配置配音服务，生成配音并定位原台词时间。
6. 连续预览声画关系，调整时长，导出分镜供后续制作。

## 相对原版的主要变化

以原项目 0.8.0 源码为基线，本仓库增加或改造了以下流程：

| 方向 | 当前实现 |
| --- | --- |
| 导演设计 | 独立景别、动作、调度说明及调度图，扩展导演详情与批量参数编辑 |
| 图片工作流 | 静态图 / 调度图独立队列、版本历史、过期保护、自动回填 |
| 图片约束 | 逐镜附件、用途与范围、提示词引用同步、生成前核对 |
| 生成调度 | 本机 Codex 执行、可配置并发、自动调节与共享运行环境 |
| 配音服务 | 增加本地 / 远程 Yovoice、模型能力选项及设置复用 |
| 声画时序 | 原台词强制对齐、可选自动应用时长、音频驱动连续预览 |
| 项目存储 | 支持绑定已有项目文件夹，中央索引和项目内容分开保存 |
| 部署与验证 | Windows 运行路径、源码 / 插件副本一致性及扩展自动化测试 |

原有 MCP 项目管理、多画幅、封面、视觉风格、动效任务与导出能力继续保留。版本变化见 [CHANGELOG.md](CHANGELOG.md)。

## 环境与依赖

| 功能 | 所需配置 |
| --- | --- |
| 编辑分镜、管理项目、上传素材、文档导出 | Node.js；基础功能不需要 Python |
| 网页后台生图 | 本机 Codex CLI、有效登录与可用的图片生成服务 |
| Yovoice 配音 | 本地或兼容 `/v1` 协议的远程服务、令牌及模型；生成 WAV 本身无需本机 FFmpeg |
| VoxCPM 分段配音 | 可用的在线 / 自建 Gradio 服务，以及本机 FFmpeg 和 FFprobe |
| 原台词时间定位 | FFmpeg、audio.cpp 引擎、Qwen3 Forced Aligner 模型 |
| 参考录音识别 | FFmpeg、Whisper.cpp 和本地 Whisper 模型，可选 |
| HyperFrames / Remotion 动效 | 对应 Agent Skill、渲染工具和依赖 |

模型和运行工具不会随 Git 仓库分发。图片与配音的在线可用性、额度和输出质量取决于实际服务。

常用环境变量：

```text
AGENT_STORYBOARD_DATA_DIR        数据目录
AGENT_STORYBOARD_PORT            HTTP 端口，默认 43218
AGENT_STORYBOARD_RUNTIME         本地工具与模型目录
AGENT_STORYBOARD_CODEX           Codex CLI 路径
AGENT_STORYBOARD_CODEX_MODEL     图片生成桥接使用的模型
AGENT_STORYBOARD_FFMPEG          FFmpeg 路径
AGENT_STORYBOARD_FFPROBE         FFprobe 路径
AGENT_STORYBOARD_ALIGNER         audio.cpp 引擎路径
AGENT_STORYBOARD_ALIGNER_MODEL   Qwen3 Forced Aligner 模型路径
AGENT_STORYBOARD_WHISPER         Whisper CLI 路径
AGENT_STORYBOARD_WHISPER_MODEL   Whisper 模型路径
AGENT_STORYBOARD_VOXCPM_URL      VoxCPM Gradio 服务地址
AGENT_STORYBOARD_VOICE_CHUNK_CHARS  VoxCPM 分段目标字数，默认 800
```

原有 `CODEX_STORYBOARD_*` 兼容变量的处理见 `env-compat.mjs`。Yovoice 地址、令牌和模型可在网页配音设置中保存。

## 项目与数据

源码启动默认使用仓库内 `data/`。插件独立启动默认使用 `~/.agent-storyboard/`；存在旧 `~/.codex-storyboard/` 时继续沿用。显式指定的数据目录优先。

创建项目时可以绑定一个已存在的本机项目文件夹，内容保存在：

```text
<项目文件夹>/.agent-storyboard/<项目ID>/
  project.json
  DESIGN.md
  media/
  generation/
```

中央数据目录中的 `projects.json` 登记索引；备份时同时保留索引和实际项目内容。未绑定文件夹的项目继续使用中央数据目录。项目不会自动迁移。

项目内容保存在本机，但生成所需的提示词、台词、附件或参考音频会发送到所选生成服务；本地强制对齐和本地 Whisper 识别不上传音频。Yovoice 是否联网取决于服务部署。

配音令牌保存在本机 `voice-settings.json`，该文件已忽略，不随项目导出，也不由设置读取接口返回。当前仓库不提交日常项目、生成素材、配音设置或本机生图并发设置。

## MCP 工具

| 工具 | 用途 |
| --- | --- |
| `open_storyboard` | 打开或连接工作台 |
| `create_storyboard_project` | 创建项目、镜头和视觉规范，可指定 `projectFolder` |
| `list_storyboard_projects` / `get_storyboard_project` | 查找与读取项目 |
| `update_storyboard_project` / `delete_storyboard_project` | 修改或删除项目 |
| `queue_storyboard_images` | 按静态参考图 / 调度图分别排队 |
| `manage_storyboard_blocking_image` | 附加或移除调度图 |
| `list_storyboard_generation_tasks` | 查询生成任务 |
| `generate_storyboard_image` | 通过本机 Codex 生成并回填图片 |
| `claim_storyboard_generation_task` / `complete_storyboard_generation_task` / `fail_storyboard_generation_task` / `heartbeat_storyboard_generation_task` | 处理 Agent 生成任务及长任务状态 |
| `plan_broll_motion` | 记录 B-roll 模板、动效方案及确认状态 |
| `manage_storyboard_audio` | 配音版本、台词时间定位与时长应用 |
| `inspect_storyboard_environment` | 查看运行环境状态 |

## 文档

- [本地部署与 MCP 接入](LOCAL-SETUP.md)
- [参考资产与生图约束](REFERENCE-ASSETS.md)
- [配音设置与自动对齐](VOICE-SETTINGS.md)
- [配音运行环境与独立 VoxCPM 调用](docs/voice-runtime.md)
- [产品定位](PRODUCT.md)
- [版本记录](CHANGELOG.md)

## 开发

```bash
npm run check
npm test
```

根目录服务与 `public/` 是开发入口，`plugins/agent-storyboard/app/` 是随插件分发的副本；修改共享代码后同步两处。测试覆盖项目 API、图片任务、参考资产、配音流程、对齐数据、连续预览及插件一致性；依赖未安装时，相关集成测试可能跳过。测试不会证明真实生成服务的音质或图片质量。

```text
server.mjs / public/       本地 HTTP 服务与前端
shot-images.mjs           静态图、调度图任务与版本
reference-*.mjs           参考附件、用途与引用同步
image-concurrency.mjs     图片并发调度
audio.mjs                 配音处理与时间定位入口
voice-provider.mjs        Yovoice / VoxCPM 适配
forced-align.mjs          原台词强制对齐
runtime.mjs               本地工具与模型发现
plugins/agent-storyboard/  MCP、插件清单、Skill 与应用副本
tests/                    自动化测试
```

`docs/assets/` 中保留的旧界面图片、早期设计稿和历史实测记录属于历史资料，不代表当前界面或服务状态。

## 来源与许可证

原项目：[Yuuhann1999/agent-storyboard](https://github.com/Yuuhann1999/agent-storyboard)，作者 Yuuhann1999。本仓库从原版源码快照建立，未保留上游完整提交历史；后续扩展在本仓库记录。

采用 [MIT License](LICENSE)，保留原作者版权声明。当前维护与问题反馈：[hengji123/agent-storyboard](https://github.com/hengji123/agent-storyboard)。
