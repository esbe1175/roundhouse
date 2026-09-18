const { expect } = require("@playwright/test");
const assert = require("node:assert/strict");

module.exports = async ({ app, page }) => {
  await page.evaluate(async () => {
    window.__recoveryStatuses = [];
    window.__stopRecoveryObserve = window.app.roundhouse.onPlayer((state) => {
      window.__recoveryState = state;
      if (window.__recoveryStatuses.at(-1) !== state.status) window.__recoveryStatuses.push(state.status);
    });
    await window.app.roundhouse.control("lowLatency", true);
  });
  const state = () => page.evaluate(() => window.__recoveryState);
  const loads = () => app.evaluate(() => global.roundhouseTestLoads.length);
  const end = (...reasons) =>
    app.evaluate((_, reasons) => {
      for (const reason of reasons)
        global.roundhouseTestSocket.emit("data", Buffer.from(JSON.stringify({ event: "end-file", reason }) + "\n"));
    }, reasons);
  const baselineFetch = await app.evaluate(({ session }) => {
    global.roundhouseRecoveryFetch = session.fromPartition("persist:roundhouse-kick").fetch;
    return true;
  });
  assert.ok(baselineFetch);
  try {
    await expect.poll(async () => (await state()).status).toBe("playing");
    await page.evaluate(async () => {
      await window.app.roundhouse.control("volume", 37);
      await window.app.roundhouse.control("mute");
      await window.app.roundhouse.control("pause");
    });
    await expect.poll(async () => (await state()).pause).toBe(true);
    const chosen = (await state()).qualities[0].id;
    await page.evaluate((quality) => window.app.roundhouse.control("quality", quality), chosen);
    await expect.poll(async () => (await state()).status).toBe("playing");
    const before = await loads();
    await end("error", "eof");
    await expect(page.getByRole("heading", { name: "Reconnecting to the stream…" })).toBeVisible();
    await expect.poll(loads, { timeout: 15000 }).toBe(before + 1);
    await expect.poll(async () => (await state()).status).toBe("playing");
    assert.equal((await state()).pause, true);
    assert.equal((await state()).mute, true);
    assert.equal((await state()).volume, 37);
    assert.equal((await state()).quality, chosen);
    await end("eof");
    await expect.poll(loads, { timeout: 15000 }).toBe(before + 2);
    await expect.poll(async () => (await state()).status).toBe("playing");
    assert.equal((await state()).fallback, true);
    assert.equal((await state()).lowLatency, true);
    assert.ok(!(await page.evaluate(() => window.__recoveryStatuses)).includes("ended"));
    // Only a fresh, successful Kick channel response may mark it offline.
    await app.evaluate(({ session }) => {
      session.fromPartition("persist:roundhouse-kick").fetch = async (url, options) => {
        if (new URL(url).pathname === "/api/v2/channels/test_live")
          return new Response(JSON.stringify({ livestream: null }), { status: 200 });
        return global.roundhouseRecoveryFetch(url, options);
      };
    });
    await end("eof");
    await expect(page.getByRole("heading", { name: "This channel is offline" })).toBeVisible({ timeout: 15000 });
    assert.equal(await loads(), before + 2);
    await app.evaluate(({ session }) => {
      session.fromPartition("persist:roundhouse-kick").fetch = global.roundhouseRecoveryFetch;
    });
    await page.evaluate(() => window.app.roundhouse.control("retry"));
    await expect.poll(async () => (await state()).status).toBe("playing");
    // Switching/retrying invalidates a queued reconnect from the old generation.
    await end("eof");
    await page.evaluate(() => window.app.roundhouse.control("retry"));
    await expect.poll(async () => (await state()).status).toBe("playing");
    const afterManual = await loads();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    assert.equal(await loads(), afterManual);
    const history = await app.evaluate(async ({ app }) => {
      const fs = process.getBuiltinModule("node:fs/promises");
      return fs.readFile(app.getPath("userData") + "/logs/playback.log", "utf8");
    });
    assert.match(history, /reconnect-scheduled/);
    assert.match(history, /channel-offline/);
    assert.ok(!history.includes("https://") && !history.includes("test-only"));
    console.log(
      "PASS: real MPV error+EOF coalesce, reconnect keeps preferences, repeated failure falls back to HLS, offline requires Kick confirmation, manual retry cancels stale recovery, private diagnostic log.",
    );
  } finally {
    await app.evaluate(({ session }) => {
      session.fromPartition("persist:roundhouse-kick").fetch = global.roundhouseRecoveryFetch;
    });
    await page.evaluate(async () => {
      await window.app.roundhouse.control("lowLatency", false);
      await window.app.roundhouse.control("quality", "auto");
      await window.app.roundhouse.control("volume", 80);
      if (window.__recoveryState.mute) await window.app.roundhouse.control("mute");
      if (window.__recoveryState.pause) await window.app.roundhouse.control("pause");
      window.__stopRecoveryObserve();
    });
  }
};
