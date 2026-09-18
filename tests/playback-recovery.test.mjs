import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PlaybackRecovery, shouldRecoverEnd } from "../src/main/services/playback-recovery.mjs";
import { PlaybackLog } from "../src/main/services/playback-log.mjs";

function clock() {
  let now = 0,
    id = 0;
  const pending = new Map();
  return {
    setTimer: (fn, delay) => {
      pending.set(++id, { fn, due: now + delay });
      return id;
    },
    clearTimer: (key) => pending.delete(key),
    advance: (ms) => {
      const end = now + ms;
      for (;;) {
        const next = [...pending].sort((a, b) => a[1].due - b[1].due)[0];
        if (!next || next[1].due > end) break;
        pending.delete(next[0]);
        now = next[1].due;
        next[1].fn();
      }
      now = end;
    },
  };
}

test("a transport failure plus MPV EOF schedules one bounded recovery; flapping does not reset its budget", () => {
  const time = clock(),
    retries = [],
    waiting = [];
  let exhausted = 0;
  const recovery = new PlaybackRecovery({
    ...time,
    retry: (n) => retries.push(n),
    waiting: (n) => waiting.push(n),
    exhausted: () => exhausted++,
  });
  for (const delay of [1000, 3000, 8000]) {
    recovery.failure();
    recovery.failure();
    time.advance(delay - 1);
    assert.equal(retries.length, waiting.length - 1);
    time.advance(1);
    recovery.playing();
    time.advance(100);
  }
  recovery.failure();
  recovery.failure();
  time.advance(60000);
  assert.deepEqual(retries, [1, 2, 3]);
  assert.deepEqual(waiting, [1, 2, 3]);
  assert.equal(exhausted, 1);
});

test("stable playback renews the budget; Back/logout/offline cancels pending recovery", () => {
  const time = clock(),
    retries = [];
  const recovery = new PlaybackRecovery({
    ...time,
    retry: (n) => retries.push(n),
    waiting: () => {},
    exhausted: () => {},
  });
  recovery.failure();
  time.advance(1000);
  recovery.playing();
  time.advance(30000);
  recovery.failure();
  time.advance(1000);
  assert.deepEqual(retries, [1, 1]);
  recovery.failure();
  recovery.halt();
  time.advance(60000);
  recovery.failure();
  time.advance(60000);
  assert.deepEqual(retries, [1, 1]);
  recovery.reset();
  recovery.failure();
  time.advance(1000);
  assert.deepEqual(retries, [1, 1, 1]);
});

test("only interrupted media events recover; stop, quit and redirects cannot declare the channel offline", () => {
  for (const reason of ["eof", "error", "unknown"]) assert.equal(shouldRecoverEnd({ event: "end-file", reason }), true);
  for (const reason of ["stop", "quit", "redirect"])
    assert.equal(shouldRecoverEnd({ event: "end-file", reason }), false);
  assert.equal(shouldRecoverEnd({ event: "file-loaded" }), false);
});

test("playback diagnostics rotate and cannot persist URLs, free-form errors or credentials", async () => {
  const directory = await mkdtemp(join(tmpdir(), "roundhouse-log-"));
  try {
    const log = new PlaybackLog(directory, 180);
    for (let i = 0; i < 8; i++)
      await log.record("transport-failure", {
        stage: "playlist",
        code: "HTTP",
        status: 503,
        url: "https://private.example/?token=secret",
        error: "secret",
        cookies: "secret",
        channel: "secret",
      });
    assert.deepEqual((await readdir(directory)).sort(), ["playback.log", "playback.log.1"]);
    for (const file of await readdir(directory)) {
      const text = await readFile(join(directory, file), "utf8");
      assert.ok(!text.includes("secret") && !text.includes("private.example"));
      assert.ok(text.length < 500);
      const rows = text.trim().split("\n").map(JSON.parse);
      assert.ok(rows.every((row) => row.status === 503 && row.stage === "playlist"));
    }
  } finally {
    assert.ok(directory.startsWith(join(tmpdir(), "roundhouse-log-")));
    await rm(directory, { recursive: true, force: true });
  }
});
