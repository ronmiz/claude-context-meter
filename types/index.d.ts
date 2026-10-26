export type Limit = { kind: string; percentUsed: number; resetsAt: string | null }

export type Snapshot = {
  /** Tokens the last response was answered over; null before the first reading. */
  tokens: number | null
  /** The model's context window, in tokens. */
  window: number
  /** tokens / window as a whole percentage; null before the first reading. */
  percent: number | null
  /** Tokens added since the previous reading; null when there is none to compare. */
  delta: number | null
  limits: Limit[]
  costUsd: number | null
}

export type Row = { name: string; tokens: number; kind: 'used' | 'free' | 'buffer' }

export type Breakdown = {
  rows: Row[]
  total: number
  max: number
  percent: number
  model: string
  detail: 'summary' | 'full'
}

declare module 'claude-code' {
  interface PluginState {
    'context-meter': {
      snapshot: Shaped<Snapshot | null>
      breakdown: Shaped<Breakdown | null>
      alerted: number[]
      isLoading: boolean
      /** The last few positive per-turn context deltas, newest last; cleared when the context shrinks. */
      deltas: number[]
    }
  }
}
