# Third-party notices and acknowledgements

Roundhouse is a modified fork of KickTalk. The application's GPL license does not replace the separate licenses or trademarks of its dependencies, fonts, artwork, or remotely loaded media.

## KickTalk

- Project: [KickTalkOrg/KickTalk](https://github.com/KickTalkOrg/KickTalk).
- Original design and development: **Dark**; development: **ftk789**, with upstream contributors recorded in Git history.
- Fork baseline: [`a3570be165618f70449257bbb70df7cd16b66efe`](https://github.com/KickTalkOrg/KickTalk/tree/a3570be165618f70449257bbb70df7cd16b66efe).
- License: GNU GPL version 3; the original full text is retained, unchanged, in [LICENSE](LICENSE).
- Inherited work includes the Electron/React application, chat integrations, themes, styles, artwork and controls. Roundhouse adds shared-session follows, MPV hosting, player controls and chat refinements. The local filter engine also incorporates the project owner's supplied `kick-chat-filter` implementation.

## MPV and its Windows distribution

Thanks to the **mpv, MPlayer and mplayer2 contributors**, and **shinchiro** for the Windows builds.

- Player source: [mpv-player/mpv at 69e63f425a](https://github.com/mpv-player/mpv/tree/69e63f425a).
- Distributor: [shinchiro/mpv-winbuild-cmake](https://github.com/shinchiro/mpv-winbuild-cmake).
- Pinned release: [20260903](https://github.com/shinchiro/mpv-winbuild-cmake/releases/tag/20260903), standard Windows x86_64 build.
- Archive URL, SHA-256, build-script revision and workflow: [resources/mpv-manifest.json](resources/mpv-manifest.json).
- The observed binary reports `mpv v0.41.0-1023-g69e63f425`, FFmpeg `N-126390-g9fc8c785e`, and libplacebo `v7.371.0 (v7.360.0-120-g86bbd5d-dirty)`. Its enabled features include `gpl`.

MPV's [copyright statement](resources/licenses/mpv-Copyright.txt) describes its default GPL-2.0-or-later licensing, optional LGPL builds, and separately licensed parts. This project downloads the distributor's GPL-enabled executable; it does not build or relicense MPV. Copies of MPV's GPL and LGPL texts and FFmpeg's license statement/GPLv3 text are in [resources/licenses](resources/licenses). FFmpeg and other libraries compiled into the player have their own terms; see the pinned [FFmpeg source](https://github.com/FFmpeg/FFmpeg/tree/9fc8c785e) and [distributor build recipes](https://github.com/shinchiro/mpv-winbuild-cmake/tree/cd1edc11dc6887a50f705717619d879f5a93a488) for dependency sources and configuration.

The downloaded archive includes documentation and support files but no standalone license files. Roundhouse supplies the tracked upstream texts alongside it. These texts are not a complete inventory of every library statically linked by the distributor. When publishing binary releases, provide the applicable corresponding source and dependency notices for those exact binaries; a link to a moving branch is not a substitute for corresponding source.

## Electron, Chromium and npm packages

Thanks to the **Electron and Chromium projects**, **Meta and the React/Lexical contributors**, **WorkOS/Radix**, and the maintainers of the other packages listed in [package.json](package.json) and [package-lock.json](package-lock.json).

The pinned Electron distribution includes its `LICENSE` and `LICENSES.chromium.html` (packaged as `LICENSE.electron.txt` and `LICENSES.chromium.html`); electron-builder retains these beside `Roundhouse.exe`. `npm run notices` collects installed runtime package versions, declared licenses, copyright notices and full license texts into `.cache/notices/NPM_NOTICES.md`. Packaging includes that generated file under `resources/licenses/generated/`, using verified upstream texts for packages that omit a license file from their npm archive. A missing notice fails packaging. Electron's archive extraction helper is installation tooling and is not shipped by electron-builder.

The generated inventory is tied to the lockfile and installed dependency tree. Regenerate it whenever dependencies change. Build tooling such as Vite, Sass, node-gyp, electron-builder and Playwright retains its own package licenses in `node_modules`; it is not part of the app's source license.

## Fonts, icons and services

- **Inter**, by the Inter Project Authors: SIL Open Font License 1.1. See [Inter-OFL-1.1.txt](resources/licenses/Inter-OFL-1.1.txt).
- **Phosphor Icons**, used by the inherited KickTalk controls: MIT. See [Phosphor-MIT.txt](resources/licenses/Phosphor-MIT.txt).
- KickTalk's original logos and artwork remain credited to their upstream creators.
- **Kick** provides the streaming platform, account data and channel content; **7TV** provides community emotes and cosmetics. These services and user-provided content retain their respective rights. Downloading or displaying an emote does not make it Roundhouse-owned artwork.

Source URLs for the tracked license copies are recorded in [resources/licenses/sources.json](resources/licenses/sources.json). Roundhouse is an independent community project, unaffiliated with Kick, KickTalk, MPV or 7TV; acknowledgement is not an endorsement.
