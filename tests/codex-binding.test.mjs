import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readCodexBinding, codexProcessEnv } from '../codex-binding.mjs';
test('MCP child with no CODEX_HOME receives the desktop binding without copying credentials',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'codex-binding-'));
 try{
  const command=join(dir,'codex.exe');await writeFile(command,'test');const file=join(dir,'binding.json');
  await writeFile(file,JSON.stringify({command,home:dir}));const binding=readCodexBinding(file);
  assert.deepEqual(binding,{command,home:dir});const parent={PATH:'test'};
  assert.equal(codexProcessEnv(parent,binding).CODEX_HOME,dir);assert.equal(parent.CODEX_HOME,undefined);
  assert.equal(codexProcessEnv({CODEX_HOME:'old'},binding).CODEX_HOME,dir);
  assert.equal(readCodexBinding(join(dir,'absent.json')),null);
  await writeFile(file,JSON.stringify({command:'relative.exe',home:dir}));assert.throws(()=>readCodexBinding(file),/绝对路径/);
 }finally{await rm(dir,{recursive:true,force:true});}
});
