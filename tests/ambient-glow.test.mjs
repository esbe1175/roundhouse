import test from "node:test";
import assert from "node:assert/strict";
import { glowOpacity } from "../utils/ambient-glow.mjs";

test("glow has a smooth tail, rounded corners and an unfaded option", () => {
  const frame = { left: 0.2, right: 0.8, top: 0.2, bottom: 0.8 };
  const alpha = (x, y) => glowOpacity(x, y, frame, 1, 60);
  assert.equal(alpha(0.2, 0.5), 1);
  assert.ok(alpha(0.199, 0.5) > 0.999, "no abrupt slope at the picture edge");
  assert.ok(alpha(0.1, 0.5) > alpha(0, 0.5));
  assert.ok(alpha(0, 0.5) > 0, "no finite box cutoff");
  assert.ok(alpha(0.1, 0.1) < alpha(0.1, 0.5), "corners fade radially");
  assert.equal(glowOpacity(0, 0, frame, 1, 0), 1);
});

test("identical aspect ratios produce identical glow falloff at 1080p and 4K", () => {
  const frame = { left: 0.1, right: 0.9, top: 0.05, bottom: 0.95 };
  for (const falloff of [1, 35, 70, 100]) {
    for (const [x, y] of [
      [0, 0],
      [0.05, 0.5],
      [0.5, 0.02],
      [0.97, 0.8],
    ]) {
      assert.equal(glowOpacity(x, y, frame, 1920 / 1080, falloff), glowOpacity(x, y, frame, 3840 / 2160, falloff));
    }
  }
});
