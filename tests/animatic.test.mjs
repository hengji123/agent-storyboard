import { test } from 'node:test';
import assert from 'node:assert/strict';
import { animaticTimeline, animaticFrame } from '../public/animatic.js';
test('preview follows shot durations with narration as the master duration and timed recognized subtitles', () => {
  const data = animaticTimeline([{id:'a',duration:2,dialogue:'原台词'},{id:'b',duration:3}],{durationMs:5000,timeline:[{shotId:'a',text:'旧字幕',start:1000,end:2500}],recognition:[{text:'错误听写',start:0,end:5000}]});
  assert.equal(data.duration,5); assert.equal(animaticFrame(data,1.99),0); assert.equal(animaticFrame(data,2),1);
  assert.deepEqual(data.subtitles,[{text:'原台词',start:1,end:2.5}]);
  assert.equal(animaticTimeline([{id:'a',duration:4}]).duration,4);
});
