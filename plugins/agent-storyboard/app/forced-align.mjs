import { readFile, writeFile, mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { createServer } from 'node:net';
import { spawn } from 'node:child_process';
import { runtimeHome } from './runtime.mjs';

const letters = text => [...String(text || '').normalize('NFKC').toLowerCase()].filter(c => /[\p{L}\p{N}]/u.test(c));
// Consume the known transcript in order. This validates the aligner's echo, not ASR.
export function forcedTimeline(shots, words, durationMs) {
  const chars = words.flatMap(word => {
    const text = letters(word.word ?? word.text);
    const start = Number(word.start ?? word.start_time), end = Number(word.end ?? word.end_time);
    if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || end * 1000 > durationMs + 250) throw Error('强制对齐返回无效时间戳，请重试时间定位');
    return text.map((char, i) => ({ char, start: (start + (end-start)*i/text.length)*1000, end: (start + (end-start)*(i+1)/text.length)*1000 }));
  });
  let cursor = 0;
  const spoken = shots.filter(shot => letters(shot.dialogue).length);
  const timeline = spoken.map((shot, index) => {
    const text = letters(shot.dialogue), matched = chars.slice(cursor, cursor + text.length);
    if (matched.length !== text.length || matched.some((item,i) => item.char !== text[i])) throw Error(`第 ${shots.indexOf(shot)+1} 镜时间定位未覆盖全部原台词；请重试或手动调整该段边界。`);
    cursor += text.length;
    return {shotId:shot.id,text:shot.dialogue,start:Math.round(matched[0].start),end:Math.round(matched.at(-1).end),source:'forced-alignment'};
  });
  if (!timeline.length || cursor !== chars.length) throw Error('时间定位输出与输入台词长度不符');
  timeline.forEach((row,index) => {
    if (!index) row.start=0;
    row.end=index+1<timeline.length?timeline[index+1].start:durationMs;
    if(row.end<=row.start)throw Error(`第 ${index+1} 镜未获得有效时间范围，请手动检查边界`);
  });
  return timeline;
}

export async function forceAlign(wav, shots, durationMs) {
  const root=join(runtimeHome,'forced-aligner');
  const model=process.env.AGENT_STORYBOARD_ALIGNER_MODEL || join(root,'qwen3-aligner.gguf');
  let engine=process.env.AGENT_STORYBOARD_ALIGNER;
  if(!engine) { try {engine=(await readFile(join(root,'engine-path.txt'),'utf8')).trim();} catch {} }
  if(!engine || !(await stat(model).catch(()=>null))) throw Error('本地强制对齐环境未配置：需要 audio.cpp 引擎与 Qwen3 Forced Aligner 模型；不会退回语音听写。');
  const directory=await mkdtemp(join(tmpdir(),'storyboard-align-'));
  const reservation=createServer(); await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve)); const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
  const config=join(directory,'server.json');
  await writeFile(config,JSON.stringify({host:'127.0.0.1',port,backend:'cpu',threads:4,lazy_load:true,models:[{id:'storyboard-align',family:'qwen3_forced_aligner',path:model,task:'align',mode:'offline'}]}));
  const child=spawn(engine,['--config',config,'--no-ui'],{cwd:dirname(model),windowsHide:true});
  let log='',spawnError; child.on('error',error=>spawnError=error); child.stdout.on('data',data=>log=(log+data).slice(-4000));child.stderr.on('data',data=>log=(log+data).slice(-4000));
  const stopped=new Promise(resolve=>{child.once('close',resolve);child.once('error',resolve);});
  const base=`http://127.0.0.1:${port}`;
  try {
    for(let i=0;i<200;i++) {
      if(spawnError)throw spawnError;
      if(child.exitCode!==null)throw Error(`强制对齐引擎启动失败：${log}`);
      try{if((await fetch(base+'/health',{signal:AbortSignal.timeout(1000)})).ok)break;}catch{}
      if(i===199)throw Error('强制对齐引擎启动超时');
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    const form=new FormData(); form.append('model','storyboard-align');form.append('language','Chinese');
    form.append('text',shots.map(shot=>shot.dialogue.trim()).filter(Boolean).join('\n'));
    form.append('file',new Blob([await readFile(wav)],{type:'audio/wav'}),'speech.wav');
    const response=await fetch(base+'/v1/audio/alignments',{method:'POST',body:form,signal:AbortSignal.timeout(30*60*1000)});
    const result=await response.json();
    if(!response.ok)throw Error(`强制对齐失败：${JSON.stringify(result).slice(0,500)}`);
    const timeline=forcedTimeline(shots,result.words||[],durationMs);
    return {timeline,subtitles:timeline.map(({text,start,end})=>({text,start,end})),engine:'qwen3-forced-aligner',alignmentMethod:'forced'};
  } finally {child.kill();await stopped;await rm(directory,{recursive:true,force:true});}
}
