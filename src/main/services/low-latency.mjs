import { createServer } from "node:http";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";

function mediaFailure(code, stage, status) {
  return Object.assign(new Error("Low latency media request failed."), { code, stage, status });
}
function describeFailure(error, stage) {
  if (error?.stage) return error;
  return mediaFailure(error?.name === "TimeoutError" ? "TIMEOUT" : "NETWORK", stage);
}
const transientStatus = (status) => status === 429 || status >= 500;

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
  constructor({ fetchMedia = fetch, onFailure = () => {}, onDiagnostic = () => {} } = {}) {
    this.fetchMedia = fetchMedia;
    this.onFailure = onFailure;
    this.onDiagnostic = onDiagnostic;
    this.abort = new AbortController();
  }
  async playlist() {
    for (let attempt = 0; ; attempt++) {
      try {
        const response = await this.fetchMedia(this.source, {
          signal: AbortSignal.any([this.abort.signal, AbortSignal.timeout(10000)]),
          cache: "no-store",
        });
        if (!response.ok) {
          await response.body?.cancel();
          throw mediaFailure("HTTP", "playlist", response.status);
        }
        const text = await response.text();
        try {
          return parseLivePlaylist(text, this.source);
        } catch {
          throw mediaFailure("FORMAT", "playlist");
        }
      } catch (error) {
        this.abort.signal.throwIfAborted();
        const failure = describeFailure(error, "playlist");
        if (attempt >= 2 || failure.code === "FORMAT" || (failure.status && !transientStatus(failure.status)))
          throw failure;
        this.onDiagnostic({ code: failure.code, stage: failure.stage, status: failure.status, attempt: attempt + 1 });
        await delay(250 * 2 ** attempt, undefined, { signal: this.abort.signal });
      }
    }
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
      void this.pump(response, initial).catch((error) => {
        if (!this.abort.signal.aborted) this.onFailure(describeFailure(error, "segment"));
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
      if (!playlist) throw mediaFailure("FORMAT", "playlist");
      // After a stalled connection, resume at the available window instead of
      // replaying an ever-growing backlog. Resuming a paused player opens a
      // fresh transport at the live edge instead of consuming buffered history.
      next = Math.max(next, playlist.segments[0]?.sequence || next);
      const segment = playlist.segments.find((item) => item.sequence === next);
      if (segment) {
        const signal = AbortSignal.any([this.abort.signal, AbortSignal.timeout(15000)]);
        let response;
        try {
          response = await this.fetchMedia(segment.url, { signal, cache: "no-store" });
        } catch (error) {
          throw describeFailure(error, "segment");
        }
        if (response.ok && response.body) {
          try {
            for await (const chunk of response.body) {
              if (!output.write(chunk)) await once(output, "drain", { signal: this.abort.signal });
            }
          } catch (error) {
            // Once bytes have reached MPV, replaying a partial segment would
            // duplicate MPEG-TS packets. Reconnect at a freshly resolved edge.
            throw describeFailure(error, "segment-body");
          }
          next++;
          retries = 0;
        } else {
          await response.body?.cancel();
          const retryable =
            transientStatus(response.status) || (segment.prefetch && [404, 425].includes(response.status));
          if (!retryable || ++retries > 24) throw mediaFailure("HTTP", "segment", response.status);
          this.onDiagnostic({ code: "HTTP", stage: "segment", status: response.status, attempt: retries });
          await delay(250, undefined, { signal: this.abort.signal });
        }
      } else {
        if (playlist.ended) {
          output.end();
          return;
        }
        if (++retries > 40) throw mediaFailure("STALLED", "playlist");
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
