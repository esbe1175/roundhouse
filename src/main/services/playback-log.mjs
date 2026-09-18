import { appendFile, mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";

// No free-form errors, URLs, channel identifiers, headers or account data are
// accepted. Keep two small files so the previous failure survives an app restart.
export class PlaybackLog {
  constructor(directory, limit = 256 * 1024) {
    this.directory = directory;
    this.limit = limit;
    this.pending = Promise.resolve();
  }
  record(event, details = {}) {
    const row = { time: new Date().toISOString(), event };
    if (!/^[a-z-]{1,40}$/.test(event)) return;
    for (const key of ["attempt", "delay", "status", "exitCode", "generation"])
      if (Number.isFinite(details[key])) row[key] = details[key];
    const allowed = {
      reason: ["eof", "error", "stop", "quit", "redirect", "unknown"],
      stage: ["playlist", "segment", "segment-body"],
      transport: ["hls", "prefetch"],
      code: [
        "HTTP",
        "NETWORK",
        "TIMEOUT",
        "FORMAT",
        "STALLED",
        "SESSION_EXPIRED",
        "CHALLENGE",
        "RATE_LIMIT",
        "KICK_ERROR",
        "UNKNOWN",
      ],
    };
    for (const [key, values] of Object.entries(allowed)) if (values.includes(details[key])) row[key] = details[key];
    for (const key of ["lowLatency", "fallback", "paused"])
      if (typeof details[key] === "boolean") row[key] = details[key];
    this.pending = this.pending
      .then(async () => {
        const directory = typeof this.directory === "function" ? this.directory() : this.directory;
        await mkdir(directory, { recursive: true });
        const path = join(directory, "playback.log");
        if ((await stat(path).catch(() => ({ size: 0 }))).size >= this.limit) {
          await rm(path + ".1", { force: true });
          await rename(path, path + ".1");
        }
        await appendFile(path, JSON.stringify(row) + "\n");
      })
      .catch(() => {});
    return this.pending;
  }
}
