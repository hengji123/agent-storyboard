// Resolve explicit references only. Never choose an age/costume variant from a person's name.
export function syncPromptReferences(shot, shots = []) {
  if (shot.referenceMode === 'none') return 0;
  const text = String(shot.visualPrompt || '');
  const assets = shot.referenceAssets ||= [];
  const names = new Set(assets.map(asset => asset.name));
  for (const name of shot.referenceExclusions || []) names.add(name);
  const catalog = shots.flatMap(item => item.referenceAssets || []);
  const requested = new Set();
  for (const match of text.matchAll(/【(?:参考|资产)[：:]\s*([^】]+)】/g)) requested.add(match[1].trim());
  for (const match of text.matchAll(/\b(?:C|L|P|CHAR|SCENE|PROP)\d{2,}(?:[-_]v\d+)?\b/gi)) requested.add(match[0]);
  for (const asset of catalog) if (asset.name?.length >= 2 && text.includes(asset.name)) requested.add(asset.name);
  let count = 0;
  for (const name of requested) {
    if (names.has(name)) continue;
    const candidates = catalog.filter(asset => asset.name === name && asset.path && asset.usage && asset.scope !== 'blocking');
    const variants = [...new Map(candidates.map(asset => [JSON.stringify([asset.path, asset.usage]), asset])).values()];
    assets.push(variants.length === 1 ? { ...variants[0], scope: 'reference' } : { name, path: '', usage: '', scope: 'reference' });
    names.add(name); count++;
  }
  if (count) shot.referencesReviewed = false;
  return count;
}
