import type { Register } from 'claude-code'

import { addRun, addVerdict, statsReport } from './history'
import {
  BUILT_IN,
  claudeUsage,
  customWorker,
  detectInstalled,
  expandHome,
  loadCustomSpecs,
  statusOf,
  usageOf,
} from './workers'
import type { Ctx, Engine, Status, Worker } from './workers'

const MARK: Record<Status['state'], string> = {
  ready: '[ready]   ',
  unverified: '[found]   ',
  'signed-out': '[sign in] ',
  missing: '[ -- ]    ',
}

const KINDS = ['review', 'code', 'debug', 'question', 'research', 'other']

type Options = { workerDir: string; customFile: string }

async function context($: Engine, opts: Options) {
  const home = (await $.env.get('HOME')) ?? ''
  const ctx: Ctx = { home, workerDir: expandHome(opts.workerDir, home) }
  const specs = await loadCustomSpecs($, expandHome(opts.customFile, home))
  const workers: Worker[] = [...BUILT_IN, ...specs.map(customWorker)]
  return { ctx, specs, workers }
}

async function setupReport($: Engine, opts: Options) {
  const { ctx, workers } = await context($, opts)
  const statuses = await Promise.all(workers.map(w => statusOf($, w, ctx)))
  const blocks = workers.map((w, i) => {
    const s = statuses[i]!
    const tag = w.isTested ? '' : ' (untested recipe)'
    const lines = [`${MARK[s.state]}${w.name}${tag}: ${s.detail.join('; ')}`]
    if (s.state !== 'ready') lines.push(...w.setup.map(l => `            ${l}`))
    return lines.join('\n')
  })
  return [
    'ai-crew setup. Every worker runs on your own logins; this mod ships no accounts or keys.',
    '',
    ...blocks,
    '',
    'Sign-ins open a browser: run them in your own terminal, not through Claude.',
    `Add your own workers in ${opts.customFile} (see the README). Run /crew-setup again to check.`,
  ].join('\n')
}

async function usageReport($: Engine, opts: Options, installed: readonly string[]) {
  const { ctx, workers } = await context($, opts)
  const present = workers.filter(w => installed.includes(w.id))
  const parts = await Promise.all([
    claudeUsage($, 'main (this session)'),
    ...present.map(w => usageOf($, w, ctx)),
  ])
  return parts.filter(p => p.length > 0).map(p => p.join('\n')).join('\n\n')
}

async function workersSection($: Engine, opts: Options, installed: readonly string[]) {
  const { workers } = await context($, opts)
  const lines = workers
    .filter(w => installed.includes(w.id))
    .map(w => `- ${w.id}: ${w.name}. ${w.strengths}`)
  return [
    '# ai-crew workers',
    "Other AI agents are installed on this machine as workers, each on the user's own account. You are the controller and decide when to hand work to them:",
    ...lines,
    '',
    "Use the ai-crew:delegate skill to hand a worker a task or mission, and ai-crew:review to have work checked by an agent of another vendor. Delegate without being asked when an independent second opinion would likely catch mistakes in a non-trivial or risky change, when independent subtasks can run in parallel, or when this account's usage runs low; say when you do. Small tasks you do yourself. Before choosing, check mcp__ai-crew__usage and mcp__ai-crew__stats. Verify everything a worker returns, then call mcp__ai-crew__record_outcome.",
  ].join('\n')
}

async function workerFor($: Engine, opts: Options, command: string) {
  const builtIn = BUILT_IN.find(w => w.runPattern.test(command))
  if (builtIn) return builtIn
  const { workers } = await context($, opts)
  return workers.find(w => w.runPattern.test(command))
}

async function isWorkerSession($: Engine) {
  return (await $.env.get('AI_CREW_ROLE')) === 'worker'
}

