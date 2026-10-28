// Heuristic review cues, never universal editing standards or artistic scores.
const deliberate = shot => /长镜头|一镜到底|蒙太奇|刻意|留白|停顿|凝视|沉思|情绪停留/.test(`${shot.actionDescription || ''} ${shot.notes || ''}`);
const scene = shot => String(shot.notes || '').match(/\bSC\d+\b/i)?.[0]?.toUpperCase() || '';
const sameScene = (a,b) => !scene(a) || !scene(b) || scene(a) === scene(b);
export function inspectPacingDetailed(shots, context = {}) {
  const findings = [];
  const add = (code, category, indexes, message, severity = 'review') => findings.push({code,category,indexes,message,severity});
  const take = context.take;
  const durations = shots.map(shot => Number(shot.duration));
  shots.forEach((shot,index) => {
    const seconds=durations[index], label=`镜头 ${index+1}`;
    if(!Number.isFinite(seconds)||seconds<=0){add('invalid-duration','基础数据',[index],`${label}时长无效，无法评估切点或预览。`,'error');return;}
    if(seconds<1&&!deliberate(shot))add('reading-time','画面可读性',[index],`${label}仅 ${seconds.toFixed(2)} 秒；检查主体、空间或字幕能否被看清。若为闪切或蒙太奇，可保留。`);
    if(seconds>=10&&!shot.actionDescription?.trim()&&!deliberate(shot))add('unmotivated-hold','叙事与情绪',[index],`${label}停留 ${seconds.toFixed(1)} 秒，未记录动作或情绪节拍。请补充停留目的；只有信息或情绪已完成时才考虑提前切出。`);
    const aligned=take?.timeline?.find(row=>row.shotId===shot.id);
    const words=[...String(shot.dialogue||'').replace(/[^\p{L}\p{N}]/gu,'')].length;
    if(aligned&&Math.abs(seconds-(aligned.end-aligned.start)/1000)>.35)add('voice-timing','声音与切点',[index],`${label}时长 ${seconds.toFixed(2)} 秒与配音对齐区间 ${((aligned.end-aligned.start)/1000).toFixed(2)} 秒不一致；确认是有意声画错位，还是需重新应用时长。`);
    if(!aligned&&words/seconds>6)add('speech-load','信息负荷',[index],`${label}估计每秒 ${(words/seconds).toFixed(1)} 字；尚无该镜配音对齐，请试听是否过密。不要仅按字数修改已确认的表演节奏。`);
    if(index&&sameScene(shots[index-1],shot)&&!deliberate(shot)&&!deliberate(shots[index-1])){
      const before=durations[index-1];
      if(before>0&&Math.max(seconds,before)/Math.min(seconds,before)>=4&&Math.abs(seconds-before)>=4)add('duration-contrast','节奏转折',[index-1,index],`镜头 ${index}→${index+1} 从 ${before.toFixed(1)} 秒变为 ${seconds.toFixed(1)} 秒；检查叙事转折、动作强调或情绪变化是否支撑节奏跳变。`);
      if(shot.shotSize&&shot.shotSize===shots[index-1].shotSize&&shot.visualPrompt?.trim()&&shot.visualPrompt.trim()===shots[index-1].visualPrompt?.trim())add('duplicate-composition','视觉推进',[index-1,index],`镜头 ${index}→${index+1} 景别及画面描述完全相同；核对动作、视点或信息是否推进，否则考虑合并，避免无动机切镜。`);
    }
  });
  for(let start=0;start<shots.length;){
    let end=start+1;
    while(end<shots.length&&shots[start].shotSize&&shots[end].shotSize===shots[start].shotSize&&sameScene(shots[end-1],shots[end]))end++;
    if(end-start>=4&&!shots.slice(start,end).some(deliberate))add('scale-run','视觉变化',Array.from({length:end-start},(_,i)=>start+i),`镜头 ${start+1}–${end} 连续使用${shots[start].shotSize}；检查构图、视点与信息是否持续推进。无需机械插入远景或特写。`);
    start=end;
  }
  if(take?.durationMs>0&&durations.every(n=>Number.isFinite(n)&&n>0)){
    const total=durations.reduce((a,b)=>a+b,0), voice=take.durationMs/1000;
    if(Math.abs(total-voice)>.5)add('total-duration','整体声画结构',shots.map((_,i)=>i),`镜头总长 ${total.toFixed(2)} 秒，配音 ${voice.toFixed(2)} 秒；核对无旁白段落、留白与尾镜安排，避免提前截断或尾图停留。`);
  }
  return findings;
}
export function inspectPacing(shots,context){return inspectPacingDetailed(shots,context).map(item=>item.message);}
