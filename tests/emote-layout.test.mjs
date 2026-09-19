import test from "node:test";
import assert from "node:assert/strict";
import { emoteDisplaySize, isZeroWidthEmote, STV_ZERO_WIDTH_FLAG } from "../utils/emote-layout.mjs";

test("only the 7TV zero-width flag creates an overlay", () => {
  assert.equal(isZeroWidthEmote(0), false);
  assert.equal(isZeroWidthEmote(1), false);
  assert.equal(isZeroWidthEmote(2), false);
  assert.equal(isZeroWidthEmote(STV_ZERO_WIDTH_FLAG), true);
  assert.equal(isZeroWidthEmote(STV_ZERO_WIDTH_FLAG | 2), true);
});

test("wide emotes reserve their aspect-ratio width and use loaded dimensions as a fallback", () => {
  assert.deepEqual(emoteDisplaySize(128, 32), { width: 128, height: 32 });
  assert.deepEqual(emoteDisplaySize(undefined, undefined, 96, 32), { width: 96, height: 32 });
  assert.deepEqual(emoteDisplaySize(32, 32, 128, 32), { width: 128, height: 32 });
  assert.deepEqual(emoteDisplaySize(32, 32), { width: 32, height: 32 });
});