export const register: Register = (on, options) => {
  const opts: Options = {
    workerDir: String(options.claudeWorkerDir ?? '~/.claude-worker'),
    customFile: String(options.customWorkersFile ?? '~/.config/ai-crew/workers.json'),
  }

  // Module variables start over on a reload, and session.start runs again.
  let isWorkerRole = false
  let installed: string[] = []

  on('session.start', async ($, e, next) => {
    isWorkerRole = await isWorkerSession($)
    if (isWorkerRole) return next(e)

    const { ctx, specs } = await context($, opts)
    await $.env.set('AI_CREW_CLAUDE_WORKER_DIR', ctx.workerDir)
    installed = await detectInstalled($, ctx, specs)

    await $.command.register({ name: 'crew-setup', description: 'Check which AI workers are installed and signed in, with sign-in steps' })
    await $.command.register({ name: 'crew-usage', description: 'Show remaining usage for Claude and every installed worker' })
    await $.command.register({ name: 'crew-stats', description: 'Show each worker\'s track record: runs, failures, speed, verdicts' })
    await $.tool.register({
      name: 'usage',
      description: 'Remaining subscription usage for this Claude account and every installed worker. Check before a big delegation, when choosing a worker, or after a rate-limit error.',
      inputSchema: { type: 'object', properties: {} },
    })
    await $.tool.register({
      name: 'setup_check',
      description: 'Which workers are installed and signed in, with the sign-in steps for the person to run in their own terminal.',
      inputSchema: { type: 'object', properties: {} },
    })
    await $.tool.register({
      name: 'stats',
      description: 'Each worker\'s track record over the last N days: runs, failures, median time, and your recorded verdicts per kind of task. Use it to pick the worker most likely to do well.',
      inputSchema: { type: 'object', properties: { days: { type: 'number', description: 'Window in days (default 30)' } } },
    })
    await $.tool.register({
      name: 'record_outcome',
      description: 'Record your verdict on a worker\'s result AFTER you verified it, so later choices learn from it.',
      inputSchema: {
        type: 'object',
        properties: {
          worker: { type: 'string', description: 'Worker id: claude-worker, codex, gemini, copilot, cursor, qwen, ollama, or a custom id' },
          kind: { type: 'string', enum: KINDS },
          verdict: { type: 'string', enum: ['good', 'partial', 'bad'] },
          note: { type: 'string', description: 'One short line on what was good or wrong' },
        },
        required: ['worker', 'kind', 'verdict'],
      },
    })
    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    if (isWorkerRole || installed.length === 0) return composed
    const text = await workersSection($, opts, installed)
    return { sections: [...composed.sections, { id: 'ai-crew:workers', text, scope: 'session' }] }
  })

  on('command.run', { command: 'crew-setup' }, async $ => ({ text: await setupReport($, opts) }))
  on('command.run', { command: 'crew-usage' }, async $ => ({ text: await usageReport($, opts, installed) }))
  on('command.run', { command: 'crew-stats' }, async $ => {
    const { workers } = await context($, opts)
    return { text: await statsReport($, workers) }
  })

  on('tool.call', { tool: 'mcp__ai-crew__usage' }, async $ => ({ result: await usageReport($, opts, installed) }))
  on('tool.call', { tool: 'mcp__ai-crew__setup_check' }, async $ => ({ result: await setupReport($, opts) }))
  on('tool.call', { tool: 'mcp__ai-crew__stats' }, async ($, e) => {
    const { workers } = await context($, opts)
    const days = Number(e.days ?? 30)
    return { result: await statsReport($, workers, days > 0 ? days : 30) }
  })
  on('tool.call', { tool: 'mcp__ai-crew__record_outcome' }, async ($, e) => {
    await addVerdict($, {
      worker: e.worker,
      kind: KINDS.includes(e.kind) ? e.kind : 'other',
      verdict: e.verdict,
      note: e.note?.slice(0, 200),
      at: Date.now(),
    })
    return { result: `Recorded ${e.verdict} for ${e.worker} (${e.kind}).` }
  })

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const worker = await workerFor($, opts, e.command)
    if (!worker) return next(e)
    // A worker session that has this mod too must not delegate further.
    if (isWorkerRole || (await isWorkerSession($))) {
      return { deny: 'ai-crew: this is a worker session; it does not delegate to other agents.' }
    }
    // Only the second Claude account's recipe has a supervised background form.
    if (e.run_in_background && worker.id !== 'claude-worker') {
      return { deny: `ai-crew: run ${worker.name} in the foreground with a long timeout, so its result can be checked.` }
    }
    const startedAt = Date.now()
    const ran = await next(e)
    if (!e.run_in_background && ran.deny === undefined) {
      await addRun($, { worker: worker.id, at: startedAt, durationMs: Date.now() - startedAt, isOk: ran.isError !== true })
    }
    return ran
  })
}
