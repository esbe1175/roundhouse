# Roundhouse

A personal Windows stream viewer built from KickTalk: your followed channels, an embedded MPV player, and KickTalk chat in one resizable window.

## Fresh clone: one setup command

**Supported target: Windows 10/11 x64.** Install the prerequisites below once, then run these commands in PowerShell. Replace the quoted repository placeholder with your Roundhouse remote URL or a local repository path; cloning KickTalk itself will not include Roundhouse's changes.

```powershell
git clone "YOUR_ROUNDHOUSE_REPOSITORY_URL" Roundhouse
Set-Location Roundhouse
npm run setup -- --run
```

No separate `npm install`, MPV download, `.env`, Kick developer application, or API credentials are needed. Sign in to Kick inside the built app.

`setup` works before `node_modules` exists. It checks prerequisites, runs `npm ci` using the committed lockfile, installs the pinned Electron binary, downloads and verifies the pinned MPV archive, compiles the Windows native host for Electron, generates dependency notices, builds the production app, and verifies the resulting package. `--run` launches the app when finished. Omit it to build only. Allow several minutes and several GB of free space for dependencies, compiler output, and binary caches; initial setup needs internet access.

To produce an installer in the same operation:

```powershell
npm run setup -- --installer
```

The unpacked app is `dist/win-unpacked/Roundhouse.exe`; the optional installer is `dist/Roundhouse-0.1.0-setup.exe`. To copy an unpacked build, copy the **whole `win-unpacked` directory**, including `resources`, DLLs, and license files. Close Roundhouse before rebuilding that output directory.

### Prerequisites

