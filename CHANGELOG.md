# Changelog

## [0.2.8] - 2026-10-03

- Accept prepared speech recognizers in standby or waking, matching DSH's official voice input instead of treating them as uninstalled. The host retains wake-up, queuing and cancellation ownership.
- Distinguish missing providers, resource checks, downloads, loads and preparation errors in feedback; verify standby/waking transcription without re-preparation.
- Clear previous voice feedback after a successful retry rather than leaving the old preparation error visible.
- Restart animation when caret gaze ends and extend gaze to wrapped follow-up input. Preserve the original three-cycle bursts and reduced-motion frames.
- Remove the added desktop double-click jump and page idle random gestures; close stale or folded request panels without answering them. Verify the native task/hover/drag/input/request state matrix.

## [0.2.7] - 2026-10-02

- Use the locally identified `square-and-pencil-light-20` drawing for the floating new-conversation button, matching its rounded pen and frame instead of the previous angular outline.

## [0.2.6] - 2026-10-02

- Constrain the mascot itself, allowing the transparent canvas to cross display edges; independently inset readable panels. Match the reference's vertical area and 40px bottom reserve instead of constraining a 360px window with 96px reserved.
- Match measured compact controls (17×6px, 300ms dismissal, 40/56px proximity) and reply icon size, elbow shape, neutral/hover colors and follow-up input styling.
- Keep drag acknowledgements scoped to their gesture identity; verify actual left/right/top placement, inward card offsets, computed styles and existing drag/session interactions.

## [0.2.5] - 2026-10-02

- End native dragging on capture loss, pointer cancellation, mouse release, Escape, blur or hide. Clear the drag before releasing DOM capture and ignore late start requests after button release.
- Add Electron mouse and Windows window-message release checks, plus a bounded drag duration, so missing a renderer pointer-up cannot leave the companion attached to the cursor.
- Exercise five cancellation paths in the actual isolated Electron helper and verify both processes stop dragging and window bounds remain stable.

## [0.2.4] - 2026-10-02

- Collapse controls until hover; idle pets have two actions and tasks add the third. Flip notification placement above/below by mascot position while preserving its screen anchor.
- Display visible assistant previews, tool-name fallbacks and completion marks with hover actions; add inline follow-up replies to the original session and round through native queue mode.
- Verify retained reply previews, original-session routing and host denials; add native placement/hover/editor checks and real browser/host/helper follow-up integration.

## [0.2.3] - 2026-10-02

- Correct directional animation targets: ordinary mouse movement no longer replaces idle/status animation; only the active floating editor caret supplies a gaze target.
- Dismiss quick chat on outside click or native window blur, retaining unsent text and attachments when reopened. Keep it open during the attachment picker.
- Add native regression checks for outside click, actual focus loss and retained drafts.

## [0.2.2] - 2026-10-02

- Replace the WinForms companion with an independently implemented transparent Electron window using the existing shared runtime; compact single-line chat, pixelated sprites, rounded notifications and SVG actions.
- Align animation timing and gaze with locally inspected Codex parameters: slower idle, three action cycles, directional gaze and hover/drag behavior. All nine existing sprite sheets already match the reference files.
- Authenticate the local helper transport, preserve original request identities and page fallback, and verify native window plus browser/host/helper integration.
- Document reference measurements and the distinction between DSH voice dictation and Codex real-time voice.

## [0.2.1] - 2026-10-02

- Center pet, toolbar and rounded transparent-shadow notifications vertically.
- Floating new-chat draft, host-configured voice dictation and conversation collapse with a counted bell.
- Create sessions only on explicit send; transcripts fill the draft. Bounded PCM capture, recognizer readiness and microphone cleanup on finish/disconnect, verified with simulated audio.

## [0.2.0] - 2026-10-02 (independent fork)

- Native transparent Windows companion outside DSH, with topmost/non-activating display, drag, DPI, monitor placement and context menu.
- SSE transports existing notifications and original approval/question/plan identities. Claim display after painting; restore page display on failure.
- Desktop setting, disconnect/parent exit cleanup and release of idle session observation references.
- Commit prepared lib for GitHub installation without prepack. No fork Actions, npm publishing or Releases; settings link to this fork.
- Automated, browser, native and browser/host/native integration validation.

## [0.1.12] - 2026-09-30

- Add compatibility with DSH `0.2.0-rc.2` without dropping the existing supported hosts. Pin development types and the default end-to-end host to this release. Cordis stays `4.0.4`.
- The services and slots this plugin uses keep their contracts. No host-version branch was added.

## [0.1.11] - 2026-09-28

- Add compatibility with DSH `0.2.0-rc.1` without dropping the existing supported hosts. Pin development types and the default end-to-end host to this release. Cordis stays `4.0.4`.
- The services and slots this plugin uses keep their contracts. No host-version branch was added.

