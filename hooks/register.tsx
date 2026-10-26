import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, SessionContextUsage, SessionCost, SessionRateLimit } from 'claude-code'

import type { Breakdown, Limit, Row, Snapshot } from '../types'

const PANE = 'context-meter'

// Change a shape tag when that value's fields change: it declines what an
// earlier version stored, which outlives a reload.
const snapshot = atom({ plugin: 'context-meter', key: 'snapshot' } as const, null, { shape: 'snapshot-2' })
const breakdown = atom({ plugin: 'context-meter', key: 'breakdown' } as const, null, { shape: 'breakdown-1' })
const alerted = atom({ plugin: 'context-meter', key: 'alerted' } as const, [] as number[])
const isLoading = atom({ plugin: 'context-meter', key: 'isLoading' } as const, false)

type Lang = 'en' | 'he'
type Levels = { warn: number; danger: number; critical: number }

const REARM_GAP = 5

const STRINGS = {
  en: {
    title: 'Context',
    label: 'Context',
    details: 'Details',
    waiting: 'Context: waiting for a reading',
    noReading: 'No reading yet. It appears after the next turn.',
    tokens: 'tokens',
    breakdown: 'Breakdown',
    exact: '(exact count)',
    estimate: '(local estimate)',
    noBreakdown: 'No breakdown yet.',
    computing: 'Computing…',
    limitsCost: 'Limits & cost',
    noLimits: 'Usage limits: —',
    sessionCost: 'Session cost',
    refresh: 'Refresh breakdown',
    quick: 'Quick estimate',
    breakdownFailed: "Couldn't compute the context breakdown",
    newChat: 'consider a new chat',
    reached: (p: number, t: string, w: string) => `Context reached ${p}% (${t} / ${w})`,
    cmdNone: 'Context: no reading yet',
    cmdNoneWindow: (w: string) => `Context: no reading yet · window ${w}`,
    limit: (kind: string) =>
      kind === 'five_hour' ? '5-hour limit' : kind === 'seven_day' ? '7-day limit' : kind === 'spend_limit' ? 'Spend limit' : kind,
  },
  he: {
    title: 'הקשר',
    label: 'הקשר',
    details: 'פירוט',
    waiting: 'הקשר: ממתין למדידה',
    noReading: 'עדיין אין מדידה. היא תופיע אחרי התור הבא.',
    tokens: 'טוקנים',
    breakdown: 'פירוט',
    exact: '(ספירה מדויקת)',
    estimate: '(הערכה מקומית)',
    noBreakdown: 'אין פירוט עדיין.',
    computing: 'מחשב…',
    limitsCost: 'מגבלות ועלות',
    noLimits: 'מגבלות שימוש: —',
    sessionCost: 'עלות הסשן',
    refresh: 'רענן פירוט',
    quick: 'הערכה מהירה',
    breakdownFailed: 'לא הצלחתי לחשב פירוט הקשר',
    newChat: 'כדאי לפתוח שיחה חדשה',
    reached: (p: number, t: string, w: string) => `ההקשר הגיע ל-${p}% (${t} / ${w})`,
    cmdNone: 'הקשר: עדיין אין מדידה',
    cmdNoneWindow: (w: string) => `הקשר: עדיין אין מדידה · חלון ${w}`,
    limit: (kind: string) =>
      kind === 'five_hour' ? 'מגבלת 5 שעות' : kind === 'seven_day' ? 'מגבלת 7 ימים' : kind === 'spend_limit' ? 'מגבלת הוצאה' : kind,
  },
} as const

