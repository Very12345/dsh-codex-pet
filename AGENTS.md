# DSH floating pet fork

- This is an independent fork of MichengAI/dsh-codex-pet, based on upstream 0.1.12, commit d1a44741a939b8126d1f0acff7700712acb5df54. Preserve Apache-2.0 and the separate third-party artwork NOTICE.
- Official DSH owns sessions, tools, permissions and approval. Desktop controls must pass the original session/request identity to the existing API; never auto-approve or modify host policy.
- Windows native windows run in the plugin-owned transparent Electron helper; use the configured executable or the shared ~/.dsh/electron runtime. Keep console windows hidden, do not activate windows except after an explicit user action, and stop helpers on stream disconnect, host exit or plugin disposal.
- Do not patch the installed DSH application or depend on another desktop fork. Linux/macOS keep page display until a separately tested native backend exists.
- Build and commit lib/ so Git URL installation requires no package lifecycle build script. Keep development data, credentials, private screenshots and node_modules out of Git.
- Run npm run verify, npm run smoke, npm run smoke:desktop and node scripts/smoke-desktop-client.mjs before shipping relevant changes. Native tests use owned fixtures only, never users' actual sessions or approvals.
- Pushes are used for distribution. Do not create GitHub Releases or enable Actions in this fork unless explicitly requested.
- Local calls must not silently use cloud recognition, request API keys, or change host permissions. Capture starts only from an explicit call action. Hangup stops audio and releases the observation lease without cancelling work. Tests use simulated microphones and silent WAV synthesis; do not record real microphones or play speakers automatically.
- The spoken conversation layer is tool-less and uses the native selected model with an isolated cursor. Delegate only original user utterances and bounded clarification context through native Session admission. Preserve result uncertainty and cancellation; never treat stopped work as success. Keep speech concise, clear ephemeral history on hangup, and disclose ordinary text-model usage.
