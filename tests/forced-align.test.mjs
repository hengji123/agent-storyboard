import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forcedTimeline } from '../forced-align.mjs';
test('known original dialogue is preserved and grouped by aligned words',()=>{
  const shots=[{id:'a',dialogue:'蔡启瑞，1913年。'},{id:'b',dialogue:'科研获奖。'}];
  const words=[{word:'蔡启瑞',start:0.2,end:1},{word:'1913年',start:1,end:2},{word:'科研获奖',start:2.5,end:4}];
  const timeline=forcedTimeline(shots,words,4500);
  assert.deepEqual(timeline.map(row=>row.text),shots.map(shot=>shot.dialogue));
  assert.equal(timeline[0].end,2500);assert.equal(timeline[1].end,4500);
  assert.equal(timeline[0].source,'forced-alignment');
});
test('missing, reordered or invalid timestamps are rejected instead of inventing timing',()=>{
  assert.throws(()=>forcedTimeline([{id:'a',dialogue:'你好'}],[{word:'你',start:0,end:1}],2000),/未覆盖/);
  assert.throws(()=>forcedTimeline([{id:'a',dialogue:'你好'}],[{word:'你好',start:-1,end:1}],2000),/无效/);
});
