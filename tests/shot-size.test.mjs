import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeShotSize } from '../shot-size.mjs';
import { imageSourceHash, imagePrompt } from '../shot-images.mjs';
test('migrate only explicit leading shot sizes and preserve manual choices', () => {
  assert.equal(normalizeShotSize({ visualPrompt: '中近景，平视。蔡启瑞在书房。' }), '中近景');
  assert.equal(normalizeShotSize({ visualPrompt: '景别：大特写。手部' }), '大特写');
  assert.equal(normalizeShotSize({ visualPrompt: '书房里，远处屏幕显示特写。' }), '');
  assert.equal(normalizeShotSize({ shotSize: '全景', visualPrompt: '近景，平视。' }), '全景');
  assert.equal(normalizeShotSize({ shotSize: '', visualPrompt: '近景，平视。' }), '');
});
test('shot size constrains generation and changing it invalidates old results', () => {
  const shot = { shotSize: '中景', visualPrompt: '人物站在窗边' };
  assert.match(imagePrompt(shot, 'reference'), /明确景别：中景/);
  assert.notEqual(imageSourceHash({}, shot, 'reference'), imageSourceHash({}, { ...shot, shotSize: '特写' }, 'reference'));
});
