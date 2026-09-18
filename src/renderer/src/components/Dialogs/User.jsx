import "../../assets/styles/dialogs/UserDialog.scss";
import { useCallback, useEffect, useRef, useState } from "react";
import { userKickTalkBadges } from "../../../../../utils/kickTalkBadges";
import clsx from "clsx";
import Message from "../Messages/Message";
import Pin from "../../assets/icons/push-pin-fill.svg?asset";
import ArrowUpRight from "../../assets/icons/arrow-up-right-bold.svg?asset";
import Close from "../../assets/icons/x-bold.svg?asset";
import Copy from "../../assets/icons/copy-simple-fill.svg?asset";
import BanIcon from "../../assets/icons/gavel-fill.svg?asset";
import UnbanIcon from "../../assets/icons/circle-slash.svg?asset";
import Check from "../../assets/icons/check-bold.svg?asset";
import { KickBadges, KickTalkBadges, StvBadges } from "../Cosmetics/Badges";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../Shared/Tooltip";

// TODO: Add Kick Talk Badges to User Dialog
// TODO: Add Paints to User Dialog
// TODO: Add Slider/Custom Timeout to User Dialog

const User = () => {
  const [dialogData, setDialogData] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [userLogs, setUserLogs] = useState([]);
  const [subscriberBadges, setSubscriberBadges] = useState([]);
  const [sevenTVEmotes, setSevenTVEmotes] = useState([]);
  const [isDialogPinned, setIsDialogPinned] = useState(false);
  const [dialogUserStyle, setDialogUserStyle] = useState(null);
  const [isUserSilenced, setIsUserSilenced] = useState(false);
  const [settings, setSettings] = useState({});
  const dialogLogsRef = useRef(null);

  const kickUsername = localStorage.getItem("kickUsername");

  const [silencedUsers, setSilencedUsers] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("silencedUsers")) || { data: [] };
    } catch (e) {
      console.error("Error parsing silenced users:", e);
      return { data: [] };
    }
  });

  const loadGeneration = useRef(0);
  const latestData = useRef(null);
  const [profileError, setProfileError] = useState("");
  const [profileLoading, setProfileLoading] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const loadData = async (data) => {
    const generation = ++loadGeneration.current;
    latestData.current = data;
    setUserProfile(null);
    setUserLogs([]);
    setAvatarFailed(false);
    setProfileError("");
    setProfileLoading(true);
    setIsDialogPinned(data.pinned || false);
    let rooms = [];
    try {
      rooms = JSON.parse(localStorage.getItem("chatrooms") || "[]");
    } catch {
      /* Use the selection's channel. */
    }
    const storedRoom = rooms.find((room) => room.id === data.chatroomId);
    const chatroom = storedRoom || { slug: data.chatroomSlug, username: data.chatroomSlug };
    setDialogData({ ...data, chatroom });
    setDialogUserStyle(data.userStyle);
    setSevenTVEmotes(data.sevenTVEmotes || storedRoom?.channel7TVEmotes || []);
    setSubscriberBadges(data.subscriberBadges || storedRoom?.streamerData?.subscriber_badges || []);
    const results = await Promise.allSettled([
      window.app.store.get(),
      window.app.logs.get({ chatroomId: data.chatroomId, userId: data.sender.id }),
      data.fetchedUser
        ? Promise.resolve({ data: data.fetchedUser })
        : chatroom.slug
          ? window.app.kick.getUserChatroomInfo(chatroom.slug, data.sender.username)
          : Promise.reject(new Error("Channel details are unavailable.")),
    ]);
    if (generation !== loadGeneration.current) return;
    if (results[0].status === "fulfilled") setSettings(results[0].value);
    if (results[1].status === "fulfilled") setUserLogs(results[1].value || []);
    if (results[2].status === "fulfilled" && results[2].value?.data) {
      const profile = results[2].value.data;
      setUserProfile(profile.data || profile);
    } else setProfileError("Profile details could not be loaded.");
    setProfileLoading(false);
    let silenced = { data: [] };
    try {
      silenced = JSON.parse(localStorage.getItem("silencedUsers")) || silenced;
    } catch {
      /* No cached muted users. */
    }
    setSilencedUsers(silenced);
    setIsUserSilenced(silenced.data?.some((user) => user.id === data.sender.id));
  };

  const updateData = (data) => {
    setUserLogs((prevLogs) => {
      if (data?.userId !== latestData.current?.sender?.id || data?.chatroomId !== latestData.current?.chatroomId)
        return prevLogs;
      if (!data?.logs?.length) return prevLogs;
      const existingIds = new Set(prevLogs.map((msg) => msg.id));
      const newLogs = data.logs.filter((msg) => !existingIds.has(msg.id));

      if (!newLogs.length) return prevLogs;
      return [...prevLogs, ...newLogs];
    });
  };

  useEffect(() => {
    const dataCleanup = window.app.userDialog.onData(loadData);
    const updateCleanup = window.app.logs.onUpdate(updateData);
    const escape = (event) => {
      if (event.key === "Escape") window.app.userDialog.close();
    };
    window.addEventListener("keydown", escape);

    return () => {
      loadGeneration.current++;
      window.removeEventListener("keydown", escape);
      dataCleanup();
      updateCleanup();
    };
  }, []);

  useEffect(() => {
    if (dialogLogsRef.current) {
      dialogLogsRef.current.scrollTop = dialogLogsRef.current.scrollHeight;
    }
  }, [userLogs, dialogData]);

  const silenceUser = useCallback(async () => {
    if (!dialogData?.sender?.id) return;

    console.log("Silencing user", dialogData?.sender?.username);
    const currentSilencedUsers = JSON.parse(localStorage.getItem("silencedUsers")) || { data: [] };
    const userIndex = currentSilencedUsers.data.findIndex((user) => user.id === dialogData?.sender?.id);

    if (userIndex === -1) {
      currentSilencedUsers.data.push({
        id: dialogData?.sender?.id,
        username: dialogData?.sender?.username,
      });

      window.app.kick.getSilenceUser(dialogData?.sender?.id);
      setIsUserSilenced(true);
    } else {
      currentSilencedUsers.data.splice(userIndex, 1);
      window.app.kick.getUnsilenceUser(dialogData?.sender?.id);
      setIsUserSilenced(false);
    }

    localStorage.setItem("silencedUsers", JSON.stringify(currentSilencedUsers));
    setSilencedUsers(currentSilencedUsers);
  }, [dialogData?.sender?.id]);

  const handlePinToggle = async () => {
    await window.app.userDialog.pin(!isDialogPinned);
    setIsDialogPinned(!isDialogPinned);
  };

  const canModerate =
    dialogData?.userChatroomInfo?.is_broadcaster ||
    dialogData?.userChatroomInfo?.is_moderator ||
    dialogData?.userChatroomInfo?.is_super_admin;

  const handleTimeoutUser = async (duration) => {
    await window.app.modActions.getTimeoutUser(dialogData?.chatroom?.username, dialogData?.sender?.username, duration);
  };

  const userBadges = dialogData?.sender?.identity?.badges || [];

  return (
    <TooltipProvider>
      <div className="dialogWrapper">
        <div className="dialogHeader">
          <div className="dialogHeaderUser">
            <div className="dialogHeaderUserImage">
              {!avatarFailed && (userProfile?.profile_pic || dialogData?.sender?.profile_pic) ? (
                <img
                  src={userProfile?.profile_pic || dialogData?.sender?.profile_pic}
                  alt={`${dialogData?.sender?.username} avatar`}
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                <span className="dialogAvatarFallback" role="img" aria-label="No profile picture">
                  {dialogData?.sender?.username?.slice(0, 2).toUpperCase() || "?"}
                </span>
              )}
            </div>
            <div className="dialogHeaderUserInfo">
              <div className="dialogHeaderUserInfoProfile">
                <h1>{dialogData?.sender?.username || "N/A"}</h1>
                {(userBadges?.length > 0 || dialogData?.userStyle?.badge) && (
                  <div className="dialogHeaderUserBadges">
                    {dialogData?.userStyle?.badge && (
                      <StvBadges
                        badge={dialogData?.userStyle?.badge}
                        className="dialogHeaderUserBadges"
                        tooltip={false}
                      />
                    )}
                    {userBadges?.length > 0 && (
                      <KickBadges
                        badges={userBadges}
                        subscriberBadges={dialogData?.subscriberBadges}
                        tooltip={false}
                        className="dialogHeaderUserBadges"
                      />
                    )}
                  </div>
                )}
              </div>

              {profileLoading && <p role="status">Loading profile�</p>}
              {profileError && (
                <p role="alert">
                  {profileError}{" "}
                  <button
                    className="dialogProfileRetry"
                    onClick={() => loadData({ ...latestData.current, pinned: isDialogPinned })}
                  >
                    Retry
                  </button>
                </p>
              )}
              <div className="dialogHeaderUserDates">
                <div className="dialogHeaderDate">
                  <p>Following since:</p>
                  <span>
                    {userProfile?.following_since
                      ? new Date(userProfile?.following_since).toLocaleDateString(undefined, {
                          year: "numeric",
                          month: "long",
                          day: "numeric",
                        })
                      : "N/A"}
                  </span>
                </div>

                <div className="dialogHeaderDate">
                  <p>Subscribed for</p>
                  <span>
                    {userProfile?.subscribed_for == null
                      ? "Not available"
                      : userProfile.subscribed_for !== 1
                        ? `${userProfile?.subscribed_for} months`
                        : `${userProfile?.subscribed_for} month`}
                    .
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="dialogHeaderOptions">
            <div className="dialogHeaderOptionsTop">
              <button
                className={clsx("dialogHeaderOptionsButton", isUserSilenced && "muted")}
                disabled={
                  kickUsername?.replaceAll("-", "_").toLowerCase() === dialogData?.sender?.username?.toLowerCase() ||
                  !kickUsername
                }
                onClick={silenceUser}
              >
                <span>{isUserSilenced ? "Unmute User" : "Mute User"}</span>
                <div className="checkBox">
                  <img src={Check} width={14} height={14} alt="Check" />
                </div>
              </button>
              <button
                className="dialogHeaderOptionsButton"
                onClick={() => {
                  // TODO: Fix different underscores effects
                  const transformedUsername = dialogData?.sender?.username.toLowerCase();
                  window.open(`https://kick.com/${transformedUsername}`, "_blank", "noopener,noreferrer");
                }}
              >
                Open Channel <img src={ArrowUpRight} width={18} height={18} />
              </button>
            </div>

            {canModerate && dialogData?.sender?.username !== dialogData?.chatroom?.username && (
              <div className="dialogHeaderModActions">
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <button
                      className="dialogHeaderModActionsBtn"
                      onClick={() => {
                        window.app.modActions.getUnbanUser(
                          dialogData?.chatroom?.username,
                          dialogData?.sender?.username,
                        );
                      }}
                    >
                      <img src={UnbanIcon} width={16} height={16} alt="Unban" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Unban User</p>
                  </TooltipContent>
                </Tooltip>
                <div className="dialogHeaderModActionsTimeout">
                  <button className="dialogHeaderModActionsTimeoutBtn" onClick={() => handleTimeoutUser(1)}>
                    1m
                  </button>
                  <button className="dialogHeaderModActionsTimeoutBtn" onClick={() => handleTimeoutUser(5)}>
                    5m
                  </button>
                  <button className="dialogHeaderModActionsTimeoutBtn" onClick={() => handleTimeoutUser(30)}>
                    30m
                  </button>
                  <button className="dialogHeaderModActionsTimeoutBtn" onClick={() => handleTimeoutUser(60)}>
                    1h
                  </button>
                  <button className="dialogHeaderModActionsTimeoutBtn" onClick={() => handleTimeoutUser(1440)}>
                    1d
                  </button>
                  <button className="dialogHeaderModActionsTimeoutBtn" onClick={() => handleTimeoutUser(10080)}>
                    1w
                  </button>
                  {/* <div className="dialogHeaderModActionsTimeoutCustom">
                <input type="number" placeholder="Custom" />
              </div> */}
                </div>
                <Tooltip delayDuration={100}>
                  <TooltipTrigger asChild>
                    <button
                      className="dialogHeaderModActionsBtn"
                      onClick={() => {
                        window.app.modActions.getBanUser(dialogData?.chatroom?.username, dialogData?.sender?.username);
                      }}
                    >
                      <img src={BanIcon} width={16} height={16} alt="Ban" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Ban User</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>

          <div className="dialogOptions">
            <button
              className="dialogOptionsButton"
              aria-label="Close user"
              title="Close (Escape)"
              onClick={() => window.app.userDialog.close()}
            >
              <img src={Close} width={16} height={16} alt="" />
            </button>
            <button className={clsx("dialogOptionsButton", isDialogPinned ? "pinned" : "")} onClick={handlePinToggle}>
              <img src={Pin} width={16} height={16} alt="Pin" />
            </button>
            <button
              className="dialogOptionsButton"
              onClick={() => navigator.clipboard.writeText(dialogData?.sender?.username ?? "N/A")}
            >
              <img src={Copy} width={16} height={16} alt="Copy" />
            </button>
          </div>
        </div>

        <div className="dialogLogs">
          <div className="dialogLogsContent" ref={dialogLogsRef}>
            {userLogs?.map((message, i) => {
              return (
                <Message
                  key={`${message.id}-${i}`}
                  message={message}
                  chatroomId={dialogData?.chatroomId}
                  chatroomName={dialogData?.chatroom?.slug}
                  userChatroomInfo={dialogData?.userChatroomInfo}
                  dialogUserStyle={dialogUserStyle}
                  subscriberBadges={subscriberBadges}
                  allStvEmotes={sevenTVEmotes}
                  settings={settings}
                  kickTalkBadges={userKickTalkBadges}
                  type={"dialog"}
                />
              );
            })}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
};

export default User;
