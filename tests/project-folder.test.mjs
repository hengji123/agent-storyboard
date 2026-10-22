import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

test("project folders survive restart, serve media and isolate deletion", async () => {
  const root = await mkdtemp(join(tmpdir(), "storyboard-folder-"));
  const folder = join(root, "my production");
  await mkdir(folder);
  await writeFile(join(folder, "script.txt"), "keep this");
  const socket = createServer();
  await new Promise(resolve => socket.listen(0, "127.0.0.1", resolve));
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  let child, stopped;
  const start = async () => {
    child = spawn(process.execPath, ["server.mjs", "--data-dir", join(root, "registry"), "--port", String(port)], { windowsHide: true });
    stopped = new Promise(resolve => child.once("close", resolve));
    let errors = "";
    child.stderr.on("data", data => { errors += data; });
    for (let i = 0; i < 100; i++) {
      try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw Error(errors || "Service did not start");
  };
  const stop = async () => { if (child) { child.kill(); await stopped; child = null; } };
  const request = async (path, method = "GET", body) => {
    const response = await fetch(base + path, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, data: await response.json() };
  };
  try {
    await start();
    assert.equal((await request("/api/projects", "POST", { projectFolder: "relative" })).status, 400);
    assert.equal((await request("/api/projects", "POST", { projectFolder: join(root, "missing") })).status, 400);
    const created = await request("/api/projects", "POST", { title: "External", projectFolder: folder, shots: [{ dialogue: "hello", visualPrompt: "rain", generator: "image-gen" }] });
    assert.equal(created.status, 201);
    const project = created.data;
    assert.equal(project.projectFolder, folder);
    const storedDir = join(folder, ".agent-storyboard", project.id);
    assert.equal(JSON.parse(await readFile(join(storedDir, "project.json"))).title, "External");
    await assert.rejects(stat(join(root, "registry", "projects", project.id)));
    await writeFile(join(storedDir, "media", "sample.png"), "sample image");
    const queued = await request("/api/generation/tasks", "POST", { projectId: project.id, shotIds: [project.shots[0].id] });
    assert.equal(queued.status, 201);
    assert.equal(queued.data.queued.length, 1);
    const taskId = queued.data.queued[0].taskId;
    const tasks = (await request("/api/generation/tasks?status=pending")).data.tasks;
    assert.equal(tasks.find(task => task.taskId === taskId).outputDir, join(storedDir, "generation", taskId));
    await stop();
    await start();
    assert.equal((await request(`/api/projects/${project.id}`)).data.projectFolder, folder);
    assert.equal(await (await fetch(`${base}/media/${project.id}/sample.png`)).text(), "sample image");
    const sibling = (await request("/api/projects", "POST", { title: "Sibling", projectFolder: folder })).data;
    assert.equal((await request(`/api/projects/${project.id}`, "DELETE")).status, 200);
    assert.equal(await readFile(join(folder, "script.txt"), "utf8"), "keep this");
    assert.equal((await request(`/api/projects/${sibling.id}`)).status, 200);
    await assert.rejects(stat(storedDir));
  } finally {
    await stop();
    await rm(root, { recursive: true, force: true });
  }
});
