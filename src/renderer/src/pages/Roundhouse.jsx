import { useCallback, useEffect, useRef, useState } from "react";
import { useSettings } from "../providers/SettingsProvider";
import useChatStore from "../providers/ChatProvider";
import Chat from "../components/Chat";
import Mentions from "../components/Dialogs/Mentions";
import "../assets/styles/pages/ChatPage.scss";
import "../assets/styles/pages/Roundhouse.scss";

const api = window.app.roundhouse;
const emptyPlayer = { status: "idle", pause: false, volume: 80, mute: false, qualities: [], quality: "auto" };

function ChannelCard({ channel, onOpen }) {
  return (
    <button className={`rh-channel ${channel.live ? "" : "rh-offline"}`} onClick={() => onOpen(channel)}>
      <div className="rh-thumbnail">
        {channel.thumbnail ? (
          <img src={channel.thumbnail} alt="" loading="lazy" />
        ) : (
          <span className="rh-monogram">{channel.name.slice(0, 1).toUpperCase()}</span>
        )}
        {channel.live && <span className="rh-live">LIVE</span>}
        {channel.live && channel.viewers !== null && (
          <span className="rh-viewers">{new Intl.NumberFormat().format(channel.viewers)} watching</span>
        )}
      </div>
      <div className="rh-card-info">
        {channel.avatar ? (
          <img className="rh-avatar" src={channel.avatar} alt="" />
        ) : (
          <span className="rh-avatar rh-initial">{channel.name.slice(0, 1)}</span>
        )}
        <div>
          <strong>{channel.name}</strong>
          <p title={channel.title}>{channel.title}</p>
          <small>{channel.category || (channel.live ? "Live now" : "Open chat")}</small>
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
    } catch (err) {
      setError(err.message);
    } finally {
      setLoginBusy(false);
    }
  };
  const open = async (channel) => {
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
          })
          .catch(() => {});
      });
    };
    const resize = new ResizeObserver(sync);
    resize.observe(surface.current);
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
  }, [selected, fullscreen, player.status]);

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
          <span className="rh-brand">
            <span className="rh-logo">R</span> Roundhouse
          </span>
          <span className="rh-caption">YOUR CHANNELS. YOUR SPACE.</span>
          <div className="rh-window-controls">
            <button aria-label="Minimize" onClick={() => window.app.minimize()}>
              −
            </button>
            <button aria-label="Maximize" onClick={() => window.app.maximize()}>
              □
            </button>
            <button aria-label="Close" onClick={() => window.app.close()}>
              ×
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
          <div className="rh-logo rh-logo-large">R</div>
          <small>WELCOME TO ROUNDHOUSE</small>
          <h1>
            A little closer to
            <br />
            your favorite streams.
          </h1>
          <p>
            Your follows, an MPV player, and KickTalk chat.
            <br />
            Together in one quiet space.
          </p>
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
          {!fullscreen && (
            <nav className="rh-watchbar">
              <button onClick={() => void back()}>← Following</button>
              <div>
                <strong>{selected.name}</strong>
                <span>{selected.title}</span>
              </div>
              <button onClick={() => window.app.settingsDialog.open({ userData: account })}>Settings</button>
            </nav>
          )}
          {error && (
            <div className="rh-error" role="alert">
              {error}
              <button onClick={() => setError("")}>Dismiss</button>
            </div>
          )}
          <main className="rh-watch">
            <section className="rh-player">
              <div className="rh-surface" ref={surface}>
                {!["playing"].includes(player.status) && (
                  <div className="rh-player-message">
                    <span className="rh-logo">R</span>
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
                    <p>{player.error || (player.status === "offline" ? "Chat is still here." : "Powered by MPV")}</p>
                    {["error", "ended", "offline"].includes(player.status) && (
                      <button onClick={() => void control("retry")}>Retry stream</button>
                    )}
                  </div>
                )}
              </div>
              <div className="rh-player-controls">
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
                  className="rh-divider"
                  role="separator"
                  aria-label="Chat width"
                  aria-orientation="vertical"
                  aria-valuenow={effectiveWidth}
                  aria-valuemin={280}
                  aria-valuemax={viewportWidth - 480}
                  tabIndex={0}
                  onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
                  onPointerMove={(event) => {
                    if (event.currentTarget.hasPointerCapture(event.pointerId))
                      resizeChat(window.innerWidth - event.clientX);
                  }}
                  onPointerUp={(event) => event.currentTarget.releasePointerCapture(event.pointerId)}
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
                    <small>KickTalk</small>
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
              <small>YOUR CORNER OF KICK</small>
              <h1>
                Following<span>{channels.length}</span>
              </h1>
              <p>Good company. Nothing extra.</p>
            </div>
            <div className="rh-account">
              <span>{account.username}</span>
              <button onClick={() => window.app.settingsDialog.open({ userData: account })}>Settings</button>
              <button onClick={() => window.app.logout()}>Sign out</button>
            </div>
          </div>
          <div className="rh-toolbar">
            <label>
              <span>⌕</span>
              <input
                placeholder="Find a followed channel…"
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
                <i /> Live now <span>{live.length}</span>
              </h2>
              <small>FROM YOUR FOLLOWED CHANNELS</small>
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
                      ? "Your followed channels are taking a break."
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
          <footer>
            Made for your way of watching.<span>KickTalk + MPV</span>
          </footer>
        </main>
      )}
    </div>
  );
}
