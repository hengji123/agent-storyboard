# 本地部署与 MCP 接入

适用版本：0.9.0。当前仓库为 [hengji123/agent-storyboard](https://github.com/hengji123/agent-storyboard)。

## 启动

建议安装 Node.js 22 或更高版本，然后运行：

```bash
git clone https://github.com/hengji123/agent-storyboard.git
cd agent-storyboard
npm start
```

打开 [本地工作台](http://127.0.0.1:43218)，按 Ctrl+C 停止。源码启动默认使用仓库内 `data/`，基础编辑不要求安装图片或配音依赖。

Windows 的 `./start-local.ps1` 会检查 FFmpeg，并把共享运行目录中的 FFmpeg 加入进程 PATH；没有 FFmpeg 时，可先用 `npm start` 使用基础功能。此项目不会自动安装模型、注册开机自启或启动第三方配音服务。

## 项目保存与备份

新建项目可填写一个已有本机文件夹的绝对路径。项目的 `project.json`、`DESIGN.md`、`media/` 和 `generation/` 保存在：

```text
<项目文件夹>/.agent-storyboard/<项目ID>/
```

中央数据目录的 `projects.json` 登记索引。备份时需要同时保留索引和各项目的实际内容。留空项目文件夹时，内容继续保存在中央数据目录，旧项目不自动迁移。

通过 MCP 创建时传入 `projectFolder`。目录需预先存在，并且运行服务的账号有写入权限。该路径属于运行服务的电脑。创建后不能通过普通编辑改变项目位置。

删除分镜项目仅清理该项目 ID 对应的数据子目录，不删除外层文件夹或其他脚本。

## MCP 接入

### 本地插件

在仓库根目录注册所用客户端的插件：

```bash
codex plugin marketplace add .
codex plugin add agent-storyboard@agent-storyboard
```

```bash
claude plugin marketplace add .
claude plugin install agent-storyboard@agent-storyboard
```

仓库同时提供 Codex 与 Claude Code 清单。安装后新开聊天，检查 `open_storyboard`、`create_storyboard_project` 等工具是否可见；插件命令以客户端支持情况为准。

### 直接注册 MCP

MCP 入口为 `plugins/agent-storyboard/mcp/server.mjs`。以通用 JSON 客户端为例：

```json
{
  "mcpServers": {
    "agent-storyboard-local": {
      "command": "node",
      "args": ["/absolute/path/agent-storyboard/plugins/agent-storyboard/mcp/server.mjs"],
      "env": {
        "AGENT_STORYBOARD_DATA_DIR": "/absolute/path/agent-storyboard/data",
        "AGENT_STORYBOARD_PORT": "43218"
      }
    }
  }
}
```

将所有示例路径替换为本机绝对路径。Windows JSON 路径可使用正斜杠。已有服务运行时 MCP 会尝试连接，否则可以启动插件内的服务副本；独立插件默认数据目录为 `~/.agent-storyboard/`，已有旧目录时继续沿用。

需要连接一个手动启动的 HTTP 服务时，增加 `AGENT_STORYBOARD_URL`，并先启动该服务。仓库中的 [mcp.local.example.json](mcp.local.example.json) 是这种连接方式的示例。

Codex 客户端使用的配置格式可能是 TOML；不要把 JSON 直接粘贴到 TOML 文件。客户端已有全局配置时沿用同一个数据目录，避免打开另一套空项目。

## 图片生成与参考资产

网页的静态参考图和调度图任务可由本机 Codex CLI 执行，需要已登录账号及可用额度。可在设置中调整最高并发（1–8）与自动调节。

静态参考图 `referenceImageUrl`、调度图 `blockingImageUrl` 与最终素材 `mediaUrl` 分别管理。修改相关内容会标记旧图待更新；每个新版本保留独立文件地址，任务完成时检查内容版本。

通过 `queue_storyboard_images` 选择 `imageKind: reference|blocking`，默认交给 Agent；`runLocally: true` 使用本机后台。任务标记 `runner: local` 或 `runner: agent`，不要重复认领本机任务。

生成前必须核对参考附件及用途；无需参考图时明确选择。详见 [参考资产规范](REFERENCE-ASSETS.md)。

## 配音与对齐

在脚本页配置本地 Yovoice、兼容协议的远程 Yovoice API 或 VoxCPM 在线服务。Yovoice 默认地址为 `http://127.0.0.1:8080/v1`，需要在服务端开启接口并填写令牌。服务连接后读取可用模型和音色。

Yovoice 可直接下载 WAV；VoxCPM 分段处理需要 FFmpeg / FFprobe。镜头原台词时间定位使用 FFmpeg、audio.cpp 与 Qwen3 Forced Aligner；Whisper 仅用于独立参考录音识别。

配音设置和令牌保存在中央数据目录的 `voice-settings.json`，令牌为本机明文。该文件已加入 Git 忽略，不写入项目，也不由设置读取接口返回。详见 [配音设置](VOICE-SETTINGS.md) 和 [运行环境](docs/voice-runtime.md)。

## 外部创作工具

其他分镜、导演或媒体生成 Skill 可以通过 MCP 写入镜头字段及回填素材。当前生成方式为 `image-gen`、`manual`、`hyperframes`、`remotion`；没有原生 Dreamina / Seedance 队列适配，不要把外部任务标记成已有生成器。

## 开发与更新

根目录服务与 `public/` 是开发入口，修改共享代码后同步 `plugins/agent-storyboard/app/`。提交前运行 `npm run check` 和适用测试。

本仓库从原项目 0.8.0 源码快照建立，未导入上游完整提交历史。`origin` 为 hengji123 的当前仓库；`upstream` 仅用于跟踪 Yuuhann1999 的原项目。上游变化应比较后选择合并，不应直接覆盖本仓库扩展。

旧界面截图、早期设计和历史实测记录不表示当前验证结果。最新功能汇总见 [版本记录](CHANGELOG.md)。
