import { app, screen } from "electron";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { MpvIPC } from "./mpv-ipc.mjs";
import { parseQualities } from "./channels.mjs";
import store from "../../../utils/config";
import { latencyOptions } from "./playback-options.mjs";
import { LowLatencyStream } from "./low-latency.mjs";
import { GLOW_DEFAULTS } from "../../../utils/glow-settings.mjs";
import { PlaybackRecovery, shouldRecoverEnd } from "./playback-recovery.mjs";
import { PlaybackLog } from "./playback-log.mjs";

export class Player {
  constructor(account) {
    this.account = account;
    this.state = {
      status: "idle",
      pause: false,
      volume: 80,
      mute: false,
      qualities: [],
      quality: "auto",
      lowLatency: store.get("lowLatency"),
      ambientGlow: store.get("ambientGlow"),
      ambientIntensity: store.get("ambientIntensity"),
      ambientFalloff: store.get("ambientFalloff"),
      cacheAhead: 0,
    };
    this.generation = 0;
    this.log = new PlaybackLog(() => join(app.getPath("userData"), "logs"));
    this.recovery = new PlaybackRecovery({
      retry: (attempt) => {
        if (this.slug)
          void this.open(this.slug, {
            quality: this.state.quality,
            pause: this.state.pause,
            recovering: true,
            forceHls: this.forceHls || (this.state.lowLatency && attempt >= 2),
          });
      },
      waiting: (attempt, total, delay) => {
        this.log.record("reconnect-scheduled", { attempt, delay, transport: this.state.transport });
        this.emit({ status: "reconnecting", error: `Connection interrupted. Reconnecting (${attempt}/${total})…` });
      },
      exhausted: () => {
        this.log.record("reconnect-exhausted");
        this.emit({
          status: "error",
          error: "Could not restore playback. Check your connection, then retry the stream.",
        });
      },
    });
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
      const hoverTop = overTitlebar || (!!inside && y - rect.y < Math.max(64, rect.height * 0.15));
      const hoverBottom =
        !!inside && rect.y + rect.height - y < Math.max(64, rect.height * 0.15, rect.overlayBottom || 0);
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
      const videoClicks = this.host?.consumeClicks?.() || 0;
      const videoDoubleClicks = this.host?.consumeDoubleClicks?.() || 0;
      if (videoClicks || videoDoubleClicks)
        this.emit({
          ...(videoClicks ? { videoClick: (this.state.videoClick || 0) + videoClicks } : {}),
          ...(videoDoubleClicks
            ? { videoDoubleClick: (this.state.videoDoubleClick || 0) + videoDoubleClicks }
            : {}),
        });
    }, 100);
    this.window.once("closed", () => clearInterval(this.hoverTimer));
    this.ambientTimer = setInterval(() => this.sampleAmbient(), 3000);
    this.window.once("closed", () => clearInterval(this.ambientTimer));
  }
  sampleAmbient() {
    const dims = this.videoDimensions;
    if (
      this.sampling ||
      !this.ipc ||
      !this.state.ambientGlow ||
      this.state.ambientIntensity === 0 ||
      this.state.pause ||
      this.state.status !== "playing" ||
      !this.window?.isVisible() ||
      this.window.isMinimized() ||
      !this.rect?.visible ||
      !dims ||
      dims.ml + dims.mr + dims.mt + dims.mb < 4
    )
      return;
    const ipc = this.ipc;
    this.sampling = true;
    void ipc
      .command(["script-message", "roundhouse-ambient-sample"])
      .catch(() => {})
      .finally(() => {
        this.sampling = false;
      });
  }
  async mediaURL(url) {
    this.transport?.close();
    this.transport = null;
    this.emit({ transport: "hls" });
    if (!this.state.lowLatency || this.forceHls) return url;
    const generation = this.generation;
    const transport = new LowLatencyStream({
      onFailure: (error) => {
        if (generation === this.generation && this.transport === transport) {
          this.log.record("transport-failure", error);
          this.recovery.failure();
        }
      },
      onDiagnostic: (details) => this.log.record("transport-retry", details),
    });
    this.transport = transport;
    try {
      const local = await transport.start(url);
      if (generation !== this.generation || this.transport !== transport) throw new Error("Playback changed.");
      if (local) {
        this.emit({ transport: "prefetch" });
        return local;
      }
    } catch (error) {
      if (generation !== this.generation || this.transport !== transport) {
        transport.close();
        throw error;
      }
      // Ordinary HLS remains playable when prefetch is absent/unsupported.
      this.log.record("prefetch-unavailable", error);
    }
    transport.close();
    this.transport = null;
    return url;
  }
  async open(slug, { quality = "auto", pause = false, recovering = false, forceHls = false } = {}) {
    if (typeof slug !== "string" || !/^[a-zA-Z0-9_-]+$/.test(slug)) throw new Error("Invalid channel.");
    const generation = ++this.generation;
    if (!recovering) this.recovery.reset();
    this.forceHls = forceHls;
    this.slug = slug;
    await this.dispose();
    if (generation !== this.generation) return;
    this.emit({
      status: recovering ? "reconnecting" : "loading",
      error: recovering ? this.state.error : null,
      qualities: [],
      quality,
      pause,
      "paused-for-cache": false,
      ambientColors: null,
      hoverTop: false,
      hoverBottom: false,
      fallback: forceHls,
      cacheAhead: 0,
    });
    this.log.record(recovering ? "reconnect-start" : "playback-start", {
      generation,
      lowLatency: this.state.lowLatency,
      fallback: forceHls,
      paused: pause,
    });
    try {
      const { data } = await this.account.request(`/api/v2/channels/${slug}`, { cache: "no-store" });
      if (generation !== this.generation) return;
      if (!data || typeof data !== "object" || !Object.hasOwn(data, "livestream"))
        throw Object.assign(new Error("Kick did not return the channel's live status. Retry the stream."), {
          code: "KICK_ERROR",
        });
      if (!data.livestream || data.livestream.is_live === false) {
        this.recovery.halt();
        this.log.record("channel-offline");
        this.emit({ status: "offline" });
        return;
      }
      const startedAt = data.livestream.created_at ?? data.livestream.started_at ?? data.livestream.start_time;
      this.emit({
        startedAt: typeof startedAt === "string" && Number.isFinite(Date.parse(startedAt)) ? startedAt : null,
      });
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
          `--script=${join(base, app.isPackaged ? "player" : "resources/player", "ambient.lua")}`,
          ...latencyOptions(this.state.lowLatency),
        ],
        { windowsHide: true, stdio: "ignore" },
      ));
      child.on("error", () => {
        if (generation === this.generation && this.child === child) {
          this.log.record("mpv-start-failed");
          this.recovery.failure();
        }
      });
      child.on("exit", (exitCode) => {
        if (generation === this.generation && this.child === child) {
          this.transport?.close();
          this.transport = null;
          this.ipc?.close();
          this.host?.destroy();
          this.log.record("mpv-exit", { exitCode });
          this.recovery.failure();
        }
      });
      const ipc = (this.ipc = new MpvIPC());
      await ipc.connect(pipe);
      if (generation !== this.generation) {
        ipc.close();
        return;
      }
      ipc.onEvent = (event) => {
        if (generation !== this.generation || ipc !== this.ipc) return;
        if (event.event === "file-loaded") {
          this.recovery.playing();
          this.log.record("file-loaded", { transport: this.state.transport, fallback: this.forceHls });
          this.emit({ status: "playing", error: null });
          this.transport?.setPaused(this.state.pause);
        }
        if (event.event === "end-file") {
          this.log.record("mpv-end", { reason: event.reason, transport: this.state.transport });
          // EOF can mean a broken HTTP connection, not an offline broadcaster.
          // Only the fresh Kick channel response above may declare it offline.
          if (shouldRecoverEnd(event)) this.recovery.failure();
        }
        if (
          event.event === "property-change" &&
          ["pause", "volume", "mute", "paused-for-cache", "demuxer-cache-duration"].includes(event.name)
        )
          this.emit({
            [event.name === "demuxer-cache-duration" ? "cacheAhead" : event.name]:
              event.name === "demuxer-cache-duration" ? Math.max(0, Number(event.data) || 0) : event.data,
          });
        if (event.event === "property-change" && event.name === "osd-dimensions") {
          this.videoDimensions = event.data;
          const d = event.data;
          if (d?.w > 0 && d?.h > 0)
            this.emit({
              videoFrame: { left: d.ml / d.w, top: d.mt / d.h, right: 1 - d.mr / d.w, bottom: 1 - d.mb / d.h },
            });
          this.setBounds(this.rect);
        }
        if (event.event === "property-change" && event.name === "user-data/roundhouse/ambient") {
          const colors = event.data?.colors;
          if (
            this.state.ambientGlow &&
            Array.isArray(colors) &&
            colors.length === 24 &&
            colors.every(
              (color) =>
                Array.isArray(color) &&
                color.length === 3 &&
                color.every((value) => Number.isInteger(value) && value >= 0 && value <= 255),
            )
          ) {
            this.emit({ ambientColors: colors, ambientSampleMs: event.data.sampleMs });
            this.setBounds(this.rect);
          }
        }
      };
      // Apply saved values before observing, so MPV's initial defaults cannot
      // overwrite them while a mode change is restarting the process.
      await ipc.command(["set_property", "volume", this.state.volume]);
      await ipc.command(["set_property", "mute", this.state.mute]);
      await ipc.command(["set_property", "pause", pause]);
      for (const [index, property] of [
        "pause",
        "volume",
        "mute",
        "paused-for-cache",
        "demuxer-cache-duration",
        "osd-dimensions",
        "user-data/roundhouse/ambient",
      ].entries())
        await ipc.command(["observe_property", index, property]);
      const variant = this.qualities.find((q) => q.id === quality);
      const media = await this.mediaURL(variant?.url || this.qualities[0]?.url || this.url);
      if (generation !== this.generation) return;
      await ipc.command(["loadfile", this.state.lowLatency ? media : variant?.url || this.url, "replace"]);
      if (generation !== this.generation) return;
      this.emit({ quality: variant?.id || "auto", qualities: this.qualities.map(({ id, label }) => ({ id, label })) });
      this.setBounds(this.rect);
    } catch (error) {
      if (generation === this.generation) {
        await this.dispose();
        if (generation === this.generation) {
          this.log.record("playback-open-failed", { code: error.code || "UNKNOWN", status: error.status });
          if (["SESSION_EXPIRED", "CHALLENGE", "RATE_LIMIT"].includes(error.code)) {
            this.recovery.halt();
            this.emit({ status: "error", error: error.message });
          } else if (recovering || error.code === "NETWORK") this.recovery.failure();
          else this.emit({ status: "error", error: error.message });
        }
      }
    }
  }
  setBounds(rect) {
    if (!rect) return;
    if (!["x", "y", "width", "height"].every((k) => Number.isFinite(rect[k]) && rect[k] >= 0 && rect[k] < 20000))
      throw new Error("Invalid player rectangle.");
    const top = rect.overlayTop ?? 0,
      bottom = rect.overlayBottom ?? 0;
    if (![top, bottom].every((value) => Number.isFinite(value) && value >= 0 && value <= 512))
      throw new Error("Invalid player overlay bounds.");
    if (
      !Number.isFinite(rect.titlebarHeight ?? 0) ||
      (rect.titlebarHeight ?? 0) < 0 ||
      (rect.titlebarHeight ?? 0) > 256
    )
      throw new Error("Invalid title bar height.");
    if (!Number.isFinite(rect.dividerWidth ?? 0) || (rect.dividerWidth ?? 0) < 0 || (rect.dividerWidth ?? 0) > 16)
      throw new Error("Invalid divider width.");
    if (!Number.isFinite(rect.borderRadius ?? 0) || (rect.borderRadius ?? 0) < 0 || (rect.borderRadius ?? 0) > 64)
      throw new Error("Invalid player corner radius.");
    const holes = rect.overlayRects ?? [];
    if (
      !Array.isArray(holes) ||
      holes.length > 16 ||
      !holes.every(
        (hole) =>
          hole &&
          ["x", "y", "width", "height"].every(
            (key) => Number.isFinite(hole[key]) && hole[key] >= 0 && hole[key] < 20000,
          ),
      )
    )
      throw new Error("Invalid player overlay rectangles.");
    this.rect = rect;
    const zoom = this.window.webContents.getZoomFactor();
    const visible = !!rect.visible && !this.window.isMinimized();
    const d = this.videoDimensions;
    const clip =
      this.state.ambientGlow && this.state.ambientColors && d?.w > 0 && d?.h > 0
        ? [d.ml / d.w, d.mt / d.h, 1 - d.mr / d.w, 1 - d.mb / d.h]
        : [0, 0, 1, 1];
    this.host?.bounds(
      rect.x * zoom,
      rect.y * zoom,
      rect.width * zoom,
      rect.height * zoom,
      visible,
      top * zoom,
      bottom * zoom,
      ...clip,
      holes.flatMap((hole) => [hole.x * zoom, hole.y * zoom, hole.width * zoom, hole.height * zoom]),
      (rect.borderRadius || 0) * zoom,
    );
  }
  async control(action, value) {
    if (action === "resetGlow") {
      store.set({ ...GLOW_DEFAULTS });
      this.emit({ ...GLOW_DEFAULTS });
      this.setBounds(this.rect);
      this.sampleAmbient();
      return;
    }
    if (["ambientIntensity", "ambientFalloff"].includes(action)) {
      if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error("Invalid ambient setting.");
      store.set(action, value);
      this.emit({ [action]: value });
      return;
    }
    if (action === "ambientGlow") {
      if (typeof value !== "boolean") throw new Error("Invalid ambient glow setting.");
      store.set("ambientGlow", value);
      this.emit({ ambientGlow: value, ...(!value ? { ambientColors: null } : {}) });
      this.setBounds(this.rect);
      this.sampleAmbient();
      return;
    }
    if (action === "lowLatency") {
      if (typeof value !== "boolean") throw new Error("Invalid low latency setting.");
      if (value === this.state.lowLatency) return;
      store.set("lowLatency", value);
      this.emit({ lowLatency: value });
      if (this.slug) return this.open(this.slug, { quality: this.state.quality, pause: this.state.pause });
      return;
    }
    if (action === "retry" || action === "live") {
      if (this.slug) return this.open(this.slug, { quality: this.state.quality });
      return;
    }
    if (!this.ipc) throw new Error("No active stream.");
    switch (action) {
      case "pause":
        if (this.transport && this.state.pause) return this.open(this.slug, { quality: this.state.quality });
        this.transport?.setPaused(true);
        return this.ipc.command(["cycle", "pause"]);
      case "mute":
        return this.ipc.command(["cycle", "mute"]);
      case "volume":
        if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error("Invalid volume.");
        return this.ipc.command(["set_property", "volume", value]);
      case "quality": {
        const target = value === "auto" ? this.url : this.qualities.find((q) => q.id === value)?.url;
        if (!target) throw new Error("Invalid quality.");
        // Replace the playback generation before closing the old transport, so
        // its delayed EOF cannot trigger recovery for the newly selected quality.
        return this.open(this.slug, { quality: value, pause: this.state.pause });
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
    this.transport?.close();
    this.transport = null;
    this.videoDimensions = null;
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
    this.recovery.halt();
    const generation = ++this.generation;
    this.slug = null;
    await this.dispose();
    if (generation === this.generation)
      this.emit({ status: "idle", qualities: [], error: null, startedAt: null, cacheAhead: 0 });
  }
}