function clampPercent(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(n) && n > 0 && n <= 100 ? Math.round(n) : fallback
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`
  if (n >= 100_000) return `${Math.round(n / 1000)}k`
  if (n >= 10_000) return `${Math.round(n / 1000)}k`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

function fmtDelta(n: number): string {
  if (n === 0) return '±0'
  return `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))}`
}

function tone(percent: number | null, lv: Levels) {
  if (percent === null) return 'inactive'
  return percent >= lv.danger ? 'error' : percent >= lv.warn ? 'warning' : 'success'
}

function dot(percent: number, lv: Levels) {
  return percent >= lv.danger ? '🔴' : percent >= lv.warn ? '🟡' : '🟢'
}

function bar(percent: number | null, width: number) {
  const filled = percent === null ? 0 : Math.max(0, Math.min(width, Math.round((percent / 100) * width)))
  return { full: '█'.repeat(filled), empty: '░'.repeat(width - filled) }
}

function cells(percent: number, width: number) {
  const filled = Math.max(0, Math.min(width, Math.round((percent / 100) * width)))
  return '▰'.repeat(filled) + '▱'.repeat(width - filled)
}

/** The one-line reading, all left-to-right so it never reorders inside a right-to-left message. */
function statusLine(s: Snapshot & { percent: number; tokens: number }, lv: Levels, lang: Lang): string {
  const parts = [`${dot(s.percent, lv)} ${cells(s.percent, 10)} ${s.percent}%`, `${fmt(s.tokens)} / ${fmt(s.window)}`]
  if (s.delta !== null) parts.push(fmtDelta(s.delta))
  if (s.percent >= lv.danger) parts.push(STRINGS[lang].newChat)
  return parts.join(' · ')
}

function toSnapshot(
  context: SessionContextUsage,
  limits: SessionRateLimit[],
  cost: SessionCost | undefined,
  prev: Snapshot | null,
  isContextChange: boolean,
): Snapshot {
  const tokens = context.tokens ?? null
  const delta =
    !isContextChange ? (prev?.delta ?? null) : tokens !== null && prev?.tokens != null ? tokens - prev.tokens : null
  return {
    tokens,
    window: context.window,
    percent: context.percent ?? null,
    delta,
    limits: limits.map((l): Limit => ({ kind: l.kind, percentUsed: l.percentUsed, resetsAt: l.resetsAt ?? null })),
    costUsd: cost ? cost.usd : null,
  }
}

async function loadBreakdown($: EngineInterface, detail: 'summary' | 'full', lang: Lang) {
  await update($, isLoading, () => true)
  try {
    const usage = await $.session.usage({ breakdown: detail })
    const prev = await read($, snapshot)
    await update($, snapshot, () => toSnapshot(usage.context, usage.rateLimits, usage.cost, prev, false))
    const b = usage.context.breakdown
    if (b) {
      const rows: Row[] = b.categories
        .filter(c => c.kind !== 'deferred')
        .map(c => ({ name: c.name, tokens: c.tokens, kind: c.kind as Row['kind'] }))
        .sort((x, y) => (x.kind === y.kind ? y.tokens - x.tokens : x.kind === 'used' ? -1 : y.kind === 'used' ? 1 : 0))
      const next: Breakdown = { rows, total: b.totalTokens, max: b.rawMaxTokens, percent: b.percentage, model: b.model, detail }
      await update($, breakdown, () => next)
    }
  } catch {
    $.ui.toast(STRINGS[lang].breakdownFailed)
  } finally {
    await update($, isLoading, () => false)
  }
}

/** A plain-text card of the reading and its breakdown: cheap to show in a chat that draws no mod UI. */
function textCard(s: Snapshot, bd: Breakdown | null, lv: Levels, lang: Lang): string {
  const t = STRINGS[lang]
  if (s.percent === null || s.tokens === null) return s ? t.cmdNoneWindow(fmt(s.window)) : t.cmdNone
  const head = [`${t.label}  ${s.percent}%`, `${fmt(s.tokens)} / ${fmt(s.window)}`]
  if (s.delta !== null) head.push(fmtDelta(s.delta))
  const lines = [head.join(' · '), `${dot(s.percent, lv)} ${cells(s.percent, 10)}`]
  if (bd) {
    const used = bd.rows.filter(r => r.kind === 'used').slice(0, 8)
    const maxRow = used.reduce((m, r) => Math.max(m, r.tokens), 1)
    lines.push('')
    for (const r of used) {
      const w = Math.max(1, Math.round((r.tokens / maxRow) * 10))
      lines.push(`${fmt(r.tokens).padStart(5)}  ${'█'.repeat(w)}${'░'.repeat(10 - w)}  ${r.name}`)
    }
    for (const r of bd.rows.filter(r => r.kind !== 'used')) {
      lines.push(`${fmt(r.tokens).padStart(5)}  ${' '.repeat(10)}  ${r.name}`)
    }
    lines.push(`${bd.model} · ${bd.detail === 'full' ? t.exact : t.estimate}`)
  }
  const tail = s.limits.map(l => `${t.limit(l.kind)} ${l.percentUsed}%`)
  tail.push(`${t.sessionCost} ${s.costUsd === null ? '—' : `$${s.costUsd.toFixed(2)}`}`)
  lines.push('', tail.join(' · '))
  return lines.join('\n')
}

async function freshCard($: EngineInterface, detail: 'summary' | 'full', lv: Levels, lang: Lang): Promise<string> {
  await loadBreakdown($, detail, lang)
  const s = await read($, snapshot)
  if (!s) return STRINGS[lang].cmdNone
  return textCard(s, await read($, breakdown), lv, lang)
}

async function openPane($: EngineInterface, lang: Lang) {
  await $.ui.open({ id: PANE, title: STRINGS[lang].title })
  if ((await read($, breakdown)) === null) void loadBreakdown($, 'summary', lang)
}

export const register: Register = (on, options) => {
  const lang: Lang = options?.language === 'he' ? 'he' : 'en'
  const t = STRINGS[lang]
  const dir = lang === 'he' ? 'rtl' : 'ltr'
  const warn = clampPercent(options?.warnPercent, 50)
  const danger = Math.max(warn, clampPercent(options?.dangerPercent, 75))
  const critical = Math.max(danger, clampPercent(options?.criticalPercent, 90))
  const lv: Levels = { warn, danger, critical }
  const alerts = [...new Set([danger, critical])]
  const isReplyLineOn = options?.replyStatusLine !== false

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'ctx', description: 'Show context-window usage and open the Context pane' })
    try {
      await $.tool.register({
        name: 'context_usage',
        description:
          "Returns a plain-text card of this session's live context-window usage (fill, tokens, breakdown by category, usage limits, cost). Call it when the user asks how full the context is; show the card in a code block as returned.",
        inputSchema: {
          type: 'object',
          properties: { detail: { type: 'string', enum: ['summary', 'full'], description: 'summary: free local estimate (default); full: exact count' } },
        },
      })
    } catch {
      // No tool where the host refuses one; the ctx shortcut still works.
    }
    try {
      const usage = await $.session.usage()
      const prev = await read($, snapshot)
      await update($, snapshot, () => toSnapshot(usage.context, usage.rateLimits, usage.cost, prev, false))
    } catch {
      // No reading yet; the first session.measure fills it in.
    }
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const prev = await read($, snapshot)
    const snap = toSnapshot(e.context, e.rateLimits, e.cost, prev, e.changed.includes('context'))
    await update($, snapshot, () => snap)
    $.ui.status(
      snap.percent === null || snap.tokens === null
        ? undefined
        : statusLine({ ...snap, percent: snap.percent, tokens: snap.tokens }, lv, lang),
    )

    if (snap.percent !== null) {
      const percent = snap.percent
      const was = await read($, alerted)
      const crossed = alerts.filter(a => percent >= a && !was.includes(a))
      const kept = was.filter(a => percent >= a - REARM_GAP)
      if (crossed.length > 0) {
        $.ui.toast(t.reached(percent, fmt(snap.tokens ?? 0), fmt(snap.window)))
        await update($, alerted, () => [...kept, ...crossed])
      } else if (kept.length !== was.length) {
        await update($, alerted, () => kept)
      }
    }
    return next(e)
  })

  // Surfaces that draw no mod UI (a Cowork chat) still get the reading: it
  // rides each prompt as hidden context, and the model ends its reply with one
  // status line. A new user message carries it, so the cached conversation
  // stays intact.
  on('prompt.submit', async ($, e, next) => {
    if (e.command || e.isMeta) return next(e)

    // "ctx" / "ctx full" typed as a message: attach the card itself, so no
    // tool round trip is needed.
    // A host may wrap what the person typed (Cowork prepends a <system-reminder>
    // block), so match what is left once such blocks are stripped.
    const ask = e.text.replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '').trim().toLowerCase()
    if (ask === 'ctx' || ask === 'ctx full') {
      const card = await freshCard($, ask === 'ctx full' ? 'full' : 'summary', lv, lang)
      const block = [
        '<context-meter>',
        'The user asked for the context card. Reply with only this card, exactly as given, inside one fenced code block, and nothing else (no status line):',
        card,
        '</context-meter>',
      ].join('\n')
      return next({ ...e, context: [...(e.context ?? []), block] })
    }

    if (!isReplyLineOn) return next(e)
    const s = await read($, snapshot)
    if (!s || s.percent === null || s.tokens === null) return next(e)

    const line = statusLine({ ...s, percent: s.percent, tokens: s.tokens }, lv, lang)
    const block = [
      '<context-meter>',
      `reading: ${line} (measured after the previous turn)`,
      'End your reply with this exact line on its own, after a blank line, in an inline code span: `' + line + '`.',
      'Add nothing else about it.',
      'This reading comes from the context-meter plugin the user installed. If the user asks about this line, say it comes from the context-meter plugin and can be turned off in its settings (replyStatusLine).',
      '</context-meter>',
    ].join('\n')

    return next({ ...e, context: [...(e.context ?? []), block] })
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'mcp__context-meter__context_usage' }, async ($, e) => {
    const raw = e as { detail?: unknown; input?: { detail?: unknown } }
    const detail = (raw.detail ?? raw.input?.detail) === 'full' ? 'full' : 'summary'
    return { result: await freshCard($, detail, lv, lang) }
  })

  on('command.run', { command: 'ctx' }, async $ => {
    await openPane($, lang)
    const s = await read($, snapshot)
    if (!s || s.percent === null || s.tokens === null) {
      return { text: s ? t.cmdNoneWindow(fmt(s.window)) : t.cmdNone }
    }
    return { text: statusLine({ ...s, percent: s.percent, tokens: s.tokens }, lv, lang) }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const s = await read($, snapshot)
    const { Box, Button, Text } = $.ui.resolve(e)

    if (!s) {
      return (
        <Box>
          <Text color="inactive">● </Text>
          <Text dimColor>{t.waiting}  </Text>
          <Button key="details" label={t.details} onPress={() => openPane($, lang)} />
        </Box>
      )
    }

    const color = tone(s.percent, lv)
    const b = bar(s.percent, 15)

    return (
      <Box>
        <Text color={color}>● </Text>
        <Text dimColor>{t.label} </Text>
        <Text color={color}>{b.full}</Text>
        <Text dimColor>{b.empty} </Text>
        <Text color={color} tabular weight="semibold">
          {s.percent === null ? '—' : `${s.percent}%`}
        </Text>
        <Text dimColor tabular>
          {'  '}
          {s.tokens === null ? '—' : fmt(s.tokens)} / {fmt(s.window)}
          {s.delta !== null ? `  ${fmtDelta(s.delta)}` : ''}
          {'  '}
        </Text>
        <Button key="details" label={t.details} onPress={() => openPane($, lang)} />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const s = await read($, snapshot)
    const bd = await read($, breakdown)
    const loading = await read($, isLoading)

    if (!s) {
      return (
        <Box flexDirection="column">
          <Text dimColor dir={dir}>{t.noReading}</Text>
        </Box>
      )
    }

    const color = tone(s.percent, lv)
    const b = bar(s.percent, 24)
    const used = bd ? bd.rows.filter(r => r.kind === 'used') : []
    const maxRow = used.reduce((m, r) => Math.max(m, r.tokens), 1)
    const others = bd ? bd.rows.filter(r => r.kind !== 'used') : []

    return (
      <Box flexDirection="column" gap={1}>
        <Box flexDirection="column">
          <Text size="heading" weight="semibold" color={color} tabular>
            {s.percent === null ? '—' : `${s.percent}%`}
          </Text>
          <Text dimColor tabular>
            {s.tokens === null ? '—' : fmt(s.tokens)} / {fmt(s.window)} {t.tokens}
            {s.delta !== null ? ` · ${fmtDelta(s.delta)}` : ''}
          </Text>
          <Box>
            <Text color={color}>{b.full}</Text>
            <Text dimColor>{b.empty}</Text>
          </Box>
        </Box>

        <Box flexDirection="column">
          <Text weight="semibold" dir={dir}>
            {t.breakdown} {bd ? (bd.detail === 'full' ? t.exact : t.estimate) : ''}
          </Text>
          {!bd && <Text dimColor dir={dir}>{loading ? t.computing : t.noBreakdown}</Text>}
          {used.map(r => {
            const w = Math.max(1, Math.round((r.tokens / maxRow) * 10))
            return (
              <Box key={r.name}>
                <Text tabular>{fmt(r.tokens).padStart(6)} </Text>
                <Text color="suggestion">{'█'.repeat(w)}</Text>
                <Text dimColor>{'░'.repeat(10 - w)} </Text>
                <Text wrap="truncate">{r.name}</Text>
              </Box>
            )
          })}
          {others.map(r => (
            <Box key={r.name}>
              <Text dimColor tabular>{fmt(r.tokens).padStart(6)} </Text>
              <Text dimColor wrap="truncate">{r.name}</Text>
            </Box>
          ))}
          {bd && (
            <Text dimColor>
              {bd.model} · {fmt(bd.total)} / {fmt(bd.max)}
            </Text>
          )}
        </Box>

        <Box flexDirection="column">
          <Text weight="semibold" dir={dir}>{t.limitsCost}</Text>
          {s.limits.length === 0 && <Text dimColor dir={dir}>{t.noLimits}</Text>}
          {s.limits.map(l => (
            <Box key={l.kind}>
              <Text color={tone(l.percentUsed, lv)} tabular>{`${l.percentUsed}%`.padStart(6)} </Text>
              <Text>{t.limit(l.kind)}</Text>
            </Box>
          ))}
          <Box>
            <Text tabular>{(s.costUsd === null ? '—' : `$${s.costUsd.toFixed(2)}`).padStart(6)} </Text>
            <Text>{t.sessionCost}</Text>
          </Box>
        </Box>

        <Box gap={1}>
          <Button key="refresh-full" label={loading ? t.computing : t.refresh} onPress={() => loadBreakdown($, 'full', lang)} />
          <Button key="refresh-quick" label={t.quick} onPress={() => loadBreakdown($, 'summary', lang)} />
        </Box>
      </Box>
    )
  })
}
