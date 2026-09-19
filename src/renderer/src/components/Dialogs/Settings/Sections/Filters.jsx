import { useMemo, useState } from "react";
import { Switch } from "../../../Shared/Switch";
import { DEFAULTS } from "../../../../../../../utils/chat-filters.mjs";
import { useFilterWorker } from "../../../../utils/useChatFilters";
import CaretDown from "../../../../assets/icons/caret-down-bold.svg?asset";
import "../../../../assets/styles/dialogs/Filters.scss";

function Toggle({ title, description, checked, onChange }) {
  return (
    <div className="rh-filter-toggle">
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      <Switch aria-label={title} checked={!!checked} onCheckedChange={onChange} />
    </div>
  );
}
function Names({ label, values, onChange }) {
  const [text, setText] = useState("");
  const add = (event) => {
    event.preventDefault();
    const names = text
      .split(/[,\n]+/)
      .map((name) => name.trim().replace(/^@/, "").toLowerCase())
      .filter(Boolean);
    if (names.length) {
      onChange([...new Set([...values, ...names])]);
      setText("");
    }
  };
  return (
    <div>
      <form className="rh-filter-add" onSubmit={add}>
        <input aria-label={label} value={text} onChange={(e) => setText(e.target.value)} placeholder={label} />
        <button type="submit" disabled={!text.trim()}>
          Add
        </button>
      </form>
      <p className="rh-filter-help">Names ignore capitalization. Separate multiple names with commas.</p>
      <ul className="rh-filter-names">
        {values.map((name) => (
          <li key={name}>
            {name}
            <button aria-label={`Remove ${name}`} onClick={() => onChange(values.filter((value) => value !== name))}>
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
export default function Filters({ settingsData, onChange }) {
  const settings = { ...DEFAULTS, ...settingsData?.chatFilters };
  const change = (patch) => onChange("chatFilters", { ...settings, ...patch });
  const [sample, setSample] = useState("");
  const [selectedTab, setSelectedTab] = useState("people");
  const rules = settings.regexRules;
  const edit = (index, patch) =>
    change({ regexRules: rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)) });
  const move = (index, offset) => {
    const next = [...rules];
    [next[index], next[index + offset]] = [next[index + offset], next[index]];
    change({ regexRules: next });
  };
  const previewTask = useMemo(() => ({ kind: "preview", sample, settings: { regexRules: rules } }), [sample, rules]);
  const preview = useFilterWorker(previewTask, "filter-preview");
  return (
    <section className="rh-filters">
      <div className="settingsSectionHeader">
        <h4>Chat filters</h4>
        <p>Shape the chat you see. Your changes stay on this computer; pins and system notices stay visible.</p>
      </div>
      <Toggle
        title="Enable chat filters"
        description="Pause all filters without losing your rules."
        checked={settings.enabled}
        onChange={(enabled) => change({ enabled })}
      />
      <label className="rh-filter-display">
        Filtered messages
        <select
          aria-label="Filtered messages"
          value={settings.highlightBlocked ? "highlight" : "hide"}
          onChange={(e) => change({ highlightBlocked: e.target.value === "highlight" })}
        >
          <option value="hide">Hide</option>
          <option value="highlight">Show with a muted red highlight</option>
        </select>
      </label>
      {!settings.enabled && (
        <p className="rh-filter-help">Filters are paused. You can still edit and test them below.</p>
      )}
      <div
        className="rh-filter-tabs"
        role="tablist"
        aria-label="Filter categories"
        onKeyDown={(event) => {
          const tabs = [...event.currentTarget.querySelectorAll('[role="tab"]')];
          const index = tabs.indexOf(document.activeElement);
          const next =
            event.key === "ArrowRight"
              ? (index + 1) % tabs.length
              : event.key === "ArrowLeft"
                ? (index + tabs.length - 1) % tabs.length
                : event.key === "Home"
                  ? 0
                  : event.key === "End"
                    ? tabs.length - 1
                    : null;
          if (next === null) return;
          event.preventDefault();
          tabs[next].focus();
          tabs[next].click();
        }}
      >
        {[
          ["people", "Users & repeats"],
          ["emotes", "Emotes"],
          ["rules", "Text rules"],
        ].map(([id, title]) => (
          <button
            key={id}
            id={`filter-tab-${id}`}
            role="tab"
            aria-selected={selectedTab === id}
            aria-controls="filter-panel"
            tabIndex={selectedTab === id ? 0 : -1}
            onClick={() => setSelectedTab(id)}
          >
            {title}
          </button>
        ))}
      </div>
      <div id="filter-panel" role="tabpanel" aria-labelledby={`filter-tab-${selectedTab}`}>
        {selectedTab === "people" && (
          <>
            <h5>Hidden users</h5>
            <p>Hide messages from these usernames. This does not mute or ban them on Kick.</p>
            <Names
              label="Add username"
              values={settings.blockedUsers}
              onChange={(blockedUsers) => change({ blockedUsers })}
            />
            <Toggle
              title="Limit repeated messages"
              description="Apply the limit separately to each user's identical messages."
              checked={settings.duplicateEnabled}
              onChange={(duplicateEnabled) => change({ duplicateEnabled })}
            />
            <div className="rh-filter-numbers">
              {[
                ["duplicateCount", "Allow repeats", 1, 100],
                ["duplicateWindowMessages", "Recent messages", 1, 1000],
                ["duplicateWindowSeconds", "Within seconds", 1, 3600],
              ].map(([key, label, min, max]) => (
                <label key={key}>
                  {label}
                  <input
                    type="number"
                    aria-label={label}
                    min={min}
                    max={max}
                    value={settings[key]}
                    onChange={(e) => change({ [key]: Math.max(min, Math.min(max, Number(e.target.value) || min)) })}
                  />
                </label>
              ))}
            </div>
            <p className="rh-filter-help">
              Allow {settings.duplicateCount} identical messages per user, then filter repeats within both the last{" "}
              {settings.duplicateWindowMessages} eligible chat messages and {settings.duplicateWindowSeconds} seconds.
            </p>
          </>
        )}
        {selectedTab === "emotes" && (
          <>
            <Toggle
              title="Filter messages containing emotes"
              description="Matches Kick emotes and available 7TV emotes."
              checked={settings.blockEmotes}
              onChange={(blockEmotes) => change({ blockEmotes })}
            />
            <Names
              label="Add emote name"
              values={settings.blockedEmotes}
              onChange={(blockedEmotes) => change({ blockedEmotes })}
            />
            <p>
              {settings.blockedEmotes.length
                ? "Only messages containing one of the listed emotes are filtered."
                : "With an empty list, every message containing an emote is filtered."}
            </p>
          </>
        )}
        {selectedTab === "rules" && (
          <>
            <Toggle
              title="Enable text rules"
              description="Rules run from top to bottom. Replacements feed into the next rule; a Block match stops processing."
              checked={settings.regexEnabled}
              onChange={(regexEnabled) => change({ regexEnabled })}
            />
            <label className="rh-filter-sample">
              Test a message
              <textarea
                aria-label="Test a message"
                placeholder="Type a sample to preview every rule"
                value={sample}
                onChange={(e) => setSample(e.target.value)}
              />
            </label>
            <div className="rh-filter-rules">
              {rules.map((rule, index) => {
                const current = preview?.task === previewTask;
                const paused = current && preview.paused?.includes(index + 1);
                const {
                  status,
                  captures = [],
                  error = false,
                } = paused
                  ? { status: "Took too long — paused. Edit this rule to retry.", error: true }
                  : current && preview.error
                    ? { status: preview.error, error: true }
                    : (current && preview.result?.[index]) || { status: "Checking…" };
                return (
                  <div className="rh-filter-rule" key={index}>
                    <div className="rh-filter-rule-heading">
                      <strong>Rule {index + 1}</strong>
                      <div>
                        <button
                          aria-label={`Move rule ${index + 1} up`}
                          disabled={index === 0}
                          onClick={() => move(index, -1)}
                        >
                          <img className="rh-rule-arrow rh-rule-arrow-up" src={CaretDown} alt="" />
                        </button>
                        <button
                          aria-label={`Move rule ${index + 1} down`}
                          disabled={index === rules.length - 1}
                          onClick={() => move(index, 1)}
                        >
                          <img className="rh-rule-arrow" src={CaretDown} alt="" />
                        </button>
                        <button
                          aria-label={`Delete rule ${index + 1}`}
                          onClick={() => change({ regexRules: rules.filter((_, i) => i !== index) })}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="rh-filter-pattern">
                      <label>
                        Pattern
                        <input
                          aria-label={`Rule ${index + 1} pattern`}
                          value={rule.pattern}
                          onChange={(e) => edit(index, { pattern: e.target.value })}
                          placeholder="e.g. buy\\s+followers"
                        />
                      </label>
                      <label>
                        Flags
                        <input
                          aria-label={`Rule ${index + 1} flags`}
                          value={rule.flags}
                          onChange={(e) => edit(index, { flags: e.target.value })}
                        />
                      </label>
                      <label>
                        Action
                        <select
                          aria-label={`Rule ${index + 1} action`}
                          value={rule.action}
                          onChange={(e) => edit(index, { action: e.target.value })}
                        >
                          <option value="block">Block</option>
                          <option value="replace">Replace</option>
                        </select>
                      </label>
                    </div>
                    {rule.action === "replace" && (
                      <label>
                        Replacement
                        <input
                          aria-label={`Rule ${index + 1} replacement`}
                          value={rule.replacement}
                          onChange={(e) => edit(index, { replacement: e.target.value })}
                          placeholder="Use $1 for the first capture, $& for the match"
                        />
                      </label>
                    )}
                    <p className={error ? "rh-filter-invalid" : "rh-filter-result"} role={error ? "alert" : "status"}>
                      {status}
                    </p>
                    {!!captures.length && (
                      <p className="rh-filter-help">
                        Captures:{" "}
                        {captures.map((capture, i) => `$${i + 1} = ${JSON.stringify(capture ?? "")}`).join(" · ")}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              className="rh-filter-add-rule"
              onClick={() =>
                change({ regexRules: [...rules, { pattern: "", flags: "iu", action: "block", replacement: "" }] })
              }
            >
              Add text rule
            </button>
            <p className="rh-filter-help">
              Use JavaScript regular expressions without surrounding slashes. “i” ignores capitalization; “g” replaces
              every match. Invalid rules are skipped.
            </p>
          </>
        )}
      </div>
      <p className="rh-filter-help">Changes save automatically and apply to all followed channels.</p>
    </section>
  );
}
