import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { normalizeVoiceSettings, publicVoiceSettings, inspectVoiceProvider, prepareVoiceProvider, synthesizeVoice, wavDurationMs } from '../voice-provider.mjs';
import { generateVoice } from '../audio.mjs';

function sampleWav() {
  const data = Buffer.alloc(32000);
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(36 + data.length, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(16000, 24); header.writeUInt32LE(32000, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

test('voice settings hide credentials and do not carry them to another endpoint', () => {
  const saved = normalizeVoiceSettings({ provider: 'yovoice-local', baseUrl: 'http://127.0.0.1:8080/v1/', token: 'private-test-token', modelId: 'model' });
  assert.equal(publicVoiceSettings(saved).token, undefined);
  assert.equal(publicVoiceSettings(saved).hasToken, true);
  assert.equal(normalizeVoiceSettings({ token: '' }, saved).token, saved.token);
  assert.equal(normalizeVoiceSettings({ baseUrl: 'http://127.0.0.1:8081/v1', token: '' }, saved).token, '');
  assert.equal(normalizeVoiceSettings({ clearToken: true }, saved).token, '');
  assert.throws(() => normalizeVoiceSettings({ provider: 'yovoice-local', baseUrl: 'https://example.com' }));
  assert.throws(() => normalizeVoiceSettings({ provider: 'yovoice-api', baseUrl: 'http://example.com' }));
  assert.throws(() => normalizeVoiceSettings({ baseUrl: 'https://user:password@example.com' }));
  assert.throws(() => wavDurationMs(Buffer.from('not audio')));
  const advanced = normalizeVoiceSettings({ generation: { voxMode: 'continuation', guidanceScale: 1.8, inferenceSteps: 12, seed: 123, modelOptions: { voxcpm2: { text_chunk_size: 160 } } } }, saved);
  assert.deepEqual(normalizeVoiceSettings({}, advanced).generation, advanced.generation);
  assert.throws(() => normalizeVoiceSettings({ generation: { guidanceScale: 99 } }, saved));
  assert.equal(wavDurationMs(sampleWav()), 1000);
});

test('Yovoice uses authenticated jobs, reference upload and WAV download without FFmpeg', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'storyboard-provider-'));
  const requests = [];
  let polls = 0, brokenAudio = false, failedJob = false, busy = false;
  const service = createServer(async (request, response) => {
    const parts = [];
    for await (const part of request) parts.push(part);
    const raw = Buffer.concat(parts);
    requests.push({ method: request.method, url: request.url, authorization: request.headers.authorization, raw });
    if (request.headers.authorization !== 'Bearer private-test-token') { response.writeHead(401); return response.end('Unauthorized'); }
    response.setHeader('content-type', 'application/json');
    if (request.url === '/v1/status') return response.end(JSON.stringify({ ready: true }));
    if (request.url === '/v1/models') return response.end(JSON.stringify({ installed: [{ id: 'test-model' }] }));
    if (request.url === '/v1/voices') return response.end(JSON.stringify([{ id: 'saved-voice', name: 'Narrator', referenceText: '音色库原文' }]));
    if (request.url.startsWith('/v1/voices?')) return response.end(JSON.stringify({ id: 'uploaded-voice' }));
    if (request.url.startsWith('/v1/jobs/')) {
      if (busy) { response.writeHead(409); return response.end('busy'); }
      const requestId = request.url.split('/').at(-1);
      if (request.method === 'PUT') return response.end(JSON.stringify({ requestId, status: 'running' }));
      if (failedJob) return response.end(JSON.stringify({ requestId, status: 'failed', error: 'failure private-test-token' }));
      return response.end(JSON.stringify(++polls % 2 ? { requestId, status: 'running' } : { requestId, status: 'completed', id: 'audio-result' }));
    }
    if (request.url === '/v1/audio/audio-result') {
      response.setHeader('content-type', 'audio/wav');
      return response.end(brokenAudio ? Buffer.from('not a WAV') : sampleWav());
    }
    response.writeHead(404); response.end('{}');
  });
  await new Promise(resolve => service.listen(0, '127.0.0.1', resolve));
  const settings = normalizeVoiceSettings({ provider: 'yovoice-local', baseUrl: `http://127.0.0.1:${service.address().port}/v1`, token: 'private-test-token', modelId: 'test-model' });
  try {
    const inspection = await inspectVoiceProvider(settings);
    assert.equal(inspection.models.installed[0].id, 'test-model');
    assert.equal(inspection.voices[0].id, 'saved-voice');
    await assert.rejects(inspectVoiceProvider({ ...settings, token: 'wrong' }), /401/);
    const reference = join(directory, 'reference.wav');
    await writeFile(reference, sampleWav());
    const prepared = await prepareVoiceProvider(settings, { promptWav: reference, promptText: '原文' });
    assert.equal(prepared.voiceId, 'uploaded-voice');
    const output = join(directory, 'result.wav');
    const result = await synthesizeVoice(prepared, { text: '测试旁白', output, instruction: '沉稳', promptText: '原文', pollMs: 1 });
    assert.equal(result.durationMs, 1000);
    assert.deepEqual(await readFile(output), sampleWav());
    const submitted = requests.find(request => request.method === 'PUT');
    assert.match(submitted.url, /^\/v1\/jobs\/[a-f0-9]{32}$/);
    assert.deepEqual(JSON.parse(submitted.raw), { text: '测试旁白', modelId: 'test-model', voiceId: 'uploaded-voice', voiceDescription: '沉稳', referenceText: '原文' });
    assert.equal(requests.filter(request => request.url.startsWith('/v1/voices?')).length, 1);
    const precise = { ...prepared, modelId: 'voxcpm2-orig', generation: { voxMode: 'continuation', guidanceScale: 1.8, inferenceSteps: 12, seed: 123, modelOptions: { voxcpm2: { text_chunk_size: 160 } } } };
    await synthesizeVoice(precise, { text: '精细克隆', promptText: '准确原文', output, pollMs: 1 });
    const detailed = JSON.parse(requests.filter(request => request.method === 'PUT').at(-1).raw);
    assert.equal(detailed.voxMode, 'continuation'); assert.equal(detailed.guidanceScale, 1.8);
    assert.equal(detailed.modelOptions.voxcpm2.text_chunk_size, 160);
    await assert.rejects(synthesizeVoice(precise, { text: '缺原文', output, pollMs: 1 }), /准确原文/);
    assert.ok(requests.filter(request => request.url === '/v1/audio/audio-result').every(request => request.authorization === 'Bearer private-test-token'));
    // This path must work even when FFmpeg is unavailable.
    const generated = await generateVoice({ directory, id: 'native', text: '旁白', voiceSettings: { ...settings, voiceId: 'saved-voice' } });
    assert.equal(JSON.parse(requests.filter(request => request.method === 'PUT').at(-1).raw).referenceText, '音色库原文');
    assert.equal(generated.durationMs, 1000);
    assert.equal(generated.fileName, 'native.wav');
    assert.equal(generated.chunkCount, 1);
    failedJob = true;
    await assert.rejects(synthesizeVoice(settings, { text: 'fail', output, pollMs: 1 }), error => !error.message.includes('private-test-token') && error.message.includes('[已隐藏]'));
    failedJob = false; brokenAudio = true;
    await assert.rejects(synthesizeVoice(settings, { text: 'bad audio', output, pollMs: 1 }), /WAV/);
    busy = true;
    const before = requests.filter(request => request.method === 'PUT').length;
    await assert.rejects(synthesizeVoice(settings, { text: 'busy', output, pollMs: 1 }), /409/);
    assert.equal(requests.filter(request => request.method === 'PUT').length, before + 1);
  } finally {
    service.closeAllConnections();
    await new Promise(resolve => service.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
