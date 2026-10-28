import { readFile, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { generateVoxcpm, voxcpmBase } from './voxcpm.mjs';

export const defaultVoiceSettings = { provider: 'voxcpm', baseUrl: 'https://voxcpm.modelbest.cn', token: '', modelId: '', voiceId: '', speaker: '' };
export function normalizeGeneration(value = {}) {
  const output = {};
  for (const [key, min, max, integer] of [['guidanceScale', 0.5, 5], ['inferenceSteps', 1, 50, true], ['seed', 0, 2147483647, true], ['speed', 0.5, 2], ['emotionStrength', 0, 1]]) {
    if (value[key] === undefined || value[key] === '' || value[key] === null) continue;
    const n = Number(value[key]);
    if (!Number.isFinite(n) || n < min || n > max || (integer && !Number.isInteger(n))) throw Error(`配音参数 ${key} 超出范围 ${min}–${max}`);
    output[key] = n;
  }
  if (value.voxMode) { if (!['design', 'clone', 'continuation'].includes(value.voxMode)) throw Error('无效的克隆模式'); output.voxMode = value.voxMode; }
  if (value.voiceMode) { if (!['design', 'clone'].includes(value.voiceMode)) throw Error('无效的声音模式'); output.voiceMode = value.voiceMode; }
  if (value.emotionText) output.emotionText = String(value.emotionText).slice(0, 500);
  if (value.modelOptions && typeof value.modelOptions === 'object' && !Array.isArray(value.modelOptions)) {
    if (JSON.stringify(value.modelOptions).length > 16000) throw Error('模型参数过长');
    output.modelOptions = structuredClone(value.modelOptions);
  }
  return output;
}
export function normalizeVoiceSettings(input, previous = defaultVoiceSettings) {
  const provider = input.provider ?? previous.provider;
  if (!['yovoice-local', 'yovoice-api', 'voxcpm'].includes(provider)) throw Error('不支持的配音服务');
  const url = new URL(String(input.baseUrl ?? previous.baseUrl).trim());
  const local = ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw Error('请输入有效的 HTTP/HTTPS 服务地址，不包含账号、查询参数或片段');
  if (provider === 'yovoice-local' && !local) throw Error('本地服务地址只能使用 127.0.0.1、localhost 或 ::1');
  if (!local && url.protocol !== 'https:') throw Error('远程 API 请使用 HTTPS 地址');
  const baseUrl = url.href.replace(/\/+$/, '');
  const same = provider === previous.provider && baseUrl === previous.baseUrl;
  const token = input.clearToken ? '' : String(input.token || (same ? previous.token : '') || '').trim();
  if (/[\r\n]/.test(token)) throw Error('令牌格式无效');
  return { provider, baseUrl, token, modelId: String(input.modelId ?? previous.modelId).trim(), voiceId: String(input.voiceId ?? previous.voiceId).trim(), speaker: String(input.speaker ?? previous.speaker).trim(), generation: normalizeGeneration(input.generation ?? previous.generation) };
}
export function publicVoiceSettings(settings) {
  const { token, ...publicSettings } = settings;
  return { ...publicSettings, hasToken: Boolean(token) };
}
export async function loadVoiceSettings(path) {
  try { return normalizeVoiceSettings(JSON.parse(await readFile(path, 'utf8'))); }
  catch (error) { if (error.code === 'ENOENT') return { ...defaultVoiceSettings, baseUrl: voxcpmBase() }; throw error; }
}
function apiBase(settings) { return settings.baseUrl.replace(/\/v1\/?$/, '') + '/v1'; }
function redact(text, settings) { return settings.token ? text.split(settings.token).join('[已隐藏]') : text; }
async function call(settings, path, options = {}) {
  let response;
  try {
    response = await fetch(apiBase(settings) + path, {
      ...options, redirect: 'error', signal: options.signal || AbortSignal.timeout(10000),
      headers: { ...options.headers, ...(settings.token ? { authorization: `Bearer ${settings.token}` } : {}) }
    });
  } catch { throw Error('无法连接配音服务，请检查地址、端口及本机接口开关'); }
  if (!response.ok) {
    const detail = redact((await response.text()).slice(0, 400), settings);
    const hint = response.status === 401 ? '访问令牌无效，请重新填写' : response.status === 409 ? '服务正在忙，请等待当前任务完成' : detail;
    throw Error(`配音服务 HTTP ${response.status}：${hint}`);
  }
  return response;
}
export async function inspectVoiceProvider(settings) {
  if (settings.provider === 'voxcpm') {
    const response = await fetch(settings.baseUrl, { signal: AbortSignal.timeout(10000), redirect: 'error' });
    if (!response.ok) throw Error(`VoxCPM 服务 HTTP ${response.status}`);
    return { ok: true, models: [], voices: [], message: 'VoxCPM 服务可访问；实际生成仍取决于服务状态' };
  }
  if (!settings.token) throw Error('请先填写 Yovoice 访问令牌');
  const status = await (await call(settings, '/status')).json();
  const models = await (await call(settings, '/models')).json();
  const voices = await (await call(settings, '/voices')).json();
  return { ok: true, status, models, voices, message: '连接成功，已读取模型和音色' };
}
export async function prepareVoiceProvider(settings, { promptWav, promptText }) {
  if (settings.provider === 'voxcpm') return settings;
  if (settings.generation?.voxMode === 'design' || settings.generation?.voiceMode === 'design') return { ...settings, voiceId: '' };
  if (!settings.token) throw Error('请先填写 Yovoice 访问令牌');
  if (settings.voiceId) {
    const result = await (await call(settings, '/voices')).json();
    const voices = Array.isArray(result) ? result : Array.isArray(result.voices) ? result.voices : result.id ? [result] : [];
    const voice = voices.find(item => item.id === settings.voiceId);
    return { ...settings, referenceText: voice?.referenceText || '', libraryVoice: true };
  }
  if (!promptWav) return settings;
  const response = await call(settings, '/voices?name=storyboard-reference', {
    method: 'POST', headers: { 'content-type': 'application/octet-stream' }, body: await readFile(promptWav), signal: AbortSignal.timeout(90000)
  });
  const voice = await response.json();
  if (!voice.id) throw Error('上传参考音频后服务未返回音色 ID');
  return { ...settings, voiceId: voice.id, referenceText: promptText };
}
export function wavDurationMs(audio) {
  if (audio.length < 44 || audio.toString('ascii', 0, 4) !== 'RIFF' || audio.toString('ascii', 8, 12) !== 'WAVE') throw Error('配音服务未返回有效 WAV 音频');
  let byteRate = 0, dataBytes = 0;
  for (let offset = 12; offset + 8 <= audio.length;) {
    const name = audio.toString('ascii', offset, offset + 4);
    const size = audio.readUInt32LE(offset + 4);
    if (offset + 8 + size > audio.length) throw Error('WAV 音频数据不完整');
    if (name === 'fmt ' && size >= 16) byteRate = audio.readUInt32LE(offset + 16);
    if (name === 'data') dataBytes += size;
    offset += 8 + size + (size % 2);
  }
  if (!(byteRate > 0) || !(dataBytes > 0)) throw Error('无法读取 WAV 音频时长');
  return Math.max(1, Math.round(dataBytes / byteRate * 1000));
}
export async function synthesizeVoice(settings, { text, output, instruction, promptWav, promptText, pollMs = 2000, timeoutMs = 30 * 60 * 1000 }) {
  if (settings.provider === 'voxcpm') return generateVoxcpm({ text, output, instruction, promptWav, promptText, apiBase: settings.baseUrl });
  if (settings.libraryVoice) promptText = settings.referenceText;
  const requestId = randomBytes(16).toString('hex');
  const body = { ...normalizeGeneration(settings.generation), text };
  if (settings.modelId) body.modelId = settings.modelId;
  if (settings.voiceId) body.voiceId = settings.voiceId;
  if (settings.speaker) body.speaker = settings.speaker;
  if (instruction) body.voiceDescription = instruction;
  if (promptText) body.referenceText = promptText;
  if (settings.modelId.startsWith('voxcpm2')) {
    body.voxMode ||= settings.voiceId ? (promptText ? 'continuation' : 'clone') : 'design';
    if (body.voxMode !== 'design' && !settings.voiceId) throw Error('音色克隆需要选择已有音色或上传参考音频');
    if (body.voxMode === 'continuation' && !promptText?.trim()) throw Error('精细克隆需要填写参考音频的准确原文');
    if (body.voxMode === 'design') { delete body.voiceId; delete body.referenceText; }
    delete body.voiceMode;
  } else { delete body.voxMode; }
  const signal = AbortSignal.timeout(timeoutMs);
  let job;
  try {
    job = await (await call(settings, `/jobs/${requestId}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal })).json();
    while (job.status === 'running') {
      await new Promise(resolve => setTimeout(resolve, pollMs));
      job = await (await call(settings, `/jobs/${requestId}`, { signal })).json();
    }
    if (job.status !== 'completed' || !job.id) throw Error(redact(String(job.error || `配音任务状态异常：${job.status}`), settings));
    const audio = Buffer.from(await (await call(settings, `/audio/${encodeURIComponent(job.id)}`, { signal })).arrayBuffer());
    const durationMs = wavDurationMs(audio);
    await writeFile(output, audio);
    return { durationMs };
  } catch (error) {
    if (signal.aborted) {
      await call(settings, `/jobs/${requestId}`, { method: 'DELETE', signal: AbortSignal.timeout(5000) }).catch(() => {});
      throw Error('配音任务超过 30 分钟，已尝试取消，请在 Yovoice 中检查任务状态');
    }
    throw error;
  }
}
