import { createFilterTask } from "../../../../utils/filter-worker-task.mjs";

const execute = createFilterTask();
self.onmessage = ({ data }) => {
  const { id } = data;
  try {
    const result = execute(data, (rule) => self.postMessage({ type: "rule", id, rule }));
    self.postMessage({ type: "result", id, result });
  } catch {
    self.postMessage({ type: "result", id, error: "Text filtering failed. Filtering is paused for this view." });
  }
};
self.postMessage({ type: "ready" });
