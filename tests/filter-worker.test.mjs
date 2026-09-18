import test from "node:test";
import assert from "node:assert/strict";
import { Worker } from "node:worker_threads";
import { FilterWorkerClient } from "../utils/filter-worker-client.mjs";

function client(t) {
  const runner = new FilterWorkerClient(
    () => {
      const worker = new Worker(new URL("./fixtures/filter-worker.mjs", import.meta.url));
      const adapter = { postMessage: (data) => worker.postMessage(data), terminate: () => worker.terminate() };
      worker.on("message", (data) => adapter.onmessage?.({ data }));
      worker.on("error", (error) => adapter.onerror?.(error));
      return adapter;
    },
    { budget: 150 },
  );
  t.after(() => runner.dispose());
  return runner;
}
const message = (id, content) => ({ id, content, type: "message", sender: { username: "fixture" } });
const task = (messages, regexRules) => ({
  messages,
  settings: { enabled: true, duplicateEnabled: false, regexEnabled: true, regexRules },
});

test(
  "the live freeze input times out in a worker; other rules and subsequent messages keep working",
  { timeout: 10000 },
  async (t) => {
    const runner = client(t);
    const bad = { pattern: "^(.{4,}?)(?:\\s*\\1)+$", flags: "iu", action: "replace", replacement: "$1" };
    const block = { pattern: "hide this", flags: "i", action: "block" };
    // Emote masking can produce the same long whitespace prefix as real input.
    const content = "[emote:1:Smile]".repeat(13) + " WEEE WONNNN";
    const job = task([message(1, content), message(2, "hide this"), message(3, "hello")], [bad, block]);
    let ticks = 0;
    const heartbeat = setInterval(() => ticks++, 10);
    t.after(() => clearInterval(heartbeat));
    const result = await runner.run(job);
    assert.deepEqual(result.paused, [1]);
    assert.deepEqual(
      result.result.map((m) => m.id),
      [1, 3],
    );
    assert.ok(ticks > 3, "the host stays responsive while a rule is stuck");
    assert.deepEqual(
      (await runner.run({ ...job, messages: [...job.messages, message(4, "next")] })).result.map((m) => m.id),
      [1, 3, 4],
    );
    const edited = await runner.run(
      task([message(5, "hello")], [{ ...bad, pattern: "hello", replacement: "edited" }, block]),
    );
    assert.deepEqual(edited.paused, []);
    assert.equal(edited.result[0].displayContent, "edited");
  },
);

test(
  "settings previews also contain catastrophic expressions and report the offending rule",
  { timeout: 10000 },
  async (t) => {
    const runner = client(t);
    const result = await runner.run({
      kind: "preview",
      sample: "a".repeat(100) + "!",
      settings: {
        regexRules: [
          { pattern: "^(a+)+$", flags: "", action: "block" },
          { pattern: "!", flags: "", action: "replace", replacement: "OK" },
        ],
      },
    });
    assert.deepEqual(result.paused, [1]);
    assert.equal(result.result[1].status, `Result: ${"a".repeat(100)}OK`);
  },
);

test("zero-width Unicode matches advance over emoji instead of looping", { timeout: 10000 }, async (t) => {
  const runner = client(t);
  for (const flags of ["u", "v"]) {
    const result = await runner.run(task([message(1, "😀 hello")], [{ pattern: "(?=.)", flags, action: "block" }]));
    assert.deepEqual(result.paused, []);
    assert.equal(result.result.length, 1);
  }
});

test("pending snapshots coalesce and disposal settles all requests", { timeout: 10000 }, async (t) => {
  const runner = client(t);
  const first = runner.run(task([message(1, "first")], []));
  const second = runner.run(task([message(2, "second")], []));
  const third = runner.run(task([message(3, "third")], []));
  assert.equal(await first, null);
  assert.equal(await second, null);
  assert.equal((await third).result[0].id, 3);
  const pending = runner.run(task([message(4, "pending")], []));
  runner.dispose();
  assert.equal(await pending, null);
});
