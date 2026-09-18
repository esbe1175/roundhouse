import test from "node:test";
import assert from "node:assert/strict";
import { FilterEngine, FilterSession, compileRegexRules } from "../utils/chat-filters.mjs";
import { popupBounds, tooltipBounds } from "../utils/ui-geometry.mjs";

const settings = { enabled: true, duplicateEnabled: false };
const message = (id, content = "hello", username = "Viewer") => ({
  id,
  content,
  type: "message",
  sender: { username },
  created_at: `2026-09-18T12:00:${String(id).padStart(2, "0")}Z`,
});

test("user filters ignore capitalization and can be paused without losing rules", () => {
  const engine = new FilterEngine({ ...settings, blockedUsers: [" VIEWER "] });
  assert.equal(engine.evaluate({ username: "Viewer", text: "hello" }).reason, "user");
  engine.update({ ...engine.settings, enabled: false });
  assert.equal(engine.evaluate({ username: "Viewer", text: "hello" }).blocked, false);
});

test("duplicates are per user and bounded by both message count and time", () => {
  const engine = new FilterEngine({
    enabled: true,
    duplicateCount: 1,
    duplicateWindowMessages: 2,
    duplicateWindowSeconds: 10,
  });
  const a = { username: "A", text: "hi" },
    b = { username: "B", text: "hi" };
  assert.equal(engine.evaluate(a, 1000).blocked, false);
  assert.equal(engine.evaluate(b, 2000).blocked, false);
  assert.equal(engine.evaluate(a, 3000).reason, "duplicate");
  assert.equal(engine.evaluate(a, 14000).blocked, false);
  engine.evaluate({ username: "C", text: "other" }, 15000);
  engine.evaluate({ username: "D", text: "other" }, 16000);
  assert.equal(engine.evaluate(a, 17000).blocked, false);
});

test("incremental filtering never counts the same row twice or reveals a filtered row on pruning", () => {
  const session = new FilterSession(),
    config = { enabled: true, duplicateCount: 1 };
  const rows = [message(1), message(2), message(3, "different")];
  assert.deepEqual(
    session.apply(rows.slice(0, 2), config).map((m) => m.id),
    [1],
  );
  assert.deepEqual(
    session.apply(rows, config).map((m) => m.id),
    [1, 3],
  );
  assert.deepEqual(
    session.apply(rows.slice(1), config).map((m) => m.id),
    [3],
  );
});

test("text rules use ordered captures, skip invalid rules, and retain originals for reply/moderation", () => {
  const session = new FilterSession();
  const config = {
    ...settings,
    regexEnabled: true,
    regexRules: [
      { pattern: "[", flags: "i", action: "block" },
      { pattern: "(hello)", flags: "gi", action: "replace", replacement: "$1 there" },
      { pattern: "there spam", flags: "i", action: "block" },
    ],
  };
  const rows = [message(1, "hello hello [emote:123:hello]"), message(2, "hello spam")];
  const filtered = session.apply(rows, config);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].displayContent, "hello there hello there [emote:123:hello]");
  assert.equal(filtered[0].content, rows[0].content);
  assert.equal(rows[0].displayContent, undefined);
  assert.equal(compileRegexRules([{ pattern: "x", flags: "ii" }]).invalid.length, 1);
});

test("Kick and available 7TV emotes support selected/all filters, while notices survive", () => {
  const session = new FilterSession(),
    config = { ...settings, blockEmotes: true, blockedEmotes: ["smile"] };
  const rows = [
    message(1, "[emote:123:Smile]"),
    message(2, "Wave"),
    message(3, "ordinary"),
    { ...message(4, "[emote:123:Smile]"), type: "system" },
  ];
  const sets = [{ emotes: [{ name: "Wave" }] }];
  assert.deepEqual(
    session.apply(rows, config, sets).map((m) => m.id),
    [2, 3, 4],
  );
  assert.deepEqual(
    session.apply(rows, { ...config, blockedEmotes: [] }, sets).map((m) => m.id),
    [3, 4],
  );
  const highlighted = session.apply(rows, { ...config, highlightBlocked: true }, sets);
  assert.equal(highlighted[0].filterReason, "emote");
  assert.equal(highlighted[3].filterReason, undefined);
});

test("popups fit screen edges, small displays and monitors with negative coordinates", () => {
  assert.deepEqual(popupBounds({ x: 1919, y: 1079 }, { x: 0, y: 0, width: 1920, height: 1040 }), {
    x: 1320,
    y: 440,
    width: 600,
    height: 600,
  });
  assert.deepEqual(popupBounds({ x: -1920, y: 0 }, { x: -1920, y: 0, width: 1920, height: 1040 }), {
    x: -1920,
    y: 0,
    width: 600,
    height: 600,
  });
  assert.deepEqual(popupBounds({ x: 450, y: 300 }, { x: 0, y: 0, width: 500, height: 400 }), {
    x: 0,
    y: 0,
    width: 500,
    height: 400,
  });
});

test("tooltips prefer the right and clamp within chat without covering native video", () => {
  const area = { x: 900, y: 30, width: 360, height: 600 },
    size = { width: 200, height: 100 };
  assert.deepEqual(tooltipBounds({ x: 920, y: 100 }, size, area), { left: 935, top: 115 });
  assert.deepEqual(tooltipBounds({ x: 1250, y: 620 }, size, area), { left: 1052, top: 505 });
});
