import type { Engine, Worker } from './workers'

export type Run = { worker: string; at: number; durationMs: number; isOk: boolean }

export type Verdict = {
  worker: string
  at: number
  kind: string
  verdict: 'good' | 'partial' | 'bad'
  note?: string
}

const KEEP = 500
const DAY = 86_400_000

async function list<T>($: Engine, key: string): Promise<T[]> {
  const value = await $.store.get(key)
  return Array.isArray(value) ? (value as T[]) : []
}

export async function addRun($: Engine, run: Run) {
  await $.store.set('runs', [...(await list<Run>($, 'runs')), run].slice(-KEEP))
}

export async function addVerdict($: Engine, verdict: Verdict) {
  await $.store.set('verdicts', [...(await list<Verdict>($, 'verdicts')), verdict].slice(-KEEP))
}

function median(values: number[]) {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)] ?? 0
}

function duration(ms: number) {
  return ms < 90_000 ? `${Math.round(ms / 1000)}s` : `${(ms / 60_000).toFixed(1)}m`
}

export async function statsReport($: Engine, workers: readonly Worker[], days = 30) {
  const since = Date.now() - days * DAY
  const runs = (await list<Run>($, 'runs')).filter(r => r.at >= since)
  const verdicts = (await list<Verdict>($, 'verdicts')).filter(v => v.at >= since)
  const lines = [`ai-crew track record, last ${days} days (runs are timed automatically; verdicts are Claude's after checking the work)`]
  for (const w of workers) {
    const mine = runs.filter(r => r.worker === w.id)
    const judged = verdicts.filter(v => v.worker === w.id)
    if (mine.length === 0 && judged.length === 0) continue
    const failed = mine.filter(r => !r.isOk).length
    lines.push('', `${w.name}: ${mine.length} runs, ${failed} failed, median ${duration(median(mine.map(r => r.durationMs)))}`)
    const kinds = [...new Set(judged.map(v => v.kind))]
    for (const kind of kinds) {
      const of = judged.filter(v => v.kind === kind)
      const count = (x: Verdict['verdict']) => of.filter(v => v.verdict === x).length
      lines.push(`  ${kind.padEnd(10)} good ${count('good')}, partial ${count('partial')}, bad ${count('bad')}`)
    }
    const notes = judged.filter(v => v.note).slice(-2)
    for (const v of notes) lines.push(`  note (${v.verdict}, ${v.kind}): ${v.note}`)
  }
  if (lines.length === 1) lines.push('', 'No delegations recorded yet.')
  return lines.join('\n')
}
