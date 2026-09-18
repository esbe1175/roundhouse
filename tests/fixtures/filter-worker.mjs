import { parentPort } from "node:worker_threads";
import { createFilterTask } from "../../utils/filter-worker-task.mjs";
const execute = createFilterTask();
parentPort.on("message", (data) => {
  const result = execute(data, (rule) => parentPort.postMessage({ type: "rule", id: data.id, rule }));
  parentPort.postMessage({ type: "result", id: data.id, result });
});
parentPort.postMessage({ type: "ready" });
