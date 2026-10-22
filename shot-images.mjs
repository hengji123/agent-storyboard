import { createHash } from 'node:crypto';
export const IMAGE_KINDS = ['reference', 'blocking'];
export const imageUrlKey = kind => kind === 'reference' ? 'referenceImageUrl' : 'blockingImageUrl';
export function normalizeImageGeneration(value = {}) {
  return Object.fromEntries(IMAGE_KINDS.map(kind => {
    const item = value?.[kind] || {};
    return [kind, {
      generationStatus: ['idle', 'pending', 'processing', 'ready', 'stale', 'failed'].includes(item.generationStatus) ? item.generationStatus : 'idle',
      generationTaskId: String(item.generationTaskId || ''), generationError: String(item.generationError || ''),
      generationRequestedAt: item.generationRequestedAt || null, generationStartedAt: item.generationStartedAt || null,
      generationHeartbeatAt: item.generationHeartbeatAt || null, generationCompletedAt: item.generationCompletedAt || null,
      sourceHash: String(item.sourceHash || ''), requestHash: String(item.requestHash || ''),
      runner: item.runner === 'local' ? 'local' : 'agent', version: Number(item.version) || 0,
      history: Array.isArray(item.history) ? item.history : []
    }];
  }));
}
export function imageSourceHash(project, shot, kind) {
  return createHash('sha256').update(JSON.stringify([
    project.aspectRatio, project.designRevision || '', shot.visualPrompt || '', shot.actionDescription || '', shot.notes || '',
    ...(kind === 'blocking' ? [shot.blockingDescription || '', shot.referenceImageUrl || '', shot.imageGeneration?.reference?.version || 0] : [])
  ])).digest('hex');
}
export function syncShotImages(project) {
  let changed = false;
  for (const shot of project.shots) {
    shot.imageGeneration ||= normalizeImageGeneration();
    for (const kind of IMAGE_KINDS) {
      const item = shot.imageGeneration[kind];
      const hash = imageSourceHash(project, shot, kind);
      const url = shot[imageUrlKey(kind)];
      if (url && !item.sourceHash) { item.sourceHash = hash; item.version ||= 1; item.history.push({ version: item.version, url, sourceHash: hash, createdAt: new Date().toISOString() }); changed = true; }
      if (['pending', 'processing'].includes(item.generationStatus) && item.requestHash !== hash) {
        item.generationTaskId = ''; item.generationStatus = url ? 'stale' : 'idle';
        item.generationError = '描述或上游参考图已修改，旧任务结果不会回填'; changed = true;
      } else if (!['pending', 'processing', 'failed'].includes(item.generationStatus)) {
        const status = url ? (item.sourceHash === hash ? 'ready' : 'stale') : 'idle';
        if (status !== item.generationStatus) { item.generationStatus = status; changed = true; }
      } else if (item.generationStatus === 'failed' && item.requestHash && item.requestHash !== hash) {
        item.generationTaskId = ''; item.generationStatus = url ? 'stale' : 'idle'; changed = true;
      }
    }
  }
  return changed;
}
export function recordShotImage(project, shot, kind, url) {
  const item = shot.imageGeneration[kind];
  shot[imageUrlKey(kind)] = url;
  item.version++;
  item.sourceHash = imageSourceHash(project, shot, kind);
  item.generationStatus = 'ready'; item.generationError = '';
  item.generationCompletedAt = new Date().toISOString();
  item.history.push({ version: item.version, url, sourceHash: item.sourceHash, createdAt: item.generationCompletedAt });
  if (kind === 'reference' && shot.imageGeneration.blocking.generationStatus === 'pending') shot.imageGeneration.blocking.requestHash = imageSourceHash(project, shot, 'blocking');
}
export function imagePrompt(shot, kind) {
  const context = shot.notes ? `\n\n制作约束与资产索引（以已确认资料为准）：${shot.notes}` : '';
  if (kind === 'reference') return `生成本镜的静态成品参考图，锁定起始构图与主体身份。只生成单张画面，不添加机位箭头、路线、分镜表或说明文字。\n\n画面：${shot.visualPrompt}\n\n本镜动作（用于理解起始状态，不把多个动作拼成组图）：${shot.actionDescription || '无'}${context}`;
  return `生成独立的导演镜头调度工作图，不是成品效果图。清楚表示机位/朝向、人物与关键物站位、视线、动作路线、轴线及必要的起止状态。按描述选用简明俯视图或示意图，用简短中文标签和箭头说明，避免精美插画掩盖空间关系。参考图仅用于空间/身份依据。\n\n场景：${shot.visualPrompt}\n\n动作：${shot.actionDescription || '无'}\n\n调度要求：${shot.blockingDescription}${context}`;
}
