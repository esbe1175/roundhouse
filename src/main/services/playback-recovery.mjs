// Keep duplicate transport/MPV failure events in one recovery attempt. A short
// successful load does not reset the budget and create an endless restart loop.
export class PlaybackRecovery {
  constructor({
    retry,
    waiting,
    exhausted,
    delays = [1000, 3000, 8000],
    stableMs = 30000,
    setTimer = setTimeout,
    clearTimer = clearTimeout,
  }) {
    Object.assign(this, { retry, waiting, exhausted, delays, stableMs, setTimer, clearTimer });
    this.attempt = 0;
  }
  failure() {
    this.clearTimer(this.stableTimer);
    this.stableTimer = null;
    if (this.timer || this.halted) return;
    if (this.attempt >= this.delays.length) {
      this.halted = true;
      this.exhausted();
      return;
    }
    const delay = this.delays[this.attempt++];
    this.waiting(this.attempt, this.delays.length, delay);
    this.timer = this.setTimer(() => {
      this.timer = null;
      this.retry(this.attempt);
    }, delay);
  }
  playing() {
    if (this.halted) return;
    this.clearTimer(this.timer);
    this.clearTimer(this.stableTimer);
    this.timer = null;
    this.stableTimer = this.setTimer(() => {
      this.attempt = 0;
      this.stableTimer = null;
    }, this.stableMs);
  }
  reset() {
    this.clearTimer(this.timer);
    this.clearTimer(this.stableTimer);
    this.timer = this.stableTimer = null;
    this.attempt = 0;
    this.halted = false;
  }
  halt() {
    this.reset();
    this.halted = true;
  }
}

export function shouldRecoverEnd(event) {
  return event.event === "end-file" && !["stop", "quit", "redirect"].includes(event.reason);
}
