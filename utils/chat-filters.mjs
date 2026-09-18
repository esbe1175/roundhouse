// Adapted from the user-provided kick-chat-filter/filter-engine.js.
// Roundhouse uses KickTalk rendering and persistent app settings.
const DEFAULTS = Object.freeze({
  enabled: false,
  blockedUsers: [],
  duplicateEnabled: true,
  duplicateCount: 3,
  duplicateWindowMessages: 20,
  duplicateWindowSeconds: 30,
  regexEnabled: false,
  regexRules: [],
  blockEmotes: false,
  blockedEmotes: [],
  highlightBlocked: false,
});

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function normalizeSettings(input) {
  const value = Object.assign({}, DEFAULTS, input || {});
  value.blockedUsers = [...new Set((value.blockedUsers || []).map(normalizeText).filter(Boolean))];
  value.blockedEmotes = [...new Set((value.blockedEmotes || []).map(normalizeText).filter(Boolean))];
  value.regexRules = (value.regexRules || [])
    .map((rule) => {
      if (typeof rule === "string") return { pattern: rule.trim(), flags: "iu", action: "block", replacement: "" };
      return {
        pattern: String(rule?.pattern || "").trim(),
        flags: String(rule?.flags ?? "iu"),
        action: rule?.action === "replace" ? "replace" : "block",
        replacement: String(rule?.replacement || ""),
      };
    })
    .filter((rule) => rule.pattern);
  value.duplicateCount = Math.max(1, Math.min(100, Number(value.duplicateCount) || 3));
  value.duplicateWindowMessages = Math.max(1, Math.min(1000, Number(value.duplicateWindowMessages) || 20));
  value.duplicateWindowSeconds = Math.max(1, Math.min(3600, Number(value.duplicateWindowSeconds) || 30));
  return value;
}

function compileRegexRules(rules) {
  const valid = [],
    invalid = [];
  for (const input of rules || []) {
    const rule = typeof input === "string" ? { pattern: input, flags: "iu", action: "block", replacement: "" } : input;
    try {
      valid.push({ rule, regex: new RegExp(rule.pattern, rule.flags ?? "iu") });
    } catch (error) {
      invalid.push({ source: rule.pattern, message: error.message });
    }
  }
  return { valid, invalid };
}

function maskEmotes(value) {
  return String(value || "").replace(/\[emote:\d+:[^\]]+\]/g, (token) => " ".repeat(token.length));
}

function execProtected(value, regex) {
  const source = String(value || ""),
    masked = maskEmotes(source);
  const iterator = new RegExp(regex.source, `${regex.flags.replace(/[gy]/g, "")}g`);
  let match;
  while ((match = iterator.exec(masked))) {
    const original = source
      .slice(match.index, match.index + match[0].length)
      .replace(/\[emote:\d+:[^\]]+\]/g, "")
      .trim();
    if (original) return match;
    if (match[0] === "") iterator.lastIndex++;
  }
  return null;
}

function replaceProtected(value, regex, replacement) {
  const source = String(value || "");
  const masked = maskEmotes(source);
  const iterationFlags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
  const iterator = new RegExp(regex.source, iterationFlags.replace("y", ""));
  const single = new RegExp(regex.source, regex.flags.replace(/[gy]/g, ""));
  let output = "",
    last = 0,
    match;
  while ((match = iterator.exec(masked))) {
    const visible = source
      .slice(match.index, match.index + match[0].length)
      .replace(/\[emote:\d+:[^\]]+\]/g, "")
      .trim();
    if (!visible) {
      if (!regex.global || match[0] === "") break;
      continue;
    }
    output += source.slice(last, match.index);
    output += match[0].replace(single, replacement);
    last = match.index + match[0].length;
    if (!regex.global || match[0] === "") break;
  }
  return last ? output + source.slice(last) : source;
}

