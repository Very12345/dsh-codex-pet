# DSH Floating Pet

[简体中文](README.zh-CN.md)

An independent fork of [MichengAI/dsh-codex-pet](https://github.com/MichengAI/dsh-codex-pet), based on upstream 0.1.12. Fork version **0.2.4** adds a native Windows floating companion outside the DSH window.

## Features

- Controls collapse to a small capsule until hovered. Idle pets show new conversation and voice only; tasks add a collapse/expand button and count.
- Notifications appear above a bottom-positioned pet and below a top-positioned pet, preserving the mascot anchor as UI expands. Cards show visible assistant previews or tool names, a completion mark, and hover actions. Reply opens an inline follow-up sent to the original session in queue mode, preserving host permissions and round identity.
- Sending a draft or pressing Ctrl+Enter creates and prompts a native DSH session. Voice uses the host-configured speech recognizer; enable and prepare DSH voice input first. Transcripts require an explicit send.

- Transparent, always-on-top pet, visible while DSH is minimized or another app is active. Startup and state updates do not steal focus.
- Drag to move, double-click to jump, right-click for settings, task notifications, position reset, hiding or returning to page display. Transparent pixels pass mouse input through.
- Nine built-in pets, custom sprites, animations and existing multi-task notifications. Open a task, stop a turn, dismiss a reminder or respond to supported approvals, questions and plans.
- Per-display position persistence, DPI scaling and a primary-display fallback when the saved monitor is missing.
- Display is claimed only after the native frame is painted. A failed helper restores the page companion. Host exit, plugin disposal or a disconnected owner closes the native windows.

## Requirements

Native floating display currently supports **Windows 10/11**, using a transparent Electron window and browser rendering. It does not modify the official DSH installation and reuses a generic Electron runtime at `~/.dsh/electron` (or `DSH_FLOATING_PET_ELECTRON`). Missing runtimes restore page display without automatic downloads.

The development and validation baseline is **DSH 0.2.0-rc.2**. The upstream RC compatibility list remains declared. Linux/macOS keep page display; this fork has no native backend for them. The companion closes when DSH exits.

## Install

This fork is distributed by GitHub pushes, without npm publishing or GitHub Releases. Prepared `lib/` files are committed and the plugin has no install-time build lifecycle script.

```powershell
dsh plugin --profile desktop add 'https://github.com/Very12345/dsh-codex-pet.git' --ignore-scripts
```

Remove `@michengai/dsh-codex-pet` first if installed: both versions use the same asset route and should not run together. Existing data under `.dsh/codex-pet` is retained. Restart DSH after installation. Use the official plugin installer with the GitHub URL if the `dsh` command is unavailable.

Open **Settings → Floating pet → Appearance → Desktop companion**. Native display is enabled by default on Windows. Turn it off to show the companion inside DSH. Use the fork's GitHub URL for updates; upstream npm updates do not contain these changes.

## Operation

The host owns a local native helper. A live page pushes session snapshots and receives actions over SSE, including when hidden. Original session, turn and request identities are preserved. Host validation and permission policy still apply; the companion never approves requests automatically.

One page owns the desktop display at a time. Switching apps or minimizing DSH retains ownership. A closed/disconnected page has a ten-second reconnection grace period; after that the helper exits. Reload the page or toggle desktop display to retry a failed connection.

Images are decoded into memory only, leaving the original sprites unchanged. Observation references are released when tasks become idle and when the plugin unloads.

## Development

```powershell
npm ci --ignore-scripts
npm run verify
npm run smoke
npm run smoke:desktop
node scripts/smoke-desktop-client.mjs
npm pack --dry-run --ignore-scripts
```

Windows browser tests default to Edge (`DSH_PET_BROWSER_CHANNEL` overrides it). Fixtures use temporary data and fake sessions, never real user approvals. Native screenshots capture only the helper's own sprite under ignored `.preview/`.

Validation includes 62 automated tests, page notifications and localization, native transparency/topmost/non-activation, 200% DPI, hidden-page continuity, approval transport, page fallback and process cleanup. Native macOS/Linux and all older desktop host combinations are unverified.

Actions are disabled for this fork. Push after local validation; upstream workflow history is retained without enabling automated publishing.

## Attribution

Upstream commit: `d1a44741a939b8126d1f0acff7700712acb5df54`. Original plugin code and fork additions are Apache-2.0. Bundled OpenAI Codex artwork is excluded from that code license; see [NOTICE](NOTICE). This is a community project, not an official OpenAI or DeepSeek product.
