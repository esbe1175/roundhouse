import { useCallback, useEffect, useRef, useState } from "react";
import { useSettings } from "../providers/SettingsProvider";
import useChatStore from "../providers/ChatProvider";
import Chat from "../components/Chat";
import Mentions from "../components/Dialogs/Mentions";
import Minus from "../assets/icons/minus-bold.svg?asset";
import Square from "../assets/icons/square-bold.svg?asset";
import Close from "../assets/icons/x-bold.svg?asset";
import Gear from "../assets/icons/gear-fill.svg?asset";
import SignOut from "../assets/icons/sign-out-bold.svg?asset";
import User from "../assets/icons/user-fill.svg?asset";
import Play from "../assets/icons/play-fill.svg?asset";
import "../assets/styles/pages/ChatPage.scss";
import "../assets/styles/pages/Roundhouse.scss";

const api = window.app.roundhouse;
const emptyPlayer = { status: "idle", pause: false, volume: 80, mute: false, qualities: [], quality: "auto" };

function ChannelCard({ channel, onOpen }) {
  const [failedThumbnail, setFailedThumbnail] = useState(null);
  return (
    <button className={`rh-channel ${channel.live ? "" : "rh-offline"}`} onClick={() => onOpen(channel)}>
      <div className="rh-thumbnail">
        {channel.thumbnail && channel.thumbnail !== failedThumbnail ? (
          <img src={channel.thumbnail} alt="" loading="lazy" onError={() => setFailedThumbnail(channel.thumbnail)} />
        ) : (
          <img className="rh-placeholder" src={Play} alt="" />
        )}
        {channel.live && (
          <span className="rh-live">
            <i />
            {channel.viewers !== null
              ? new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(
                  channel.viewers,
                )
              : "LIVE"}
          </span>
        )}
        {!channel.live && <span className="rh-offline-label">Offline</span>}
      </div>
      <div className="rh-card-info">
        {channel.avatar ? (
          <img className="rh-avatar" src={channel.avatar} alt="" />
        ) : (
          <span className="rh-avatar rh-initial">
            <img src={User} alt="" />
          </span>
        )}
        <div>
          <strong>{channel.name}</strong>
          {channel.title && <p title={channel.title}>{channel.title}</p>}
          {channel.category && <small className="rh-category">{channel.category}</small>}
        </div>
      </div>
    </button>
  );
}

