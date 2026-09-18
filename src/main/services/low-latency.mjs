import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

// Kick/IVS advertises incomplete MPEG-TS segments using EXT-X-PREFETCH.
// FFmpeg's regular HLS demuxer ignores them. Feed their bytes to MPV as they
// arrive, instead of waiting for the segment to appear as a completed EXTINF.
export function parseLivePlaylist(text, base) {
  if (!text.startsWith("#EXTM3U") || text.length > 512 * 1024) throw new Error("Invalid media playlist.");
  if (/#EXT-X-(?:KEY|MAP|BYTERANGE|PART):/.test(text)) return null;
  let sequence = Number(/^#EXT-X-MEDIA-SEQUENCE:(\d+)/m.exec(text)?.[1] || 0);
  let duration = 2;
  const segments = [];
  for (const line of text.split(/\r?\n/).map((line) => line.trim())) {
    if (line.startsWith("#EXTINF:")) duration = Number(line.slice(8).split(",")[0]) || 2;
    const prefetch = line.startsWith("#EXT-X-PREFETCH:");
    if (!line || (line.startsWith("#") && !prefetch)) continue;
    const url = new URL(prefetch ? line.slice(16) : line, base);
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid media segment URL.");
    segments.push({ sequence: sequence++, url: url.href, prefetch, duration });
  }
  return { segments, ended: text.includes("#EXT-X-ENDLIST") };
}

export class LowLatencyStream {
  constructor({ fetchMedia = fetch, onFailure = () => {} } = {}) {
    this.fetchMedia = fetchMedia;
    this.onFailure = onFailure;
    this.abort = new AbortController();
  }
  async playlist() {
    const response = await this.fetchMedia(this.source, {
      signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(10000)]),
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Could not refresh the low latency playlist.");
    return parseLivePlaylist(await response.text(), this.source);
  }
  async start(source) {
    if (new URL(source).protocol !== "https:") throw new Error("Invalid playback URL.");
    this.source = source;
    const initial = await this.playlist();
    this.abort.signal.throwIfAborted();
    if (!initial || initial.ended || !initial.segments.some((segment) => segment.prefetch)) return null;
    const route = `/${randomBytes(24).toString("hex")}/live.ts`;
    this.server = createServer((request, response) => {
      if (request.method !== "GET" || request.url !== route || request.headers.origin || this.connected) {
        response.writeHead(404).end();
        return;
      }
      this.connected = true;
      response.writeHead(200, { "Content-Type": "video/mp2t", "Cache-Control": "no-store", Connection: "close" });
      response.flushHeaders();
      response.on("close", () => this.abort.abort());
      void this.pump(response, initial).catch(() => {
        if (!this.abort.signal.aborted)
          this.onFailure("Low latency media connection failed. Retry playback or turn low latency off.");
        response.destroy();
      });
    });
    this.server.listen(0, "127.0.0.1");
    await once(this.server, "listening");
    return `http://127.0.0.1:${this.server.address().port}${route}`;
  }
  async pump(output, playlist) {
    let next = playlist.segments.find((segment) => segment.prefetch).sequence;
    let retries = 0;
    while (!this.abort.signal.aborted) {
      while (this.paused) await delay(250, undefined, { signal: this.abort.signal });
      if (!playlist) throw new Error("Stream format changed.");
      // After a stalled connection, resume at the available window instead of
      // replaying an ever-growing backlog. Resuming a paused player opens a
      // fresh transport at the live edge instead of consuming buffered history.
      next = Math.max(next, playlist.segments[0]?.sequence || next);
      const segment = playlist.segments.find((item) => item.sequence === next);
      if (segment) {
        const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(15000)]);
        const response = await this.fetchMedia(segment.url, { signal, cache: "no-store" });
        if (response.ok && response.body) {
          for await (const chunk of response.body) {
            if (!output.write(chunk)) await once(output, "drain", { signal: this.abort.signal });
          }
          next++;
          retries = 0;
        } else {
          await response.body?.cancel();
          if (!segment.prefetch || ![404, 425, 503].includes(response.status) || ++retries > 24)
            throw new Error("Media segment unavailable.");
          await delay(250, undefined, { signal: this.abort.signal });
        }
      } else {
        if (playlist.ended) {
          output.end();
          return;
        }
        if (++retries > 40) throw new Error("Live playlist stopped advancing.");
        await delay(250, undefined, { signal: this.abort.signal });
      }
      playlist = await this.playlist();
    }
  }
  setPaused(paused) {
    this.paused = paused;
  }
  close() {
    this.abort.abort();
    this.server?.closeAllConnections();
    this.server?.close();
  }
}
