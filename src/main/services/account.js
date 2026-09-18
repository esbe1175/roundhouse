import { BrowserWindow, session } from "electron";
import { collectFollows, resolveFollowDetails } from "./channels.mjs";
import { openKickLogin } from "./login-page";

export class KickAccount {
  user = null;
  loginWindow = null;
  listeners = new Set();
  get session() {
    return session.fromPartition("persist:roundhouse-kick");
  }
  notify(error = null) {
    for (const listener of this.listeners) listener({ user: this.user, error });
  }

  async request(url, options = {}) {
    const target = new URL(url, "https://kick.com");
    if (target.origin !== "https://kick.com") throw new Error("Account requests are limited to Kick.");
    const cookies = await this.session.cookies.get({ url: "https://kick.com" });
    const token = cookies.find((c) => c.name === "session_token");
    const xsrf = cookies.find((c) => c.name === "XSRF-TOKEN");
    const headers = { Accept: "application/json", ...options.headers };
    if (token) headers.Authorization = `Bearer ${decodeURIComponent(token.value)}`;
    if (xsrf) headers["X-XSRF-TOKEN"] = decodeURIComponent(xsrf.value);
    let response;
    try {
      response = await this.session.fetch(target.href, {
        ...options,
        headers,
        credentials: "include",
        redirect: "error",
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw Object.assign(new Error("Cannot reach Kick. Check your connection and retry."), { code: "NETWORK" });
    }
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    if (!response.ok || data === null) {
      const status = response.status;
      const code =
        status === 401
          ? "SESSION_EXPIRED"
          : status === 429
            ? "RATE_LIMIT"
            : status === 403 || data === null
              ? "CHALLENGE"
              : "KICK_ERROR";
      const message =
        code === "SESSION_EXPIRED"
          ? "Your Kick session expired. Sign in again."
          : code === "RATE_LIMIT"
            ? "Kick is limiting requests. Please wait before retrying."
            : code === "CHALLENGE"
              ? "Kick requires a browser check. Use Sign in to Kick to continue."
              : `Kick request failed (${status}).`;
      if (status === 401) {
        this.user = null;
        this.notify(message);
      }
      throw Object.assign(new Error(message), {
        code,
        status,
        data: data?.errors ? { errors: data.errors, message: data.message } : undefined,
      });
    }
    return { data, status: response.status, headers: Object.fromEntries(response.headers) };
  }

  async validate() {
    if (this.validation) return this.validation;
    this.validation = (async () => {
      const cookies = await this.session.cookies.get({ url: "https://kick.com" });
      if (!cookies.some((c) => c.name === "session_token")) {
        this.user = null;
        return { user: null };
      }
      try {
        const { data } = await this.request("/api/v1/user");
        const user = data.data || data;
        if (!user.id) throw new Error("Kick did not return an account identity.");
        this.user = {
          id: user.id,
          username: user.username || user.streamer_channel?.slug,
          profile_pic: user.profile_pic,
        };
        return { user: this.user };
      } catch (error) {
        return { user: this.user, error: error.message };
      }
    })();
    try {
      return await this.validation;
    } finally {
      this.validation = null;
    }
  }

  login(parent) {
    if (this.loginWindow) {
      this.loginWindow.focus();
      return this.loginPromise;
    }
    const win = (this.loginWindow = new BrowserWindow({
      width: 1050,
      height: 780,
      title: "Sign in to Kick — Roundhouse",
      parent,
      autoHideMenuBar: true,
      webPreferences: { session: this.session, nodeIntegration: false, contextIsolation: true, sandbox: true },
    }));
    win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    win.on("page-title-updated", (event) => event.preventDefault());
    win.webContents.setAudioMuted(true);
    let loginError = null;
    let dialogOpened = false;
    win.webContents.on("did-finish-load", async () => {
      if (dialogOpened || new URL(win.webContents.getURL()).origin !== "https://kick.com") return;
      try {
        dialogOpened = await win.webContents.executeJavaScript(`(${openKickLogin.toString()})()`);
        loginError = dialogOpened
          ? null
          : "Kick's login dialog could not be opened automatically. Try again and select Log In in the Kick window.";
      } catch {
        // Navigation (including a website challenge) can replace the document.
        // The next completed Kick page gets its own attempt.
      }
    });
    this.loginPromise = new Promise((resolve) => {
      let busy = false;
      const timer = setInterval(async () => {
        if (busy) return;
        busy = true;
        try {
          const state = await this.validate();
          if (state.user && !state.error && !win.isDestroyed()) {
            this.notify();
            win.close();
          }
        } finally {
          busy = false;
        }
      }, 2000);
      win.on("closed", () => {
        clearInterval(timer);
        this.loginWindow = null;
        resolve({ user: this.user, error: loginError });
      });
    });
    void win.loadURL("https://kick.com/").catch((error) => {
      // Kick may replace the initial navigation during a browser check.
      if (win.isDestroyed() || error.code === "ERR_ABORTED") return;
      loginError = "Could not load Kick's sign-in page. Check your connection and try again.";
      win.close();
    });
    return this.loginPromise;
  }
  closeLogin() {
    this.loginWindow?.close();
  }
  async logout() {
    this.closeLogin();
    this.user = null;
    await this.session.clearStorageData();
    await this.session.clearCache();
    this.notify();
  }
  async follows() {
    if (!this.user) throw new Error("Sign in to Kick first.");
    const request = async (url) => (await this.request(url)).data;
    return resolveFollowDetails(await collectFollows(request), request);
  }
}
