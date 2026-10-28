# 配音服务与本地运行环境

适用版本：0.9.0。分镜台支持本地 / 远程 Yovoice 和 VoxCPM，生成配音与原台词时间定位是独立步骤。设置行为见 [配音设置与自动对齐](../VOICE-SETTINGS.md)。

## 服务选择

| 服务 | 连接方式 | 本机依赖 |
| --- | --- | --- |
| 本地 Yovoice | 默认 `http://127.0.0.1:8080/v1`，填写令牌，选择已安装模型和音色 | 下载生成 WAV 本身无需 FFmpeg |
| 远程 Yovoice API | 兼容相同 `/v1` 协议的服务地址和令牌 | 同上；音频和文本按所选服务处理 |
| VoxCPM | 兼容 Gradio 协议的在线 / 自建服务 | 工作台分段、转码和拼接需 FFmpeg / FFprobe |

Yovoice 的声音设计、音色克隆、精细克隆与模型参数，以实际服务返回的能力为准。工作台未提供任意厂商 TTS API 的通用适配。

服务连接、令牌和模型设置保存在中央数据目录的 `voice-settings.json`；声音描述、参考原文和自动应用时长偏好属于项目。配音令牌不会随项目导出或由设置读取接口返回，切换地址时不会自动把旧令牌发送给新服务。

## 工作台中的配音流程

`audio.mjs` 与 `voice-provider.mjs` 负责选择服务、生成和保存音频。Yovoice 使用异步任务并下载 WAV。VoxCPM 长文按句尾分段，默认以每段约 800 字为目标；每段使用同一份参考音频，通过 FFmpeg 裁剪静音、统一响度并拼接。

生成新版本复用已保存配置。开启自动处理后，生成的音频继续进入原台词时间定位；失败时保留音频和镜头时长，并显示具体原因。关闭自动处理时只生成配音。

## 原台词强制对齐

镜头时间定位使用本地 audio.cpp 引擎和 Qwen3 Forced Aligner 模型：

1. FFmpeg 将音频转为单声道 16 kHz WAV。
2. 启动独立 CPU 对齐进程，监听随机本机端口。
3. 向本机对齐接口提交音频和镜头原台词，校验返回内容与时间。
4. 保存镜头区间及字幕；按需应用有台词镜头的时长。
5. 完成后关闭对齐进程并清理临时文件。

字幕保留原台词，对齐模型只定位时间。输出未覆盖完整台词、时间戳无效，或处理期间台词已变更时，不应用旧结果。相同音频与未变台词的对齐结果可以复用，新配音不会套用旧版本时间轴。

无台词镜头保留原时长，不会自动向配音文件插入静音；连续预览时需检查总时长和留白。强制对齐依然需要人工试听边界，不保证音素级精度。

Whisper 仅用于独立参考录音的原文识别，不参与镜头时间定位。缺少强制对齐引擎或模型时，不会自动退回 Whisper 听写。

## 环境配置

```text
AGENT_STORYBOARD_RUNTIME            工具与模型目录，默认 .runtime-voice
AGENT_STORYBOARD_FFMPEG             FFmpeg 可执行文件
AGENT_STORYBOARD_FFPROBE            FFprobe 可执行文件
AGENT_STORYBOARD_ALIGNER            audio.cpp 引擎可执行文件
AGENT_STORYBOARD_ALIGNER_MODEL      Qwen3 Forced Aligner 模型
AGENT_STORYBOARD_WHISPER            Whisper CLI，可选
AGENT_STORYBOARD_WHISPER_MODEL      Whisper 模型，可选
AGENT_STORYBOARD_VOXCPM_URL          兼容的 VoxCPM Gradio 服务
AGENT_STORYBOARD_VOICE_CHUNK_CHARS   VoxCPM 分段目标字数，默认 800
```

源码服务和插件副本共享仓库运行目录。FFmpeg / FFprobe 优先使用指定路径或本地工具，Windows 还尝试 WinGet 安装目录，最后查找 PATH。运行工具与模型不会隐式安装。

Windows 本地目录示例：

```text
.runtime-voice/
  ffmpeg/bin/ffmpeg.exe
  ffmpeg/bin/ffprobe.exe
  forced-aligner/qwen3-aligner.gguf
  forced-aligner/engine-path.txt
  whisper/whisper-cli.exe
  ggml-large-v3-turbo-q5_0.bin
```

`engine-path.txt` 写入 audio.cpp 引擎的本机路径，也可用环境变量覆盖引擎及模型路径。引擎需支持本工作台使用的配置文件与 `/v1/audio/alignments` 协议。

Whisper 模型依次查找运行目录中的 Turbo 模型与 `~/.cache/dsh-whisper/` 中已有模型。没有参考录音识别需求时无需安装 Whisper。

## 独立调用 VoxCPM

`voxcpm.mjs` 仅使用 Node.js 内置模块，可单文件复用。建议 Node.js 22 或更高版本：

```javascript
import { generateVoxcpm } from "./voxcpm.mjs";

await generateVoxcpm({
  text: "你好，这是一段语音生成测试。",
  output: "./speech.wav",
  instruction: "自然清晰的普通话，温暖平静"
});
```

执行会向所选服务发送台词并生成音频；`output` 的父目录必须存在，同名文件会被覆盖。函数完成文件写入，不返回音频对象。

| 参数 | 说明 |
| --- | --- |
| `text` / `output` | 待朗读文字、输出文件路径，必填 |
| `instruction` | 声音或语气描述 |
| `promptWav` / `promptText` | 本地参考音频和准确原文 |
| `apiBase` | 服务地址；默认读取 `AGENT_STORYBOARD_VOXCPM_URL`，否则使用客户端默认值 |
| `cfg` / `steps` | 引导强度 / 推理步数，默认 2.0 / 10 |
| `normalize` / `denoise` | 服务端文本规范化 / 降噪，默认 true / false |
| `timeoutMs` | 超时，默认 600000 毫秒 |

独立客户端不自动识别参考原文、转码、分段或拼接；完整工作台处理需要其他模块。

## 验证与历史资料

`npm run check` 和 `npm test` 用于语法与自动化验证，不证明在线服务可用或实际音质合格。真实生成、音色、时间边界与连续预览应在配置完成后用少量素材试听检查。

`scripts/voice-smoke.mjs` 和 [早期实测记录](voice-smoke-results.md) 保留的是旧 VoxCPM / Whisper 流程，脚本仍含旧引擎断言，不适合作为当前强制对齐流程的验收入口。