class FilterEngine {
  constructor(settings) {
    this.update(settings);
    this.history = [];
  }
  update(settings) {
    this.settings = normalizeSettings(settings);
    const compiled = compileRegexRules(this.settings.regexRules);
    this.regexes = compiled.valid;
    this.invalidRegexes = compiled.invalid;
  }
  reset() {
    this.history.length = 0;
  }
  evaluate(message, now) {
    const s = this.settings;
    const username = normalizeText(message.username);
    const text = normalizeText(message.text);
    const emotes = (message.emotes || []).map(normalizeText).filter(Boolean);
    const timestamp = Number(now) || Date.now();
    if (!s.enabled) return { blocked: false, reason: null };
    if (s.blockedUsers.includes(username)) return { blocked: true, reason: "user" };
    let outputText = String(message.text || "");
    let replaced = false;
    if (s.regexEnabled) {
      for (const entry of this.regexes) {
        const match = execProtected(outputText, entry.regex);
        if (!match) continue;
        if (entry.rule.action === "block")
          return {
            blocked: true,
            reason: "regex",
            text: outputText,
            replaced,
            match: match[0],
            captures: match.slice(1),
          };
        const nextText = replaceProtected(outputText, entry.regex, entry.rule.replacement);
        replaced ||= nextText !== outputText;
        outputText = nextText;
      }
    }
    if (
      s.blockEmotes &&
      (s.blockedEmotes.length === 0 ? emotes.length > 0 : emotes.some((e) => s.blockedEmotes.includes(e)))
    ) {
      return { blocked: true, reason: "emote" };
    }
    if (s.duplicateEnabled && username && text) {
      const cutoff = timestamp - s.duplicateWindowSeconds * 1000;
      const recent = this.history.slice(-s.duplicateWindowMessages).filter((entry) => entry.time >= cutoff);
      const identical = recent.reduce(
        (count, entry) => count + (entry.username === username && entry.text === text ? 1 : 0),
        0,
      );
      this.history.push({ username, text, time: timestamp });
      const maxHistory = Math.max(s.duplicateWindowMessages * 2, 100);
      if (this.history.length > maxHistory) this.history.splice(0, this.history.length - maxHistory);
      if (identical + 1 > s.duplicateCount) return { blocked: true, reason: "duplicate" };
    }
    return { blocked: false, reason: null, text: outputText, replaced };
  }
}

export { DEFAULTS, FilterEngine, normalizeSettings, compileRegexRules, execProtected, replaceProtected };

export class FilterSession {
  constructor() {
    this.cache = new Map();
  }
  apply(messages, settings, emoteSets = []) {
    const emoteNames = new Set(emoteSets.flatMap((set) => set.emotes || []).map((emote) => emote.name));
    const key = JSON.stringify([settings, [...emoteNames].sort()]);
    if (key !== this.key) {
      this.key = key;
      this.engine = new FilterEngine(settings);
      this.cache.clear();
    }
    const retained = new Set(messages.map((message) => message.id));
    for (const id of this.cache.keys()) if (!retained.has(id)) this.cache.delete(id);
    const result = [];
    for (const message of messages) {
      if (!["message", "reply"].includes(message.type) || message.deleted || !this.engine.settings.enabled) {
        result.push(message);
        continue;
      }
      let entry = this.cache.get(message.id);
      if (!entry || entry.content !== message.content || entry.username !== message.sender?.username) {
        const text = message.content || "";
        const emotes = [...text.matchAll(/\[emote:\d+:([^\]]+)\]/g)].map((match) => match[1]);
        emotes.push(...text.split(/\s+/).filter((word) => emoteNames.has(word)));
        entry = {
          content: message.content,
          username: message.sender?.username,
          decision: this.engine.evaluate(
            { username: message.sender?.username, text, emotes },
            Date.parse(message.created_at) || Date.now(),
          ),
        };
        this.cache.set(message.id, entry);
      }
      const decision = entry.decision;
      if (decision.blocked && !this.engine.settings.highlightBlocked) continue;
      result.push(
        decision.blocked || decision.replaced
          ? {
              ...message,
              displayContent: decision.text ?? message.content,
              filterReason: decision.blocked ? decision.reason : null,
            }
          : message,
      );
    }
    return result;
  }
}
