// Each attachment has an explicit purpose; a path mentioned in prose is not an attachment.
export function normalizeReferences(value) {
  const items = Array.isArray(value) ? value.map(item => ({
    name: String(item.name || ''), path: String(item.path || ''), contentHash: String(item.contentHash || ''),
    usage: String(item.usage || ''), scope: ['reference', 'blocking'].includes(item.scope) ? item.scope : 'both'
  })) : [];
  return items.some(item => item.path && item.usage)
    ? items.filter(item => item.name || item.path || item.usage)
    : items;
}
export function referencesFor(shot, kind) {
  if (shot.referenceMode === 'none') return [];
  return normalizeReferences(shot.referenceAssets).filter(item => item.scope === 'both' || item.scope === kind);
}
export function referenceInstructions(shot, kind) {
  const assets = referencesFor(shot, kind);
  return '\n\n已绑定参考资产（附件顺序如下；不得把其他年龄、服装或场景混用）：\n' +
    (assets.map((item, index) => `参考图${index + 1}：${item.name}；用途与限制：${item.usage}`).join('\n') || '已确认本镜无需外部参考资产。') +
    '\n设计图仅提供指定依据。成片人物必须完整，不复制白底、多视图、无头身体或设定图排版；场景构图以本镜设计为准。';
}
