# Security policy

## Reporting a vulnerability

Please report security issues privately through GitHub:
[Report a vulnerability](https://github.com/ronmiz/claude-context-meter/security/advisories/new).

Do not open a public issue for a security problem.

Include what you found, how to reproduce it, and the version of context-meter (`version` in `.claude-plugin/plugin.json`). I aim to send a first reply within 14 days. Confirmed issues are fixed in a new release and noted in `CHANGELOG.md`.

## Supported versions

Only the latest release on the `main` branch receives fixes.

## What the plugin can access

context-meter reads only context-window usage figures from the engine. It reads no files, makes no network calls and sends nothing outside Claude. The README section "Privacy and cost" lists exactly what it adds to prompts and the one prompt it submits.