export default function Roundhouse() {
  const { settings, updateSettings } = useSettings();
  const [account, setAccount] = useState(null),
    [ready, setReady] = useState(false),
    [loginBusy, setLoginBusy] = useState(false);
  const [channels, setChannels] = useState([]),
    [query, setQuery] = useState(""),
    [error, setError] = useState(""),
    [refreshing, setRefreshing] = useState(false),
    [updated, setUpdated] = useState(null);
  const [selected, setSelected] = useState(null),
    [room, setRoom] = useState(null),
    [chatError, setChatError] = useState(""),
    [player, setPlayer] = useState(emptyPlayer),
    [fullscreen, setFullscreen] = useState(false),
    [mentions, setMentions] = useState(false);
  const [width, setWidth] = useState(() => Number(localStorage.getItem("roundhouse.chatWidth")) || 360);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [topFocus, setTopFocus] = useState(false),
    [bottomFocus, setBottomFocus] = useState(false);
  const [draggingDivider, setDraggingDivider] = useState(false);
  const [chatTools, setChatTools] = useState(null);
  const dividerDrag = useRef(null);
  const streamData = useChatStore((state) => state.chatrooms.find((chat) => chat.id === room)?.streamerData);
  const windowTitle = selected
    ? `Roundhouse: ${streamData?.user?.username || selected.name}${streamData?.livestream?.session_title || selected.title ? ` - ${streamData?.livestream?.session_title || selected.title}` : ""}`
    : "Roundhouse";
  useEffect(() => {
    document.title = windowTitle;
  }, [windowTitle]);
  const topBar = useRef(null),
    bottomBar = useRef(null);
  const topShown = !!player.hoverTop || topFocus,
    bottomShown = !!player.hoverBottom || bottomFocus;
  const overview = useRef(null),
    scroll = useRef(0),
    surface = useRef(null),
    generation = useRef(0),
    refreshLock = useRef(false),
    selectedRef = useRef(null);
  const effectiveWidth = Math.max(280, Math.min(width, viewportWidth - 480));

  const clearChat = useCallback(() => {
    const store = useChatStore.getState();
    store.cleanupBatching();
    for (const chat of [...store.chatrooms]) store.removeChatroom(chat.id);
    store.setCurrentChatroom(null);
    localStorage.removeItem("chatrooms");
    setRoom(null);
    setMentions(false);
  }, []);
  const back = useCallback(async () => {
    setTopFocus(false);
    setBottomFocus(false);
    setDraggingDivider(false);
    generation.current++;
    selectedRef.current = null;
    setSelected(null);
    setChatError("");
    clearChat();
    await api.stop();
    await api.fullscreen(false);
  }, [clearChat]);
  useEffect(() => {
    api.ready().then((state) => {
      setAccount(state.user);
      setError(state.error || "");
      setReady(true);
    });
    const cleanPlayer = api.onPlayer(setPlayer),
      cleanFull = api.onFullscreen(setFullscreen);
    const cleanAccount = api.onAccount((state) => {
      if (state.user) {
        window.location.reload();
      } else {
        void back();
        setAccount(null);
        setChannels([]);
        setError(state.error || "");
      }
    });
    const resize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => {
      cleanPlayer();
      cleanFull();
      cleanAccount();
      window.removeEventListener("resize", resize);
    };
  }, [back]);

  const refresh = useCallback(async () => {
    if (refreshLock.current) return;
    refreshLock.current = true;
    setRefreshing(true);
    try {
      const data = await api.follows();
      setChannels(data);
      setUpdated(new Date());
      setError("");
    } catch (err) {
      setError(err.message);
    } finally {
      refreshLock.current = false;
      setRefreshing(false);
    }
  }, []);
  useEffect(() => {
    if (!account || selected) return;
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 60000);
    requestAnimationFrame(() => {
      if (overview.current) overview.current.scrollTop = scroll.current;
    });
    return () => clearInterval(timer);
  }, [account, selected, refresh]);

  const login = async () => {
    setLoginBusy(true);
    setError("");
    try {
      const state = await api.login();
      if (state.user) window.location.reload();
      else if (state.error) setError(state.error);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoginBusy(false);
    }
  };
  const open = async (channel) => {
    setTopFocus(false);
    setBottomFocus(false);
    const current = ++generation.current;
    scroll.current = overview.current?.scrollTop || 0;
    clearChat();
    setChatError("");
    setSelected(channel);
    selectedRef.current = channel;
    setPlayer({ ...emptyPlayer, status: "loading" });
    void api.open(channel.slug).catch((err) => setError(err.message));
    try {
      const chat = await useChatStore.getState().addChatroom(channel.slug);
      if (current !== generation.current) {
        if (chat?.id) useChatStore.getState().removeChatroom(chat.id);
        return;
      }
      if (!chat?.id) throw new Error(chat?.message || "Could not connect to this channel’s chat.");
      useChatStore.getState().setCurrentChatroom(chat.id);
      setRoom(chat.id);
      useChatStore.setState({ personalEmoteSets: JSON.parse(localStorage.getItem("stvPersonalEmoteSets") || "[]") });
    } catch (err) {
      setChatError(err.message);
    }
  };
  const control = async (action, value) => {
    try {
      await api.control(action, value);
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => {
    if (!selected || !surface.current) return;
    let raf;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = surface.current?.getBoundingClientRect();
        if (!rect) return;
        const overlays = [
          ...document.querySelectorAll('[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]'),
        ];
        const covered = overlays.some((el) => {
          const r = el.getBoundingClientRect();
          return (
            r.width &&
            r.height &&
            r.left < rect.right &&
            r.right > rect.left &&
            r.top < rect.bottom &&
            r.bottom > rect.top
          );
        });
        void api
          .bounds({
            x: Math.max(0, rect.x),
            y: Math.max(0, rect.y),
            width: rect.width,
            height: rect.height,
            visible: !covered && ["playing", "loading"].includes(player.status),
            overlayTop: topShown ? topBar.current?.getBoundingClientRect().height || 0 : 0,
            overlayBottom: bottomShown ? bottomBar.current?.getBoundingClientRect().height || 0 : 0,
            dividerWidth: fullscreen ? 0 : 7,
            titlebarHeight: document.querySelector(".rh-titlebar")?.getBoundingClientRect().height || 0,
          })
          .catch(() => {});
      });
    };
    const resize = new ResizeObserver(sync);
    resize.observe(surface.current);
    if (topBar.current) resize.observe(topBar.current);
    if (bottomBar.current) resize.observe(bottomBar.current);
    const mutation = new MutationObserver(sync);
    mutation.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-state", "style"],
    });
    window.addEventListener("resize", sync);
    sync();
    return () => {
      cancelAnimationFrame(raf);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [selected, fullscreen, player.status, topShown, bottomShown]);

  useEffect(() => {
    const keys = (event) => {
      if (!selected) return;
      if (event.key === "Escape" && fullscreen) {
        void api.fullscreen(false);
        return;
      }
      if (event.target.closest('input,textarea,[contenteditable="true"],button,select')) return;
      if (event.code === "Space") {
        event.preventDefault();
        void control("pause");
      }
      if (event.key === "f") void api.fullscreen(!fullscreen);
      if (event.key === "m") void control("mute");
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [selected, fullscreen]);
  const resizeChat = (value) => {
    const next = Math.max(280, Math.min(value, window.innerWidth - 480));
    setWidth(next);
    localStorage.setItem("roundhouse.chatWidth", String(next));
  };
  const filtered = channels.filter((c) =>
    `${c.name} ${c.title} ${c.category}`.toLowerCase().includes(query.toLowerCase()),
  );
  const live = filtered.filter((c) => c.live),
    offline = filtered.filter((c) => !c.live);

  return (
    <div className={`rh-app ${fullscreen ? "rh-fullscreen" : ""}`}>
      {!fullscreen && (
        <header className="rh-titlebar">
          <span className="rh-brand" title={windowTitle}>
            {windowTitle}
          </span>
          {account && (
            <div className="rh-account">
              <button
                className="rh-account-settings"
                title="Settings"
                aria-label="Settings"
                onClick={() => window.app.settingsDialog.open({ userData: account })}
              >
                {account.profile_pic && <img className="rh-account-avatar" src={account.profile_pic} alt="" />}
                <span>{account.username}</span>
                <img src={Gear} alt="" />
              </button>
              <button title="Sign out" aria-label="Sign out" onClick={() => window.app.logout()}>
                <img src={SignOut} alt="" />
              </button>
            </div>
          )}
          <div className="rh-window-controls">
            <button aria-label="Minimize" onClick={() => window.app.minimize()}>
              <img src={Minus} alt="" />
            </button>
            <button aria-label="Maximize" onClick={() => window.app.maximize()}>
              <img src={Square} alt="" />
            </button>
            <button aria-label="Close" onClick={() => window.app.close()}>
              <img src={Close} alt="" />
            </button>
          </div>
        </header>
      )}
      {!ready ? (
        <main className="rh-welcome">
          <p>Restoring your session…</p>
        </main>
      ) : !account ? (
        <main className="rh-welcome">
          <h1>Sign in to Roundhouse</h1>
          <p>Watch your followed channels and join chat with your Kick account.</p>
          <button className="rh-primary" disabled={loginBusy} onClick={login}>
            {loginBusy ? "Finish signing in with Kick…" : "Sign in to Kick"}
          </button>
          {error && (
            <p className="rh-error" role="alert">
              {error}
            </p>
          )}
          <small>Your session stays on this computer.</small>
        </main>
      ) : selected ? (
        <>
          {error && (
            <div className="rh-error" role="alert">
              {error}
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          <main className="rh-watch">
            <section className="rh-player">
              <nav
                ref={topBar}
                aria-label="Channel controls"
                className={`rh-watchbar rh-video-overlay ${topShown ? "is-visible" : ""}`}
                onPointerDownCapture={() => setTopFocus(false)}
                onFocusCapture={(event) => setTopFocus(event.target.matches(":focus-visible"))}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setTopFocus(false);
                }}
              >
                <button onClick={() => void back()}>← Following</button>
                <div>
                  <strong>{selected.name}</strong>
                  <span>{selected.title}</span>
                </div>
              </nav>
              <div className="rh-surface" ref={surface}>
                {!["playing"].includes(player.status) && (
                  <div className="rh-player-message">
                    <h2>
                      {player.status === "loading"
                        ? "Connecting to the stream…"
                        : player.status === "offline"
                          ? "This channel is offline"
                          : player.status === "ended"
                            ? "The stream has ended"
                            : player.status === "error"
                              ? "Playback needs attention"
                              : "Ready to watch"}
                    </h2>
                    {player.error && <p>{player.error}</p>}
                    {["error", "ended", "offline"].includes(player.status) && (
                      <button onClick={() => void control("retry")}>Retry stream</button>
                    )}
                  </div>
                )}
              </div>
              <div
                ref={bottomBar}
                role="toolbar"
                aria-label="Playback controls"
                className={`rh-player-controls rh-video-overlay ${bottomShown ? "is-visible" : ""}`}
                onPointerDownCapture={() => setBottomFocus(false)}
                onFocusCapture={(event) => setBottomFocus(event.target.matches(":focus-visible"))}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setBottomFocus(false);
                }}
              >
                <button disabled={player.status !== "playing"} onClick={() => void control("pause")}>
                  {player.pause ? "Play" : "Pause"}
                </button>
                <button onClick={() => void control("mute")}>{player.mute ? "Unmute" : "Mute"}</button>
                <input
                  aria-label="Volume"
                  type="range"
                  min="0"
                  max="100"
                  value={player.volume ?? 80}
                  onChange={(event) => void control("volume", Number(event.target.value))}
                />
                <button onClick={() => void control("live")}>● Live</button>
                <span className="rh-player-status">
                  {player["paused-for-cache"] ? "Buffering" : player.status === "playing" ? "MPV" : player.status}
                </span>
                <select
                  aria-label="Video quality"
                  value={player.quality}
                  onChange={(event) => void control("quality", event.target.value)}
                >
                  <option value="auto">Auto quality</option>
                  {player.qualities.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.label}
                    </option>
                  ))}
                </select>
                <button onClick={() => api.fullscreen(!fullscreen)}>
                  {fullscreen ? "Exit fullscreen" : "Fullscreen"}
                </button>
              </div>
            </section>
            {!fullscreen && (
              <>
                <div
                  className={`rh-divider ${player.hoverDivider || draggingDivider ? "is-active" : ""}`}
                  style={{ right: effectiveWidth - 7 }}
                  role="separator"
                  aria-label="Chat width"
                  aria-orientation="vertical"
                  aria-valuenow={effectiveWidth}
                  aria-valuemin={280}
                  aria-valuemax={viewportWidth - 480}
                  tabIndex={0}
                  onPointerDown={(event) => {
                    if (event.button !== 0) return;
                    event.preventDefault();
                    dividerDrag.current = { x: event.clientX, width: effectiveWidth };
                    event.currentTarget.setPointerCapture(event.pointerId);
                    setDraggingDivider(true);
                  }}
                  onPointerMove={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId) && dividerDrag.current)
                      resizeChat(dividerDrag.current.width + dividerDrag.current.x - event.clientX);
                  }}
                  onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
                  onLostPointerCapture={() => {
                    dividerDrag.current = null;
                    setDraggingDivider(false);
                  }}
                  onKeyDown={(event) => {
                    if (["ArrowLeft", "ArrowRight", "Home"].includes(event.key)) {
                      event.preventDefault();
                      resizeChat(event.key === "Home" ? 360 : width + (event.key === "ArrowLeft" ? 20 : -20));
                    }
                  }}
                />
                <aside className="rh-chat" style={{ width: effectiveWidth }}>
                  <div className="rh-chat-tabs">
                    <button className={!mentions ? "active" : ""} onClick={() => setMentions(false)}>
                      Stream chat
                    </button>
                    <button className={mentions ? "active" : ""} onClick={() => setMentions(true)}>
                      Mentions
                    </button>
                    <div className="rh-chat-tools" ref={setChatTools} />
                    <button className="rh-chat-filter-button" title="Chat filters" aria-label="Chat filters"
                      onClick={() => window.app.settingsDialog.open({ userData: account, section: "filters" })}><img src={Gear} alt="" width={16} height={16} /></button>
                  </div>
                  <div className="rh-chat-content">
                    {chatError ? (
                      <div className="rh-player-message">
                        <p>{chatError}</p>
                        <button onClick={() => void open(selected)}>Retry chat</button>
                      </div>
                    ) : !room ? (
                      <div className="rh-player-message">Connecting to chat…</div>
                    ) : mentions ? (
                      <Mentions chatroomId={room} setActiveChatroom={() => setMentions(false)} />
                    ) : (
                      <Chat
                        compactHeader
                        headerTarget={chatTools}
                        chatroomId={room}
                        kickUsername={account.username}
                        kickId={String(account.id)}
                        settings={settings}
                        updateSettings={updateSettings}
                      />
                    )}
                  </div>
                </aside>
              </>
            )}
          </main>
        </>
      ) : (
        <main className="rh-overview" ref={overview}>
          <div className="rh-overview-heading">
            <div>
              <h1>Following</h1>
            </div>
          </div>
          <div className="rh-toolbar">
            <label>
              <svg
                aria-hidden="true"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="10.5" cy="10.5" r="6.5" />
                <path d="m16 16 5 5" />
              </svg>
              <input
                placeholder="Search followed channels"
                aria-label="Search followed channels"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <span>
              {updated
                ? `Updated ${updated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                : "Syncing with Kick"}
            </span>
            <button onClick={refresh} disabled={refreshing}>
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
          </div>
          {error && (
            <div className="rh-error" role="alert">
              {error}
              {channels.length > 0 && " Showing your last successful refresh."}
              <button onClick={login}>Sign in to Kick</button>
            </div>
          )}
          <section>
            <div className="rh-section-heading">
              <h2>
                Live channels <span>{live.length}</span>
              </h2>
            </div>
            {live.length ? (
              <div className="rh-grid">
                {live.map((channel) => (
                  <ChannelCard key={channel.slug} channel={channel} onOpen={open} />
                ))}
              </div>
            ) : (
              <div className="rh-empty">
                {refreshing && !updated
                  ? "Loading your followed channels…"
                  : query
                    ? "No live channels match your search."
                    : channels.length
                      ? "None of your followed channels are live."
                      : "Your followed channels will appear here."}
              </div>
            )}
          </section>
          {offline.length > 0 && (
            <details className="rh-offline-section">
              <summary>
                Offline <span>{offline.length}</span>
              </summary>
              <div className="rh-grid">
                {offline.map((channel) => (
                  <ChannelCard key={channel.slug} channel={channel} onOpen={open} />
                ))}
              </div>
            </details>
          )}
        </main>
      )}
    </div>
  );
}
