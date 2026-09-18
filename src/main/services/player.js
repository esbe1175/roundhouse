import { app, screen } from "electron";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { MpvIPC } from "./mpv-ipc.mjs";
import { parseQualities } from "./channels.mjs";

export class Player {
  constructor(account) {
    this.account = account;
    this.state = { status: "idle", pause: false, volume: 80, mute: false, qualities: [], quality: "auto" };
    this.generation = 0;
  }
  emit(patch) {
    Object.assign(this.state, patch);
    if (this.window && !this.window.isDestroyed()) this.window.webContents.send("roundhouse:player", this.state);
  }
  watchPointer() {
    // Native video receives mouse events instead of the DOM. Track edge hover in
    // screen DIPs, then convert to the same CSS coordinates as the player bounds.
    this.hoverTimer = setInterval(() => {
      if (!this.window || this.window.isDestroyed()) return;
      const bounds = this.window.getContentBounds();
      const point = screen.getCursorScreenPoint();
      const zoom = this.window.webContents.getZoomFactor();
      const x = (point.x - bounds.x) / zoom,
        y = (point.y - bounds.y) / zoom;
      const rect = this.rect;
      // Hover should work while another app has focus, just like the chat pane.
      // Only hidden/minimized windows should suppress the native-video controls.
      const active = this.slug && this.window.isVisible() && !this.window.isMinimized() && rect;
      const inside = active && x >= rect.x && x < rect.x + rect.width && y >= rect.y && y < rect.y + rect.height;
      const overTitlebar = !!active && x >= 0 && x < bounds.width / zoom && y >= 0 && y < (rect.titlebarHeight || 0);
      const hoverTop = overTitlebar || (!!inside && y - rect.y < 64);
      const hoverBottom = !!inside && rect.y + rect.height - y < 64;
      // The invisible divider sits over the first few pixels of chat. Native
      // video can swallow DOM mouseleave, so its hover must also use screen position.
      const hoverDivider =
        !!active &&
        x >= rect.x + rect.width &&
        x < rect.x + rect.width + (rect.dividerWidth || 0) &&
        y >= rect.y &&
        y < rect.y + rect.height;
      if (
        hoverTop !== this.state.hoverTop ||
        hoverBottom !== this.state.hoverBottom ||
        hoverDivider !== this.state.hoverDivider
      )
        this.emit({ hoverTop, hoverBottom, hoverDivider });
    }, 100);
    this.window.once("closed", () => clearInterval(this.hoverTimer));
  }
  async open(slug) {
    if (typeof slug !== "string" || !/^[a-zA-Z0-9_-]+$/.test(slug)) throw new Error("Invalid channel.");
    const generation = ++this.generation;
    this.slug = slug;
    await this.dispose();
    if (generation !== this.generation) return;
    this.emit({
      status: "loading",
      error: null,
      qualities: [],
      quality: "auto",
      pause: false,
      hoverTop: false,
      hoverBottom: false,
    });
    try {
      const { data } = await this.account.request(`/api/v2/channels/${slug}`);
      if (generation !== this.generation) return;
      if (!data.livestream || data.livestream.is_live === false) {
        this.emit({ status: "offline" });
        return;
      }
      const url = new URL(data.playback_url);
      if (url.protocol !== "https:") throw new Error("Kick did not return an HTTPS playback URL.");
      this.url = url.href;
      this.qualities = [];
      try {
        const response = await fetch(this.url, { signal: AbortSignal.timeout(12000) });
        if (response.ok) this.qualities = parseQualities(await response.text(), this.url);
      } catch {
        /* Master playback is still usable when quality inspection fails. */
      }
      if (generation !== this.generation) return;
      const base = app.isPackaged ? process.resourcesPath : app.getAppPath();
      const executable = join(base, app.isPackaged ? "mpv" : "resources/mpv", "mpv.exe");
      const addon = join(base, app.isPackaged ? "native" : "native/build/Release", "roundhouse_host.node");
      if (!existsSync(executable) || !existsSync(addon))
        throw new Error("Player files are missing. Run npm run setup:mpv and npm run build:native.");
      this.host = require(addon);
      const handle = this.host.create(this.window.getNativeWindowHandle());
      const pipe = `\\\\.\\pipe\\roundhouse-${process.pid}-${generation}`;
      const child = (this.child = spawn(
        executable,
        [
          `--wid=${handle}`,
          `--input-ipc-server=${pipe}`,
          "--idle=yes",
          "--force-window=yes",
          "--no-config",
          "--no-terminal",
          "--osc=no",
          "--input-default-bindings=no",
          "--input-vo-keyboard=no",
          "--input-cursor-passthrough=yes",
          "--hwdec=auto-safe",
          "--keep-open=no",
          "--ytdl=no",
        ],
        { windowsHide: true, stdio: "ignore" },
      ));
      child.on("error", () => {
        if (generation === this.generation) this.emit({ status: "error", error: "Could not start MPV." });
      });
      child.on("exit", () => {
        if (generation === this.generation) {
          this.ipc?.close();
          this.host?.destroy();
          this.emit({ status: "error", error: "MPV closed. Retry playback." });
        }
      });
      const ipc = (this.ipc = new MpvIPC());
      await ipc.connect(pipe);
      if (generation !== this.generation) {
        ipc.close();
        return;
      }
      ipc.onEvent = (event) => {
        if (generation !== this.generation) return;
        if (event.event === "file-loaded") this.emit({ status: "playing", error: null });
        if (event.event === "end-file")
          this.emit({
            status: event.reason === "error" ? "error" : "ended",
            error:
              event.reason === "error" ? "Playback ended unexpectedly. Retry to resolve a fresh stream URL." : null,
          });
        if (event.event === "property-change" && ["pause", "volume", "mute", "paused-for-cache"].includes(event.name))
          this.emit({ [event.name]: event.data });
      };
      for (const [index, property] of ["pause", "volume", "mute", "paused-for-cache"].entries())
        await ipc.command(["observe_property", index, property]);
      await ipc.command(["set_property", "volume", this.state.volume]);
      await ipc.command(["set_property", "mute", this.state.mute]);
      await ipc.command(["loadfile", this.url, "replace"]);
      if (generation !== this.generation) return;
      this.emit({ qualities: this.qualities.map(({ id, label }) => ({ id, label })) });
      this.setBounds(this.rect);
    } catch (error) {
      if (generation === this.generation) {
        await this.dispose();
        if (generation === this.generation) this.emit({ status: "error", error: error.message });
      }
    }
  }
  setBounds(rect) {
    if (!rect) return;
    if (!["x", "y", "width", "height"].every((k) => Number.isFinite(rect[k]) && rect[k] >= 0 && rect[k] < 20000))
      throw new Error("Invalid player rectangle.");
    const top = rect.overlayTop ?? 0,
      bottom = rect.overlayBottom ?? 0;
    if (![top, bottom].every((value) => Number.isFinite(value) && value >= 0 && value <= 256))
      throw new Error("Invalid player overlay bounds.");
    if (
      !Number.isFinite(rect.titlebarHeight ?? 0) ||
      (rect.titlebarHeight ?? 0) < 0 ||
      (rect.titlebarHeight ?? 0) > 256
    )
      throw new Error("Invalid title bar height.");
    if (!Number.isFinite(rect.dividerWidth ?? 0) || (rect.dividerWidth ?? 0) < 0 || (rect.dividerWidth ?? 0) > 16)
      throw new Error("Invalid divider width.");
    this.rect = rect;
    const zoom = this.window.webContents.getZoomFactor();
    const visible = !!rect.visible && !this.window.isMinimized();
    this.host?.bounds(
      rect.x * zoom,
      rect.y * zoom,
      rect.width * zoom,
      rect.height * zoom,
      visible,
      top * zoom,
      bottom * zoom,
    );
  }
  async control(action, value) {
    if (action === "retry" || action === "live") {
      if (this.slug) return this.open(this.slug);
      return;
    }
    if (!this.ipc) throw new Error("No active stream.");
    switch (action) {
      case "pause":
        return this.ipc.command(["cycle", "pause"]);
      case "mute":
        return this.ipc.command(["cycle", "mute"]);
      case "volume":
        if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error("Invalid volume.");
        return this.ipc.command(["set_property", "volume", value]);
      case "quality": {
        const target = value === "auto" ? this.url : this.qualities.find((q) => q.id === value)?.url;
        if (!target) throw new Error("Invalid quality.");
        await this.ipc.command(["loadfile", target, "replace"]);
        this.emit({ quality: value });
        return;
      }
      default:
        throw new Error("Unknown player action.");
    }
  }
  async dispose() {
    if (this.disposing) return this.disposing;
    const child = this.child,
      ipc = this.ipc,
      host = this.host;
    this.child = null;
    this.ipc = null;
    this.host = null;
    this.disposing = (async () => {
      if (ipc) {
        await ipc.command(["quit"]).catch(() => {});
        ipc.close();
      }
      if (child && child.exitCode === null) {
        await new Promise((resolve) => {
          const timer = setTimeout(() => {
            child.kill();
            resolve();
          }, 1000);
          child.once("exit", () => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
      host?.destroy();
    })();
    try {
      await this.disposing;
    } finally {
      this.disposing = null;
    }
  }
  async stop() {
    const generation = ++this.generation;
    this.slug = null;
    await this.dispose();
    if (generation === this.generation) this.emit({ status: "idle", qualities: [], error: null });
  }
}
