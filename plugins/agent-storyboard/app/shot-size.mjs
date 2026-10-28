export const SHOT_SIZES = ['', '大远景', '远景', '大全景', '全景', '中全景', '中景', '中近景', '近景', '特写', '大特写'];
export function normalizeShotSize(shot) {
  if (SHOT_SIZES.includes(shot.shotSize)) return shot.shotSize;
  // Only migrate an explicit size at the start, never a passing mention later in prose.
  const match = String(shot.visualPrompt || '').match(/^\s*(?:景别[：:]\s*)?(大远景|大全景|中全景|中近景|大特写|远景|全景|中景|近景|特写)(?=[\s，。；、,:;]|$)/);
  return match?.[1] || '';
}
