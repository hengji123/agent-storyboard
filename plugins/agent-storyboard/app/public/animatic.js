export function animaticTimeline(shots, take) {
  let time = 0;
  const frames = shots.map(shot => { const start = time; time += Math.max(0, Number(shot.duration) || 0); return { id: shot.id, start, end: time }; });
  const duration = take?.durationMs > 0 ? take.durationMs / 1000 : time;
  const subtitles = (take?.timeline || []).map(row => ({ text: shots.find(shot => shot.id === row.shotId)?.dialogue ?? row.text, start: row.start / 1000, end: row.end / 1000 }));
  return { frames, duration, subtitles };
}
export function animaticFrame(timeline, time) {
  const index = timeline.frames.findIndex(frame => time >= frame.start && time < frame.end);
  return index >= 0 ? index : Math.max(0, timeline.frames.length - 1);
}
