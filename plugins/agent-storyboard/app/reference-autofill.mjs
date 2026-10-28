export function missingAsset(asset) {
  return !asset.path || asset.contentHash === 'missing';
}
export function bindGeneratedAsset(project, name, path) {
  let count = 0;
  for (const shot of project.shots) {
    if (shot.referenceMode === 'none' || shot.referenceExclusions?.includes(name)) continue;
    for (const asset of shot.referenceAssets || []) {
      if (asset.name !== name || !missingAsset(asset)) continue;
      asset.path = path; asset.contentHash = ''; count++;
      shot.referencesReviewed = false;
    }
  }
  return count;
}
export function createAssetJobs({ generate, load, commit, outputPath, design, now = Date.now }) {
  const jobs = new Map();
  return {
    get(projectId, name) { return jobs.get(JSON.stringify([projectId, name])); },
    start(project, shot, asset) {
      const key = JSON.stringify([project.id, asset.name]);
      const old = jobs.get(key);
      if (old?.status === 'processing') return old;
      if (!missingAsset(asset)) throw Error('此资产已有图片，请使用现有引用');
      if (!asset.name?.trim() || !asset.usage?.trim()) throw Error('请先填写资产名称和用途，再一键补齐');
      const job = { status: 'processing', name: asset.name, startedAt: now(), count: 0, error: '' };
      jobs.set(key, job);
      job.done = (async () => {
        try {
          const visual = await design(project);
          const prompt = `制作一张可复用参考资产图，而非整镜画面。资产：${asset.name}。要求：${asset.usage}。以此用途为唯一主体，不把当前镜头中的其他人物画入资产图。\n项目统一视觉规范：\n${visual}`;
          const result = await generate({ prompt, aspect: project.aspectRatio, refImages: [], outputPath: outputPath(project, asset.name, now()), retries: 0 });
          await commit(async () => {
            const current = await load(project.id);
            job.count = bindGeneratedAsset(current, asset.name, result.path);
            await current.save();
          });
          job.status = 'ready';
        } catch (error) { job.status = 'failed'; job.error = String(error.message).slice(0,1500); }
      })();
      return job;
    }
  };
}
