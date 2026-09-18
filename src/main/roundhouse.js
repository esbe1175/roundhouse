import { app, BrowserWindow, ipcMain, shell } from "electron";
import { pathToFileURL } from "node:url";
import { join } from "node:path";
import * as kick from "../../utils/services/kick/kickAPI";
import { installKickAdapter } from "../../utils/services/kick/kickTransport";
import { getChannelEmotes, getUserStvProfile } from "../../utils/services/seventv/stvAPI";
import { KickAccount } from "./services/account";
import { Player } from "./services/player";
import { validateOperation } from "./services/ipc-validation.mjs";

export const account = new KickAccount();
export const player = new Player(account);
export async function openWebLink(url) {
  const parsed = new URL(url);
  if (!["https:", "http:"].includes(parsed.protocol)) throw new Error("Only web links can be opened.");
  return shell.openExternal(parsed.href);
}

export function trustedSender(event) {
  const frame = event.senderFrame;
  if (!frame || frame !== event.sender.mainFrame) return false;
  const url = frame.url;
  if (process.env.NODE_ENV === "development" && process.env.ELECTRON_RENDERER_URL) {
    try {
      if (new URL(url).origin === new URL(process.env.ELECTRON_RENDERER_URL).origin) return true;
    } catch {
      return false;
    }
  }
  return url.startsWith(pathToFileURL(join(app.getAppPath(), "out/renderer/")).href);
}

export function installIPCGuard() {
  const handle = ipcMain.handle.bind(ipcMain),
    on = ipcMain.on.bind(ipcMain);
  ipcMain.handle = (name, callback) =>
    handle(name, (event, ...args) => {
      if (!trustedSender(event)) throw new Error("Untrusted IPC sender.");
      return callback(event, ...args);
    });
  ipcMain.on = (name, callback) =>
    on(name, (event, ...args) => {
      if (trustedSender(event)) callback(event, ...args);
    });
  app.on("web-contents-created", (_, contents) => {
    if (!contents.getLastWebPreferences().preload) return;
    contents.on("will-navigate", (event, url) => {
      event.preventDefault();
      void openWebLink(url).catch(() => {});
    });
  });
}

export function setupRoundhouse(window) {
  player.window = window;
  player.watchPointer();
  installKickAdapter(async (config) => {
    const url = new URL(config.url);
    if (url.origin !== "https://kick.com") throw new Error("Unsupported Kick API origin.");
    for (const [key, value] of Object.entries(config.params || {})) url.searchParams.set(key, value);
    const response = await account.request(url.href, {
      method: config.method.toUpperCase(),
      headers: config.data ? { "Content-Type": "application/json" } : {},
      body: config.data,
    });
    return { ...response, config };
  });
  // Only explicit operations can be called. Existing chat components retain their interfaces.
  const methods = Object.fromEntries(
    [
      "sendMessageToChannel",
      "sendReplyToChannel",
      "getChannelInfo",
      "getChannelChatroomInfo",
      "getKickEmotes",
      "getSelfInfo",
      "getUserChatroomInfo",
      "getSelfChatroomInfo",
      "getSilencedUsers",
      "getInitialChatroomMessages",
      "getInitialPollInfo",
      "getSubmitPollVote",
      "getChatroomViewers",
      "getBanUser",
      "getUnbanUser",
      "getTimeoutUser",
      "getDeleteMessage",
      "getSilenceUser",
      "getUnsilenceUser",
      "getPinMessage",
      "getUnpinMessage",
      "getKickAuthForEvents",
      "getUpdateTitle",
      "getClearChatroom",
    ].map((name) => [name, kick[name]]),
  );
  Object.assign(methods, {
    account: () => account.validate(),
    login: () => account.login(window),
    follows: () => account.follows(),
    getUserStvProfile,
    getChannelEmotes,
    getSelfInfo: () => ({ data: account.user, status: 200 }),
    getChannelInfo: async (slug) => {
      const { playback_url, ...channel } = await kick.getChannelInfo(slug);
      return channel;
    },
    getChannelChatroomInfo: async (slug) => {
      const response = await kick.getChannelChatroomInfo(slug);
      const { playback_url, ...channel } = response.data;
      return { data: channel, status: response.status };
    },
    playerOpen: (slug) => player.open(slug),
    playerStop: () => player.stop(),
    playerControl: (action, value) => player.control(action, value),
    playerBounds: (rect) => player.setBounds(rect),
    fullscreen: (value) => {
      if (typeof value !== "boolean") throw new Error("Invalid fullscreen state.");
      window.setFullScreen(value);
    },
    openExternal: openWebLink,
  });
  ipcMain.handle("roundhouse:call", async (event, method, args) => {
    try {
      if (!Object.hasOwn(methods, method) || !Array.isArray(args) || args.length > 8)
        throw new Error("Unknown application operation.");
      validateOperation(method, args);
      const result = await methods[method](...args);
      const value = result?.config ? { data: result.data, status: result.status } : result;
      return { ok: true, value: JSON.parse(JSON.stringify(value ?? null)) };
    } catch (error) {
      return {
        ok: false,
        error: {
          message: error.message,
          code: error.code,
          status: error.status || error.response?.status,
          data: error.data,
        },
      };
    }
  });
  account.listeners.add((state) => {
    if (!window.isDestroyed()) window.webContents.send("roundhouse:account", state);
  });
  window.on("enter-full-screen", () => window.webContents.send("roundhouse:fullscreen", true));
  window.on("leave-full-screen", () => window.webContents.send("roundhouse:fullscreen", false));
  window.webContents.on("before-input-event", (event, input) => {
    if (input.key === "Escape" && window.isFullScreen()) {
      event.preventDefault();
      window.setFullScreen(false);
    }
  });
  window.on("minimize", () => player.setBounds(player.rect));
  window.on("restore", () => player.setBounds(player.rect));
  window.on("close", () => {
    void player.stop();
    account.closeLogin();
    for (const other of BrowserWindow.getAllWindows()) if (other !== window) other.close();
  });
  let quitting = false;
  app.on("before-quit", (event) => {
    if (!quitting) {
      event.preventDefault();
      quitting = true;
      player.stop().finally(() => app.quit());
    }
  });
  // Upstream updater is intentionally unavailable for this fork.
  for (const action of ["check", "download", "install"])
    ipcMain.handle(`autoUpdater:${action}`, () => ({ disabled: true }));
}
