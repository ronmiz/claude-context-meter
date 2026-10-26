# Changelog

## 1.0.1 — 2026-10-26

- The reading added to each prompt no longer tells Claude to keep quiet about it. If you ask about the status line, Claude now says it comes from this plugin and can be turned off with `replyStatusLine`.
- The plugin description now states that, by default, a short context-usage reading is added to each prompt.

## 1.0.0 — 2026-10-23

First public release.

- Band above the prompt and a Context pane (breakdown, usage limits, session cost) where the host draws mod UI: the terminal and the desktop app's Code tab.
- Status line at the end of each reply, for surfaces that draw no mod UI such as a Cowork chat, with the change since the previous turn.
- `ctx` / `ctx full` message for a plain-text card of the live reading, and a `context_usage` tool for questions in your own words.
- Alerts when the fill crosses 75% and 90%, re-armed after a compaction.
- Settings: language (`en`/`he`), thresholds, and switching the reply status line off.
