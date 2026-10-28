import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("bundled plugin matches the development app", async () => {
  for (const path of ["codex-binding.mjs", "forced-align.mjs", "public/voice-capabilities.json", "shot-size.mjs", "reference-assets.mjs", "server.mjs", "shot-images.mjs", "voice-provider.mjs", "task-state.mjs", "runtime.mjs", "audio.mjs", "timing.mjs", "recognition.mjs", "voxcpm.mjs", "env-compat.mjs", "codex-image.mjs", "public/animatic.js", "public/reference-sync.js", "public/app.js", "public/index.html", "public/styles.css", "public/autosave.js", "public/pacing.js", "public/shots.js", "public/voice-player.js", "public/voice-player.css"]) {
    assert.equal(await readFile(path, "utf8"), await readFile(`plugins/agent-storyboard/app/${path}`, "utf8"), path);
  }
});
