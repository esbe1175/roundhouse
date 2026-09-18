import { test } from "node:test";
import assert from "node:assert/strict";
import { MpvIPC } from "../src/main/services/mpv-ipc.mjs";

test("matches out-of-order replies across fragmented IPC messages", async () => {
  const ipc = new MpvIPC(),
    writes = [];
  ipc.socket = { write: (line) => writes.push(JSON.parse(line)), destroy() {} };
  const first = ipc.command(["get_property", "pause"]),
    second = ipc.command(["get_property", "volume"]);
  const events = [];
  ipc.onEvent = (event) => events.push(event);
  ipc.feed('{"request_id":2,"error":"success","data":80}\n{"request_');
  ipc.feed('id":1,"error":"success","data":false}\n{"event":"file-loaded"}\n');
  assert.equal(await first, false);
  assert.equal(await second, 80);
  assert.equal(events[0].event, "file-loaded");
  assert.equal(writes[0].request_id, 1);
  ipc.close();
});
test("rejects pending commands when the player disconnects", async () => {
  const ipc = new MpvIPC();
  ipc.socket = { write() {}, destroy() {} };
  const pending = ipc.command(["loadfile", "https://example.com/stream"]);
  ipc.close();
  await assert.rejects(pending, /disconnected/);
  assert.equal(ipc.pending.size, 0);
});
test("rejects MPV errors without treating them as playback events", async () => {
  const ipc = new MpvIPC();
  ipc.socket = { write() {}, destroy() {} };
  const pending = ipc.command(["set_property", "volume", 500]);
  ipc.feed('{"request_id":1,"error":"invalid parameter"}\n');
  await assert.rejects(pending, /invalid parameter/);
  ipc.close();
});
