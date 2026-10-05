# DSH Floating Pet

[简体中文](README.zh-CN.md)

An independent fork of [MichengAI/dsh-codex-pet](https://github.com/MichengAI/dsh-codex-pet), based on upstream 0.1.12. Fork version **0.5.2** adds a native Windows floating companion outside the DSH window.

## Features

- Idle controls collapse to a white capsule until hovered. Visible task, request and call cards keep the toolbar expanded; automatic folding resumes after the cards are explicitly hidden or dismissed. Idle pets show new conversation and voice only; tasks add a collapse/expand button and count.
- Notifications appear above a bottom-positioned pet and below a top-positioned pet, preserving the mascot anchor as UI expands. Cards place live thinking, visible reply text or friendly tool activity below the title. Completed tool calls return to thinking; a subtle progress shimmer respects reduced motion. Completion marks and hover actions remain, with inline follow-ups sent to the original session in queue mode.
- New companion tasks receive separate scratch directories under `.dsh/codex-pet/workspaces/task-*`, with files retained for follow-up. Existing task replies and pinned calls keep their workspace. Clicking a task card navigates through the workspace UI, then brings the owning Windows DSH window forward and restores it when minimized; a refused activation is reported.
- Sending a draft or pressing Ctrl+Enter creates and prompts a native DSH session. The voice button starts a continuous local call with automatic utterance submission and spoken reply summaries; right-click the pet for the original manual dictation flow.
- A separate spoken conversation layer uses the selected DSH text model. Chat, follow-ups and clarifications are answered directly; work requests are delegated to the original task. Results become one to three conversational sentences, with directory listings, files and logs kept in the written task rather than reading a truncated preview. Recognition remains responsive while the model thinks.
- Recognition and synthesis remain local, with no new speech API key. Dialogue adds normal text-model calls under the configured model/account usage terms. The spoken layer has no tools or approval permissions; short conversation history is cleared on hangup.
- Spoken context uses bounded standard conversation messages without repeatedly embedding history or unchanged task output in a new question. Modern task results wait for their terminal event and are summarized once; late completion metadata stays silent while cancellation/failure changes remain visible.
- Prepared local recognizers in standby/waking accept recording, matching DSH voice input; the host wakes the worker during transcription without requiring re-installation.

- Transparent, always-on-top pet, visible while DSH is minimized or another app is active. Startup and state updates do not steal focus.
- Hold the left button to drag; release or Escape ends dragging. Capture loss and focus loss also stop it, with a 30-second upper bound. Hover plays the jumping animation; right-click opens settings or returning to page display. Transparent pixels pass mouse input through.
- Nine built-in pets, custom sprites, animations and existing multi-task notifications. Open a task, stop a turn, dismiss a reminder or respond to supported approvals, questions and plans.
- Per-display position persistence, DPI scaling and a primary-display fallback when the saved monitor is missing.
- The mascot can reach the left/right/top display edges independently of its transparent canvas. Readable panels shift inward; the bottom retains the reference control reserve.
- Display is claimed only after the native frame is painted. A failed helper restores the page companion. Host exit, plugin disposal or a disconnected owner closes the native windows.

## Requirements

Native floating display currently supports **Windows 10/11**, using a transparent Electron window and browser rendering. It does not modify the official DSH installation and reuses a generic Electron runtime at `~/.dsh/electron` (or `DSH_FLOATING_PET_ELECTRON`). Missing runtimes restore page display without automatic downloads.

The development and validation baseline is **DSH 0.2.0-rc.2**. The upstream RC compatibility list remains declared. Linux/macOS keep page display; this fork has no native backend for them. The companion closes when DSH exits.

## Continuous local calls

Enable official DSH voice input and prepare **local SenseVoice**. Replies use installed Windows system voices, without a speech API key or additional speech API fees; the DSH text model keeps its existing configuration and billing. Cloud recognizers are rejected for this call path, including if selection changes while a call is active.

- Select a conversation in DSH, click the pet voice button and grant microphone access. A pause of about one second submits an utterance automatically. Without a selected conversation, the first ordinary utterance creates one.
- Calls stay pinned to the original session. Running work receives native `steer` input, idle work receives `queue`, and existing permissions remain intact. Switching the main view does not retarget the call.
- Speaking interrupts playback while work continues. The microphone button pauses capture; the red phone hangs up. Hangup, owner disconnect and target removal release microphone and session observation without cancelling the background task.
- Local controls include “status”, “stop the task”, “repeat that”, “stop speaking” and “hang up”, plus their documented Chinese equivalents. Approvals still use the native request UI.
- Choose a voice and rate under Floating pet → Local voice call. Audio stays in plugin memory, utterances are capped at 30 seconds, and overlong recordings are discarded rather than submitted as truncated instructions. At most two utterances await recognition.

This is segmented local recognition → DSH text work → system speech, with short spoken summaries. It has different latency and expressiveness from GPT-Live and does not add a separate realtime voice model or autonomous voice agent.

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
node scripts/smoke-host-focus.mjs
node scripts/smoke-desktop-client.mjs
npm pack --dry-run --ignore-scripts
```

Windows browser tests default to Edge (`DSH_PET_BROWSER_CHANNEL` overrides it). Fixtures use temporary data and fake sessions, never real user approvals. Native screenshots capture only the helper's own sprite under ignored `.preview/`.

Validation includes 119 automated tests covering notifications, session interaction, motion, local voice calls and spoken dialogue. Previous isolated page and native checks cover localization, transparency/topmost/non-activation, 200% DPI, hidden-page continuity, approval transport, page fallback and process cleanup. The isolated native state matrix covers reduced motion, task states, hover/drag priority, request dismissal and follow-up gaze. Real microphone, speaker and live-model call experience remain unverified, as do native macOS/Linux and all older desktop host combinations.

Actions are disabled for this fork. Push after local validation; upstream workflow history is retained without enabling automated publishing.

## Attribution

Upstream commit: `d1a44741a939b8126d1f0acff7700712acb5df54`. Original plugin code and fork additions are Apache-2.0. Bundled OpenAI Codex artwork is excluded from that code license; see [NOTICE](NOTICE). This is a community project, not an official OpenAI or DeepSeek product.
