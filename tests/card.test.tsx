import { expect, test } from 'claude-code/testing'

const USAGE = {
  startedAt: 0,
  rateLimits: [{ kind: 'five_hour', percentUsed: 31 }],
  cost: { usd: 1.25 },
  context: {
    tokens: 366_000, window: 1_000_000, percent: 37,
    breakdown: {
      categories: [
        { name: 'System prompt', tokens: 180_000, kind: 'used', color: 'promptBorder', isDeferred: false },
        { name: 'Messages', tokens: 140_000, kind: 'used', color: 'permission', isDeferred: false },
        { name: 'MCP tools (deferred)', tokens: 50_000, kind: 'deferred', color: 'inactive', isDeferred: true },
        { name: 'Free space', tokens: 650_000, kind: 'free', color: 'inactive', isDeferred: false },
      ],
      totalTokens: 320_000, maxTokens: 1_000_000, rawMaxTokens: 1_000_000, autocompactSource: 'model-default',
      percentage: 32, gridRows: [], model: 'claude-opus-5-5', memoryFiles: [], mcpTools: [], agents: [],
    },
  },
}

const stubs = (on: any) => {
  on('session.measure', (_: unknown, e: any) => ({ changed: e.changed }))
  on('session.usage', () => ({ value: USAGE }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('tool.register', () => ({ value: { tool: 'mcp__context-meter__context_usage' } }))
  on('command.register', () => ({ value: { command: 'ctx' } }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
}

test('"ctx" attaches the text card and no status line', async ($, on) => {
  let seen: readonly string[] = []
  stubs(on)
  on('prompt.submit', (_: unknown, e: any) => { seen = e.context ?? []; return { text: e.text } })

  await $.prompt.submit({ text: ' CTX ', wait: false } as never)
  expect(seen.length).toBe(1)
  const block = seen[0]!
  console.log(block)
  expect(block).toContain('Context  37% · 366k / 1M')
  expect(block).toContain('180k  ██████████  System prompt')
  expect(block).toContain('140k  ████████░░  Messages')
  expect(block).toContain('650k              Free space')
  expect(block).not.toContain('MCP tools (deferred)')
  expect(block).toContain('5-hour limit 31% · Session cost $1.25')
  expect(block).toContain('(local estimate)')
  expect(block).not.toContain('End your reply')
})

test('the context_usage tool returns the same card', async ($, on) => {
  stubs(on)
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true } as never)
  const r = await $.tool.call({ tool: 'mcp__context-meter__context_usage', detail: 'full' } as never)
  const text = String((r as { result?: unknown }).result)
  expect(text).toContain('Context  37%')
  expect(text).toContain('(exact count)')
})

test('"ctx" is recognised behind a host system-reminder', async ($, on) => {
  let seen: readonly string[] = []
  stubs(on)
  on('prompt.submit', (_: unknown, e: any) => { seen = e.context ?? []; return { text: e.text } })
  await $.prompt.submit({ text: '<system-reminder>The user\'s timezone is X.</system-reminder>\nctx', wait: false } as never)
  expect(seen[0]).toContain('The user asked for the context card')
  await $.prompt.submit({ text: '<system-reminder>X</system-reminder>\nwhat is ctx?', wait: false } as never)
  expect(seen.join('')).not.toContain('The user asked for the context card')
})
