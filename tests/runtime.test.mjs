import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { findWindowsBinary, findWhisperModel, resolveRuntimeHome } from "../runtime.mjs";
import { runtimeHome as bundledRuntimeHome } from '../plugins/agent-storyboard/app/runtime.mjs';
import { runtimeHome } from '../runtime.mjs';

test('MCP bundled server and development server share installed voice tools', () => {
  assert.equal(bundledRuntimeHome, runtimeHome, 'bundled server must use the same FFmpeg and forced-aligner runtime');
});
test('bundled app resolves shared runtime without depending on launch directory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'storyboard-shared-runtime-'));
  try {
    const shared=join(root,'.runtime-voice'); await mkdir(shared);
    const app=join(root,'plugins','agent-storyboard','app'); await mkdir(app,{recursive:true});
    assert.equal(resolveRuntimeHome(app,''),shared);
    assert.equal(resolveRuntimeHome(app,join(root,'override')),join(root,'override'));
    await mkdir(join(app,'.runtime-voice'));
    assert.equal(resolveRuntimeHome(app,''),join(app,'.runtime-voice'));
  } finally { await rm(root,{recursive:true,force:true}); }
});

test("finds FFmpeg binaries installed through WinGet", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-runtime-"));
  try {
    const bin = join(root, "Microsoft", "WinGet", "Packages", "Gyan.FFmpeg_Test", "ffmpeg-9.0.1-full_build", "bin");
    await mkdir(bin, { recursive: true });
    const expected = join(bin, "ffmpeg.exe");
    await writeFile(expected, "test");
    assert.equal(findWindowsBinary("ffmpeg.exe", root, "win32"), expected);
    assert.equal(findWindowsBinary("ffprobe.exe", root, "win32"), null);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("uses the DSH Whisper cache when the bundled model is absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "codex-runtime-whisper-"));
  try {
    const model = join(root, ".cache", "dsh-whisper", "ggml-large-v3-turbo.bin");
    await mkdir(join(root, ".cache", "dsh-whisper"), { recursive: true });
    await writeFile(model, "test model");
    assert.equal(findWhisperModel({ runtimeHome: join(root, "runtime"), home: root }), model);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
