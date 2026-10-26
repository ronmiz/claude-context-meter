# context-meter

A Claude mod that shows how full the context window is, live, from the engine's own measurement (`$.session.usage()`, the same figures as the Claude Code status line). Nothing is estimated unless it says so.

## What it does

- **Band above the prompt**: fill percentage and tokens used / window size, green below 50%, yellow from 50%, red from 75%. Updates after every turn.
- **Context pane** (the band's "Details" button, or `/ctx`): breakdown by category (a free local estimate by default; "Refresh breakdown" runs an exact count), plus 5-hour / 7-day usage limits and session cost when the host reports them. A missing figure shows as "—", never a guess.
- **Alerts** once each time the fill crosses 75% and 90%; they re-arm when the fill drops back (after a compaction).
- **Status line at the end of each reply** — for surfaces that draw no mod UI, such as a Cowork chat:

  `🟢 ▰▰▰▱▱▱▱▱▱▱ 31% · 308k / 1M · +6.5k`

  The dot turns 🟡 from 50% and 🔴 from 75% (where it adds "consider a new chat"); the last part is what the previous turn added. See "Privacy and cost" below.

- **`ctx` card**: send the message `ctx` (or `ctx full` for an exact count) and Claude replies with a plain-text card of the live reading, breakdown, limits and cost, a few hundred tokens instead of a drawn panel. Asking in your own words ("how full is the context?") works too, through the mod's `context_usage` tool. The mod answers that tool itself, with the same card; it is the mod's own tool and stands in for no other.
- **Turns forecast** (estimate): from the yellow threshold on, the band and the status line add how many turns are left at the recent pace, for example `~7 turns to 75%`, or `~10 turns to full` once past the red threshold. It averages the last 5 turns, needs at least 3, and resets after a compaction. The pane shows it at any fill.
- **Handoff**: past the red threshold the band shows a **Write handoff** button (the pane has one at any fill). In Cowork, send the message `ctx handoff`. Either way Claude replies with one block to paste into a new chat: goal, decisions, what is done, next steps, files and open questions. The button sends `ctx handoff` for you, so it appears in the chat as your message.

## Install

At the prompt of a terminal session:

```
/plugin install context-meter --marketplace ronmiz/claude-context-meter
```

From a shell:

```
claude plugin install context-meter --marketplace ronmiz/claude-context-meter
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `ronmiz/claude-context-meter`, then **Add plugin**.

Answer `y` to add the marketplace, then pick a scope (user scope loads it in every session).

**In a company on a Claude Team or Enterprise plan**, the simplest way is for an owner to add it to the organization: see [ADMIN.md](ADMIN.md).

## Settings

| Setting | Default | What it does |
| --- | --- | --- |
| `language` | `en` | `en` or `he`: status line, band, pane and alerts |
| `warnPercent` | 50 | Meter turns yellow |
| `dangerPercent` | 75 | Meter turns red, first alert |
| `criticalPercent` | 90 | Second alert |
| `bandStyle` | `full` | `compact`: a short bar, the percentage and the forecast, and a shorter reply status line; tokens and delta move to the pane |
| `replyStatusLine` | true | Status line at the end of each reply |

## Privacy and cost

With `replyStatusLine` on, the mod adds one short block to each prompt you send, as context only Claude sees: the latest reading (for example `🟢 ▰▰▰▱▱▱▱▱▱▱ 27% · 271k / 1M`) and an instruction to end the reply with that line. The reading is the one measured after the previous turn. It costs a few dozen tokens per turn and sends nothing anywhere else. Turn it off in the plugin settings if you only want the band and pane.

`ctx handoff` (typed, or sent by the button) attaches a different block instead: an instruction to reply with the handoff summary and no status line.

The mod reads only usage figures from the engine; it reads no files, makes no network calls and stores only its own last reading and the last few per-turn deltas for the forecast.

### What the mod adds to prompts and submits

- **Blocks it attaches to your own prompts** (context only Claude sees, inside `<context-meter>` tags): the status-line reading and the instruction to end the reply with it (when `replyStatusLine` is on); the context card, when you send `ctx` or `ctx full`; the handoff instruction, when you send `ctx handoff`. Each block holds only usage figures and fixed instruction text, never conversation text.
- **The one prompt it submits itself**: the exact text `ctx handoff`, and only when you press **Write handoff**. It carries no conversation text, readings or other data; it is the same as typing `ctx handoff` yourself, and the chat shows it as your message. Claude's reply stays in your chat.
- **The `context_usage` tool**: the mod registers this tool and answers it itself with the same text card as `ctx`. It stands in for no other tool.
- **The `prompt.submit` hook**: it sees each prompt only to recognise `ctx`, `ctx full` and `ctx handoff`, and to attach the blocks above. It never changes or drops what you typed.

## Where it shows

| Surface | Band / pane | Reply status line |
| --- | --- | --- |
| Terminal (Claude Code CLI) | yes | yes |
| Desktop app, Code tab | yes | yes |
| Cowork chat | not drawn by the host | yes |

## Development

```
claude plugin validate .
claude plugin test .
```

---

## בעברית

מוד ל-Claude שמציג כמה מחלון ההקשר מנוצל, בזמן אמת, לפי המדידה של המנוע עצמו.

- **פס מעל שורת הפרומפט** עם אחוז וטוקנים, בירוק, צהוב ואדום.
- **פאנל פירוט** (כפתור "פירוט" או `/ctx`) עם פירוט לפי קטגוריות, מגבלות שימוש ועלות.
- **התראות** ב-75% וב-90%.
- **שורת סטטוס בסוף כל תשובה** ב-Cowork, שלא מציג ממשק של מודים.
- **תחזית תורות** (הערכה): מהסף הצהוב, כמה תורות נשארו בקצב האחרון.
- **סיכום המשך (handoff)**: כפתור בפס מעבר לסף האדום, או ההודעה `ctx handoff` ב-Cowork. Claude כותב בלוק אחד להדבקה בשיחה חדשה.
- **`bandStyle: compact`**: פס קצר יותר למי שרוצה לחסוך מקום.

**פרטיות:** כשהאפשרות `replyStatusLine` פעילה, המוד מצרף לכל הודעה שלך בלוק קצר שרק Claude רואה, עם המדידה האחרונה. זה עולה כמה עשרות טוקנים לתור, ושום דבר לא נשלח לשום מקום אחר. אפשר לכבות את זה בהגדרות.
