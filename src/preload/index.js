import { contextBridge, ipcRenderer } from "electron";
const call = async (method, ...args) => {
  const result = await ipcRenderer.invoke("roundhouse:call", method, args);
  if (!result.ok) {
    const error = new Error(result.error.message);
    error.code = result.error.code;
    error.response = { status: result.error.status, data: result.error.data };
    throw error;
  }
  return result.value;
};

const sendMessageToChannel = (...args) => call("sendMessageToChannel", ...args);
const sendReplyToChannel = (...args) => call("sendReplyToChannel", ...args);
const getChannelInfo = (...args) => call("getChannelInfo", ...args);
const getChannelChatroomInfo = (...args) => call("getChannelChatroomInfo", ...args);
const getKickEmotes = (...args) => call("getKickEmotes", ...args);
const getSelfInfo = (...args) => call("getSelfInfo", ...args);
const getUserChatroomInfo = (...args) => call("getUserChatroomInfo", ...args);
const getSelfChatroomInfo = (...args) => call("getSelfChatroomInfo", ...args);
const getSilencedUsers = (...args) => call("getSilencedUsers", ...args);
const getInitialChatroomMessages = (...args) => call("getInitialChatroomMessages", ...args);
const getInitialPollInfo = (...args) => call("getInitialPollInfo", ...args);
const getSubmitPollVote = (...args) => call("getSubmitPollVote", ...args);
const getChatroomViewers = (...args) => call("getChatroomViewers", ...args);
const getBanUser = (...args) => call("getBanUser", ...args);
const getUnbanUser = (...args) => call("getUnbanUser", ...args);
const getTimeoutUser = (...args) => call("getTimeoutUser", ...args);
const getDeleteMessage = (...args) => call("getDeleteMessage", ...args);
const getSilenceUser = (...args) => call("getSilenceUser", ...args);
const getUnsilenceUser = (...args) => call("getUnsilenceUser", ...args);
const getPinMessage = (...args) => call("getPinMessage", ...args);
const getUnpinMessage = (...args) => call("getUnpinMessage", ...args);
const getKickAuthForEvents = (...args) => call("getKickAuthForEvents", ...args);
const getChannelEmotes = (...args) => call("getChannelEmotes", ...args);
const withAuth = (fn) => fn(undefined, undefined);
let signedIn = false;
const tokenManager = {
  isValidToken: async () => {
    const state = await call("account");
    signedIn = !!state.user;
    return signedIn;
  },
  clearTokens: () => ipcRenderer.invoke("logout"),
};
const initialize = async () => {
  const state = await call("account");
  signedIn = !!state.user;
  if (state.user) {
    localStorage.setItem("kickId", state.user.id);
    localStorage.setItem("kickUsername", state.user.username);
    try {
      const profile = await call("getUserStvProfile", state.user.id);
      if (profile) {
        localStorage.setItem("stvId", profile.user_id);
        localStorage.setItem(
          "stvPersonalEmoteSets",
          JSON.stringify(profile.emoteSets?.filter((s) => s.type === "personal") || []),
        );
      }
    } catch {}
    try {
      const response = await getSilencedUsers();
      localStorage.setItem("silencedUsers", JSON.stringify(response.data));
    } catch {}
  } else {
    for (const key of ["kickId", "kickUsername", "stvId", "stvPersonalEmoteSets", "silencedUsers", "chatrooms"])
      localStorage.removeItem(key);
  }
  return state;
};
const ready = initialize().catch((error) => ({ user: null, error: error.message }));
const subscribe = (event, callback) => {
  const handler = (_, data) => callback(data);
  ipcRenderer.on(event, handler);
  return () => ipcRenderer.removeListener(event, handler);
};
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld("app", {
      roundhouse: {
        ready: () => ready,
        login: () => call("login"),
        follows: () => call("follows"),
        open: (slug) => call("playerOpen", slug),
        stop: () => call("playerStop"),
        control: (action, value) => call("playerControl", action, value),
        bounds: (rect) => call("playerBounds", rect),
        fullscreen: (value) => call("fullscreen", value),
        onPlayer: (callback) => subscribe("roundhouse:player", callback),
        onAccount: (callback) => subscribe("roundhouse:account", callback),
        onFullscreen: (callback) => subscribe("roundhouse:fullscreen", callback),
      },
      minimize: () => ipcRenderer.send("minimize"),
      maximize: () => ipcRenderer.send("maximize"),
      close: () => ipcRenderer.send("close"),
      logout: () => ipcRenderer.invoke("logout"),
      getAppInfo: () => ipcRenderer.invoke("get-app-info"),
      alwaysOnTop: () => ipcRenderer.invoke("alwaysOnTop"),

      notificationSounds: {
        getAvailable: () => ipcRenderer.invoke("notificationSounds:getAvailable"),
        getSoundUrl: (soundFile) => ipcRenderer.invoke("notificationSounds:getSoundUrl", { soundFile }),
        openFolder: () => ipcRenderer.invoke("notificationSounds:openFolder"),
      },

      authDialog: {
        open: (data) => ipcRenderer.invoke("authDialog:open", { data }),
        auth: (data) => ipcRenderer.invoke("authDialog:auth", { data }),
        close: () => ipcRenderer.invoke("authDialog:close"),
      },

      userDialog: {
        open: (data) => ipcRenderer.invoke("userDialog:open", { data }),
        close: () => ipcRenderer.send("userDialog:close"),
        move: (x, y) => ipcRenderer.send("userDialog:move", { x, y }),
        pin: (pinState) => ipcRenderer.invoke("userDialog:pin", pinState),
        onData: (callback) => {
          const handler = (_, data) => {
            callback(data);
          };

          ipcRenderer.on("userDialog:data", handler);
          return () => ipcRenderer.removeListener("userDialog:data", handler);
        },
      },

      chattersDialog: {
        open: (data) => ipcRenderer.invoke("chattersDialog:open", { data }),
        close: () => ipcRenderer.invoke("chattersDialog:close"),
        onData: (callback) => {
          const handler = (_, data) => callback(data);

          ipcRenderer.on("chattersDialog:data", handler);
          return () => ipcRenderer.removeListener("chattersDialog:data", handler);
        },
      },

      settingsDialog: {
        open: (data) => ipcRenderer.invoke("settingsDialog:open", { data }),
        close: () => ipcRenderer.invoke("settingsDialog:close"),
        onData: (callback) => {
          const handler = (_, data) => callback(data);

          ipcRenderer.on("settingsDialog:data", handler);
          return () => ipcRenderer.removeListener("settingsDialog:data", handler);
        },
      },

      searchDialog: {
        open: (data) => ipcRenderer.invoke("searchDialog:open", { data }),
        close: () => ipcRenderer.invoke("searchDialog:close"),
        onData: (callback) => {
          const handler = (_, data) => {
            callback(data);
          };
          ipcRenderer.on("searchDialog:data", handler);
          return () => ipcRenderer.removeListener("searchDialog:data", handler);
        },
      },

      modActions: {
        getBanUser: (channelName, username) =>
          withAuth((token, session) => getBanUser(channelName, username, token, session)),
        getUnbanUser: (channelName, username) =>
          withAuth((token, session) => getUnbanUser(channelName, username, token, session)),
        getTimeoutUser: (channelName, username, banDuration) =>
          withAuth((token, session) => getTimeoutUser(channelName, username, banDuration, token, session)),
        getDeleteMessage: (chatroomId, messageId) =>
          withAuth((token, session) => getDeleteMessage(chatroomId, messageId, token, session)),
      },

      reply: {
        open: (data) => ipcRenderer.invoke("reply:open", { data }),
        onData: (callback) => {
          const handler = (_, data) => callback(data);

          ipcRenderer.on("reply:data", handler);
          return () => ipcRenderer.removeListener("reply:data", handler);
        },
      },

      provider: {
        refresh: (provider) => ipcRenderer.invoke("provider:refresh", { provider }),
      },

      update: {
        checkForUpdates: () => ipcRenderer.invoke("autoUpdater:check"),
        downloadUpdate: () => ipcRenderer.invoke("autoUpdater:download"),
        installUpdate: () => ipcRenderer.invoke("autoUpdater:install"),
        onUpdate: (callback) => {
          const handler = (event, update) => callback(update);
          ipcRenderer.on("autoUpdater:status", handler);
          return () => ipcRenderer.removeListener("autoUpdater:status", handler);
        },
        onDismiss: (callback) => {
          const handler = () => callback();
          ipcRenderer.on("autoUpdater:dismiss", handler);
          return () => ipcRenderer.removeListener("autoUpdater:dismiss", handler);
        },
      },

      logs: {
        get: (data) => ipcRenderer.invoke("chatLogs:get", { data }),
        add: (data) => ipcRenderer.invoke("chatLogs:add", { data }),
        updateDeleted: (chatroomId, messageId) => ipcRenderer.invoke("logs:updateDeleted", { chatroomId, messageId }),
        onUpdate: (callback) => {
          const handler = (_, data) => callback(data);

          ipcRenderer.on("chatLogs:updated", handler);
          return () => ipcRenderer.removeListener("chatLogs:updated", handler);
        },
      },

      replyLogs: {
        get: (data) => ipcRenderer.invoke("replyLogs:get", { data }),
        add: (data) => ipcRenderer.invoke("replyLogs:add", data),
        updateDeleted: (chatroomId, messageId) =>
          ipcRenderer.invoke("replyLogs:updateDeleted", { chatroomId, messageId }),
        clear: (data) => ipcRenderer.invoke("replyLogs:clear", { data }),
        onUpdate: (callback) => {
          const handler = (_, data) => callback(data);

          ipcRenderer.on("replyLogs:updated", handler);
          return () => ipcRenderer.removeListener("replyLogs:updated", handler);
        },
      },

      replyThreadDialog: {
        open: (data) => ipcRenderer.invoke("replyThreadDialog:open", { data }),
        close: () => ipcRenderer.invoke("replyThreadDialog:close"),
        onData: (callback) => {
          const handler = (_, data) => callback(data);

          ipcRenderer.on("replyThreadDialog:data", handler);
          return () => ipcRenderer.removeListener("replyThreadDialog:data", handler);
        },
      },

      // Kick API
      kick: {
        getChannelInfo,
        getChannelChatroomInfo,
        getInitialPollInfo: (channelName) =>
          withAuth((token, session) => getInitialPollInfo(channelName, token, session)),
        sendMessage: (channelId, message) =>
          withAuth((token, session) => sendMessageToChannel(channelId, message, token, session)),
        sendReply: (channelId, message, metadata = {}) =>
          withAuth((token, session) => sendReplyToChannel(channelId, message, metadata, token, session)),
        getSilencedUsers: () => withAuth((token, session) => getSilencedUsers(token, session)),
        getSelfInfo: async () => {
          try {
            const response = await withAuth(getSelfInfo);
            return response?.data || null;
          } catch (error) {
            console.error("Error fetching user data:", error);
            return null;
          }
        },
        getEmotes: (chatroomName) => getKickEmotes(chatroomName),
        getSelfChatroomInfo: (chatroomName) =>
          withAuth((token, session) => getSelfChatroomInfo(chatroomName, token, session)),
        getUserChatroomInfo: (chatroomName, username) => getUserChatroomInfo(chatroomName, username),
        getInitialChatroomMessages: (channelID) => getInitialChatroomMessages(channelID),
        getSilenceUser: (userId) => withAuth((token, session) => getSilenceUser(userId, token, session)),
        getUnsilenceUser: (userId) => withAuth((token, session) => getUnsilenceUser(userId, token, session)),
        getPinMessage: (data) => withAuth((token, session) => getPinMessage(data, token, session)),
        getUnpinMessage: (chatroomName) => withAuth((token, session) => getUnpinMessage(chatroomName, token, session)),
        getSubmitPollVote: (channelName, optionId) =>
          withAuth((token, session) => getSubmitPollVote(channelName, optionId, token, session)),
        getKickAuthForEvents: (eventName, socketId) =>
          withAuth((token, session) => getKickAuthForEvents(eventName, socketId, token, session)),
        getChatroomViewers: (chatroomId) => getChatroomViewers(chatroomId),
      },

      // kickChannelActions: {
      //   // Broadcaster Actions

      //   // Channel Commands
      //   getUpdateTitle: (channelName, title) => withAuth((token, session) => getUpdateTitle(channelName, title, token, session)),
      //   getClearChatroom: (channelName) => withAuth((token, session) => getClearChatroom(channelName, token, session)),
      //   getUpdateSlowmode: (channelName, slowmodeOptions) =>
      //     withAuth((token, session) => getUpdateSlowmode(channelName, slowmodeOptions, token, session)),
      // },

      // 7TV API
      stv: {
        getChannelEmotes,
      },

      // Utility functions
      utils: {
        openExternal: (url) => call("openExternal", url),
      },

      store: {
        get: async (key) => await ipcRenderer.invoke("store:get", { key }),
        set: async (key, value) => await ipcRenderer.invoke("store:set", { key, value }),
        delete: async (key) => await ipcRenderer.invoke("store:delete", { key }),
        onUpdate: (callback) => {
          const handler = (_, data) => callback(data);
          ipcRenderer.on("store:updated", handler);
          return () => ipcRenderer.removeListener("store:updated", handler);
        },
      },

      // Authentication utilities
      auth: {
        isValidToken: () => tokenManager.isValidToken(),
        clearTokens: () => tokenManager.clearTokens(),
        isSignedIn: () => signedIn,
      },
    });
  } catch (error) {
    console.error("Failed to expose APIs:", error);
  }
}
