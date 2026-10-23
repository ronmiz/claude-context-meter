# context-meter — guide for organization admins

This page is for the owner of a Claude Team or Enterprise organization who wants to offer the context-meter mod to members.

## What it does

context-meter shows how full Claude's context window is, from the engine's own measurement (the same figures as the Claude Code status line):

- **Cowork and chat**: a one-line status at the end of each reply, for example `🟢 ▰▰▰▱▱▱▱▱▱▱ 31% · 308k / 1M · +6.5k`, and a `ctx` message that returns a short text card with the breakdown, usage limits and session cost.
- **Claude Code (terminal and the desktop app's Code tab)**: a band above the prompt and a Context pane with the same figures.
- Alerts at 75% and 90% suggest starting a new conversation before quality drops.

## Security review

Output of `claude plugin validate` for version 1.0.0:

```
hooks: session.start, session.measure, prompt.submit,
       tool.call{tool=mcp__context-meter__context_usage}, command.run{command=ctx},
       ui.render{component=AbovePrompt}, ui.render{component=Pane, requestId=context-meter}
calls: $.command.register, $.session.usage, $.state.get, $.state.set, $.tool.register,
       $.ui.open, $.ui.resolve, $.ui.status, $.ui.toast
```

What that means:

- **No file, process or network access.** The mod calls none of `$.fs`, `$.process`, `$.http` or `$.env`. It reads no files, starts no programs, sends nothing over the network and reads no environment variables or settings.
- **It sees each prompt (`prompt.submit`)** for two reasons only: to recognise the message `ctx`, and to attach the latest reading as a short block of context only Claude sees, so Claude can end its reply with the status line. It does not change what the user typed and does not change the system prompt.
- **Its one tool call hook** answers only its own tool, `context_usage`. It does not see, approve, deny or rewrite any other tool call.
- **It stores** only its own last reading in session state.
- **Cost**: the status line adds a few dozen tokens per turn; a `ctx` card a few hundred. Members can switch the status line off in the plugin's settings.

The full source is one file, `hooks/register.tsx`, MIT licensed: https://github.com/ronmiz/claude-context-meter

## Add it to your organization

Owners and Primary Owners can do this (on Enterprise, also a custom role that can manage the organization's libraries). Cowork and Skills must be enabled.

1. Open **Organization settings → Plugins & skills → Add → Upload a plugin** and upload `context-meter.zip`.
   - **Sync from GitHub** accepts only private or internal repositories. The public repository can't be synced directly; upload the ZIP, or copy the repository into a private one in your organization and sync that.
2. On the **Inventory** tab, open the plugin's menu → **Default access**. Recommended: **Available to install** for a pilot, then **Installed by default** if the team wants it. Avoid **Required**: some people will not want the status line.

Members then find it under **Customize → Plugins → Discover** (for "Available to install"), or get it automatically (for "Installed by default"). It works in chat, Cowork and Claude Code wherever they sign in with the same Claude account. Changes reach members on their next session.

## Policies that affect it

- **`allowManagedModsOnly`** (Claude Code managed settings): if set, a mod your organization turns on from claude.ai still counts as a user's mod and does not load in Claude Code. To run it there under that policy, deploy it as an organization mod from a directory on each machine, as described in https://code.claude.com/docs/en/plugins/mods/admin
- **Marketplace restrictions** (`strictKnownMarketplaces`): members can't add the public repository themselves; distributing through the organization avoids that.
- **Built-in guard**: on Team and Enterprise, Claude Code's `sec-default` guard loads ahead of every user mod. context-meter does not touch anything the guard protects (managed hooks, system prompt, managed instructions, settings).

## Remove or roll back

- Set **Default access → Not available** to hide it, or delete it from the Inventory.
- A member can turn it off under **Customize → Plugins**, unless it is Required.
- In Claude Code, `claude --safe-mode` starts a session with installed mods off, to check whether a mod causes a problem.

## Known limits

- Cowork does not draw mod UI, so the band and pane appear only in Claude Code; Cowork gets the status line and the `ctx` card.
- The `ctx` shortcut relies on how Cowork wraps a message. If that changes, ask in your own words ("how full is the context?") and Claude uses the `context_usage` tool instead.
- Claude mods are in early access; a Claude update may change the API the mod uses.
