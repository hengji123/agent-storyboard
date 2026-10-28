import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {ImageConcurrency,validateGenerationSettings} from '../image-concurrency.mjs';

test('manual limits, adaptive backoff and recovery respect configured maximum',()=>{
 let now=0;const c=new ImageConcurrency({maxConcurrency:5,autoAdjust:false},()=>now);
 assert.equal(c.limit,5);c.configure({maxConcurrency:3});assert.equal(c.limit,3);
 c.configure({autoAdjust:true});assert.equal(c.limit,2);
 c.finish();c.finish();c.finish();assert.equal(c.limit,3);
 c.finish(Error('429 rate limit'));assert.equal(c.limit,1);
 for(let i=0;i<10;i++)c.finish();assert.equal(c.limit,1);
 now=60001;for(let i=0;i<6;i++)c.finish();assert.equal(c.limit,3);
 c.configure({maxConcurrency:1});assert.equal(c.limit,1);
 c.configure({maxConcurrency:4,autoAdjust:false});assert.equal(c.limit,4);
 assert.throws(()=>validateGenerationSettings({maxConcurrency:0}));
 assert.throws(()=>validateGenerationSettings({maxConcurrency:9}));
 assert.throws(()=>validateGenerationSettings({autoAdjust:'true'}));
});

test('settings API saves and survives restart without generating images',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'storyboard-concurrency-settings-'));
 const socket=createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const url=`http://127.0.0.1:${port}`;let child;
 async function start(){
  child=spawn(process.execPath,['server.mjs','--port',String(port),'--data-dir',dir],{windowsHide:true});child.stdout.resume();child.stderr.resume();
  for(let i=0;i<100;i++){try{if((await fetch(url+'/api/generation/settings')).ok)return;}catch{}await new Promise(r=>setTimeout(r,30));}throw Error('server did not start');
 }
 async function stop(){if(!child)return;const closed=new Promise(r=>child.once('close',r));child.kill();await closed;child=null;}
 try{
  await start();const original=await (await fetch(url+'/api/generation/settings')).json();assert.equal(original.maxConcurrency,2);
  const save=await fetch(url+'/api/generation/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({maxConcurrency:5,autoAdjust:true})});assert.equal(save.status,200);const saved=await save.json();assert.equal(saved.maxConcurrency,5);assert.equal(saved.effectiveConcurrency,2);
  const invalid=await fetch(url+'/api/generation/settings',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({maxConcurrency:99})});assert.equal(invalid.status,400);
  await stop();await start();const reloaded=await (await fetch(url+'/api/generation/settings')).json();assert.equal(reloaded.maxConcurrency,5);assert.equal(reloaded.autoAdjust,true);
 }finally{await stop();await rm(dir,{recursive:true,force:true});}
});
