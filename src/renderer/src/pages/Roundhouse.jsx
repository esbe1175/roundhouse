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
import CaretDown from "../assets/icons/caret-down-fill.svg?asset";
import CaretRight from "../assets/icons/caret-right-fill.svg?asset";
import PlaybackIcon from "../components/PlaybackIcon";
import AmbientGlow from "../components/AmbientGlow";
import RoundhouseSettings from "../components/RoundhouseSettings";
import LegalDialog from "../components/LegalDialog";
import { GLOW_DEFAULTS } from "../../../../utils/glow-settings.mjs";
import { Slider } from "../components/Shared/Slider";
import { Switch } from "../components/Shared/Switch";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from "../components/Shared/Dropdown";
import "../assets/styles/pages/ChatPage.scss";
import "../assets/styles/pages/Roundhouse.scss";

const api = window.app.roundhouse;
const emptyPlayer = { status: "idle", pause: false, volume: 80, mute: false, qualities: [], quality: "auto" };

function formatRuntime(startedAt, now) {
  const seconds = Math.max(0, Math.floor((now - Date.parse(startedAt)) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  return `${hours ? `${hours}:` : ""}${String(minutes).padStart(hours ? 2 : 1, "0")}:${String(remainder).padStart(2, "0")}`;
}

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
    [cinema, setCinema] = useState(false),
    [mentions, setMentions] = useState(false),
    [minimized, setMinimized] = useState(false),
    [legalOpen, setLegalOpen] = useState(false);
  const videoFullscreen = fullscreen && !cinema;
  const changeView = (mode) => {
    setCinema(mode === "cinema");
    void api.fullscreen(mode !== "windowed");
  };
  const [width, setWidth] = useState(() => Number(localStorage.getItem("roundhouse.chatWidth")) || 360);
  const [viewportWidth, setViewportWidth] = useState(window.innerWidth);
  const [topFocus, setTopFocus] = useState(false),
    [bottomFocus, setBottomFocus] = useState(false);
  const [qualityOpen, setQualityOpen] = useState(false);
  const [appSettingsOpen, setAppSettingsOpen] = useState(false);
  const [surfaceSize, setSurfaceSize] = useState({ width: 0, height: 0 });
  const [bottomPressed, setBottomPressed] = useState(false);
  const [draggingDivider, setDraggingDivider] = useState(false);
  const [chatTools, setChatTools] = useState(null);
  const [clock, setClock] = useState(Date.now());
  const [playbackFeedback, setPlaybackFeedback] = useState(null);
  const dividerDrag = useRef(null);
  const streamData = useChatStore((state) => state.chatrooms.find((chat) => chat.id === room)?.streamerData);
  const windowTitle = selected
    ? `Roundhouse: ${streamData?.user?.username || selected.name}${streamData?.livestream?.session_title || selected.title ? ` - ${streamData?.livestream?.session_title || selected.title}` : ""}`
    : "Roundhouse";
  useEffect(() => {
    document.title = windowTitle;
  }, [windowTitle]);
  useEffect(() => {
    if (!selected) return undefined;
    const tick = () => setClock(Date.now());
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [selected]);
  const topBar = useRef(null),
    bottomBar = useRef(null);
  const topShown = !!player.hoverTop || topFocus,
    bottomShown = !!player.hoverBottom || bottomFocus || qualityOpen || appSettingsOpen || bottomPressed;
  useEffect(() => {
    let frame;
    // Keep the toolbar present through click dispatch, including a fast click
    // before the native cursor poll catches up after a menu closes.
    const release = () => {
      frame = requestAnimationFrame(() => setBottomPressed(false));
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    window.addEventListener("blur", release);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
      window.removeEventListener("blur", release);
    };
  }, []);
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
  const stopPlayback = useCallback(async () => {
    setTopFocus(false);
    setBottomFocus(false);
    setQualityOpen(false);
    setDraggingDivider(false);
    generation.current++;
    selectedRef.current = null;
    setSelected(null);
    setMinimized(false);
    setChatError("");
    clearChat();
    await api.stop();
    await api.fullscreen(false);
  }, [clearChat]);
  const back = useCallback(async () => {
    if (!["playing", "loading", "reconnecting"].includes(player.status)) {
      await stopPlayback();
      return;
    }
    setTopFocus(false);
    setBottomFocus(false);
    setQualityOpen(false);
    setDraggingDivider(false);
    generation.current++;
    setMinimized(true);
    setChatError("");
    clearChat();
    await api.fullscreen(false);
  }, [clearChat, player.status, stopPlayback]);
  useEffect(() => {
    api.ready().then((state) => {
      setAccount(state.user);
      setError(state.error || "");
      setReady(true);
    });
    const cleanPlayer = api.onPlayer(setPlayer),
      cleanFull = api.onFullscreen((enabled) => {
        setFullscreen(enabled);
        if (!enabled) setCinema(false);
      });
    const cleanAccount = api.onAccount((state) => {
      if (state.user) {
        window.location.reload();
      } else {
        void stopPlayback();
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
  }, [stopPlayback]);

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
    if (!account || (selected && !minimized)) return;
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 60000);
    requestAnimationFrame(() => {
      if (overview.current) overview.current.scrollTop = scroll.current;
    });
    return () => clearInterval(timer);
  }, [account, selected, minimized, refresh]);

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
  const connectChat = async (channel, current) => {
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
  const open = async (channel) => {
    setTopFocus(false);
    setBottomFocus(false);
    const current = ++generation.current;
    scroll.current = overview.current?.scrollTop || scroll.current;
    clearChat();
    setChatError("");
    const resume = selectedRef.current?.slug === channel.slug && player.status !== "idle";
    setSelected(channel);
    selectedRef.current = channel;
    setMinimized(false);
    if (!resume) {
      setPlayer((previous) => ({ ...previous, status: "loading" }));
      void api.open(channel.slug).catch((err) => setError(err.message));
    }
    await connectChat(channel, current);
  };
  const control = async (action, value) => {
    try {
      await api.control(action, value);
    } catch (err) {
      setError(err.message);
    }
  };
  const glowSettings = {
    enabled: player.ambientGlow ?? settings.ambientGlow ?? GLOW_DEFAULTS.ambientGlow,
    intensity: player.ambientIntensity ?? settings.ambientIntensity ?? GLOW_DEFAULTS.ambientIntensity,
    falloff: player.ambientFalloff ?? settings.ambientFalloff ?? GLOW_DEFAULTS.ambientFalloff,
    onChange: (enabled) => void control("ambientGlow", enabled),
    onIntensity: (value) => void control("ambientIntensity", value),
    onFalloff: (value) => void control("ambientFalloff", value),
    onReset: () => void control("resetGlow"),
  };
  const togglePauseWithFeedback = () => {
    const nextPaused = !player.pause;
    setPlaybackFeedback(nextPaused ? "pause" : "play");
    void control("pause");
  };

  useEffect(() => {
    if (!selected || !player.videoClick || !minimized) return;
    void open(selected);
  }, [player.videoClick]);
  useEffect(() => {
    if (!selected || !player.videoDoubleClick || minimized) return;
    togglePauseWithFeedback();
    const timer = setTimeout(() => setPlaybackFeedback(null), 650);
    return () => clearTimeout(timer);
  }, [player.videoDoubleClick]);

  useEffect(() => {
    if (!selected || !surface.current) return;
    let raf, transitionRaf;
    const sync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = surface.current?.getBoundingClientRect();
        if (!rect) return;
        setSurfaceSize((previous) =>
          previous.width === rect.width && previous.height === rect.height
            ? previous
            : { width: rect.width, height: rect.height },
        );
        const overlays = [
          ...document.querySelectorAll('[role="dialog"], [role="menu"], [data-radix-popper-content-wrapper]'),
        ];
        const covered = overlays.some((el) => {
          // Player menus use individual native cutouts; other dialogs hide the
          // surface until they close.
          if (el.matches(".rh-native-overlay") || el.querySelector(".rh-native-overlay"))
            return false;
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
        const overlayRects = [...document.querySelectorAll(".rh-native-overlay")]
          .map((el) => (el.closest("[data-radix-popper-content-wrapper]") || el).getBoundingClientRect())
          .filter((r) => r.left < rect.right && r.right > rect.left && r.top < rect.bottom && r.bottom > rect.top)
          .map((r) => ({
            x: Math.max(0, r.left - rect.left),
            y: Math.max(0, r.top - rect.top),
            width: Math.min(rect.right, r.right) - Math.max(rect.left, r.left),
            height: Math.min(rect.bottom, r.bottom) - Math.max(rect.top, r.top),
          }));
        const bottomHeight = bottomShown ? bottomBar.current?.getBoundingClientRect().height || 0 : 0;
        void api
          .bounds({
            x: Math.max(0, rect.x),
            y: Math.max(0, rect.y),
            width: rect.width,
            height: rect.height,
            visible: !covered && ["playing", "loading"].includes(player.status),
            overlayTop: minimized ? 0 : topShown ? topBar.current?.getBoundingClientRect().height || 0 : 0,
            overlayBottom: minimized ? 0 : bottomHeight,
            overlayRects,
            dividerWidth: minimized || videoFullscreen ? 0 : 7,
            titlebarHeight: document.querySelector(".rh-titlebar")?.getBoundingClientRect().height || 0,
            borderRadius: minimized ? 8 : 0,
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
    if (minimized) {
      const started = performance.now();
      const followTransition = (now) => {
        sync();
        if (now - started < 300) transitionRaf = requestAnimationFrame(followTransition);
      };
      transitionRaf = requestAnimationFrame(followTransition);
    }
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(transitionRaf);
      resize.disconnect();
      mutation.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [selected, minimized, fullscreen, videoFullscreen, player.status, topShown, bottomShown]);

  useEffect(() => {
    const keys = (event) => {
      if (!selected || minimized || event.defaultPrevented) return;
      if (event.key === "Escape" && fullscreen && !qualityOpen && !appSettingsOpen) {
        void api.fullscreen(false);
        return;
      }
      if (event.target.closest('input,textarea,[contenteditable="true"],button,select,[role="slider"],[role="menu"]'))
        return;
      if (event.code === "Space") {
        event.preventDefault();
        void control("pause");
      }
      if (event.key === "f") changeView(videoFullscreen ? "windowed" : "video");
      if (event.key === "m") void control("mute");
    };
    window.addEventListener("keydown", keys);
    return () => window.removeEventListener("keydown", keys);
  }, [selected, minimized, fullscreen, videoFullscreen, qualityOpen, appSettingsOpen]);
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
              <span className="rh-account-name">
                {account.profile_pic && <img className="rh-account-avatar" src={account.profile_pic} alt="" />}
                <span>{account.username}</span>
              </span>
              {!selected && <RoundhouseSettings {...glowSettings} />}
              <button title="Sign out" aria-label="Sign out" onClick={() => window.app.logout()}>
                <img src={SignOut} alt="" />
              </button>
            </div>
          )}
          <button
            className="rh-title-help"
            title="About Roundhouse"
            aria-label="About Roundhouse"
            onClick={() => setLegalOpen(true)}
          >
            <PlaybackIcon kind="help" />
          </button>
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
      <LegalDialog open={legalOpen} onClose={() => setLegalOpen(false)} />
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
      ) : selected && !minimized ? (
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
                <button className="rh-following-button" onClick={() => void back()}>
                  <PlaybackIcon kind="back" />
                  Following
                </button>
                <div>
                  <strong>{selected.name}</strong>
                  <span>{selected.title}</span>
                </div>
              </nav>
              <div className="rh-surface" ref={surface} onDoubleClick={togglePauseWithFeedback}>
                {player.ambientGlow && player.ambientColors && player.status === "playing" && (
                  <AmbientGlow
                    colors={player.ambientColors}
                    intensity={glowSettings.intensity}
                    falloff={glowSettings.falloff}
                    frame={player.videoFrame}
                    {...surfaceSize}
                  />
                )}
                {playbackFeedback && (
                  <div className="rh-playback-feedback rh-native-overlay" aria-live="polite">
                    <PlaybackIcon kind={playbackFeedback} />
                  </div>
                )}
                {!["playing"].includes(player.status) && (
                  <div className="rh-player-message">
                    <h2>
                      {player.status === "loading"
                        ? "Connecting to the stream…"
                        : player.status === "reconnecting"
                          ? "Reconnecting to the stream…"
                          : player.status === "offline"
                            ? "This channel is offline"
                            : player.status === "ended"
                              ? "Playback was interrupted"
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
                onPointerDownCapture={() => {
                  setBottomPressed(true);
                  setBottomFocus(false);
                }}
                onFocusCapture={(event) => setBottomFocus(event.target.matches(":focus-visible"))}
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setBottomFocus(false);
                }}
              >
                <button
                  className="rh-icon-control"
                  aria-label={player.pause ? "Play" : "Pause"}
                  title={player.pause ? "Play" : "Pause"}
                  disabled={player.status !== "playing"}
                  onClick={() => void control("pause")}
                >
                  <PlaybackIcon kind={player.pause ? "play" : "pause"} />
                </button>
                <button
                  className="rh-icon-control"
                  aria-label={player.mute ? "Unmute" : "Mute"}
                  title={player.mute ? "Unmute" : "Mute"}
                  onClick={() => void control("mute")}
                >
                  <PlaybackIcon kind={player.mute || player.volume === 0 ? "muted" : "volume"} />
                </button>
                <Slider
                  className="rh-volume"
                  thumbLabel="Volume"
                  title={`Volume: ${Math.round(player.volume ?? 80)}%`}
                  min={0}
                  max={100}
                  step={1}
                  value={[player.volume ?? 80]}
                  onValueChange={([volume]) => void control("volume", volume)}
                />
                {player.startedAt && (
                  <time className="rh-runtime" dateTime={player.startedAt} title="Stream runtime">
                    {formatRuntime(player.startedAt, clock)}
                  </time>
                )}
                {(player.pause || (player.cacheAhead || 0) > (player.lowLatency ? 3 : 10)) && (
                  <button className="rh-live-control" onClick={() => void control("live")}>
                    <PlaybackIcon kind="live" />
                    Live
                  </button>
                )}
                <span
                  className="rh-player-status"
                  title={
                    player.fallback
                      ? "The low latency connection failed repeatedly. Standard HLS is keeping the stream playing. Retry stream or return to Live to try low latency again."
                      : undefined
                  }
                >
                  {player["paused-for-cache"]
                    ? "Buffering"
                    : player.status === "playing"
                      ? player.fallback
                        ? "HLS fallback"
                        : "MPV"
                      : player.status}
                </span>
                <div
                  className="rh-low-latency"
                  title="Play closer to live with less buffering. Changing this reloads the video; turn off if playback stutters."
                >
                  <label htmlFor="rh-low-latency">Low latency</label>
                  <Switch
                    id="rh-low-latency"
                    aria-label="Low latency"
                    checked={!!player.lowLatency}
                    disabled={["loading", "reconnecting"].includes(player.status)}
                    onCheckedChange={(checked) => void control("lowLatency", checked)}
                  />
                </div>
                <DropdownMenu open={qualityOpen} onOpenChange={setQualityOpen} modal={false}>
                  <DropdownMenuTrigger asChild>
                    <button className="rh-quality" aria-label="Video quality" title="Video quality">
                      {player.qualities.find((q) => q.id === player.quality)?.label || "Auto quality"}
                      <img src={CaretDown} width={14} height={14} alt="" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    className="rh-quality-menu rh-native-overlay"
                    side="top"
                    align="end"
                    aria-label="Video quality"
                    collisionPadding={8}
                  >
                    <DropdownMenuRadioGroup
                      value={player.quality}
                      onValueChange={(quality) => void control("quality", quality)}
                    >
                      <DropdownMenuRadioItem className="dropdownMenuItem" value="auto">
                        Auto quality
                      </DropdownMenuRadioItem>
                      {player.qualities.map((q) => (
                        <DropdownMenuRadioItem className="dropdownMenuItem" key={q.id} value={q.id}>
                          {q.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
                <RoundhouseSettings {...glowSettings} onOpenChange={setAppSettingsOpen} />
                <button
                  className="rh-icon-control"
                  aria-label={fullscreen && cinema ? "Exit cinema" : "Cinema"}
                  aria-pressed={fullscreen && cinema}
                  title={fullscreen && cinema ? "Exit cinema" : "Cinema — fullscreen with chat"}
                  onClick={() => changeView(fullscreen && cinema ? "windowed" : "cinema")}
                >
                  <PlaybackIcon kind="cinema" />
                </button>
                <button
                  className="rh-icon-control"
                  aria-label={videoFullscreen ? "Exit fullscreen" : "Fullscreen"}
                  title={videoFullscreen ? "Exit fullscreen" : "Fullscreen"}
                  onClick={() => changeView(videoFullscreen ? "windowed" : "video")}
                >
                  <PlaybackIcon kind={videoFullscreen ? "collapse" : "expand"} />
                </button>
              </div>
            </section>
            {!videoFullscreen && (
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
                    <button className={`rh-chat-tab ${!mentions ? "active" : ""}`} onClick={() => setMentions(false)}>
                      Stream chat
                    </button>
                    <button className={`rh-chat-tab ${mentions ? "active" : ""}`} onClick={() => setMentions(true)}>
                      Mentions
                    </button>
                    <div className="rh-chat-actions">
                      <div className="rh-chat-tools" ref={setChatTools} />
                      <button
                        className="rh-chat-settings"
                        title="Chat settings"
                        aria-label="Chat settings"
                        onClick={() => window.app.settingsDialog.open({ userData: account })}
                      >
                        <img src={Gear} alt="" width={16} height={16} />
                      </button>
                    </div>
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
                <img className="rh-disclosure" src={CaretRight} alt="" />
                Offline <span>{offline.length}</span>
              </summary>
              <div className="rh-grid">
                {offline.map((channel) => (
                  <ChannelCard key={channel.slug} channel={channel} onOpen={open} />
                ))}
              </div>
            </details>
          )}
          {selected && minimized && (
            <section className="rh-mini-player" aria-label={`${selected.name} mini player`}>
              <div className="rh-mini-surface rh-surface" ref={surface}>
                <div className="rh-mini-heading rh-native-overlay">
                  <div>
                    <strong>{selected.name}</strong>
                    <span>{selected.title}</span>
                  </div>
                  <button aria-label="Close mini player" title="Close mini player" onClick={() => void stopPlayback()}>
                    <PlaybackIcon kind="close" />
                  </button>
                </div>
                {!["playing", "loading", "reconnecting"].includes(player.status) && (
                  <div className="rh-mini-state">{player.status === "offline" ? "Offline" : "Playback interrupted"}</div>
                )}
              </div>
              <button className="rh-mini-return" onClick={() => void open(selected)}>
                Return to {selected.name}
              </button>
            </section>
          )}
        </main>
      )}
    </div>
  );
}
