import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname, basename, resolve } from "node:path";
import { voxcpmBase } from "./voxcpm.mjs";
import { inspectVoiceProvider } from './voice-provider.mjs';
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
export function resolveRuntimeHome(appRoot, configured = process.env.AGENT_STORYBOARD_RUNTIME) {
  if (configured?.trim()) return resolve(configured.trim());
  const local = join(appRoot, '.runtime-voice');
  if (existsSync(local)) return local;
  // A source checkout contains a second app bundled for MCP. Both entry points
  // must reuse the same installed tools and models, independent of cwd.
  const directory = resolve(appRoot);
  if (basename(directory) === 'app' && basename(dirname(dirname(directory))) === 'plugins') {
    const shared = join(dirname(dirname(dirname(directory))), '.runtime-voice');
    if (existsSync(shared)) return shared;
  }
  return local;
}
export const runtimeHome = resolveRuntimeHome(root);
const localBinary = (name) => {
  const candidate = join(runtimeHome, name);
  return existsSync(candidate) ? candidate : null;
};
export function findWindowsBinary(name, localAppData = process.env.LOCALAPPDATA, platform = process.platform) {
  if (platform !== "win32" || !localAppData) return null;
  const packagesRoot = join(localAppData, "Microsoft", "WinGet", "Packages");
  try {
    const packageDirs = readdirSync(packagesRoot, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && entry.name.toLowerCase().includes("ffmpeg"))
      .sort((a, b) => b.name.localeCompare(a.name));
    for (const packageDir of packageDirs) {
      const packageRoot = join(packagesRoot, packageDir.name);
      const versionDirs = readdirSync(packageRoot, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .sort((a, b) => b.name.localeCompare(a.name));
      for (const versionDir of versionDirs) {
        const candidate = join(packageRoot, versionDir.name, "bin", name);
        if (existsSync(candidate)) return candidate;
      }
    }
  } catch {}
  return null;
}
export function run(command, args, timeout = 15000, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, shell: false, cwd: options.cwd, env: { ...process.env, PYTHONIOENCODING: "utf-8" } });
    let output = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error(`${command}: 执行超时`)); }, timeout);
    child.stdout.on("data", data => { output = (output + data).slice(-16000); });
    child.stderr.on("data", data => { output = (output + data).slice(-16000); });
    child.on("error", error => { clearTimeout(timer); reject(error); });
    child.on("close", code => { clearTimeout(timer); code === 0 ? resolve(output) : reject(new Error(output || `${command}: ${code}`)); });
  });
}
export const ffmpeg = process.env.AGENT_STORYBOARD_FFMPEG || localBinary("ffmpeg/bin/ffmpeg.exe") || findWindowsBinary("ffmpeg.exe") || "ffmpeg";
export const ffprobe = process.env.AGENT_STORYBOARD_FFPROBE || localBinary("ffmpeg/bin/ffprobe.exe") || findWindowsBinary("ffprobe.exe") || "ffprobe";
export const whisper = process.env.AGENT_STORYBOARD_WHISPER || localBinary("whisper/whisper-cli.exe") || "whisper-cli";
export function findWhisperModel(options = {}) {
  const configured = String(options.configured ?? process.env.AGENT_STORYBOARD_WHISPER_MODEL ?? "").trim();
  if (configured) return configured;
  const runtimePath = options.runtimeHome || runtimeHome;
  const home = options.home || homedir();
  const candidates = [
    join(runtimePath, "ggml-large-v3-turbo-q5_0.bin"),
    join(runtimePath, "ggml-large-v3-turbo.bin"),
    join(home, ".cache", "dsh-whisper", "ggml-large-v3-turbo.bin"),
    join(home, ".cache", "dsh-whisper", "ggml-large-v3.bin")
  ];
  return candidates.find(candidate => existsSync(candidate)) || candidates[0];
}
export const whisperModel = findWhisperModel();
async function probe(command, args, timeout = 5000) {
  try { return { ok: true, output: (await run(command, args, timeout)).trim() }; }
  catch (error) { return { ok: false, output: String(error.message || "") }; }
}
const firstLine = (text) => text.split(/\r?\n/).find(Boolean)?.slice(0, 80) || "";

