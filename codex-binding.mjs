import { existsSync, readFileSync } from 'node:fs';
import { join, isAbsolute } from 'node:path';
import { runtimeHome } from './runtime.mjs';

export function readCodexBinding(file = join(runtimeHome, 'codex-binding.json')) {
  try {
    const value = JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
    if (!isAbsolute(value.command || '') || !isAbsolute(value.home || '')) throw Error('Codex 程序和配置目录必须是绝对路径');
    if (!existsSync(value.command) || !existsSync(value.home)) throw Error('绑定的 Codex 程序或配置目录不存在，请更新本机绑定');
    return { command: value.command, home: value.home };
  } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
export function codexProcessEnv(env = process.env, binding = readCodexBinding()) {
  // Explicit per-app binding keeps MCP's filtered environment from selecting a
  // different login store. Never copy credentials or change the parent's login.
  return { ...env, ...(binding ? { CODEX_HOME: binding.home } : {}) };
}
