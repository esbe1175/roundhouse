import { test } from "node:test";
import assert from "node:assert/strict";
import { validateOperation } from "../src/main/services/ipc-validation.mjs";
test("accepts valid chat operations while rejecting URL/path injection", () => {
  assert.doesNotThrow(() => validateOperation("sendMessageToChannel", [123, "Hello"]));
  for (const slug of ["../logout", "https://example.com", "user?redirect=x", "user/newline"])
    assert.throws(() => validateOperation("getChannelInfo", [slug]), /identifier/);
  assert.throws(() => validateOperation("getDeleteMessage", [123, "../other"]), /identifier/);
});
test("validates chat subscription and pin targets", () => {
  assert.doesNotThrow(() => validateOperation("getKickAuthForEvents", ["private-livestream.123", "123.456"]));
  assert.throws(() => validateOperation("getKickAuthForEvents", ["anything", "not-a-socket"]), /subscription/);
  assert.throws(() => validateOperation("getPinMessage", [{ chatroomName: "../other", chatroom_id: 123 }]), /pin/);
});
test("rejects empty or oversized messages", () => {
  for (const text of ["", " ", "x".repeat(5001)])
    assert.throws(() => validateOperation("sendReplyToChannel", [123, text, {}]), /message/);
});
