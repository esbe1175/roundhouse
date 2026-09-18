import { useEffect, useMemo, useRef, useState } from "react";
import { FilterSession } from "../../../../utils/chat-filters.mjs";
import { FilterWorkerClient } from "../../../../utils/filter-worker-client.mjs";

export function useFilterWorker(task, identity) {
  const client = useRef(null);
  const latestTask = useRef(task);
  latestTask.current = task;
  const [output, setOutput] = useState(null);
  useEffect(() => {
    const worker = new FilterWorkerClient(
      () => new Worker(new URL("./filter.worker.js", import.meta.url), { type: "module" }),
    );
    client.current = worker;
    setOutput(null);
    return () => {
      worker.dispose();
      client.current = null;
    };
  }, [identity]);
  useEffect(() => {
    if (!task) return;
    const worker = client.current;
    worker.run(task).then((value) => {
      const latest = latestTask.current;
      // Render completed snapshots even if more chat has arrived. Otherwise a
      // fast, unbatched room could invalidate every result and starve the list.
      const sameConfiguration =
        latest?.kind === "preview"
          ? latest === task
          : latest && latest.settings === task.settings && latest.emoteSets === task.emoteSets;
      if (client.current === worker && sameConfiguration && value) setOutput({ task, ...value });
    });
  }, [task, identity]);
  return output;
}

export default function useChatFilters(messages, settings, emoteSets, room) {
  const synchronous = useMemo(() => new FilterSession(), [room]);
  const [failed, setFailed] = useState(false);
  const signature = JSON.stringify(settings);
  useEffect(() => setFailed(false), [signature, room]);
  const task = useMemo(
    () => (settings?.enabled && settings?.regexEnabled && !failed ? { messages, settings, emoteSets } : null),
    [messages, settings, emoteSets, failed],
  );
  const output = useFilterWorker(task, room);
  useEffect(() => {
    if (output?.error) setFailed(true);
  }, [output]);
  const fallback = useMemo(
    () => (task ? [] : synchronous.apply(messages, { ...settings, regexEnabled: false }, emoteSets)),
    [messages, settings, emoteSets, synchronous, task],
  );
  // While a new filter configuration is being evaluated, keep incoming messages
  // out of the list until their decision is known. Non-regex filters stay local.
  const result = task ? (output?.task.settings === settings && output.result ? output.result : []) : fallback;
  const warning =
    output?.error ||
    (task && output?.task.settings === settings && output.paused?.length
      ? `Text rule ${output.paused.join(", ")} took too long and is paused. Edit text rules to retry.`
      : null);
  return { messages: result, warning };
}
