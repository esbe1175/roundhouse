// Real MPV/FFmpeg against a loopback HLS fixture; no Kick session or external media.
const { spawn } = require("node:child_process");
const { createServer } = require("node:http");
const { mkdtempSync, readFileSync } = require("node:fs");
const { resolve, join } = require("node:path");
const assert = require("node:assert/strict");

const mpv = resolve("resources/mpv/mpv.exe");
function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(mpv, ["--no-config", "--no-terminal", ...args], { windowsHide: true });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("MPV fixture timed out"));
    }, 15000);
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`MPV exited ${code}`));
    });
  });
}
(async () => {
  const { latencyOptions } = await import("../src/main/services/playback-options.mjs");
  const directory = mkdtempSync(resolve(".cache/latency-"));
  const segment = join(directory, "segment.ts");
  await run([
    "--ovc=mpeg2video",
    "--of=mpegts",
    `--o=${segment}`,
    "--frames=60",
    "--no-audio",
    "av://lavfi:testsrc=size=160x90:rate=30",
  ]);
  const media = readFileSync(segment);
  let requests = [];
  const server = createServer((req, res) => {
    if (req.url === "/live.m3u8") {
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.end(
        "#EXTM3U\n#EXT-X-TARGETDURATION:2\n#EXT-X-MEDIA-SEQUENCE:100\n" +
          Array.from({ length: 8 }, (_, i) => `#EXTINF:2,\n${100 + i}.ts\n`).join(""),
      );
    } else {
      requests.push(req.url);
      res.setHeader("Content-Type", "video/mp2t");
      res.end(media);
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/live.m3u8`;
    for (const enabled of [false, true, false]) {
      requests = [];
      await run(["--vo=null", "--ao=null", "--frames=1", ...latencyOptions(enabled), url]);
      assert.equal(requests[0], enabled ? "/107.ts" : "/105.ts");
    }
    console.log(
      "PASS: real HLS demuxer starts two 2-second segments closer to live with low latency; disabling restores normal startup.",
    );
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
