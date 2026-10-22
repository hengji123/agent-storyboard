import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';

test('independent image queues, newest versions, stale protection and automatic worker', { timeout: 30000 }, async () => {
  const root = await mkdtemp(join(tmpdir(), 'storyboard-image-tasks-'));
  const fake = join(root, 'fake-codex.cjs');
  const image = join(root, 'result.png');
  const png = Buffer.concat([Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'), Buffer.alloc(2000)]);
  await writeFile(image, png);
  await writeFile(fake, `if(process.argv.includes('--version')||process.argv.includes('login')){console.log('fake');process.exit(0)}
const fs=require('node:fs'); let text=''; process.stdin.on('data',c=>text+=c); process.stdin.on('end',()=>{const path=/OUTPUT PATH: (.+)/.exec(text)[1].trim(); fs.mkdirSync(require('node:path').dirname(path),{recursive:true}); fs.copyFileSync(${JSON.stringify(image)},path); console.log(JSON.stringify({type:'turn.completed'}));});`);
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['server.mjs', '--port', String(port), '--data-dir', join(root, 'data')], {
    windowsHide: true, env: { ...process.env, AGENT_STORYBOARD_CODEX: process.execPath, AGENT_STORYBOARD_CODEX_ARGS: JSON.stringify([fake]), AGENT_STORYBOARD_IMAGE_LOCK: join(root, 'image.lock') }
  });
  const stopped = new Promise(resolve => child.once('close', resolve));
  let log = ''; child.stderr.on('data', data => { log += data; });
  const request = async (path, method = 'GET', body) => {
    const response = await fetch(base + path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  try {
    for (let i = 0; i < 100; i++) {
      try { if ((await request('/api/health')).status === 200) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
      if (i === 99) throw Error(log);
    }
    let project = (await request('/api/projects', 'POST', { title: 'Two image channels', shots: [
      { generator: 'manual', mediaType: 'video', visualPrompt: 'Shipyard', actionDescription: 'Walking', blockingDescription: 'Camera south' },
      { generator: 'manual', mediaType: 'video', visualPrompt: 'Workshop', blockingDescription: 'Camera east' }
    ] })).data;
    const projectPath = `/api/projects/${project.id}`;
    const id = project.shots[0].id;
    const queue = (kind, extra = {}) => request('/api/generation/tasks', 'POST', { projectId: project.id, imageKind: kind, ...extra });
    const action = (task, verb, extra = {}) => request(`/api/generation/tasks/${task.taskId}/${verb}`, 'POST', extra);
    const refs = (await queue('reference')).data.queued;
    const blocks = (await queue('blocking')).data.queued;
    assert.equal(refs.length, 2); assert.equal(blocks.length, 2);
    assert.equal(new Set([...refs, ...blocks].map(task => task.taskId)).size, 4);
    assert.ok(refs.every(task => task.mediaType === 'image' && task.generator === 'image-gen'));
    assert.match(blocks[0].visualPrompt, /Camera south/);
    assert.equal((await action(refs[0], 'claim')).status, 200);
    project = (await request(`${projectPath}/shots/${id}`, 'PATCH', { visualPrompt: 'Revised shipyard' })).data;
    assert.ok([404, 409].includes((await action(refs[0], 'complete', { sourcePath: image })).status));
    const firstTask = (await queue('reference', { shotIds: [id] })).data.queued[0];
    const snapshotBeforeResult = (await request(projectPath)).data;
    assert.equal((await action(firstTask, 'complete', { sourcePath: image })).status, 200);
    project = (await request(projectPath)).data;
    assert.equal(project.shots[0].mediaType, 'video'); assert.equal(project.shots[0].generator, 'manual');
    assert.equal(project.shots[0].mediaUrl, '');
    assert.equal(project.shots[0].imageGeneration.reference.version, 1);
    const firstUrl = project.shots[0].referenceImageUrl;
    // A runtime image result must not reject or overwrite simultaneous editorial changes.
    snapshotBeforeResult.shots[0].notes = 'Keep this editorial change';
    const merged = await request(projectPath, 'PUT', snapshotBeforeResult);
    assert.equal(merged.status, 200);
    assert.equal(merged.data.shots[0].notes, 'Keep this editorial change');
    assert.equal(merged.data.shots[0].referenceImageUrl, firstUrl);
    const blocking = (await queue('blocking', { shotIds: [id] })).data.queued[0];
    assert.ok(blocking.referenceImagePath.endsWith(firstUrl.split('/').at(-1)));
    assert.equal((await action(blocking, 'complete', { sourcePath: image })).status, 200);
    const secondTask = (await queue('reference', { shotIds: [id], force: true })).data.queued[0];
    await action(secondTask, 'complete', { sourcePath: image });
    project = (await request(projectPath)).data;
    assert.equal(project.shots[0].imageGeneration.reference.version, 2);
    assert.equal(project.shots[0].imageGeneration.reference.history.length, 2);
    assert.notEqual(project.shots[0].referenceImageUrl, firstUrl);
    assert.equal(project.shots[0].imageGeneration.blocking.generationStatus, 'stale');
    assert.equal((await fetch(base + firstUrl)).status, 200);
    assert.equal((await queue('reference', { shotIds: [id] })).data.queued.length, 0);
    // Queue both local channels; pending blocking must bind the new reference produced ahead of it.
    assert.equal((await queue('reference', { shotIds: [id], force: true, runLocally: true })).status, 201);
    assert.equal((await queue('blocking', { shotIds: [id], runLocally: true })).status, 201);
    for (let i = 0; i < 160; i++) {
      project = (await request(projectPath)).data;
      const state = project.shots[0].imageGeneration;
      if (state.reference.generationStatus === 'ready' && state.reference.version === 3 && state.blocking.generationStatus === 'ready' && state.blocking.version === 2) break;
      if (state.reference.generationStatus === 'failed' || state.blocking.generationStatus === 'failed') throw Error(JSON.stringify(state));
      await new Promise(resolve => setTimeout(resolve, 100));
      if (i === 159) throw Error('Worker timed out: ' + log + JSON.stringify(state));
    }
    assert.equal(project.shots[0].imageGeneration.reference.version, 3);
    assert.equal(project.shots[0].imageGeneration.blocking.version, 2);
    assert.deepEqual(Buffer.from(await (await fetch(base + project.shots[0].referenceImageUrl)).arrayBuffer()), png);
    assert.equal((await request(projectPath, 'PUT', snapshotBeforeResult)).status, 409);
    assert.equal((await readFile(join(root, 'data', 'projects', project.id, 'project.json'), 'utf8')).includes('Keep this editorial change'), true);
  } finally {
    child.kill(); await stopped;
    await rm(root, { recursive: true, force: true });
  }
});
