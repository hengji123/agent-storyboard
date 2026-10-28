import { test } from 'node:test';
import assert from 'node:assert/strict';
import { syncPromptReferences } from '../public/reference-sync.js';
test('sync explicit prompt references and known asset names without inventing paths', () => {
  const source = { referenceAssets: [{ name: 'C03', path: 'F:/assets/elder.png', usage: '晚年身份与衣服', scope: 'both' }] };
  const shot = { visualPrompt: 'C03 在【参考：书房场景 v2】中。', referencesReviewed: true };
  assert.equal(syncPromptReferences(shot, [source]), 2);
  assert.equal(shot.referenceAssets.find(a => a.name === 'C03').path, 'F:/assets/elder.png');
  assert.equal(shot.referenceAssets.find(a => a.name === '书房场景 v2').path, '');
  assert.equal(shot.referencesReviewed, false);
  assert.equal(syncPromptReferences(shot, [source]), 0, 'no duplicates');
});
test('ambiguous versions remain unresolved; manual bindings survive prompt edits', () => {
  const sources = ['v1.png', 'v2.png'].map(path => ({ referenceAssets: [{ name: 'C03', path, usage: '身份' }] }));
  const shot = { visualPrompt: 'C03 中景', referenceAssets: [{ name: '道具', path: 'prop.png', usage: '形制' }] };
  syncPromptReferences(shot, sources);
  assert.equal(shot.referenceAssets.find(a => a.name === 'C03').path, '');
  shot.visualPrompt = '改为书桌特写';
  syncPromptReferences(shot, sources);
  assert.equal(shot.referenceAssets[0].path, 'prop.png');
});
