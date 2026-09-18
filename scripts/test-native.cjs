const { spawnSync } = require("node:child_process");
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
for (const scale of ["1", "1.5"]) {
  const result = spawnSync(require("electron"), ["tests/native-host.cjs"], {
    env: { ...env, ROUNDHOUSE_TEST_SCALE: scale },
    stdio: "inherit",
    timeout: 30000,
  });
  if (result.status !== 0) {
    console.error(result.error || "Native integration test failed");
    process.exit(result.status || 1);
  }
}
