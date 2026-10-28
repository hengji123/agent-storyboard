# 配音设置与自动对齐

配音服务连接和模型参数保存在本机的 voice-settings.json，不写入项目或 Git；声音描述、参考音频原文和自动应用时长偏好保存在所属项目。

VoxCPM2 支持声音设计、音色克隆、精细克隆。精细克隆需要准确的参考原文，声音描述不参与此模式。引导强度、推理步数和随机种子使用接口对应参数。模型专属参数按本地 `/v1/models` 的 generationOptions 展示，按 family 写入 modelOptions。

生成新版本沿用保存的配置，本地调用不再反复弹出发送确认。开启自动处理时，新音频通过 Qwen3 Forced Aligner 按已知镜头台词定位时间，默认应用有台词镜头的时长；无台词镜头保留原时长。关闭时只生成音频，不自动定位或应用。相同音频和未变台词的强制对齐结果可以复用。新版本不会套用旧音频的时间轴。

定位失败时保留已生成的音频与原有镜头时长，提示具体定位原因，不再用 ASR 文案匹配率判断原稿。字幕只取镜头原台词；对齐模型仅提供时间。处理期间台词变化时不应用旧结果。语音生成仍由所选服务完成。

本地运行目录 `.runtime-voice/forced-aligner/`：`qwen3-aligner.gguf` 为量化模型，`engine-path.txt` 指向本机 audio.cpp 的 audiocpp_server.exe。也可用 AGENT_STORYBOARD_ALIGNER / AGENT_STORYBOARD_ALIGNER_MODEL 指定。每次定位启动独立 CPU 进程、随机本机端口，完成即关闭；音频不上传外网。Whisper 仅保留给独立的参考录音原文识别，不参与镜头时间定位。

协议依据：本机 `/docs/openapi.json`、`/v1/models`，以及 [Yovoice 官方 API 文档](https://github.com/leemysw/yovoice/blob/main/docs/api.md)。
