// Cross-repository contract test. No real credentials, Portal startup or Being traffic.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
const project = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const client = path.resolve(process.env.TOWN_CLIENT_DIR || "../Town-Client");
const requireClient = createRequire(path.join(client, "package.json"));
const { build } = requireClient("esbuild");
const { createServer } = requireClient("vite");
const electron = requireClient("electron");
const { launchDesktop } = await import(
  pathToFileURL(path.join(client, "tests/support/electron-lifecycle.mjs"))
);
const temporary = await mkdtemp(path.join(os.tmpdir(), "goals-plugin-e2e-"));
const profile = path.join(temporary, "profile");
let app, server;
try {
  server = await createServer({
    configFile: path.join(client, "vite.renderer.config.ts"),
    root: path.join(client, "desktop/renderer"),
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  const url = `http://127.0.0.1:${server.httpServer.address().port}/`;
  const buildDir = path.join(temporary, "build");
  await build({
    absWorkingDir: client,
    entryPoints: ["desktop/main/main.ts"],
    outfile: path.join(buildDir, "main.js"),
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
    loader: { ".py": "text", ".ps1": "text" },
    plugins: [
      {
        name: "fixture-store",
        setup(build) {
          build.onLoad(
            { filter: /desktop[\\/]main[\\/]main\.ts$/ },
            async (args) => {
              const source = await readFile(args.path, "utf8"),
                anchor =
                  "store = new SettingsStore(directory, secretStorage, binary);";
              assert(source.includes(anchor));
              return {
                contents: source.replace(
                  anchor,
                  anchor + "\n(globalThis as any).goalFixtureStore = store;",
                ),
                loader: "ts",
              };
            },
          );
        },
      },
    ],
    define: {
      MAIN_WINDOW_VITE_DEV_SERVER_URL: JSON.stringify(url),
      MAIN_WINDOW_VITE_NAME: '"main_window"',
      PORTAL_DESKTOP_BUILD: '"goals-test"',
      PORTAL_DESKTOP_UPDATE_REPOSITORY: '"fixture/repo"',
    },
  });
  await build({
    absWorkingDir: client,
    entryPoints: ["desktop/preload/preload.ts"],
    outfile: path.join(buildDir, "preload.js"),
    bundle: true,
    platform: "node",
    format: "cjs",
    external: ["electron"],
  });
  app = await launchDesktop({
    executablePath: electron,
    args: [path.join(buildDir, "main.js")],
    cwd: client,
    env: {
      ...process.env,
      PORTAL_DESKTOP_USER_DATA: profile,
      PORTAL_DESKTOP_TEST_MOCK_KEYCHAIN: "1",
    },
  });
  const page = await app.firstWindow();
  page.setDefaultTimeout(20000);
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.locator("#client-main").waitFor({ state: "visible" });
  await app.evaluate(
    ({ protocol, dialog }, directory) => {
      dialog.showOpenDialog = async () => ({
        canceled: false,
        filePaths: [directory],
      });
      dialog.showMessageBox = async () => ({ response: 1 });
      const store = globalThis.goalFixtureStore;
      store.connection = {
        endpoint: "https://goals-fixture.test/being-a",
        being: "Fixture",
        token: "fake-token",
        relaySecret: "fake-secret",
        link: "",
      };
      store.settings = {
        ...store.settings,
        endpoint: store.connection.endpoint,
        being: "Fixture",
        hasToken: true,
      };
      globalThis.goalSent = [];
      protocol.handle("https", async (request) => {
        if (request.url.includes("/api/chat/stream")) {
          globalThis.goalSent.push(await request.json());
          return new Response(
            'event: content_block_delta\ndata: {"delta":{"text":"Fixture reply"}}\n\nevent: message_stop\ndata: {}\n\n',
            { headers: { "content-type": "text/event-stream" } },
          );
        }
        if (request.url.includes("/api/stream/active"))
          return new Response(null, { status: 204 });
        if (request.url.includes("/api/history"))
          return Response.json({ messages: [] });
        return Response.json({
          kits: [],
          count: 0,
          services: {},
          being_name: "Fixture",
          sbs_enabled: false,
        });
      });
    },
    path.join(project, "dist"),
  );
  await page.reload();
  await page.locator("#client-main").waitFor({ state: "visible" });
  assert.equal(
    await page.evaluate(() => window.beings.plugins.importLocal()),
    true,
  );
  const rail = page.getByRole("navigation", { name: "主导航" });
  const tools = rail.getByRole("button", { name: "工具库", exact: true });
  if (await tools.count()) await tools.click();
  else {
    await rail.getByRole("button", { name: "更多功能", exact: true }).click();
    await page
      .getByRole("dialog", { name: "更多功能" })
      .getByRole("button", { name: "工具库", exact: true })
      .click();
  }
  await page.getByRole("tab", { name: "Plugin", exact: true }).click();
  await page.getByRole("button", { name: "刷新内容", exact: true }).click();
  await page
    .locator(".plugin-card")
    .getByRole("button", { name: "目标", exact: true })
    .click();
  const frame = page.frameLocator(".plugin-frame:visible");
  await frame.getByRole("heading", { name: "从一件你在意的事开始" }).waitFor();
  const registration = JSON.parse(
    await readFile(path.join(profile, ".portal-client.json"), "utf8"),
  );
  const command = async (operation) => {
    const response = await fetch(
      `http://127.0.0.1:${registration.port}/command`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${registration.token}` },
        body: JSON.stringify({
          endpoint: "https://goals-fixture.test/being-a",
          verb: "plugins",
          args: JSON.stringify({ plugin: "beings.goals", ...operation }),
          sceneId: "fixture-scene",
        }),
      },
    );
    const result = await response.json();
    if (result.error) throw new Error(result.error);
    return JSON.parse(result.text);
  };
  const contract = await command({ op: "describe" });
  assert.equal(contract.contract.fields.status.type, "string");
  const created = await command({
    op: "create",
    requestId: "being-create",
    data: {
      title: "每周读完一本书",
      category: "interests",
      outcome: "建立持续阅读习惯",
      criteria: ["读完一本书并写下三条收获"],
      nextAction: "今晚选一本想读的书",
      status: "active",
    },
  });
  await frame.getByRole("button", { name: /每周读完一本书/ }).waitFor();
  await frame.getByRole("button", { name: /每周读完一本书/ }).click();
  await frame
    .getByRole("dialog", { name: "目标详情" })
    .getByText(/Being/)
    .first()
    .waitFor();
  await frame
    .getByRole("button", { name: "设为当前关注", exact: true })
    .click();
  assert.equal(
    (await command({ op: "list" })).preferences.focusId,
    created.record.id,
  );
  await frame
    .getByRole("button", { name: "与 Being 继续 ↗", exact: true })
    .click();
  await page.locator("#chat-view").waitFor({ state: "visible" });
  const draft = await page
    .frameLocator("#chat-frame")
    .locator("#input")
    .inputValue();
  assert(draft.includes("@plugins") && draft.includes(created.record.id));
  await frame.getByRole("button", { name: "关闭目标详情" }).click();
  await frame.getByRole("button", { name: "＋ 新建目标", exact: true }).click();
  await frame.getByLabel("目标名称", { exact: true }).fill("每周两次散步");
  await frame
    .getByLabel("期望结果", { exact: true })
    .fill("给自己留出休息时间");
  await frame.getByRole("button", { name: "创建目标", exact: true }).click();
  await frame
    .getByRole("heading", { name: "每周两次散步", exact: true })
    .waitFor();
  assert.equal((await command({ op: "list" })).total, 2);
  await frame.getByRole("button", { name: "关闭目标详情" }).click();
  await command({
    op: "update",
    requestId: "being-progress",
    id: created.record.id,
    expectedRevision: 1,
    patch: { nextAction: "写下三条收获", status: "waiting" },
    note: "已完成阅读，等待记录收获。",
  });
  await frame.getByRole("button", { name: /写下三条收获/ }).waitFor();
  await mkdir(path.join(project, "output"), { recursive: true });
  await page.screenshot({
    path: path.join(project, "output/desktop-split.png"),
  });
  // Normal Being chat remains byte-for-byte unchanged by plugin installation/preferences.
  const chatFrame = await (
    await page.locator("#chat-frame").elementHandle()
  ).contentFrame();
  await chatFrame.evaluate(async () => {
    const response = await fetch("beings://chat/api/chat/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "普通对话原样发送" }),
    });
    await response.text();
  });
  assert.equal(
    (await app.evaluate(() => globalThis.goalSent)).at(-1).message,
    "普通对话原样发送",
  );
  const opened = app.waitForEvent("window");
  await page.evaluate(() =>
    window.beings.plugins.openWindow("beings.goals", "goals"),
  );
  const independent = await opened;
  await independent
    .frameLocator(".plugin-frame")
    .getByRole("button", { name: /每周读完一本书/ })
    .waitFor();
  await page.getByRole("button", { name: "管理插件", exact: true }).click();
  await command({
    op: "update",
    requestId: "closed-page",
    id: created.record.id,
    expectedRevision: 2,
    patch: { status: "completed" },
    note: "已写下三条收获，验收标准完成。",
  });
  await independent
    .frameLocator(".plugin-frame")
    .getByRole("button", { name: "已完成", exact: true })
    .click();
  await independent
    .frameLocator(".plugin-frame")
    .getByRole("button", { name: /每周读完一本书/ })
    .waitFor();
  await independent.setViewportSize({ width: 420, height: 720 });
  await independent.screenshot({
    path: path.join(project, "output/desktop-narrow.png"),
  });
  const independentFrame = await (
    await independent.locator(".plugin-frame").elementHandle()
  ).contentFrame();
  assert(
    await independentFrame.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    "Narrow plugin must not overflow horizontally",
  );
  await independent
    .frameLocator(".plugin-frame")
    .getByRole("button", { name: "协作偏好", exact: true })
    .click();
  await independent
    .frameLocator(".plugin-frame")
    .getByLabel("目标协作偏好", { exact: true })
    .fill("每次只推进一个小步骤");
  await independent
    .frameLocator(".plugin-frame")
    .getByRole("button", { name: "保存偏好", exact: true })
    .click();
  await independent
    .frameLocator(".plugin-frame")
    .getByText("已保存。", { exact: true })
    .waitFor();
  const beforePreferences = await command({ op: "list" });
  assert.equal(beforePreferences.preferences.guidance, "每次只推进一个小步骤");
  await command({
    op: "configure",
    requestId: "being-preferences",
    expectedRevision: beforePreferences.revision,
    preferences: { guidance: "先澄清验收标准，再确定下一步" },
    note: "用户要求调整目标插件的协作偏好",
  });
  await independentFrame.waitForFunction(
    () =>
      document.querySelector("textarea")?.value ===
      "先澄清验收标准，再确定下一步",
  );
  await page.evaluate(() => window.beings.appearance("dark"));
  await independentFrame.waitForFunction(
    () => document.documentElement.dataset.theme === "dark",
  );
  await independent
    .frameLocator(".plugin-frame")
    .getByRole("button", { name: "返回目标", exact: true })
    .click();
  await independent.screenshot({
    path: path.join(project, "output/desktop-dark.png"),
  });
  const closed = independent.waitForEvent("close");
  await page.evaluate(() =>
    window.beings.plugins.setEnabled("beings.goals", false),
  );
  await closed;
  await assert.rejects(command({ op: "list" }), /未启用/);
  assert.deepEqual(errors, []);
  console.log(
    "PASS: real sandbox + SDK + authenticated Portal command path, Being create/update, UI persistence/focus/compose, live multiwindow updates, unchanged normal chat, revocation.",
  );
} catch (error) {
  if (app) {
    const page = await app.firstWindow();
    await mkdir(path.join(project, "output"), { recursive: true });
    await page
      .screenshot({ path: path.join(project, "output/failure.png") })
      .catch(() => {});
    console.error(await page.locator("body").innerText());
    for (const frame of page.frames())
      if (frame.url().includes("plugins"))
        console.error(
          await frame
            .locator("body")
            .innerText()
            .catch(() => "unavailable"),
        );
  }
  throw error;
} finally {
  if (app) await app.close();
  if (server) await server.close();
  await rm(temporary, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 300,
  });
}
