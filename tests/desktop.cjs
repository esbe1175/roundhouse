// Desktop integration tests use an isolated profile and explicit Kick fixtures.
// They never sign in, send a chat message, or mutate a real Kick account.
const { _electron: electron, expect } = require("@playwright/test");
const path = require("node:path");
const fs = require("node:fs");
const assert = require("node:assert/strict");

(async () => {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const profile = path.resolve(".cache", `desktop-test-${Date.now()}`);
  const packaged = process.env.ROUNDHOUSE_TEST_EXE;
  const app = await electron.launch({
    executablePath: packaged,
    args: [...(packaged ? [] : ["."]), `--user-data-dir=${profile}`],
    env,
  });
  try {
    assert.equal(await app.evaluate(({ app }) => app.getPath("userData")), profile);
    const page = await app.firstWindow();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await expect(page.getByRole("button", { name: "Sign in to Kick", exact: true })).toBeVisible();
    assert.equal(await page.evaluate(() => "getToken" in window.app.auth), false);
    await app.evaluate(({ session, app }) => {
      const kick = session.fromPartition("persist:roundhouse-kick");
      kick.cookies.get = async () => [{ name: "session_token", value: "test-only" }];
      global.roundhouseTestRateLimit = false;
      kick.fetch = async (url) => {
        const pathname = new URL(url).pathname;
        let data;
        if (pathname === "/api/v1/user") data = { id: 123, username: "test_viewer" };
        else if (pathname.includes("/followed")) {
          if (global.roundhouseTestRateLimit) return new Response("{}", { status: 429 });
          data = {
            data: [
              {
                id: 1,
                slug: "test_live",
                user: { username: "Live channel" },
                livestream: {
                  is_live: true,
                  session_title: "A test broadcast",
                  viewer_count: 150,
                  categories: [{ name: "Just Chatting" }],
                },
              },
              { id: 2, slug: "test_offline", user: { username: "Offline channel" }, livestream: null },
            ],
          };
        } else if (pathname.endsWith("/me")) data = { is_following: true, subscription: null, roles: [], banned: null };
        else if (pathname.endsWith("/messages")) data = { data: { messages: [] } };
        else if (pathname.endsWith("/polls")) data = { status: { code: 404 } };
        else if (pathname.startsWith("/emotes") || pathname.includes("silenced-users")) data = [];
        else if (pathname === "/broadcasting/auth") return new Response("{}", { status: 403 });
        else if (pathname.endsWith("/test_live"))
          data = {
            id: 1,
            user_id: 455,
            slug: "test_live",
            user: { id: 455, username: "Live channel" },
            chatroom: { id: 11 },
            livestream: { is_live: true, id: 21, session_title: "A test broadcast" },
            playback_url: "https://media.fixture/master.m3u8",
            subscriber_badges: [],
          };
        else
          data = {
            id: 2,
            user_id: 456,
            slug: "test_offline",
            user: { id: 456, username: "Offline channel" },
            chatroom: { id: 12 },
            livestream: null,
            subscriber_badges: [],
          };
        return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
      };
      const axios = process.getBuiltinModule("module").createRequire(app.getAppPath() + "/package.json")("axios");
      axios.get = async () => ({ status: 404, data: {} });
      axios.post = async () => ({ status: 200, data: { data: { users: { userByConnection: null } } } });
      // Exercise the production Player with real MPV but a generated video source.
      // Replace fixture media URLs only at the IPC transport boundary.
      const requireMain = process.getBuiltinModule("module").createRequire(process.cwd() + "/package.json");
      const net = requireMain("node:net"),
        connect = net.createConnection;
      global.roundhouseTestLoads = [];
      net.createConnection = (...args) => {
        const socket = connect(...args),
          write = socket.write.bind(socket);
        socket.write = (chunk, ...rest) => {
          if (typeof chunk === "string") {
            const message = JSON.parse(chunk);
            if (message.command?.[0] === "loadfile" && message.command[1].startsWith("https://media.fixture/")) {
              global.roundhouseTestLoads.push(message.command[1]);
              message.command[1] = "av://lavfi:testsrc=size=640x360:rate=30";
              chunk = JSON.stringify(message) + "\n";
            }
          }
          return write(chunk, ...rest);
        };
        return socket;
      };
      const originalFetch = global.fetch;
      global.fetch = (url, options) =>
        String(url).startsWith("https://media.fixture/")
          ? Promise.resolve(new Response("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100,RESOLUTION=1280x720\n720.m3u8"))
          : originalFetch(url, options);
      const processes = requireMain("node:child_process"),
        spawn = processes.spawn;
      global.roundhouseTestChildren = [];
      processes.spawn = (...args) => {
        const child = spawn(...args);
        if (args[0].endsWith("mpv.exe")) global.roundhouseTestChildren.push(child);
        return child;
      };
    });
    // Prevent third-party requests and sockets in this fixture-only test.
    await page.route("https://**/*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    await page.routeWebSocket(/wss:.*/, (socket) => socket.close());
    await page.reload();
    await expect(page.getByRole("heading", { name: "Following" })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("A test broadcast", { exact: true })).toBeVisible();
    await page.screenshot({ path: ".cache/overview.png" });
    await page.getByRole("textbox", { name: "Search followed channels" }).fill("not followed");
    await expect(page.getByText("No live channels match your search.")).toBeVisible();
    await page.getByRole("textbox", { name: "Search followed channels" }).fill("");
    await app.evaluate(() => {
      global.roundhouseTestRateLimit = true;
    });
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByRole("alert")).toContainText("Showing your last successful refresh");
    await expect(page.getByText("A test broadcast", { exact: true })).toBeVisible();
    await app.evaluate(() => {
      global.roundhouseTestRateLimit = false;
    });
    await page.getByRole("button", { name: "Refresh", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.getByRole("button", { name: /Live channel/ }).click();
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeEnabled({ timeout: 15000 });
    // Repeat open/stop while an existing player is being torn down.
    await page.evaluate(async () => {
      await Promise.all([
        window.app.roundhouse.open("test_live"),
        window.app.roundhouse.open("test_live"),
        window.app.roundhouse.stop(),
      ]);
      await window.app.roundhouse.open("test_live");
    });
    await expect(page.getByRole("button", { name: "Pause", exact: true })).toBeEnabled({ timeout: 15000 });
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Video quality" }).selectOption("0");
    await expect
      .poll(() => app.evaluate(() => global.roundhouseTestLoads.at(-1)))
      .toBe("https://media.fixture/720.m3u8");
    await page.getByRole("button", { name: "← Following" }).click();
    await expect
      .poll(() => app.evaluate(() => global.roundhouseTestChildren.every((child) => child.exitCode !== null)))
      .toBe(true);
    await page.locator("summary").click();
    await page.getByRole("button", { name: /Offline channel/ }).click();
    await expect(page.getByRole("heading", { name: "This channel is offline" })).toBeVisible();
    const divider = page.getByRole("separator", { name: "Chat width" });
    const width = Number(await divider.getAttribute("aria-valuenow"));
    await divider.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(divider).toHaveAttribute("aria-valuenow", String(width + 20));
    await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
    await expect(divider).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(divider).toBeVisible();
    await page.screenshot({ path: ".cache/watch-offline.png" });
    await page.getByRole("button", { name: "← Following" }).click();
    await expect(page.getByRole("heading", { name: "Following" })).toBeVisible();
    assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("chatrooms") || "[]")), []);
    // A web page does not receive Roundhouse's preload or IPC privileges.
    const untrusted = await app.evaluate(async ({ BrowserWindow }) => {
      const win = new BrowserWindow({
        show: false,
        webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true },
      });
      await win.loadURL("data:text/html,<h1>Untrusted page</h1>");
      const exposed = await win.webContents.executeJavaScript("typeof window.app");
      win.destroy();
      return exposed;
    });
    assert.equal(untrusted, "undefined");
    assert.deepEqual(errors, []);
    console.log(
      "PASS: welcome, private bridge, follows, search, stale results, real embedded MPV with synthetic video, pause, quality, process cleanup, offline chat, divider, fullscreen, Back cleanup, isolated remote page.",
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
