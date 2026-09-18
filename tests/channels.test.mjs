import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeChannel, followPage, collectFollows, parseQualities } from "../src/main/services/channels.mjs";

test("normalizes live and offline channels without inventing viewer counts", () => {
  assert.equal(normalizeChannel({ slug: "offline", livestream: null }).live, false);
  const channel = normalizeChannel({
    slug: "live",
    user: { username: "Live" },
    livestream: { is_live: true, thumbnail: { url: "https://example.com/image" }, categories: [{ name: "Games" }] },
  });
  assert.equal(channel.live, true);
  assert.equal(channel.viewers, null);
  assert.equal(channel.category, "Games");
  assert.equal(normalizeChannel({ slug: "../escape" }), null);
});
test("collects pages, deduplicates and sorts live channels before offline", async () => {
  let calls = 0;
  const result = await collectFollows(async () =>
    ++calls === 1
      ? { data: [{ slug: "a" }, { slug: "b", livestream: { viewer_count: 4 } }], current_page: 1, last_page: 2 }
      : { data: [{ slug: "b", livestream: { viewer_count: 5 } }, { slug: "c" }], current_page: 2, last_page: 2 },
  );
  assert.equal(calls, 2);
  assert.deepEqual(
    result.map((c) => c.slug),
    ["b", "a", "c"],
  );
  assert.equal(result[0].viewers, 5);
});
test("empty follows remain empty and malformed data is not mistaken for empty follows", () => {
  assert.deepEqual(followPage([], "https://kick.com/api/v2/channels/followed").channels, []);
  assert.throws(() => followPage({ message: "denied" }, "https://kick.com/api/v2/channels/followed"), /unfamiliar/);
});
test("rejects pagination leaving Kick and detects repeated pages", async () => {
  assert.throws(
    () =>
      followPage({ data: [], next_page_url: "https://evil.test/steal" }, "https://kick.com/api/v2/channels/followed"),
    /Invalid/,
  );
  await assert.rejects(
    collectFollows(async (url) => ({ data: [], next_page_url: url })),
    /pagination/,
  );
});
test("propagates expiry and rate limits without replacing successful cached data", async () => {
  for (const status of [401, 403, 429])
    await assert.rejects(
      collectFollows(async () => {
        throw Object.assign(new Error("failure"), { status });
      }),
      (error) => error.status === status,
    );
});
test("parses relative HLS quality variants and excludes non-HTTPS variants", () => {
  const result = parseQualities(
    "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=100,RESOLUTION=1280x720,FRAME-RATE=60\n720.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=200,RESOLUTION=1920x1080\n1080.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=1\nhttp://unsafe.test/low.m3u8",
    "https://media.example/live/master.m3u8",
  );
  assert.deepEqual(
    result.map((q) => q.label),
    ["1080p", "720p60"],
  );
  assert.equal(result[1].url, "https://media.example/live/720.m3u8");
});
