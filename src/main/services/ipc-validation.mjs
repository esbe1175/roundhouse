const identifier = (value) =>
  (typeof value === "string" || typeof value === "number") && /^[a-zA-Z0-9_-]{1,100}$/.test(String(value));
const channelMethods = new Set([
  "getChannelInfo",
  "getChannelChatroomInfo",
  "getKickEmotes",
  "getUserChatroomInfo",
  "getSelfChatroomInfo",
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
  "getUnpinMessage",
  "getUpdateTitle",
  "getClearChatroom",
  "sendMessageToChannel",
  "sendReplyToChannel",
  "getChannelEmotes",
  "getUserStvProfile",
  "playerOpen",
]);
export function validateOperation(method, args) {
  if (!Array.isArray(args) || args.length > 8 || JSON.stringify(args).length > 100000)
    throw new Error("Invalid application request.");
  if (channelMethods.has(method) && !identifier(args[0])) throw new Error("Invalid channel or user identifier.");
  if (
    ["getUserChatroomInfo", "getBanUser", "getUnbanUser", "getTimeoutUser", "getDeleteMessage"].includes(method) &&
    !identifier(args[1])
  )
    throw new Error("Invalid user or message identifier.");
  if (
    ["sendMessageToChannel", "sendReplyToChannel"].includes(method) &&
    (typeof args[1] !== "string" || !args[1].trim() || args[1].length > 5000)
  )
    throw new Error("Invalid chat message.");
  if (
    method === "getKickAuthForEvents" &&
    (!/^(private-)?[a-zA-Z0-9_.-]{1,150}$/.test(args[0]) || !/^\d+\.\d+$/.test(args[1]))
  )
    throw new Error("Invalid chat subscription.");
  if (method === "getPinMessage" && (!identifier(args[0]?.chatroomName) || !identifier(args[0]?.chatroom_id)))
    throw new Error("Invalid pin target.");
}
