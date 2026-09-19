// Small monochrome controls, matching the existing chat icon size and weight.
export default function PlaybackIcon({ kind }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {kind === "play" && <path d="M7 4v16l13-8Z" fill="currentColor" stroke="none" />}
      {kind === "pause" && <path d="M6 4h4v16H6zM14 4h4v16h-4z" fill="currentColor" stroke="none" />}
      {["volume", "muted"].includes(kind) && <path d="M3 9h4l5-4v14l-5-4H3Z" />}
      {kind === "volume" && (
        <>
          <path d="M16 8a6 6 0 0 1 0 8" />
          <path d="M19 5a10 10 0 0 1 0 14" />
        </>
      )}
      {kind === "muted" && <path d="m16 9 6 6m0-6-6 6" />}
      {kind === "expand" && <path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5" />}
      {kind === "collapse" && <path d="M3 8h5V3m8 0v5h5M8 21v-5H3m18 0h-5v5" />}
      {kind === "cinema" && (
        <>
          <rect x="3" y="4" width="18" height="16" rx="1" />
          <path d="M16 4v16" />
        </>
      )}
      {kind === "back" && <path d="m15 18-6-6 6-6M9 12h11" />}
      {kind === "help" && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M9.7 9a2.5 2.5 0 1 1 3.3 2.4c-.7.3-1 .8-1 1.6" />
          <path d="M12 17h.01" />
        </>
      )}
      {kind === "close" && <path d="m6 6 12 12M18 6 6 18" />}
      {kind === "live" && <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />}
    </svg>
  );
}
