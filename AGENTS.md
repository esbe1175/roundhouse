# Roundhouse development

- Use PowerShell syntax for shell commands. Do not use `&&` or `rg`.
- This is a private Windows desktop fork of KickTalk. Preserve upstream attribution and Git ancestry.
- Keep credentials, cookies, account caches, downloaded MPV binaries, and generated native builds out of Git.
- Authenticated Kick requests belong in Electron's main process, behind named, validated IPC operations.
- Keep the renderer on KickTalk's React/SCSS stack. Preserve its chat functionality.
- Do not publish releases or push to a remote unless the user requests it.
- Run `npm run lint`, `npm test`, and `npm run build` for relevant changes.
- For session/UI changes run `npm run test:desktop` with fixture data in its isolated profile.
- For native/player changes run `npm run build:native` and `npm run test:native`.
- Do not send chat messages, vote, or perform moderation while testing without an explicit user action.
