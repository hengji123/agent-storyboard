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
  await writeFile(fake, `require('node:fs').appendFileSync(${JSON.stringify(join(root, 'args.jsonl'))}, JSON.stringify(process.argv)+'\\n');if(process.argv.includes('--version')||process.argv.includes('login')){console.log('fake');process.exit(0)}
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
      { referencesReviewed: true, generator: 'manual', mediaType: 'video', visualPrompt: 'Shipyard', actionDescription: 'Walking', blockingDescription: 'Camera south' },
      { referencesReviewed: true, generator: 'manual', mediaType: 'video', visualPrompt: 'Workshop', blockingDescription: 'Camera east' }
    ] })).data;
    const projectPath = `/api/projects/${project.id}`;
    const id = project.shots[0].id;
    const queue = (kind, extra = {}) => request('/api/generation/tasks', 'POST', { projectId: project.id, imageKind: kind, ...extra });
    const action = (task, verb, extra = {}) => request(`/api/generation/tasks/${task.taskId}/${verb}`, 'POST', extra);
    await request(`${projectPath}/shots/${id}`, 'PATCH', { referencesReviewed: false });
    assert.equal((await queue('reference')).status, 400, 'unreviewed references block the entire batch');
    const blocked = await queue('reference');
    assert.match(blocked.data.error, /第1镜/, 'error identifies the visible shot number');
    project = (await request(`${projectPath}/shots/${id}`, 'PATCH', { referenceMode: 'none', referencesReviewed: false })).data;
    assert.equal(project.shots[0].referencesReviewed, true, 'explicit none is always a confirmed no-reference decision');
    const noRef = await queue('reference', { shotIds: [id] });
    assert.equal(noRef.status, 201, 'no-reference selection is not blocked by a stale review flag');
    await request(`${projectPath}/shots/${id}`, 'PATCH', { referenceMode: 'images', referencesReviewed: false });
    assert.equal((await queue('reference', { shotIds: [id] })).status, 400, 'switching back to images still requires review');

    await request(`${projectPath}/shots/${id}`, 'PATCH', { referencesReviewed: true, referenceAssets: [{ name: 'Character v3', path: image, usage: 'Face identity only; keep full head', scope: 'both' }] });
    const refs = (await queue('reference')).data.queued;
    assert.deepEqual(refs[0].referenceImagePaths, [image]);
    assert.match(refs[0].visualPrompt, /Character v3/);
    assert.match(refs[0].visualPrompt, /Face identity only/);
    const blocks = (await queue('blocking')).data.queued;
    assert.equal(refs.length, 2); assert.equal(blocks.length, 2);
    assert.equal(new Set([...refs, ...blocks].map(task => task.taskId)).size, 4);
    assert.ok(refs.every(task => task.mediaType === 'image' && task.generator === 'image-gen'));
    assert.match(blocks[0].visualPrompt, /Camera south/);
    assert.equal((await action(refs[0], 'claim')).status, 200);
    project = (await request(`${projectPath}/shots/${id}`, 'PATCH', { visualPrompt: 'Revised shipyard' })).data;
    assert.equal(project.shots[0].referencesReviewed, false);
    await request(`${projectPath}/shots/${id}`, 'PATCH', { referencesReviewed: true });
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
    const assetEndpoint = `${projectPath}/shots/${id}/reference-assets`;
    project = (await request(`${projectPath}/shots/${id}`, 'PATCH', { visualPrompt: 'C03 in the shipyard' })).data;
    const assetIndex = project.shots[0].referenceAssets.findIndex(asset => asset.name === 'C03');
    const form = new FormData(); form.append('file', new Blob([png], { type: 'image/png' }), 'character.png');
    const uploaded = await fetch(base + assetEndpoint + '/' + assetIndex, { method: 'POST', body: form });
    assert.equal(uploaded.status, 200);
    project = await uploaded.json();
    const imported = project.shots[0].referenceAssets[assetIndex];
    assert.equal(imported.name, 'C03', 'preserve prompt identity when filling a missing image');
    assert.ok(imported.path.startsWith(join(root, 'data', 'projects', project.id)));
    assert.ok(imported.usage);
    assert.deepEqual(Buffer.from(await (await fetch(base + assetEndpoint + '/' + assetIndex)).arrayBuffer()), png);
    assert.equal((await request(assetEndpoint + '/' + assetIndex, 'DELETE')).status, 200);
    project = (await request(projectPath)).data;
    assert.equal(project.shots[0].referenceAssets.some(asset => asset.name === 'C03'), false, 'deleted prompt reference stays removed');
    assert.equal((await request(assetEndpoint + '/999', 'DELETE')).status, 404);
    const extraShot = (await request(`${projectPath}/shots`, 'POST', { visualPrompt: 'Landscape', referenceAssets: [{ name: '', path: '', usage: '' }] })).data.shots.at(-1);
    const extraEndpoint = `${projectPath}/shots/${extraShot.id}/reference-assets`;
    const extraForm = new FormData(); extraForm.append('file', new Blob([png], { type: 'image/png' }), 'landscape.png');
    const extraUpload = await fetch(base + extraEndpoint, { method: 'POST', body: extraForm });
    const extraProject = await extraUpload.json();
    const filled = extraProject.shots.at(-1);
    assert.equal(filled.referenceAssets.length, 1, 'normal upload must fill the anonymous empty placeholder');
    assert.ok(filled.referenceAssets.every(item => item.path && item.usage));
    assert.equal(filled.referencesReviewed, true);
    const attachedTask = (await queue('reference', { shotIds: [extraShot.id], runLocally: true })).data.queued[0];
    assert.deepEqual(attachedTask.referenceImagePaths, [filled.referenceAssets[0].path]);
    for (let i = 0; i < 100; i++) {
      const current = (await request(projectPath)).data.shots.at(-1);
      if (current.imageGeneration.reference.generationStatus === 'ready') break;
      await new Promise(resolve => setTimeout(resolve, 50));
      if (i === 99) assert.fail('uploaded-reference generation did not finish');
    }
    const calls = (await readFile(join(root, 'args.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
    assert.ok(calls.some(args => args.some((value, index) => value === '--image' && args[index + 1] === filled.referenceAssets[0].path)), 'uploaded reference must reach the actual Codex command as an image attachment');
    await request(`${projectPath}/shots/${extraShot.id}`, 'PATCH', { referenceMode: 'none', referencesReviewed: true });
    const noRefTask = (await queue('reference', { shotIds: [extraShot.id], force: true })).data.queued[0];
    assert.deepEqual(noRefTask.referenceImagePaths, []);
    assert.match(noRefTask.visualPrompt, /无需外部参考资产/);
    // Delay actual mock image calls, leaving availability checks immediate.
    const fakeText = await readFile(fake, 'utf8');
    await writeFile(fake, fakeText.replace("const fs=require('node:fs');", "const fs=require('node:fs');fs.appendFileSync(" + JSON.stringify(join(root, 'concurrency.jsonl')) + ",JSON.stringify({event:'start',pid:process.pid,time:Date.now()})+'\\n');const until=Date.now()+700;while(Date.now()<until){};fs.appendFileSync(" + JSON.stringify(join(root, 'concurrency.jsonl')) + ",JSON.stringify({event:'end',pid:process.pid,time:Date.now()})+'\\n');"));
    const parallelProject = (await request('/api/projects', 'POST', { title: 'Parallel slots', shots: [0,1,2].map(i => ({referenceMode:'none', visualPrompt:'Independent '+i, blockingDescription:'Camera south'})) })).data;
    const parallelQueue = await request('/api/generation/tasks','POST',{projectId:parallelProject.id,imageKind:'reference',runLocally:true});
    assert.equal(parallelQueue.status,201);
    for(let i=0;i<160;i++) {
      const state=(await request('/api/projects/'+parallelProject.id)).data;
      if(state.shots.every(s=>s.imageGeneration.reference.generationStatus==='ready'))break;
      await new Promise(resolve=>setTimeout(resolve,50));
      if(i===159)assert.fail('parallel tasks did not complete');
    }
    const events=(await readFile(join(root,'concurrency.jsonl'),'utf8')).trim().split('\n').map(JSON.parse);
    let active=0,peak=0;
    for(const event of events){active+=event.event==='start'?1:-1;peak=Math.max(peak,active);}
    assert.equal(peak,2,'two real mock Codex processes overlap, never three');
    assert.equal(active,0,'all mock image processes finished');
    const previous = (await request('/api/projects/'+parallelProject.id)).data.shots[0];
    const revision = await request('/api/generation/tasks','POST',{projectId:parallelProject.id,shotIds:[previous.id],imageKind:'reference',force:true,revisionNotes:'缩小头部，其他保持不变'});
    assert.equal(revision.status,201);
    const revisionTask=revision.data.queued[0];
    assert.match(revisionTask.visualPrompt,/缩小头部，其他保持不变/);
    assert.ok(revisionTask.referenceImagePaths.some(path=>path.endsWith(previous.referenceImageUrl.split('/').pop())),'previous version is attached to the edit request');
    assert.equal(revision.data.project.shots[0].referenceImageUrl,previous.referenceImageUrl,'queueing preserves the visible old image');
    const completedRevision=await action(revisionTask,'complete',{sourcePath:image});
    assert.equal(completedRevision.status,200);
    const revised=(await request('/api/projects/'+parallelProject.id)).data.shots[0];
    assert.equal(revised.imageGeneration.reference.history.at(-1).revisionNotes,'缩小头部，其他保持不变');
    assert.equal(revised.imageGeneration.reference.history.at(-1).revisionBaseUrl,previous.referenceImageUrl);
    assert.ok(revised.imageGeneration.reference.history.some(entry=>entry.url===previous.referenceImageUrl),'old image remains in history');


  } finally {
    child.kill(); await stopped;
    await rm(root, { recursive: true, force: true });
  }
});
