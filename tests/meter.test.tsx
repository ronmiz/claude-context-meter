import { expect, test } from 'claude-code/testing'

const BAND = {
  plugin: 'context-meter',
  component: 'AbovePrompt',
  props: { hasSurvey: false },
} as const

const measure = (tokens: number, window = 200_000) => ({
  context: { tokens, window, percent: Math.round((tokens / window) * 100) },
  rateLimits: [{ kind: 'five_hour', percentUsed: 31 }],
  changed: ['context' as const],
})

test('the band shows the live fill on every surface', async ($, on) => {
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))

  await $.session.measure(measure(84_000))

  for (const surface of ['terminal', 'desktop', 'vscode', 'mobile'] as const) {
    const ui = await $.ui.mount({ ...BAND, surface } as never)
    expect((await ui.find({ type: 'Text', text: /42%/ }))?.text).toBe('42%')
    expect((await ui.find({ type: 'Text', text: /84k/ }))?.text).toContain('84k / 200k')
    await ui.unmount()
  }
})

test('a toast fires once per threshold crossed, and re-arms after a drop', async ($, on) => {
  const toasts: string[] = []
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_, e) => {
    toasts.push(String((e as { text: string }).text))
    return { value: undefined }
  })

  await $.session.measure(measure(100_000)) // 50%: nothing
  await $.session.measure(measure(152_000)) // 76%: toast
  await $.session.measure(measure(156_000)) // 78%: still armed off
  await $.session.measure(measure(182_000)) // 91%: toast
  await $.session.measure(measure(40_000)) //  20%: re-arm both
  await $.session.measure(measure(154_000)) // 77%: toast again

  expect(toasts.length).toBe(3)
  expect(toasts[0]).toContain('76%')
  expect(toasts[1]).toContain('91%')
})

test('each prompt carries the live reading as hidden context', async ($, on) => {
  let seen: readonly string[] = []
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('prompt.submit', (_, e) => {
    seen = e.context ?? []
    return { text: e.text }
  })

  await $.session.measure(measure(52_000, 1_000_000))
  await $.prompt.submit({ text: 'hi', wait: false } as never)
  expect(seen.length).toBe(1)
  expect(seen[0]).toContain('🟢 ▰▱▱▱▱▱▱▱▱▱ 5% · 52k / 1M`')

  await $.session.measure(measure(58_500, 1_000_000))
  await $.prompt.submit({ text: 'again', wait: false } as never)
  expect(seen[0]).toContain('🟢 ▰▱▱▱▱▱▱▱▱▱ 6% · 59k / 1M · +6.5k`')

  await $.session.measure(measure(910_000, 1_000_000))
  await $.prompt.submit({ text: 'more', wait: false } as never)
  expect(seen[0]).toContain('🔴 ▰▰▰▰▰▰▰▰▰▱ 91% · 910k / 1M · +852k · consider a new chat`')
})

test('Hebrew labels when language is he', { options: { language: 'he' } }, async ($, on) => {
  let seen: readonly string[] = []
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('prompt.submit', (_, e) => {
    seen = e.context ?? []
    return { text: e.text }
  })

  await $.session.measure(measure(160_000))
  await $.prompt.submit({ text: 'שלום', wait: false } as never)
  expect(seen[0]).toContain('80% · 160k / 200k · כדאי לפתוח שיחה חדשה`')
})

test('custom thresholds move the alerts', { options: { dangerPercent: 60, criticalPercent: 80 } }, async ($, on) => {
  const toasts: string[] = []
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', (_, e) => {
    toasts.push(String((e as { text: string }).text))
    return { value: undefined }
  })

  await $.session.measure(measure(124_000)) // 62%: past 60
  await $.session.measure(measure(162_000)) // 81%: past 80
  expect(toasts.length).toBe(2)
})

