const chars = text => [...String(text).normalize("NFKC").toLowerCase()].filter(c => /[\p{L}\p{N}]/u.test(c));
export function whisperSegments(transcription = []) {
  return transcription.flatMap(segment => {
    const tokens = (segment.tokens || []).filter(token => !token.text?.startsWith('[_') && token.offsets?.to > token.offsets?.from);
    // Whisper byte tokens can contain incomplete UTF-8 characters. The full segment
    // text is decoded by Whisper before export and is safe to use in that case.
    const parts = tokens.length && tokens.every(token => !String(token.text).includes('\uFFFD')) ? tokens : [segment];
    return parts.map(part => ({ text: part.text, start: part.offsets?.from, end: part.offsets?.to }));
  }).filter(segment => Number.isFinite(segment.start) && segment.end > segment.start);
}

// Sequence alignment keeps repeated dialogue in order; punctuation is ignored.
export function matchRecognition(shots, segments, durationMs) {
  const spoken = shots.filter(shot => chars(shot.dialogue).length);
  const expected = spoken.flatMap((shot, index) => chars(shot.dialogue).map(char => ({ char, index })));
  const heard = segments.flatMap(segment => {
    const letters = chars(segment.text);
    return letters.map((char, i) => ({ char, start: segment.start + (segment.end - segment.start) * i / letters.length, end: segment.start + (segment.end - segment.start) * (i + 1) / letters.length }));
  });
  const n = expected.length, m = heard.length;
  if (!n || !m || n * m > 36000000) throw new Error("识别内容为空或文本过长，请分段对齐");
  const trace = new Uint8Array((n + 1) * (m + 1));
  let previous = Uint16Array.from({ length: m + 1 }, (_, i) => i);
  for (let i = 1; i <= n; i++) {
    const row = new Uint16Array(m + 1); row[0] = i;
    for (let j = 1; j <= m; j++) {
      const diagonal = previous[j - 1] + (expected[i - 1].char === heard[j - 1].char ? 0 : 1);
      const deletion = previous[j] + 1, insertion = row[j - 1] + 1;
      row[j] = Math.min(diagonal, deletion, insertion);
      trace[i * (m + 1) + j] = row[j] === diagonal ? 0 : row[j] === deletion ? 1 : 2;
    }
    previous = row;
  }
  const matches = spoken.map(() => []);
  let i = n, j = m;
  while (i && j) {
    const direction = trace[i * (m + 1) + j];
    if (direction === 0) {
      if (expected[i - 1].char === heard[j - 1].char) matches[expected[i - 1].index].push(heard[j - 1]);
      i--; j--;
    } else if (direction === 1) i--; else j--;
  }
  const timeline = spoken.map((shot, index) => {
    const match = matches[index];
    const confidence = match.length / chars(shot.dialogue).length;
    if (!match.length || confidence < 0.5) {
      const issue = { shotId: shot.id, shotIndex: shots.indexOf(shot) + 1, expectedText: shot.dialogue, confidence: Math.round(confidence * 100), heardText: segments.map(segment => segment.text).join('') };
      const error = new Error(`第 ${issue.shotIndex} 镜台词匹配率 ${issue.confidence}%，低于 50%，未修改镜头时长。请试听配音并核对该镜台词；若漏读或错读，请重新生成配音。`);
      error.alignmentIssue = issue;
      throw error;
    }
    return { shotId: shot.id, text: shot.dialogue, start: Math.round(Math.min(...match.map(t => t.start))), end: Math.round(Math.max(...match.map(t => t.end))), confidence: Math.round(confidence * 100) / 100 };
  });
  timeline.forEach((row, index) => {
    row.end = index + 1 < timeline.length ? timeline[index + 1].start : durationMs;
    if (index === 0) row.start = 0;
    if (row.end <= row.start || row.end > durationMs) throw new Error("识别时间戳无效，请重新识别");
  });
  return timeline;
}
