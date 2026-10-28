import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dialogueKey } from '../timing.mjs';
test('saved voice settings are reused; automatic alignment failure preserves new audio; cached alignment is reused', { timeout: 20000 }, async () => {
  const directory = await mkdtemp(join(tmpdir(), 'voice-workflow-'));
  const requests = [];
  const audio = Buffer.alloc(32044); audio.write('RIFF'); audio.writeUInt32LE(32036,4); audio.write('WAVEfmt ',8); audio.writeUInt32LE(16,16); audio.writeUInt16LE(1,20); audio.writeUInt16LE(1,22); audio.writeUInt32LE(16000,24); audio.writeUInt32LE(32000,28); audio.writeUInt16LE(2,32); audio.writeUInt16LE(16,34); audio.write('data',36); audio.writeUInt32LE(32000,40);
  const service = createServer(async (req,res) => {
    const parts=[]; for await(const part of req) parts.push(part);
    res.setHeader('content-type','application/json');
    if(req.url==='/v1/voices') return res.end(JSON.stringify([{id:'saved',referenceText:'参考原文'}]));
    if(req.method==='PUT') { requests.push(JSON.parse(Buffer.concat(parts))); return res.end(JSON.stringify({status:'completed',id:'result'})); }
    if(req.url==='/v1/audio/result') {res.setHeader('content-type','audio/wav'); return res.end(audio);}
    res.end('{}');
  });
  await new Promise(resolve=>service.listen(0,'127.0.0.1',resolve));
  const reserve = createServer(); await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve)); const port=reserve.address().port; await new Promise(resolve=>reserve.close(resolve));
  const child=spawn(process.execPath,['server.mjs','--port',String(port),'--data-dir',directory],{windowsHide:true,env:{...process.env,AGENT_STORYBOARD_ALIGNER_MODEL:join(directory,'missing-model.bin')}});
  const stopped=new Promise(resolve=>child.once('close',resolve)); child.stdout.on('data',()=>{}); child.stderr.on('data',()=>{});
  const base=`http://127.0.0.1:${port}`;
  const api=async(path,method='GET',body)=>{const response=await fetch(base+path,{method,headers:{'content-type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}); return {status:response.status,data:await response.json()};};
  try {
    for(let i=0;i<100;i++){try{if((await api('/api/health')).status===200)break;}catch{} await new Promise(resolve=>setTimeout(resolve,30));}
    await api('/api/voice/settings','POST',{provider:'yovoice-local',baseUrl:`http://127.0.0.1:${service.address().port}/v1`,token:'test',modelId:'voxcpm2-orig',voiceId:'saved',generation:{voxMode:'continuation',guidanceScale:1.8}});
    let project=(await api('/api/projects','POST',{shots:[{dialogue:'测试旁白'}]})).data;
    const path=`/api/projects/${project.id}`; project.audio.instruction='沉稳'; project.audio.referenceText='参考原文'; await api(path,'PUT',project);
    const generate=async()=>{assert.equal((await api(path+'/audio/generate','POST',{})).status,202); for(let i=0;i<100;i++){project=(await api(path)).data;if(!['generating','aligning'].includes(project.audio.status))return;await new Promise(resolve=>setTimeout(resolve,30));}assert.fail('voice task did not finish');};
    await generate();
    assert.equal(project.audio.status,'ready',project.audio.error); assert.equal(project.audio.takes.length,1); assert.match(project.audio.error,/配音已生成，自动对齐/);
    await generate(); assert.equal(project.audio.takes.length,2);
    assert.ok(requests.every(request=>request.voxMode==='continuation'&&request.guidanceScale===1.8&&request.referenceText==='参考原文'&&request.voiceDescription==='沉稳'));
    const take=project.audio.takes.at(-1); take.timeline=[{shotId:project.shots[0].id,text:'测试旁白',start:0,end:1000}]; take.dialogueKey=dialogueKey(project.shots); take.alignmentMethod='forced'; await writeFile(join(directory,'projects',project.id,'project.json'),JSON.stringify(project));
    assert.equal((await api(path+'/audio/align','POST',{})).status,200,'cached timestamps must bypass repeated recognition');
    assert.equal((await api(path+'/audio/delete','POST',{takeId:take.id})).status,200);
    project=(await api(path)).data; assert.equal(project.audio.takes.length,1); assert.notEqual(project.audio.selectedId,take.id);
    project.audio.autoApplyTiming=false;
    const originalDurations=project.shots.map(shot=>shot.duration);
    await api(path,'PUT',project);
    await generate();
    assert.equal(project.audio.error,'','unchecked automation must not start recognition or produce an alignment error');
    assert.equal(project.audio.takes.at(-1).timeline,undefined);
    assert.deepEqual(project.shots.map(shot=>shot.duration),originalDurations);
    assert.equal(project.audio.autoApplyTiming,false);
  } finally {child.kill();await stopped;service.closeAllConnections();await new Promise(resolve=>service.close(resolve));await rm(directory,{recursive:true,force:true});}
});
