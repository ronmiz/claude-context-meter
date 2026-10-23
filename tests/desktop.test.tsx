import { expect, test } from 'claude-code/testing'

const measure = (tokens: number, window = 1_000_000) => ({
  context: { tokens, window, percent: Math.round((tokens / window) * 100) },
  rateLimits: [{ kind: 'five_hour', percentUsed: 31 }],
  cost: { usd: 1.25 },
  changed: ['context' as const],
})

const hush = (on: any) => {
  on('session.measure', (_: unknown, e: any) => ({ changed: e.changed }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
}

test('desktop band: bar, percent, tokens, delta, Details button', async ($, on) => {
  hush(on)
  await $.session.measure(measure(320_000))
  await $.session.measure(measure(326_500))
  const ui = await $.ui.mount({ plugin: 'context-meter', surface: 'desktop', component: 'AbovePrompt', props: { hasSurvey: false } } as never)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  console.log('BAND desktop:', JSON.stringify(texts.join('')))
  expect(texts.join('')).toContain('33%')
  expect(texts.join('')).toContain('327k / 1M  +6.5k')
  expect(await ui.find({ type: 'Button', key: 'details' })).toBeTruthy()
  await ui.unmount()
})

test('desktop pane: header, limits, cost, buttons', async ($, on) => {
  hush(on)
  on('session.usage', () => ({ value: { startedAt: 0, rateLimits: [{ kind: 'five_hour', percentUsed: 31 }], cost: { usd: 1.25 }, context: { tokens: 326_500, window: 1_000_000, percent: 33, breakdown: { categories: [
    { name: 'System prompt', tokens: 180_000, kind: 'used', color: 'promptBorder', isDeferred: false },
    { name: 'Messages', tokens: 140_000, kind: 'used', color: 'permission', isDeferred: false },
    { name: 'Free space', tokens: 650_000, kind: 'free', color: 'inactive', isDeferred: false },
  ], totalTokens: 320_000, maxTokens: 1_000_000, rawMaxTokens: 1_000_000, autocompactSource: 'model-default', percentage: 32, gridRows: [], model: 'claude-opus-5-5', memoryFiles: [], mcpTools: [], agents: [] } } } }))
  await $.session.measure(measure(326_500))
  const ui = await $.ui.mount({ plugin: 'context-meter', surface: 'desktop', component: 'Pane', requestId: 'context-meter',
    props: { title: 'Context', isFocused: true, bodyColumns: 40, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } } as never)
  await ui.press({ key: 'refresh-full' } as never)
  const texts = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  console.log('PANE desktop:\n' + texts.join('\n'))
  expect(texts).toContain('33%')
  expect(texts.join('\n')).toContain('5-hour limit')
  expect(texts.join('\n')).toContain('$1.25')
  expect(texts.join('\n')).toContain('System prompt')
  await ui.unmount()
})
