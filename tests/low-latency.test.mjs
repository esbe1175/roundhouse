import test from "node:test";
import assert from "node:assert/strict";
import { LowLatencyStream, parseLivePlaylist } from "../src/main/services/low-latency.mjs";

const manifest =
  "#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:10\n#EXTINF:2,\n10.ts\n#EXTINF:2,\n11.ts\n#EXT-X-PREFETCH:12.ts\n#EXT-X-PREFETCH:13.ts\n";
test("Kick prefetch sequences follow completed segments, with unsupported formats falling back", () => {
  const parsed = parseLivePlaylist(manifest, "https://media.example/live.m3u8");
  assert.deepEqual(
    parsed.segments.map(({ sequence, prefetch }) => [sequence, prefetch]),
    [
      [10, false],
      [11, false],
      [12, true],
      [13, true],
    ],
  );
  assert.equal(parsed.segments[2].url, "https://media.example/12.ts");
  assert.equal(parseLivePlaylist(manifest + "#EXT-X-KEY:METHOD=AES-128\n", "https://media.example/live.m3u8"), null);
  assert.throws(
    () => parseLivePlaylist(manifest.replace("12.ts", "http://media.example/12.ts"), "https://media.example/live.m3u8"),
    /Invalid media/,
  );
});

test("prefetch bytes reach MPV before the segment completes; route is private and abort closes requests", async () => {
  let upstream, segmentSignal;
  const requested = [];
  const stream = new LowLatencyStream({
    fetchMedia: async (url, options) => {
      requested.push(url);
      if (url.endsWith("m3u8")) return new Response(manifest);
      segmentSignal = options.signal;
      return new Response(
        new ReadableStream({
          start(controller) {
            upstream = controller;
            controller.enqueue(new Uint8Array([0x47, 1, 2]));
            // Intentionally leave the segment incomplete, as IVS does at the edge.
          },
        }),
      );
    },
  });
  try {
    const url = await stream.start("https://media.example/live.m3u8");
    assert.equal((await fetch(new URL("/wrong/live.ts", url))).status, 404);
    assert.equal((await fetch(url, { headers: { Origin: "https://untrusted.example" } })).status, 404);
    const response = await fetch(url);
    const reader = response.body.getReader();
    const chunk = await Promise.race([
      reader.read(),
      new Promise((_, reject) => {
        const timer = setTimeout(() => reject(new Error("Buffered a whole segment")), 1500);
        timer.unref();
      }),
    ]);
    assert.deepEqual([...chunk.value], [0x47, 1, 2]);
    assert.ok(requested.includes("https://media.example/12.ts"));
    assert.ok(!requested.includes("https://media.example/10.ts"));
    assert.equal((await fetch(url)).status, 404);
    stream.close();
    assert.equal(segmentSignal.aborted, true);
    upstream.close();
    await reader.cancel().catch(() => {});
  } finally {
    stream.close();
  }
});

test("ordinary playlists do not start a prefetch transport", async () => {
  const stream = new LowLatencyStream({ fetchMedia: async () => new Response(manifest.split("#EXT-X-PREFETCH:")[0]) });
  try {
    assert.equal(await stream.start("https://media.example/live.m3u8"), null);
  } finally {
    stream.close();
  }
});

test("prefetch retries an unready edge, avoids replaying completed segments, pauses and reaches EOF", async () => {
  let attempts = 0;
  const delivered = [];
  const stream = new LowLatencyStream({
    fetchMedia: async (url) => {
      if (url.endsWith("m3u8")) {
        if (!delivered.length) return new Response(manifest);
        return new Response(
          "#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:12\n#EXTINF:2,\n12.ts\n#EXTINF:2,\n13.ts\n#EXT-X-ENDLIST\n",
        );
      }
      attempts++;
      if (attempts === 1) return new Response("", { status: 404 });
      const sequence = Number(new URL(url).pathname.match(/(\d+)\.ts/)[1]);
      delivered.push(sequence);
      return new Response(new Uint8Array([sequence]));
    },
  });
  try {
    stream.setPaused(true);
    const url = await stream.start("https://media.example/live.m3u8");
    const response = await fetch(url);
    assert.equal(attempts, 0);
    stream.setPaused(false);
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [12, 13]);
    assert.deepEqual(delivered, [12, 13]);
    assert.equal(attempts, 3);
  } finally {
    stream.close();
  }
});
