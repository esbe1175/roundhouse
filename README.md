# Roundhouse

A personal Windows stream viewer built from KickTalk: your followed channels, an embedded MPV player, and KickTalk chat in one resizable window.

## Run

The built app is `dist/win-unpacked/Roundhouse.exe`. The installer is `dist/Roundhouse-0.1.0-setup.exe`.

Choose **Sign in to Kick** on the welcome screen and complete login in the Kick window. Roundhouse keeps one local website session for follows, chat, and stream resolution. KickTalk does not require another login. Kick can still require reauthentication when its session expires.

The overview shows live follows first, with offline channels below. Search only covers follows. Select a channel to watch; drag the divider or focus it and use Left/Right to resize chat. Home resets chat to 360 pixels. Back stops playback and disconnects chat. Space pauses, M mutes, F opens fullscreen, and Escape restores the split view when focus is outside the chat editor.

## Development (PowerShell)

Requires Windows x64, Node 24, Python 3, and Visual Studio C++ build tools with a Windows SDK. Use the pinned npm lockfile.

```powershell
npm ci
node node_modules/electron/install.js
npm run setup:mpv
npm run build:native
npm run dev
```

The explicit Electron install command supports Electron releases that use an opt-in binary installer. MPV is downloaded from the exact release in `resources/mpv-manifest.json`; setup verifies its SHA-256 before extracting it. Binaries and native output are ignored by Git. MPV is never registered as a system file handler.

```powershell
npm run lint
npm test
npm run build
npm run test:desktop
npm run test:native
npm run build:win
```

`build:win` creates both the unpacked application and an NSIS installer. `build:unpack` produces only the unpacked application. Publishing and KickTalk's upstream updater are disabled.

## Architecture and account data

- Electron main process: one persistent `roundhouse-kick` browser session, authenticated Kick requests, paginated follows, stream resolution, and MPV lifecycle.
- Sandboxed preload: named and validated IPC operations, no token/cookie accessors. Remote login pages have no application preload.
- Renderer: KickTalk's React, Zustand, SCSS themes, emotes, messages, replies, mentions, settings, and available moderation tools.
- Native host: a small C++ Node-API module owns a Windows child HWND. MPV embeds into that HWND; a per-process named pipe carries player commands and events.
- Playback: the account session resolves the channel's HTTPS HLS URL. Account cookies are not sent to media hosts. Quality options come from the HLS master playlist.

The existing `.env` names are preserved: `roundhouse_client_id`, `roundhouse_client_secret`, and `roundhouse_redirect_url`. These developer OAuth credentials are reserved for future integration; the shared website-session flow does not use them or run a callback listener. Never commit `.env`. Runtime cookies remain in Electron's persistent profile; Roundhouse does not copy them into JSON or `.env` files.

Kick's followed-channel and playback website endpoints are undocumented. Unexpected responses produce an error instead of an empty successful result; failed overview refreshes retain the last successful list. HTTP 401, browser challenges, rate limits, and network failures receive separate handling. The implementation currently uses `/api/v2/channels/followed` and `/api/v2/channels/{slug}`; these need verification against the user's real signed-in account.

## Verification and remaining live checks

Automated checks cover pagination, normalization, invalid IPC inputs, HLS quality parsing, fragmented/out-of-order MPV replies, and disconnected commands. Desktop integration tests use a separate temporary profile, fixture Kick responses, and actual MPV playing generated video. They cover opening the login dialog after delayed page hydration, cancellation/retry, validated session handoff, follows/search, stale results, pause, quality selection, rapid open/stop, cleanup, offline chat, resizing, fullscreen, and the absence of application privileges in a remote page. Native tests exercise video output, controls, visibility, and resizing at 100% and 150% scaling.

Fixture tests do **not** prove Kick's current live login/API behavior. User-assisted acceptance still needs a real login, actual followed-channel comparison, restart/session reuse, a live stream with chat, and deliberate chat actions. Tests never send a message, vote, or moderate a real channel.

## Git and upstream

This repository preserves KickTalk history through `a3570be165618f70449257bbb70df7cd16b66efe`. `main` contains Roundhouse changes; `upstream` points to KickTalk. No personal remote or published release is configured. Review upstream changes and merge deliberately; do not replace Roundhouse files with a newer release archive.

Original KickTalk design and development: Dark and ftk789. See `LICENSE` and `THIRD_PARTY.md` for attribution and MPV provenance.
