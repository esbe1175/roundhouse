const assert = require("node:assert/strict");

// Use the shipped component/filter and Chromium raster output, not a duplicate
// implementation. A constant dark field makes individual dither levels visible.
module.exports = async ({ app, page }) => {
  await page.locator(".rh-ambient-output").evaluate((source) => {
    const probe = source.cloneNode(true);
    probe.dataset.testid = "dither-probe";
    Object.assign(probe.style, {
      position: "fixed",
      left: "20px",
      top: "50px",
      width: "256px",
      height: "128px",
      zIndex: "999999",
    });
    const field = probe.querySelector(".rh-ambient");
    Object.assign(field.style, { maskImage: "none", opacity: "0.15" });
    for (const canvas of probe.querySelectorAll("canvas")) {
      const context = canvas.getContext("2d");
      context.fillStyle = "rgb(80,80,80)";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    document.body.append(probe);
  });
  const probe = page.getByTestId("dither-probe");
  const filter = await probe.evaluate((el) => el.style.filter);
  const stats = async (png) =>
    app.evaluate(({ nativeImage }, base64) => {
      const image = nativeImage.createFromBuffer(Buffer.from(base64, "base64"));
      const pixels = image.toBitmap();
      const counts = {};
      let total = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const value = pixels[i];
        counts[value] = (counts[value] || 0) + 1;
        total += value;
      }
      return { values: Object.keys(counts).map(Number), mean: total / (pixels.length / 4) };
    }, png.toString("base64"));
  try {
    await probe.evaluate((el) => {
      el.style.filter = "none";
    });
    const plain = await stats(await probe.screenshot());
    assert.equal(plain.values.length, 1);
    await probe.evaluate((el, filter) => {
      el.style.filter = filter;
    }, filter);
    const screenshot = await probe.screenshot({ path: ".cache/glow-dither-dark.png" });
    const dither = await stats(screenshot);
    assert.ok(dither.values.length >= 2, "dithering must survive the 15% intensity setting");
    assert.ok(
      dither.values.every((value) => Math.abs(value - plain.mean) <= 1),
      "noise is bounded to one display level",
    );
    assert.ok(Math.abs(dither.mean - plain.mean) < 0.1, "signed noise should preserve mean brightness");
    assert.deepEqual(await probe.screenshot(), screenshot, "fixed noise must not shimmer");
    console.log(
      `PASS: dark glow dither ${dither.values.join("/")} vs ${plain.mean} undithered, mean ${dither.mean.toFixed(3)}; static texture.`,
    );
    if (process.env.ROUNDHOUSE_BENCH_GLOW) {
      const cdp = await page.context().newCDPSession(page);
      try {
        for (const [width, height] of [
          [1920, 1080],
          [3840, 2160],
        ]) {
          await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
          for (const enabled of [false, true]) {
            const timing = await probe.evaluate(
              async (el, { enabled, filter }) => {
                Object.assign(el.style, {
                  left: "0",
                  top: "0",
                  width: "100vw",
                  height: "100vh",
                  filter: enabled ? filter : "none",
                });
                const canvases = el.querySelectorAll("canvas");
                const context = canvases[1].getContext("2d");
                context.fillStyle = "rgb(160,100,60)";
                context.fillRect(0, 0, 96, 64);
                const animation = canvases[1].animate([{ opacity: 0 }, { opacity: 1 }], {
                  duration: 2600,
                  iterations: Infinity,
                  direction: "alternate",
                });
                const intervals = [];
                let previous;
                for (let i = 0; i < 120; i++) {
                  const now = await new Promise(requestAnimationFrame);
                  if (i > 20) intervals.push(now - previous);
                  previous = now;
                }
                animation.cancel();
                intervals.sort((a, b) => a - b);
                return {
                  median: intervals[Math.floor(intervals.length / 2)],
                  p95: intervals[Math.floor(intervals.length * 0.95)],
                };
              },
              { enabled, filter },
            );
            console.log(
              `Glow frame pacing ${width}x${height}, dither ${enabled ? "on" : "off"}: median ${timing.median.toFixed(2)}ms, p95 ${timing.p95.toFixed(2)}ms`,
            );
          }
        }
      } finally {
        await cdp.send("Emulation.clearDeviceMetricsOverride");
        await cdp.detach();
      }
    }
  } finally {
    await probe.evaluate((el) => el.remove());
  }
};