## [0.1.10] - 2026-09-25

- Add compatibility with DSH `0.1.7-rc.2` without dropping the existing supported hosts. Pin development types and the default end-to-end host to this release.
- This release is additive for the plugin: the services it uses keep their contracts, and the two slots it registers are new keys, so no host-version branch or legacy path was needed.
- The isolated end-to-end host now checks the external Cordis HMR package only when the target version's dependency graph still declares it, and locates it through the lock file. DSH `0.1.7` and later ship HMR with the host, so the old assertion failed the isolated installation outright.

## [0.1.9] - 2026-09-24

- Pin development dependencies and the default end-to-end host to DSH `0.1.7-rc.1`, and Cordis to `4.0.4`. Drop `0.1.6-alpha.1`, `0.1.6-alpha.2`, and `0.1.7-alpha.1` from the compatibility list; keep the existing RC hosts.
- Isolated end-to-end hosts now resolve dependencies as of that host's publish time, so a later Cordis release cannot remove the HMR service those hosts require. Pinned `@deepseek-ai/dsh*` packages stay exempt, because some of them are published after the meta package.

## [0.1.8] - 2026-09-22

- Add compatibility with DSH `0.1.7-alpha.1` without dropping the existing supported hosts. Pin development types and the default end-to-end host to this release. The model fixture answers the Messages API on this host.

## [0.1.7] - 2026-09-18

- Add compatibility with DSH `0.1.6-alpha.2` without dropping the existing supported hosts. Keep `sessions.open`, `pendingInteractions`, and legacy session snapshots on older hosts; use `uiWorkspace.openSession` and `uiSession.sessionStatus` only when those APIs are gone. Pin development types and the default e2e host to this release.
- Use a bilingual package description matching the GitHub repository.

## [0.1.6] - 2026-09-16

- Add compatibility with DSH `0.1.6-alpha.1` without dropping the existing supported hosts. Pin development types and the default e2e host to this release.

## [0.1.5] - 2026-09-12

- Keep the pet in a global Web overlay across pages while preserving interaction and letting clicks pass through empty areas.
- Showing the pet on Codex UI settings pages requires Codex UI 1.1.3 or later. The pet still works independently without Codex UI.

## [0.1.4] - 2026-09-11

- Restore compatibility with DSH `0.1.0-rc.8`, `0.1.1-rc.2`, `0.1.2-rc.1`, and `0.1.5-rc.1` while retaining `0.1.5-rc.2`. Adapt legacy session requests so pet notifications can answer questions and approvals on older hosts.

## [0.1.3] - 2026-09-11

- Support DSH Web `0.1.5-rc.2` and correct client service injection so the plugin loads with the updated host. Older DSH versions are outside the supported range.
- Known upstream limitation: stopping before the model returns an HTTP response may produce a `turn/end` serialization error and a failure notification; stopping after streaming starts is supported.

## [0.1.2] - 2026-09-09

- License original plugin code under Apache-2.0 and include LICENSE and third-party artwork NOTICE in the npm package.
- Automate npm publishing through GitHub Actions Trusted Publishing with provenance, version checks, tests, browser smoke checks, and package validation.
- Create bilingual normal GitHub Releases after npm publishing, without tarball or checksum attachments; document npm installation and publisher configuration.

## [0.1.1] - 2026-09-09

- Keep pet rendering inside DSH Web and expose a versioned consumer API for state, notifications, commands, and display handoff. Native window adaptation belongs to the consumer; remove native routes, renderer, bridge calls, and sibling-project tests.
- Use only the verified DSH CLI for npm updates, with a ten-minute timeout and an installation lock retained until process completion. Return stable localized error codes.
- Localize pet names, descriptions, settings, notifications, and menus; preserve user content. Add version and project links, shared update dialog, and Windows folder opening.
- Share library polling and publish only changed notification snapshots.
- Run independent Playwright Chromium smoke tests in temporary directories with automatic cleanup. No Electron or sibling checkout is needed.
- Pass type checking, 25 automated tests, build, and browser smoke checks. Real image generation, real-model interaction, and real npm updates still require acceptance testing.

## [0.1.0] - 2026-09-09

- Bundle nine pets, pet settings, and a DSH Skill-based entry for creating custom companions.
- Support in-page Web companions and native windows through a compatible Desktop pet bridge.
- Add multiple-task notifications, task navigation, current-turn cancellation, and approval, question, and plan request handling.
- Exclude subagent sessions to prevent subagent routing errors when opening or stopping tasks.
- Simplify the creation prompt by removing the Codex dependency disclaimer.
- Provide English and Chinese READMEs, a banner, and real plugin screenshots; keep local docs outside version control.
- Pass type checking, 17 automated tests, and the build; complete image generation, real-model interaction, and the normal Desktop installation still need end-to-end acceptance testing.
