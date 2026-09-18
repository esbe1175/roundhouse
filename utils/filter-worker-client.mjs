const ruleKey = (rule) =>
  JSON.stringify([String(typeof rule === "string" ? rule : rule.pattern).trim(), rule.flags ?? "iu"]);

// One bounded job at a time. Coalesce pending snapshots so a busy chat cannot
// accumulate a worker backlog. A timed-out rule stays paused until rules change.
export class FilterWorkerClient {
  constructor(createWorker, { budget = 500, startupBudget = 5000 } = {}) {
    this.createWorker = createWorker;
    this.budget = budget;
    this.startupBudget = startupBudget;
    this.disabled = new Set();
    this.serial = 0;
  }
  run(task) {
    if (this.disposed) return Promise.resolve(null);
    return new Promise((resolve) => {
      this.pending?.resolve(null);
      this.pending = { task, resolve };
      this.pump();
    });
  }
  pump() {
    if (this.active || !this.pending || this.disposed) return;
    if (!this.worker) {
      let worker;
      try {
        worker = this.worker = this.createWorker();
      } catch {
        this.fail("Text filtering could not start. Filtering is paused for this view.");
        return;
      }
      this.ready = false;
      worker.onmessage = ({ data }) => {
        if (this.worker !== worker) return;
        if (data.type === "ready") {
          clearTimeout(this.timer);
          this.ready = true;
          this.pump();
          return;
        }
        if (!this.active || data.id !== this.active.id) return;
        if (data.type === "rule") {
          this.currentRule = data.rule;
          return;
        }
        if (data.type === "result") {
          clearTimeout(this.timer);
          const job = this.active;
          this.active = null;
          const rules = job.task.settings.regexRules || [];
          const paused = rules.flatMap((rule, index) => (this.disabled.has(ruleKey(rule)) ? [index + 1] : []));
          job.resolve({ result: data.result, paused, error: data.error });
          this.pump();
        }
      };
      worker.onerror = () => {
        if (this.worker === worker) this.fail("Text filtering could not start. Filtering is paused for this view.");
      };
      this.timer = setTimeout(
        () => this.fail("Text filtering could not start. Filtering is paused for this view."),
        this.startupBudget,
      );
      return;
    }
    if (!this.ready) return;
    this.active = this.pending;
    this.pending = null;
    const { task } = this.active;
    const key = JSON.stringify(task.settings.regexRules);
    if (this.rulesKey !== key) {
      this.rulesKey = key;
      this.disabled.clear();
    }
    const settings = {
      ...task.settings,
      regexRules: (task.settings.regexRules || []).map((rule) =>
        this.disabled.has(ruleKey(rule)) ? { ...rule, pattern: "" } : rule,
      ),
    };
    this.currentRule = null;
    this.active.id = ++this.serial;
    try {
      this.worker.postMessage({ ...task, settings, id: this.active.id });
    } catch {
      this.fail("Text filtering failed. Filtering is paused for this view.");
      return;
    }
    this.timer = setTimeout(() => {
      if (!this.currentRule) {
        this.fail("Text filtering exceeded its time limit. Filtering is paused for this view.");
        return;
      }
      this.disabled.add(ruleKey(this.currentRule));
      const job = this.active;
      this.stopWorker();
      this.active = null;
      if (this.pending) job.resolve(null);
      else this.pending = job;
      this.pump();
    }, this.budget);
  }
  fail(error) {
    this.stopWorker();
    // Resolve waiting callers rather than retrying indefinitely on load errors.
    this.active?.resolve({ error });
    this.pending?.resolve({ error });
    this.active = this.pending = null;
  }
  stopWorker() {
    clearTimeout(this.timer);
    this.worker?.terminate();
    this.worker = null;
    this.ready = false;
  }
  dispose() {
    this.disposed = true;
    this.stopWorker();
    this.active?.resolve(null);
    this.pending?.resolve(null);
    this.active = this.pending = null;
  }
}