test('the reply line can be switched off', { options: { replyStatusLine: false } }, async ($, on) => {
  let seen: readonly string[] | undefined
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.status', () => ({ value: undefined }))
  on('prompt.submit', (_, e) => {
    seen = e.context
    return { text: e.text }
  })

  await $.session.measure(measure(52_000))
  await $.prompt.submit({ text: 'hi', wait: false } as never)
  expect(seen ?? []).toEqual([])
})

const quiet = (on: Parameters<Parameters<typeof test>[1]>[1]) => {
  on('session.measure', (_, e) => ({ changed: e.changed }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
}

test('the forecast appears from the yellow threshold after three turns', async ($, on) => {
  let seen: readonly string[] = []
  quiet(on)
  on('prompt.submit', (_, e) => {
    seen = e.context ?? []
    return { text: e.text }
  })

  // 200k window: +10k a turn, red threshold at 75% = 150k.
  await $.session.measure(measure(80_000)) //  40%: no delta yet
  await $.session.measure(measure(90_000)) //  45%: 1 delta
  await $.session.measure(measure(100_000)) // 50%: 2 deltas, too few
  await $.prompt.submit({ text: 'a', wait: false } as never)
  expect(seen[0]).not.toContain('turns')

  await $.session.measure(measure(110_000)) // 55%: 3 deltas -> (150k-110k)/10k = 4
  await $.prompt.submit({ text: 'b', wait: false } as never)
  expect(seen[0]).toContain('· ~4 turns to 75%`')

  await $.session.measure(measure(160_000)) // 80%: past red -> to full
  await $.prompt.submit({ text: 'c', wait: false } as never)
  expect(seen[0]).toContain('turns to full')
})

test('a context drop resets the forecast', async ($, on) => {
  let seen: readonly string[] = []
  quiet(on)
  on('prompt.submit', (_, e) => {
    seen = e.context ?? []
    return { text: e.text }
  })

  for (const t of [100_000, 110_000, 120_000, 130_000]) await $.session.measure(measure(t))
  await $.session.measure(measure(30_000)) // compaction
  for (const t of [104_000, 112_000]) await $.session.measure(measure(t))
  await $.prompt.submit({ text: 'x', wait: false } as never)
  expect(seen[0]).not.toContain('turns')
})

test('ctx handoff asks for one summary block and no status line', async ($, on) => {
  let seen: readonly string[] = []
  quiet(on)
  on('prompt.submit', (_, e) => {
    seen = e.context ?? []
    return { text: e.text }
  })

  await $.session.measure(measure(160_000))
  await $.prompt.submit({ text: 'ctx handoff', wait: false } as never)
  expect(seen.length).toBe(1)
  expect(seen[0]).toContain('HANDOFF')
  expect(seen[0]).toContain('Goal, Decided, Done, Next, Files, Open')
  expect(seen[0]).not.toContain('End your reply with this exact line')
})

test('past the red threshold the band offers Write handoff', async ($, on) => {
  quiet(on)
  await $.session.measure(measure(100_000))
  let ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  expect(await ui.find({ type: 'Button', text: 'Write handoff' })).toBe(undefined)
  await ui.unmount()

  await $.session.measure(measure(160_000))
  ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  expect((await ui.find({ type: 'Button', text: 'Write handoff' })) !== undefined).toBe(true)
  await ui.unmount()
})

test('compact band and line drop the token count', { options: { bandStyle: 'compact' } }, async ($, on) => {
  let seen: readonly string[] = []
  quiet(on)
  on('prompt.submit', (_, e) => {
    seen = e.context ?? []
    return { text: e.text }
  })

  await $.session.measure(measure(84_000))
  const ui = await $.ui.mount({ ...BAND, surface: 'desktop' } as never)
  expect((await ui.find({ type: 'Text', text: /42%/ }))?.text).toBe('42%')
  expect(await ui.find({ type: 'Text', text: /84k/ })).toBe(undefined)
  await ui.unmount()

  await $.prompt.submit({ text: 'hi', wait: false } as never)
  expect(seen[0]).toContain('`🟢 ▰▰▰▰▱▱▱▱▱▱ 42%`')
})