1. [Git for Windows](https://git-scm.com/download/win).
2. [Node.js 24 LTS, x64](https://nodejs.org/en/download), including npm. `.nvmrc` records the supported major version; Node 24.14.1 is tested.
3. [Python 3](https://www.python.org/downloads/windows/), version 3.10 or newer; 3.13 is tested. Install its launcher or add Python to `PATH`.
4. [Visual Studio 2022 Build Tools](https://visualstudio.microsoft.com/downloads/#build-tools-for-visual-studio-2022), or Visual Studio 2022 Community, with **Desktop development with C++**, the **MSVC v143 x64/x86 tools**, and a **Windows 10 or 11 SDK**. The native MPV surface requires this compiler. The .NET workload alone is insufficient.

Install these system tools once and reopen PowerShell so `PATH` changes take effect. Setup reports missing prerequisites rather than installing system-wide tools or requesting administrator access. You do not need a separate MPV, FFmpeg, CMake, or 7-Zip installation. The pinned `7zip-bin` npm dependency supplies the extractor. See [node-gyp's Windows setup](https://github.com/nodejs/node-gyp#on-windows) for compiler/Python detection details.

## Run

The built app is `dist/win-unpacked/Roundhouse.exe`. The installer is `dist/Roundhouse-0.1.0-setup.exe`.

Choose **Sign in to Kick** on the welcome screen and complete login in the Kick window. Roundhouse keeps one local website session for follows, chat, and stream resolution. KickTalk does not require another login. Kick can still require reauthentication when its session expires.

The overview shows live follows first, with offline channels below. Search only covers follows. Select a channel to watch; drag the divider or focus it and use Left/Right to resize chat. Home resets chat to 360 pixels. Back stops playback and disconnects chat. Space pauses, M mutes, F opens fullscreen, and Escape restores the split view when focus is outside the chat editor.

Hover near the video's top edge to reveal the title and Back button, or its bottom edge for playback controls. Keyboard focus also reveals these controls. They overlay the full-height video without resizing it. The chat composer includes Kick and 7TV emote pickers, plus a quick row of available Kick emotes; selecting an emote inserts it into your draft.

The window title shows the current channel and stream title. Chat tools sit beside the chat tabs. The video/chat boundary has an invisible seven-pixel drag target that turns green on hover, drag, or keyboard focus. In chat, Enter sends the message and Shift+Enter inserts a new line.

**Cinema**, beside the fullscreen icon, fills the screen while keeping chat and its resizable divider visible. Fullscreen shows video alone. Switch directly between the two modes, click the active mode again to return to a window, or press Escape. Back also restores the window.

Open the gear beside the chat tabs for **Chat settings**, then choose **Chat → Filters** for hidden usernames, per-user repeat limits, selected/all-emote filtering, and ordered text rules with Block or Replace actions. Text rules include a live preview and capture groups. Filters start paused; enable them when ready. Changes save automatically across channels. Choose Hide or a muted red highlight for filtered messages. Pins and system notices remain visible, and replacement rules only change displayed text, preserving the original for replies and moderation.

Pins sit directly below the chat tabs. Hover previews stay inside the chat pane, clear of the native video surface. User profiles open within the display's usable area, with an explicit close button and Escape support. Missing or failed avatars use local initials, and failed profile requests offer Retry.

Chat keeps the latest visible message at the bottom as history rolls over, filters hide rows, emotes load, or the pane resizes. Scrolling up with the wheel, keyboard, touch, or scrollbar pauses following so you can read. **Scroll To Bottom**, End, or scrolling back to the bottom resumes following.

### Low latency playback

Hover the bottom of the video and toggle **Low latency**. Green means enabled. The preference is saved across streams and app restarts; changing it reloads video while preserving quality, volume, mute and pause, without reconnecting chat. It starts disabled. Turn it off if your connection struggles to keep up, and use **Live** to return to the live edge after pausing.

Kick's IVS playlists advertise unfinished segments using `EXT-X-PREFETCH`. Regular FFmpeg HLS playback ignores these, even with small buffers. When available, Roundhouse streams those segment bytes immediately through a private, single-client loopback connection to MPV, using [MPV's low-latency profile](https://mpv.io/manual/master/#low-latency-playback). The control named pipe remains separate. Resuming from pause in this mode returns to live. Auto quality uses the highest advertised variant; choose a lower quality if the connection struggles. Turning the toggle off restores ordinary HLS playback.

The transport falls back to ordinary HLS if the playlist does not support this prefetch format. The fallback starts at the newest completed segment. No account cookies are passed to the media CDN or local transport. Kick's [public API](https://docs.kick.com/apis/livestreams) does not provide a separate low-latency viewer URL; the account-resolved playback URL remains the source. Streamlink's [Kick integration](https://github.com/streamlink/streamlink/blob/master/src/streamlink/plugins/kick.py) was a useful protocol reference.

A live comparison on September 18, 2026 measured the prefetch route approximately **2.47 seconds ahead** of the previous MPV route on the same Odablock rendition. This is an improvement over our old playback path, not a measurement against Kick's web player or a promise of a specific end-to-end delay. Kick's encoding, CDN and the network still matter.

### Ambient glow and Roundhouse settings

The **Roundhouse settings** gear in the video controls (or overview title bar) is separate from Chat settings. Ambient glow starts enabled and fills the video's black bars with soft stream colors. **Intensity** adjusts brightness; **Distance falloff** fades the glow away from the actual video edges. Higher values keep it closer to the picture; zero is **Unfaded**. Changes save automatically. **Reset to defaults** restores all three glow settings in one click without changing chat or playback preferences.

Current defaults are enabled, 15% intensity and 50% falloff. First-run settings and reset both read [utils/glow-settings.mjs](utils/glow-settings.mjs), so release defaults can be tuned in one place. Existing saved preferences are retained.

MPV samples a 6×4 color palette every three seconds; only 24 RGB colors cross IPC. Chromium morphs between two tiny blurred color fields over 2.6 seconds, keeping the previous field visible throughout so there is no dip to black. A soft Gaussian falloff extends from the picture edges and rounds around corners, scaled to the video's dimensions for the same appearance at 1080p and 4K with matching aspect ratios. No second video decoder, image files, JavaScript animation loop or full-resolution image transfer is used. Sampling stops while paused, minimized, hidden, disabled, at zero intensity, or when there are no black bars. The native video rectangle retains its dimensions; its black bars are clipped to reveal the glow. Player menus cut out only their own rectangles, preserving the video alongside them.

The glow also uses a fixed 128×128 monochrome dither tile to soften dark gradient bands. It adds/subtracts at most one 8-bit brightness level after intensity and falloff, using an SVG arithmetic filter. The tile is generated once and displayed at physical-pixel scale, including after moving between display scales. This adds a filter/compositing pass during color morphs, but no per-frame JavaScript, animated noise generation, extra stream samples or video decoder. Dithering stops with the glow and is bypassed at zero intensity.

## Development (PowerShell)

After the initial setup:

```powershell
npm run dev
```

For a clean reinstall after pulling dependency changes, rerun `npm run setup`. This recreates `node_modules` from the lockfile and rebuilds generated output; it does not clear your Roundhouse login/profile. Use `npm ci` rather than maintaining a second lockfile.

| Task                           | Purpose                                                    |
| ------------------------------ | ---------------------------------------------------------- |
| `npm run setup`                | Fresh-clone install and unpacked production build          |
| `npm run setup -- --run`       | Setup, then launch the packaged app                        |
| `npm run setup -- --installer` | Setup plus Windows installer                               |
| `npm run dev`                  | Electron/React development with hot reload                 |
| `npm run build`                | Compile JS/CSS only; requires installed dependencies       |
| `npm run build:unpack`         | Refresh MPV, native host, notices and unpacked app         |
| `npm run build:win`            | The same plus the NSIS installer                           |
| `npm run setup:mpv`            | Download/check/extract the pinned MPV archive              |
| `npm run build:native`         | Recompile the Windows host for the locked Electron version |
| `npm run notices`              | Regenerate npm dependency notices                          |
| `npm run verify:package`       | Check packaged resources, notices, and secret exclusion    |

### MPV version and download verification

[resources/mpv-manifest.json](resources/mpv-manifest.json) is the source of truth. It pins shinchiro's **20260903** standard x86_64 build, its exact release URL, SHA-256, player source revision and build provenance. Setup downloads into `.cache`, hashes the archive **before extraction**, and fails on mismatch. Incomplete downloads use a temporary file and are not reused. Valid archives are reused on subsequent builds. The executable and support files go in ignored `resources/mpv/`, then outside the application archive under the packaged `resources/mpv/` directory.

Roundhouse does not fetch a moving “latest” release, register MPV as a file handler, or run the distributor's updater/registration scripts. To update the player deliberately, change the release URL and verified SHA-256 together, update the source/license provenance, rebuild, and rerun native and desktop tests. The build compiles Roundhouse's host module; it **downloads a prebuilt MPV**, rather than compiling MPV and FFmpeg from source.

### Checks

```powershell
npm run lint
npm test
npm run build
npm run test:desktop
npm run test:player
npm run test:native
npm run build:win
npm run verify:package
```

Desktop/native tests open temporary windows and use isolated fixture profiles. They never send messages to a real channel. To test the packaged app specifically:

```powershell
$env:ROUNDHOUSE_TEST_EXE = (Resolve-Path 'dist/win-unpacked/Roundhouse.exe').Path
npm run test:desktop
Remove-Item Env:ROUNDHOUSE_TEST_EXE
```

Publishing and KickTalk's upstream updater are disabled. `.github/workflows/build.yml` runs the fresh-clone setup, lint, unit tests and package verification on Windows when hosted on GitHub; it does not publish a release. Interactive desktop/native tests are run locally.

### Troubleshooting

- **`npm.ps1` execution-policy error:** use `npm.cmd run setup` (and `npm.cmd` for other tasks). There is no need to weaken the system execution policy.
- **Compiler/SDK missing:** modify your Visual Studio installation to include the C++ workload and Windows SDK, reopen PowerShell, and rerun setup.
- **Python not found or wrong version:** run `py --list-paths`, then set `$env:npm_config_python = 'C:\path\to\python.exe'` before setup.
- **Download/network failure:** setup needs npm, GitHub release downloads, Electron downloads, and Electron headers. Check your proxy/firewall and rerun; it does not bypass TLS verification.
- **MPV checksum mismatch:** delete only the named `.cache/mpv-<release>.7z` archive and rerun `npm run setup:mpv`. Do not replace the expected hash merely to accept an unexpected file.
- **Build cannot overwrite a file:** close Roundhouse and any development/test MPV process, then retry. Keep the project in a normal writable local directory.
- **Native module/Electron version mismatch:** run `npm run setup` after a lockfile change. The host must be rebuilt for Electron, not for the system Node ABI.
- **Kick sign-in/challenge/API failure:** build success does not bypass Kick's website checks. Return to the welcome sign-in flow if the saved session expires.

## Architecture and account data

- Electron main process: one persistent `roundhouse-kick` browser session, authenticated Kick requests, paginated follows, stream resolution, and MPV lifecycle.
- Sandboxed preload: named and validated IPC operations, no token/cookie accessors. Remote login pages have no application preload.
- Renderer: KickTalk's React, Zustand, SCSS themes, emotes, messages, replies, mentions, settings, and available moderation tools.
- Native host: a small C++ Node-API module owns a Windows child HWND. MPV embeds into that HWND; a per-process named pipe carries player commands and events.
- Playback: the account session resolves the channel's HTTPS HLS URL. Account cookies are not sent to media hosts. Quality options come from the HLS master playlist.

The existing `.env` names are preserved: `roundhouse_client_id`, `roundhouse_client_secret`, and `roundhouse_redirect_url`. These developer OAuth credentials are reserved for future integration; the shared website-session flow does not use them or run a callback listener. Never commit `.env`. Runtime cookies remain in Electron's persistent profile; Roundhouse does not copy them into JSON or `.env` files.

Kick's followed-channel and playback website endpoints are undocumented. Unexpected responses produce an error instead of an empty successful result; failed overview refreshes retain the last successful list. HTTP 401, browser challenges, rate limits, and network failures receive separate handling. The overview uses `/api/v2/channels/followed-page` with `channel_slug`, `is_live`, and optional `nextCursor` pagination, verified against Kick's signed-in Following page. Live titles and current CDN thumbnails come from `/api/v2/channels/{slug}/info`; the older channel endpoint may return inaccessible thumbnail URLs. Unexpected rows fail explicitly instead of being silently discarded.

## Verification and remaining live checks

Automated checks cover pagination, normalization, invalid IPC inputs, HLS quality parsing, fragmented/out-of-order MPV replies, and disconnected commands. Desktop integration tests use a separate temporary profile, fixture Kick responses, and actual MPV playing generated video. They cover opening the login dialog after delayed page hydration, cancellation/retry, validated session handoff, follows/search, stale results, pause, quality selection, rapid open/stop, cleanup, offline chat, resizing, fullscreen, and the absence of application privileges in a remote page. Native tests exercise video output, controls, visibility, and resizing at 100% and 150% scaling.

Fixture tests do **not** prove Kick's current live login/API behavior. User-assisted acceptance still needs a real login, actual followed-channel comparison, restart/session reuse, a live stream with chat, and deliberate chat actions. Tests never send a message, vote, or moderate a real channel.

## Git and upstream

This repository preserves KickTalk history through `a3570be165618f70449257bbb70df7cd16b66efe`. `main` contains Roundhouse changes; `upstream` points to KickTalk. No personal remote or published release is configured. Review upstream changes and merge deliberately; do not replace Roundhouse files with a newer release archive.

`.gitignore` excludes `.env` and private keys, downloaded binaries, dependencies, native/generated builds, temporary profiles, logs, crash dumps and test output. Only placeholder credentials belong in `.env.example`. Commit source, the npm lockfile, the MPV manifest and license documents. `private: true` in `package.json` prevents accidental npm publication; it does not prevent using a public Git repository. Add your own `origin` when you choose a hosting destination; no hosted repository is created by setup.

## License and acknowledgements

Roundhouse is distributed under the **GNU General Public License, version 3**, inherited from KickTalk. [LICENSE](LICENSE) preserves the upstream license text unchanged. Third-party components retain their own licenses; [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) records attribution, versions, source links and license locations.

Thank you to:

- **Dark, ftk789 and the KickTalk contributors** for the application, design language and full chat experience.
- **The mpv/MPlayer/mplayer2 contributors and shinchiro** for the player and Windows distribution, and **FFmpeg/libplacebo contributors** for media and rendering work.
- **Streamlink contributors** for documenting Kick/IVS prefetch behavior in their open-source player integration.
- **Electron, Chromium, React, Lexical, Radix/WorkOS**, and the maintainers of our other npm dependencies for the application platform and controls.
- **The Inter Project Authors and Phosphor Icons** for typography and icons inherited through KickTalk.
- **Kick and 7TV** for the platform, community emotes and cosmetics. Roundhouse is an independent project and is not endorsed by these services.

Builds include readable notices under `resources/licenses/`, plus Electron's `LICENSE.electron.txt` and `LICENSES.chromium.html` beside the executable. The MPV notices describe the scope of the supplied upstream license texts and the additional corresponding-source/notices work needed when distributing third-party binary releases.
