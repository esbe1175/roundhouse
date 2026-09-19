import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeChannel,
  followPage,
  collectFollows,
  resolveFollowDetails,
  parseQualities,
} from "../src/main/services/channels.mjs";

test("normalizes live and offline channels without inventing viewer counts", () => {
  assert.equal(normalizeChannel({ slug: "offline", livestream: null }).live, false);
  const channel = normalizeChannel({
    slug: "live",
    user: { username: "Live" },
    livestream: {
      is_live: true,
      thumbnail: { url: "https://example.com/image" },
      categories: [{ name: "Games" }],
      created_at: "2026-09-19T10:00:00Z",
    },
  });
  assert.equal(channel.live, true);
  assert.equal(channel.viewers, null);
  assert.equal(channel.category, "Games");
  assert.equal(channel.startedAt, "2026-09-19T10:00:00Z");
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
  const url = "https://kick.com/api/v2/channels/followed-page";
  assert.deepEqual(followPage({ channels: [] }, url).channels, []);
  assert.throws(() => followPage({ message: "denied" }, url), /unfamiliar/);
  assert.throws(() => followPage({ channels: [{ unknown_slug: "missing" }] }, url), /unfamiliar/);
  assert.throws(() => followPage({ channels: [{ slug: "valid" }, null] }, url), /unfamiliar/);
});
test("reads the observed Kick Following schema and follows nextCursor, including zero", async () => {
  const calls = [];
  const result = await collectFollows(async (url) => {
    calls.push(url);
    const cursor = new URL(url).searchParams.get("cursor");
    return cursor === null
      ? { nextCursor: 0, channels: [{ channel_slug: "offline", user_username: "Offline name", is_live: false }] }
      : cursor === "0"
        ? {
            nextCursor: 5,
            channels: [
              {
                channel_slug: "live",
                user_username: "Live name",
                is_live: true,
                profile_picture: "https://example.com/avatar",
                banner_picture: "https://example.com/banner",
                category_name: "Games",
                viewer_count: 100,
                show_view_count: false,
              },
            ],
          }
        : {
            channels: [
              { channel_slug: "offline", is_live: false },
              { channel_slug: "last", is_live: false },
            ],
          };
  });
  assert.deepEqual(
    calls.map((url) => new URL(url).searchParams.get("cursor")),
    [null, "0", "5"],
  );
  assert.ok(calls.every((url) => new URL(url).pathname === "/api/v2/channels/followed-page"));
  assert.deepEqual(
    result.map((c) => c.slug),
    ["live", "last", "offline"],
  );
  assert.equal(result[0].name, "Live name");
  assert.equal(result[0].viewers, null);
  assert.equal(result[0].category, "Games");
  assert.equal(result[0].avatar, "https://example.com/avatar");
  assert.equal(result[0].thumbnail, "https://example.com/banner");
  await assert.rejects(
    collectFollows(async () => ({ channels: [], nextCursor: 5 })),
    /pagination/,
  );
});
test("resolves live metadata without requesting offline channels or exposing hidden viewer counts", async () => {
  const channels = [
    normalizeChannel({ channel_slug: "live", is_live: true, viewer_count: 50, show_view_count: false }),
    normalizeChannel({ channel_slug: "offline", is_live: false }),
  ];
  const calls = [];
  const result = await resolveFollowDetails(channels, async (url) => {
    calls.push(url);
    return {
      slug: "live",
      livestream: {
        is_live: true,
        session_title: "Current title",
        viewer_count: 50,
        thumbnail: { url: "https://example.com/live.jpg" },
      },
    };
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0], "https://kick.com/api/v2/channels/live/info");
  assert.equal(result[0].title, "Current title");
  assert.equal(result[0].thumbnail, "https://example.com/live.jpg");
  assert.equal(result[0].viewers, null);
  assert.equal(result[1].live, false);
  await assert.rejects(
    resolveFollowDetails(channels, async () => ({ slug: "unrelated" })),
    /unfamiliar/,
  );
  await assert.rejects(
    resolveFollowDetails(channels, async () => {
      throw new Error("rate limited");
    }),
    /rate limited/,
  );
});
test("rejects pagination leaving Kick and detects repeated pages", async () => {
  assert.throws(
    () =>
      followPage(
        { data: [], next_page_url: "https://evil.test/steal" },
        "https://kick.com/api/v2/channels/followed-page",
      ),
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
