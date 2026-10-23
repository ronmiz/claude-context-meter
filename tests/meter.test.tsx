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
