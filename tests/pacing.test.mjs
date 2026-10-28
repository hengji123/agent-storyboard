import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectPacingDetailed as inspect} from '../public/pacing.js';
test('B-roll runs and motivated long takes are not faults',()=>{
 assert.deepEqual(inspect([]),[]);
 assert.deepEqual(inspect(Array.from({length:5},()=>({rollType:'B-ROLL',duration:5}))),[]);
 assert.deepEqual(inspect([{duration:25,notes:'长镜头：凝视与情绪停留'}]),[]);
 assert.ok(inspect([{duration:0}]).some(x=>x.severity==='error'));
});
test('contextual cues inspect scale sequences and narrative hold',()=>{
 const shots=Array.from({length:4},(_,i)=>({duration:5,shotSize:'中景',visualPrompt:`画面${i}`}));
 assert.ok(inspect(shots).some(x=>x.code==='scale-run'));
 assert.ok(inspect([{duration:12}]).some(x=>x.code==='unmotivated-hold'));
 assert.deepEqual(inspect([{duration:12,actionDescription:'起身走到窗边观察'}]),[]);
 assert.ok(inspect([{duration:.4}]).some(x=>x.code==='reading-time'));
});
test('actual voice timing takes priority over estimated reading speed',()=>{
 const shot={id:'a',duration:2,dialogue:'这是一段信息密集但已经确认的真实配音'};
 assert.ok(inspect([shot]).some(x=>x.code==='speech-load'));
 assert.deepEqual(inspect([shot],{take:{durationMs:2000,timeline:[{shotId:'a',start:0,end:2000}]}}),[]);
 assert.ok(inspect([shot],{take:{durationMs:4000,timeline:[{shotId:'a',start:0,end:4000}]}}).some(x=>x.code==='voice-timing'));
});
