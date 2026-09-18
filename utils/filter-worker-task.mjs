import { FilterSession, execProtected, replaceProtected } from "./chat-filters.mjs";

// This module is executed in a disposable worker, never during React rendering.
export function createFilterTask() {
  const session = new FilterSession();
  return (task, onRule) => {
    if (task.kind !== "preview") return session.apply(task.messages, task.settings, task.emoteSets, onRule);
    let text = task.sample,
      blocked = false;
    return task.settings.regexRules.map((rule) => {
      let status = "Enter a pattern",
        captures = [],
        error = false;
      try {
        if (rule.pattern) {
          const regex = new RegExp(rule.pattern, rule.flags ?? "iu");
          status = blocked ? "Skipped — blocked by an earlier rule" : !task.sample ? "Ready to test" : "No match";
          if (!blocked && task.sample) {
            onRule(rule);
            const match = execProtected(text, regex);
            if (match) {
              captures = match.slice(1);
              if (rule.action === "block") {
                blocked = true;
                status = "Blocked";
              } else {
                text = replaceProtected(text, regex, rule.replacement);
                status = `Result: ${text}`;
              }
            }
          }
        }
      } catch (e) {
        error = true;
        status = e.message;
      }
      return { status, captures, error };
    });
  };
}
