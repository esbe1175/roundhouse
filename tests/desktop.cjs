// Desktop integration tests use an isolated profile and explicit Kick fixtures.
// They never sign in, send a real chat message, or mutate a real Kick account.
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
    // Reproduce Kick's server-rendered homepage followed by delayed hydration.
    // The real login window must open the dialog, not merely load the homepage.
    await app.evaluate(({ session }) => {
      session.fromPartition("persist:roundhouse-kick").protocol.handle(
        "https",
        () =>
          new Response(
            `<!doctype html><title>Kick homepage fixture</title>
          <button data-testid="login" hidden onclick="window.wrongClicks++">Hidden login</button>
          <button id="login" data-testid="login">Log In</button>
          <button onclick="window.wrongClicks++">Sign Up</button>
          <script>
            window.wrongClicks = 0; window.loginClicks = 0; window.submits = 0;
            setTimeout(() => {
              document.getElementById('login').onclick = () => {
                window.loginClicks++;
                if (document.querySelector('form')) return;
                const form = document.createElement('form');
                form.innerHTML = '<input type="password"><button data-testid="login-submit">Log In</button>';
                form.onsubmit = (event) => { event.preventDefault(); window.submits++; };
                document.body.append(form);
              };
            }, 1600);
          </script>`,
            { headers: { "content-type": "text/html" } },
          ),
      );
    });
    const openLogin = async () => {
      const nextWindow = app.waitForEvent("window");
      await page.getByRole("button", { name: "Sign in to Kick", exact: true }).click();
      const login = await nextWindow;
      await expect(login.locator('[data-testid="login-submit"]')).toBeVisible({ timeout: 12000 });
      assert.equal(await login.evaluate(() => typeof window.app), "undefined");
      assert.equal(await login.evaluate(() => window.wrongClicks + window.submits), 0);
      return login;
    };
    const cancelledLogin = await openLogin();
    await cancelledLogin.waitForTimeout(2200);
    assert.equal(await cancelledLogin.evaluate(() => window.loginClicks), 1);
    await cancelledLogin.close();
    await expect(page.getByRole("button", { name: "Sign in to Kick", exact: true })).toBeEnabled();
    const completedLogin = await openLogin();
    // Keep third-party fixtures in place before account validation reloads the UI.
    await page.route("https://**/*", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: "[]" }),
    );
    let kickSocket;
    await page.routeWebSocket(/wss:.*/, (socket) => {
      if (socket.url().includes("pusher.com")) {
        kickSocket = socket;
        socket.onMessage(() => {});
      } else socket.close();
    });
    await page.route("https://files.kick.com/emotes/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="30" fill="#53fc18"/></svg>',
      }),
    );
    await page.route("https://media.fixture/fresh-thumbnail.svg*", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/svg+xml",
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180"><rect width="320" height="180" fill="green"/></svg>',
      }),
    );
    await app.evaluate(({ session, app, screen, BrowserWindow }) => {
      global.roundhouseTestCursor = { x: -10000, y: -10000 };
      global.roundhouseTestFocused = true;
      screen.getCursorScreenPoint = () => global.roundhouseTestCursor;
      BrowserWindow.getAllWindows().find((win) => win.webContents.getURL().startsWith("file:")).isFocused = () =>
        global.roundhouseTestFocused;
      const kick = session.fromPartition("persist:roundhouse-kick");
      kick.cookies.get = async () => [{ name: "session_token", value: "test-only" }];
      global.roundhouseTestRateLimit = false;
      global.roundhouseTestMessages = [];
      global.roundhouseTestThumbnailVersion = 0;
      global.roundhouseTestFollowRequests = [];
      kick.fetch = async (url, options = {}) => {
        const pathname = new URL(url).pathname;
        if (pathname.endsWith("/info") || pathname === "/api/v2/channels/followed-page")
          global.roundhouseTestFollowRequests.push({ url, cache: options.cache });
        let data;
        if (options.method === "POST" && pathname.includes("/messages/send/")) {
          global.roundhouseTestMessages.push(JSON.parse(options.body));
          return new Response(JSON.stringify({ status: { code: 200 } }), { status: 200 });
        }
        if (pathname === "/api/v1/user") data = { id: 123, username: "test_viewer" };
        else if (pathname === "/api/v2/channels/followed-page") {
          if (global.roundhouseTestRateLimit) return new Response("{}", { status: 429 });
          data = {
            channels: [
              {
                id: 1,
                channel_slug: "test_live",
                user_username: "Live channel",
                is_live: true,
                viewer_count: 150,
                show_view_count: true,
                category_name: "Just Chatting",
              },
              { id: 2, channel_slug: "test_offline", user_username: "Offline channel", is_live: false },
            ],
          };
        } else if (pathname.endsWith("/me")) data = { is_following: true, subscription: null, roles: [], banned: null };
        else if (pathname.endsWith("/messages")) {
          const sender = { id: 700, username: "FixtureViewer", identity: { color: "#53fc18", badges: [] } };
          const messages = ["A fixture chat message", "[emote:123:TestSmile]"].map((content, i) => ({
            id: `fixture-${i}`,
            chatroom_id: pathname.includes("/1/") ? 11 : 12,
            type: "message",
            content,
            sender,
            metadata: "null",
            created_at: new Date().toISOString(),
          }));
          data = {
            data: {
              messages,
              pinned_message: {
                message: { ...messages[0], content: "Fixture pinned notice" },
                pinned_by: sender,
              },
            },
          };
        } else if (pathname.includes("/users/")) {
          if (global.roundhouseTestProfileFailure) return new Response("{}", { status: 503 });
          if (global.roundhouseTestProfileDelay) await new Promise((resolve) => setTimeout(resolve, 350));
          data = {
            id: 700,
            username: pathname.split("/").at(-1),
            profile_pic: global.roundhouseTestAvatar || null,
            following_since: "2024-02-22T00:00:00Z",
            subscribed_for: 11,
          };
        } else if (pathname.endsWith("/polls")) data = { status: { code: 404 } };
        else if (pathname.startsWith("/emotes"))
          data = [{ name: "Emojis", emotes: [{ id: 123, name: "TestSmile", subscribers_only: false }] }];
        else if (pathname.includes("silenced-users")) data = [];
        else if (pathname === "/broadcasting/auth") return new Response("{}", { status: 403 });
        else if (pathname.endsWith("/test_live") || pathname.endsWith("/test_live/info"))
          data = {
            id: 1,
            user_id: 455,
            slug: "test_live",
            user: { id: 455, username: "Live channel" },
            chatroom: { id: 11 },
            livestream: {
              is_live: true,
              id: 21,
              session_title: "A test broadcast",
              thumbnail: {
                url: global.roundhouseTestThumbnailVersion
                  ? `https://media.fixture/fresh-thumbnail.svg?versionId=${global.roundhouseTestThumbnailVersion}`
                  : "https://media.fixture/missing-thumbnail.webp",
              },
            },
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
    await expect.poll(() => completedLogin.isClosed(), { timeout: 15000 }).toBe(true);
    await expect(page.getByRole("heading", { name: "Following" })).toBeVisible({ timeout: 20000 });
    await expect(page.getByText("A test broadcast", { exact: true })).toBeVisible();
    await expect(page.locator('.rh-titlebar button[aria-label="Settings"]')).toHaveCount(0);
    // A failed remote image must be replaced, not left as a broken image box.
    await expect(page.locator(".rh-channel:not(.rh-offline) .rh-placeholder")).toBeVisible();
    // A new overview refresh must fetch fresh metadata, then replace the pinned
    // thumbnail version. Adding a cache buster to the old image is insufficient.
    const thumbnail = page.locator(".rh-channel:not(.rh-offline) .rh-thumbnail > img");
    const previousRequests = await app.evaluate(() => global.roundhouseTestFollowRequests);
    for (const version of [1, 2]) {
      await app.evaluate((_, version) => {
        global.roundhouseTestThumbnailVersion = version;
      }, version);
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      await expect(thumbnail).toHaveAttribute("src", `https://media.fixture/fresh-thumbnail.svg?versionId=${version}`);
      await expect.poll(() => thumbnail.evaluate((img) => img.naturalWidth)).toBe(320);
    }
    const refreshedRequests = await app.evaluate(() => global.roundhouseTestFollowRequests);
    assert.ok(
      refreshedRequests.every(
        (request) => request.cache === "no-store" && new URL(request.url).searchParams.has("_roundhouse"),
      ),
    );
    assert.notEqual(
      new URL(previousRequests[0].url).searchParams.get("_roundhouse"),
      new URL(refreshedRequests.at(-1).url).searchParams.get("_roundhouse"),
    );
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
    const hoverEdge = async (edge) => {
      const rect = await page.locator(".rh-surface").boundingBox();
      await app.evaluate(
        ({ BrowserWindow }, { rect, edge }) => {
          const win = BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith("file:"));
          const origin = win.getContentBounds(),
            zoom = win.webContents.getZoomFactor();
          global.roundhouseTestCursor = {
            x:
              origin.x +
              (edge === "titlebar"
                ? origin.width / zoom - 200
                : edge === "divider"
                  ? rect.x + rect.width + 3
                  : rect.x + rect.width / 2) *
                zoom,
            y:
              origin.y +
              (edge === "titlebar"
                ? 10
                : rect.y + (edge === "top" ? 10 : edge === "bottom" ? rect.height - 10 : rect.height / 2)) *
                zoom,
          };
        },
        { rect, edge },
      );
      if (edge === "divider")
        await expect(page.getByRole("separator", { name: "Chat width" })).toHaveClass(/is-active/);
      else if (edge !== "center")
        await expect(
          page.locator(edge === "top" || edge === "titlebar" ? ".rh-watchbar" : ".rh-player-controls"),
        ).toHaveClass(/is-visible/);
    };
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
    const videoBefore = await page.locator(".rh-surface").boundingBox();
    assert.equal(videoBefore.height, (await page.locator(".rh-watch").boundingBox()).height);
    assert.equal(videoBefore.x + videoBefore.width, (await page.locator(".rh-chat").boundingBox()).x);
    await expect(page.locator(".rh-chat")).toHaveCSS("border-left-width", "1px");
    const titleBorder = await page.locator(".rh-titlebar").evaluate((el) => getComputedStyle(el).borderBottomColor);
    await expect(page.locator(".rh-chat")).toHaveCSS("border-left-color", titleBorder);
    await expect(page.locator(".rh-brand")).toHaveText("Roundhouse: Live channel - A test broadcast");
    await expect(page).toHaveTitle("Roundhouse: Live channel - A test broadcast");
    assert.equal(
      await app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((win) => win.webContents.getURL().startsWith("file:"))
          .getTitle(),
      ),
      "Roundhouse: Live channel - A test broadcast",
    );
    await expect(page.locator(".rh-chat .streamerName, .rh-chat .chatStreamerLiveStatus")).toHaveCount(0);
    await expect(page.locator(".rh-chat-tabs").getByRole("button", { name: "Chatters", exact: true })).toBeInViewport();
    const divider = page.getByRole("separator", { name: "Chat width" });
    await hoverEdge("divider");
    await expect(divider).toHaveCSS("cursor", "col-resize");
    await hoverEdge("center");
    await expect(divider).not.toHaveClass(/is-active/);
    await expect(divider).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
    const dragRect = await divider.boundingBox();
    const originalWidth = Number(await divider.getAttribute("aria-valuenow"));
    await page.mouse.move(dragRect.x + 3, dragRect.y + 180);
    await page.mouse.down();
    await page.mouse.move(dragRect.x - 57, dragRect.y + 180, { steps: 6 });
    await expect(divider).toHaveAttribute("aria-valuenow", String(originalWidth + 60));
    await expect(divider).toHaveClass(/is-active/);
    await page.mouse.up();
    await expect(divider).not.toHaveClass(/is-active/);
    await divider.focus();
    await page.keyboard.press("Home");
    const input = page.getByRole("textbox", { name: "Chat message" });
    await expect(input).toBeVisible();
    await expect(page.getByRole("button", { name: "Kick emotes", exact: true })).toBeVisible();
    await expect(page.getByRole("toolbar", { name: "Quick emotes" })).toBeVisible();
    const composerFits = await page.locator(".chatInputContainer").evaluate((el) => {
      const container = el.closest(".rh-chat").getBoundingClientRect(),
        input = el.getBoundingClientRect();
      return input.left >= container.left && input.right <= container.right && input.bottom <= container.bottom;
    });
    assert.equal(composerFits, true);
    await input.fill("Unsent test draft");
    await page.getByRole("button", { name: "Insert TestSmile" }).click();
    await expect(input.locator('img[emote-name="TestSmile"]')).toHaveCount(1);
    await page.getByRole("button", { name: "Kick emotes", exact: true }).click();
    await expect(page.locator(".emoteDialog.show")).toBeVisible();
    await input.click();
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("Fixture first line");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("Fixture second line");
    assert.equal(await app.evaluate(() => global.roundhouseTestMessages.length), 0);
    await expect(input).toContainText("Fixture second line");
    await page.keyboard.press("Enter");
    await expect.poll(() => app.evaluate(() => global.roundhouseTestMessages.length)).toBe(1);
    assert.equal(
      await app.evaluate(() => global.roundhouseTestMessages[0].content),
      "Fixture first line\nFixture second line",
    );
    await expect(input).toHaveText("");
    await page.keyboard.press("Enter");
    assert.equal(await app.evaluate(() => global.roundhouseTestMessages.length), 1);
    await require("./chat-ui.cjs")({ app, page, errors });
      await require("./chat-follow.cjs")({ page, getSocket: () => kickSocket });
      await require("./chat-freeze.cjs")({ app, page, getSocket: () => kickSocket, hoverEdge, errors });
    // Roundhouse owns its playback settings; chat settings remain separate.
    await expect(page.locator(".rh-ambient")).toBeVisible({ timeout: 10000 });
    const morph = await page.locator(".rh-ambient").evaluate((el) => {
      const [base, target] = el.querySelectorAll("canvas");
      const animation = target.getAnimations()[0];
      animation.pause();
      const duration = animation.effect.getTiming().duration;
      const opacity = [];
      for (const time of [0, duration / 2, duration]) {
        animation.currentTime = time;
        opacity.push(Number(getComputedStyle(target).opacity));
      }
      const baseOpacity = getComputedStyle(base).opacity;
      const alpha = base.getContext("2d").getImageData(48, 32, 1, 1).data[3];
      animation.play();
      return { duration, opacity, baseOpacity, alpha };
    });
    assert.equal(morph.duration, 2600);
    assert.deepEqual(morph.opacity, [0, 0.5, 1]);
    assert.equal(morph.baseOpacity, "1");
    assert.equal(morph.alpha, 255, "the old color field remains opaque throughout the morph");
    await require("./glow-dither.cjs")({ app, page });
    await hoverEdge("bottom");
    await page.getByRole("button", { name: "Roundhouse settings", exact: true }).click();
    const ambientSetting = page.getByRole("menuitemcheckbox", { name: "Ambient glow", exact: true });
    await expect(ambientSetting).toBeChecked();
    // Inspect the real HWND region, since Chromium screenshots omit child video.
    await expect
      .poll(async () => {
        const surface = await page.locator(".rh-surface").boundingBox();
        const menu = await page.locator(".rh-settings-menu").boundingBox();
        const geometry = await app.evaluate(({ app }) => {
          const path = process.getBuiltinModule("node:path");
          const { createRequire } = process.getBuiltinModule("node:module");
          const require = createRequire(path.join(app.getAppPath(), "package.json"));
          const addon = app.isPackaged
            ? path.join(process.resourcesPath, "native/roundhouse_host.node")
            : path.join(app.getAppPath(), "native/build/Release/roundhouse_host.node");
          return require(addon).geometry();
        });
        // Geometry is in physical pixels; the fixture runs with Chromium zoom 1.
        return geometry.bottom / (geometry.width / surface.width) > menu.y - surface.y + 20;
      })
      .toBe(true);
    await ambientSetting.click();
    await expect(ambientSetting).not.toBeChecked();
    await expect(page.locator(".rh-ambient")).toHaveCount(0);
    assert.equal(await page.evaluate(async () => (await window.app.store.get()).ambientGlow), false);
    await ambientSetting.click();
    await expect(ambientSetting).toBeChecked();
    await expect(page.locator(".rh-ambient")).toBeVisible({ timeout: 10000 });
    const intensity = page.getByRole("slider", { name: "Intensity", exact: true });
    const falloff = page.getByRole("slider", { name: "Distance falloff", exact: true });
    await intensity.focus();
    await page.keyboard.press("End");
    await expect(intensity).toHaveAttribute("aria-valuenow", "100");
    await expect(page.locator(".rh-ambient")).toHaveCSS("opacity", "1");
    await falloff.focus();
    await page.keyboard.press("Home");
    await expect(falloff).toHaveAttribute("aria-valuenow", "0");
    await expect(page.locator(".rh-ambient")).toHaveCSS("mask-image", "none");
    assert.equal(await page.evaluate(async () => (await window.app.store.get()).ambientFalloff), 0);
    await ambientSetting.click();
    await expect(intensity).toHaveAttribute("data-disabled", "");
    await page.getByRole("menuitem", { name: "Reset to defaults", exact: true }).click();
    const { GLOW_DEFAULTS } = await import("../utils/glow-settings.mjs");
    await expect(ambientSetting).toBeChecked();
    await expect(intensity).toHaveAttribute("aria-valuenow", String(GLOW_DEFAULTS.ambientIntensity));
    await expect(falloff).toHaveAttribute("aria-valuenow", String(GLOW_DEFAULTS.ambientFalloff));
    await expect(page.locator(".rh-ambient")).toBeVisible({ timeout: 10000 });
    assert.notEqual(await page.locator(".rh-ambient").evaluate((el) => getComputedStyle(el).maskImage), "none");
    const glowStore = await page.evaluate(() => window.app.store.get());
    for (const [key, value] of Object.entries(GLOW_DEFAULTS)) assert.equal(glowStore[key], value);
    const invalidGlow = await page.evaluate(async () => {
      const messages = [];
      for (const [key, value] of [
        ["ambientIntensity", -1],
        ["ambientFalloff", 101],
        ["ambientIntensity", "50"],
        ["ambientGlow", "yes"],
      ]) {
        try {
          await window.app.roundhouse.control(key, value);
          messages.push("accepted");
        } catch (error) {
          messages.push(error.message);
        }
      }
      return messages;
    });
    assert.ok(invalidGlow.every((message) => /Invalid ambient/.test(message)));
    await page.screenshot({ path: ".cache/ambient-settings.png" });
    await page.keyboard.press("Escape");
    assert.equal(await page.evaluate(async () => (await window.app.store.get()).ambientGlow), true);
    // Background-window hover must expose both bars before any activating click.
    await app.evaluate(() => {
      global.roundhouseTestFocused = false;
    });
    await hoverEdge("titlebar");
    await hoverEdge("center");
    await expect(page.locator(".rh-watchbar")).not.toHaveClass(/is-visible/);
    await hoverEdge("top");
    await hoverEdge("bottom");
    await page.getByRole("button", { name: "Mute", exact: true }).click();
    await expect(page.getByRole("button", { name: "Unmute", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Unmute", exact: true }).click();
    await app.evaluate(() => {
      global.roundhouseTestFocused = true;
    });
    await hoverEdge("bottom");
    assert.deepEqual(await page.locator(".rh-surface").boundingBox(), videoBefore);
    await page.getByRole("button", { name: "Pause", exact: true }).click();
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await hoverEdge("center");
    await expect(page.locator(".rh-player-controls")).not.toHaveClass(/is-visible/);
    await hoverEdge("bottom");
    const volume = page.getByRole("slider", { name: "Volume" });
    assert.equal((await page.locator(".sliderRoot.rh-volume").boundingBox()).width, 105);
    await volume.focus();
    await page.keyboard.press("Home");
    await expect(volume).toHaveAttribute("aria-valuenow", "0");
    await page.keyboard.press("ArrowRight");
    await expect(volume).toHaveAttribute("aria-valuenow", "1");
    await page.keyboard.press("End");
    await expect(volume).toHaveAttribute("aria-valuenow", "100");
    const quality = page.getByRole("button", { name: "Video quality", exact: true });
    await quality.click();
    await hoverEdge("center");
    await expect(page.locator(".rh-player-controls")).toHaveClass(/is-visible/);
    await expect(page.getByRole("menuitemradio", { name: "Auto quality" })).toBeChecked();
    await page.screenshot({ path: ".cache/player-quality-menu.png", animations: "disabled" });
    await page.getByRole("menuitemradio", { name: "720p", exact: true }).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect
      .poll(() => app.evaluate(() => global.roundhouseTestLoads.at(-1)))
      .toBe("https://media.fixture/720.m3u8");
    // Switching modes restarts only video, retaining quality, pause and chat.
    await page.evaluate(async () => {
      await window.app.roundhouse.control("volume", 35);
      await window.app.roundhouse.control("mute");
    });
    await expect(page.getByRole("button", { name: "Unmute", exact: true })).toBeVisible();
    await hoverEdge("bottom");
    const latency = page.getByRole("switch", { name: "Low latency", exact: true });
    await expect(latency).not.toBeChecked();
    const beforeModeChange = await app.evaluate(() => global.roundhouseTestChildren.length);
    await latency.click();
    await expect.poll(() => app.evaluate(() => global.roundhouseTestChildren.length)).toBe(beforeModeChange + 1);
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeEnabled({ timeout: 15000 });
    await expect(latency).toBeEnabled({ timeout: 15000 });
    await expect(latency).toBeChecked();
    await expect(quality).toHaveText("720p");
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeVisible();
    await expect(input).toBeVisible();
    await expect(volume).toHaveAttribute("aria-valuenow", "35");
    await expect(page.getByRole("button", { name: "Unmute", exact: true })).toBeVisible();
    assert.equal(await page.evaluate(async () => (await window.app.store.get()).lowLatency), true);
    assert.equal(await app.evaluate(() => global.roundhouseTestLoads.at(-1)), "https://media.fixture/720.m3u8");
    assert.ok(
      await app.evaluate(() => global.roundhouseTestChildren.at(-1).spawnargs.includes("--profile=low-latency")),
    );
    await expect
      .poll(() => app.evaluate(() => global.roundhouseTestChildren.filter((child) => child.exitCode === null).length))
      .toBe(1);
    const invalidLatency = await page.evaluate(async () => {
      try {
        await window.app.roundhouse.control("lowLatency", "yes");
        return "accepted";
      } catch (error) {
        return error.message;
      }
    });
    assert.match(invalidLatency, /Invalid low latency/);
    await input.focus();
    await hoverEdge("center");
    await expect(page.locator(".rh-player-controls")).not.toHaveClass(/is-visible/);
    // Keyboard focus reveals controls even with the pointer in the video center.
    await page.getByRole("button", { name: "← Following" }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Play", exact: true })).toBeFocused();
    await expect(page.locator(".rh-player-controls")).toHaveClass(/is-visible/);
    await input.focus();
    // Cinema keeps the existing chat mounted and uses the same MPV process.
    const beforeCinema = await app.evaluate(() => global.roundhouseTestChildren.length);
    await input.fill("Unsent cinema draft");
    await hoverEdge("bottom");
    await page.getByRole("button", { name: "Cinema", exact: true }).click();
    await expect(page.locator(".rh-titlebar")).toHaveCount(0);
    await expect(divider).toBeVisible();
    await expect(input).toHaveText("Unsent cinema draft");
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isFullScreen()), true);
    await input.focus();
    await page.keyboard.press("Escape");
    await expect(page.locator(".rh-titlebar")).toBeVisible();
    await expect(input).toHaveText("Unsent cinema draft");
    await input.fill("");
    await hoverEdge("bottom");
    await page.getByRole("button", { name: "Cinema", exact: true }).click();
    await expect(page.locator(".rh-titlebar")).toHaveCount(0);
    const cinemaWidth = Number(await divider.getAttribute("aria-valuenow"));
    await divider.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(divider).toHaveAttribute("aria-valuenow", String(cinemaWidth + 20));
    await hoverEdge("bottom");
    await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
    await expect(divider).toHaveCount(0);
    await hoverEdge("bottom");
    await page.getByRole("button", { name: "Cinema", exact: true }).click();
    await expect(divider).toBeVisible();
    await expect(divider).toHaveAttribute("aria-valuenow", String(cinemaWidth + 20));
    await hoverEdge("bottom");
    await page.screenshot({ path: ".cache/watch-cinema.png" });
    await page.getByRole("button", { name: "Exit cinema", exact: true }).click();
    await expect(page.locator(".rh-titlebar")).toBeVisible();
    assert.equal(await app.evaluate(() => global.roundhouseTestChildren.length), beforeCinema);
    await hoverEdge("top");
    assert.equal((await page.locator(".rh-surface").boundingBox()).height, videoBefore.height);
    await page.getByRole("button", { name: "← Following" }).click();
    await expect
      .poll(() => app.evaluate(() => global.roundhouseTestChildren.every((child) => child.exitCode !== null)))
      .toBe(true);
    await page.locator("summary").click();
    await page.getByRole("button", { name: /Offline channel/ }).click();
    await expect(page.getByRole("heading", { name: "This channel is offline" })).toBeVisible();
    await expect(latency).toBeChecked();
    await hoverEdge("bottom");
    await latency.click();
    await expect(latency).not.toBeChecked();
    assert.equal(await page.evaluate(async () => (await window.app.store.get()).lowLatency), false);
    const width = Number(await divider.getAttribute("aria-valuenow"));
    await divider.focus();
    await page.keyboard.press("ArrowLeft");
    await expect(divider).toHaveAttribute("aria-valuenow", String(width + 20));
    for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowRight");
    await expect(divider).toHaveAttribute("aria-valuenow", "280");
    assert.equal(
      await input.evaluate((el) => {
        const pane = el.closest(".rh-chat").getBoundingClientRect();
        const box = el.closest(".chatInputContainer").getBoundingClientRect();
        return box.left >= pane.left && box.right <= pane.right && box.bottom <= pane.bottom;
      }),
      true,
    );
    await expect(page.getByRole("button", { name: "Kick emotes", exact: true })).toBeInViewport();
    await page.keyboard.press("Home");
    await hoverEdge("bottom");
    await page.getByRole("button", { name: "Fullscreen", exact: true }).click();
    await expect(divider).toHaveCount(0);
    await quality.focus();
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("menu")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);
    await expect(divider).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(divider).toBeVisible();
    await page.screenshot({ path: ".cache/watch-offline.png" });
    await hoverEdge("bottom");
    await page.getByRole("button", { name: "Cinema", exact: true }).click();
    await expect(page.locator(".rh-titlebar")).toHaveCount(0);
    await hoverEdge("top");
    await page.getByRole("button", { name: "← Following" }).click();
    await expect(page.getByRole("heading", { name: "Following" })).toBeVisible();
    await expect(page.locator(".rh-titlebar")).toBeVisible();
    await expect(page).toHaveTitle("Roundhouse");
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
      "PASS: welcome, login dialog, session handoff, private bridge, follows, search, stale results, real embedded MPV with synthetic video, full-height video, edge hover and keyboard overlays, invisible divider hover/drag/cleanup, window title, compact chat header, Enter sends to fixture and Shift+Enter adds newline, emote insertion, narrow composer, pause, quality, process cleanup, offline chat, fullscreen, Back cleanup, isolated remote page.",
    );
  } finally {
    await app.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