async function voiceServiceReachable(settings) {
  try {
    if (settings && settings.provider !== 'voxcpm') return (await inspectVoiceProvider(settings)).ok;
    const response = await fetch(`${settings?.baseUrl || voxcpmBase()}/config`, { signal: AbortSignal.timeout(4000) });
    return response.ok;
  } catch { return false; }
}

// 只列用户真正需要关心的东西：状态 ready（正常）/ missing（需要处理）/ info（未检测到，但不影响使用）。
// Node、配音客户端这类已经内置的东西不再检查；Remotion、HyperFrames 属于 Agent 自己的能力，不是本机环境。
export async function inspectEnvironment(voiceSettings) {
  const [voiceOnline, ffmpegProbe, whisperProbe, codex, codexLogin, claude] = await Promise.all([
    voiceServiceReachable(voiceSettings),
    probe(ffmpeg, ["-version"]),
    probe(whisper, ["--help"]),
    probe("codex", ["--version"]),
    probe("codex", ["login", "status"]),
    probe("claude", ["--version"])
  ]);
  const modelReady = existsSync(whisperModel);
  const whisperReady = whisperProbe.ok && modelReady;
  const ffmpegReady = ffmpegProbe.ok;
  const imageReady = codex.ok && codexLogin.ok;

  const groups = [
    {
      id: "voice",
      title: "配音",
      items: [
        voiceOnline
          ? { id: "voice-service", name: "配音服务", status: "ready", detail: `${voiceSettings?.provider?.startsWith('yovoice') ? 'Yovoice' : 'VoxCPM'} 服务已连接` }
          : { id: "voice-service", name: "配音服务", status: "missing", detail: "无法连接所选配音服务，请在配音服务设置中检查地址、令牌和接口开关" },
        ffmpegReady
          ? { id: "ffmpeg", name: "FFmpeg", status: "ready", detail: firstLine(ffmpegProbe.output).replace(/ Copyright.*/, "") }
          : { id: "ffmpeg", name: "FFmpeg", status: voiceSettings?.provider?.startsWith('yovoice') ? "info" : "missing", detail: "未检测到 FFmpeg。Yovoice 生成不依赖它；VoxCPM 转码和 Whisper 对齐需要它。" },
        whisperReady
          ? { id: "whisper", name: "台词对齐（Whisper）", status: "ready", detail: "已就绪" }
          : { id: "whisper", name: "台词对齐（Whisper）", status: "missing", detail: !whisperProbe.ok ? "未检测到 whisper-cli：用于把配音对齐到镜头台词，没有它仍可生成配音。macOS：brew install whisper-cpp" : `缺少识别模型：${whisperModel}` }
      ]
    },
    {
      id: "agents",
      title: "Agent 与生图",
      items: [
        { id: "codex", name: "Codex", status: codex.ok ? "ready" : "info", detail: codex.ok ? firstLine(codex.output) : "未检测到 Codex CLI" },
        { id: "claude", name: "Claude Code", status: claude.ok ? "ready" : "info", detail: claude.ok ? firstLine(claude.output) : "未检测到 Claude Code" },
        imageReady
          ? { id: "image", name: "AI 生图", status: "ready", detail: "可通过 Codex 的 image_gen 出图" }
          : { id: "image", name: "AI 生图", status: "info", detail: codex.ok ? "Codex 尚未登录，登录后即可出图" : "需要安装并登录 Codex CLI；否则请让 Agent 自带的生图能力出图，或手动上传素材" }
      ]
    }
  ];
  const missing = groups.flatMap((group) => group.items).filter((item) => item.status === "missing");
  return {
    summary: missing.length
      ? { state: "attention", title: `${missing.length} 项需要处理`, detail: missing.map((item) => item.name).join("、") }
      : { state: "ready", title: "分镜台运行正常", detail: "配音和素材处理所需的组件都已就绪" },
    groups,
    checks: groups.flatMap((group) => group.items)
  };
}
