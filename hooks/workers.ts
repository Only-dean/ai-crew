import type { EngineInterface } from 'claude-code'

export type Engine = EngineInterface

export type Ctx = { home: string; workerDir: string }

export type StatusState = 'ready' | 'unverified' | 'signed-out' | 'missing'

export type Status = { state: StatusState; detail: string[] }

export type Worker = {
  id: string
  name: string
  // Who makes the models: a review goes to a worker of another vendor.
  vendor: string
  // A Bash command that delegates to this worker.
  runPattern: RegExp
  strengths: string
  // False until someone with an account has run the recipe end to end.
  isTested: boolean
  setup: string[]
  // Set on a worker from the custom workers file.
  spec?: CustomWorkerSpec
}

export type CustomWorkerSpec = {
  id: string
  name?: string
  vendor?: string
  command: string[]
  readOnlyArgs?: string[]
  editArgs?: string[]
  usageCommand?: string[]
  strengths?: string
}

// ---- helpers -------------------------------------------------------------

export async function run(
  $: Engine,
  argv: string[],
  env?: Record<string, string>,
  timeoutMs = 90_000,
) {
  try {
    return await $.process.run(argv, { env, timeoutMs, stdin: '' })
  } catch {
    return undefined
  }
}

export function expandHome(path: string, home: string) {
  return path.replace(/^~(?=\/|$)/, home)
}

function resets(ts: unknown) {
  const date = typeof ts === 'number' ? new Date(ts * 1000) : new Date(String(ts))
  if (Number.isNaN(date.getTime())) return ''
  const hours = (date.getTime() - Date.now()) / 3_600_000
  return `resets in ${hours < 48 ? `${hours.toFixed(1)}h` : `${(hours / 24).toFixed(1)}d`}`
}

function pct(n: number) {
  return `${Math.round(n)}%`.padStart(4)
}

function firstLine(text: string | undefined) {
  return (text ?? '').trim().split('\n')[0]?.slice(0, 160) ?? ''
}

async function version($: Engine, bin: string) {
  const out = await run($, [bin, '--version'], undefined, 15_000)
  return out && out.exitCode === 0 ? firstLine(out.stdout || out.stderr) : undefined
}

function at(cmd: string) {
  return String.raw`(^|[;&|(]\s*|\s)` + cmd
}

// ---- Claude --------------------------------------------------------------

export async function claudeUsage($: Engine, label: string, env?: Record<string, string>) {
  const out = await run($, ['claude', '-p', '/usage'], env)
  if (!out) return [`Claude ${label}: could not run the claude command`]
  const rows = [...out.stdout.matchAll(/^Current (.+?): (\d+)% used · resets (.+)$/gm)]
  if (rows.length === 0) return [`Claude ${label}: no usage reported (${firstLine(out.stdout || out.stderr)})`]
  // A model-specific weekly meter is a sub-cap inside the all-models weekly
  // pool, so its real headroom is the smaller of the two.
  const allModels = rows.find(r => r[1] === 'week (all models)')
  const allLeft = allModels ? 100 - Number(allModels[2]) : undefined
  const lines = [`Claude ${label}`]
  for (const [, name = '', used = '0', reset = ''] of rows) {
    const left = 100 - Number(used)
    const isSubCap = name.startsWith('week (') && name !== 'week (all models)'
    const note = isSubCap && allLeft !== undefined ? `  (inside all-models: effectively ${Math.min(left, allLeft)}%)` : ''
    lines.push(`  ${name.padEnd(30)}${pct(left)} left  resets ${reset}${note}`)
  }
  if (allLeft !== undefined && allLeft <= 15) {
    lines.push(`  WARNING: all-models weekly pool at ${allLeft}%; hand work to another worker.`)
  }
  return lines
}

async function claudeWorkerStatus($: Engine, ctx: Ctx): Promise<Status> {
  const isThere = await $.fs.stat(ctx.workerDir).then(() => true, () => false)
  if (!isThere) return { state: 'missing', detail: [`no account folder at ${ctx.workerDir}`] }
  const out = await run($, ['claude', 'auth', 'status'], { CLAUDE_CONFIG_DIR: ctx.workerDir }, 30_000)
  try {
    const s = JSON.parse(out?.stdout ?? '')
    if (s.loggedIn) {
      const who = [s.email, s.orgName, s.subscriptionType].filter(Boolean).join(', ')
      return { state: 'ready', detail: [`signed in (${who}) at ${ctx.workerDir}`] }
    }
  } catch {}
  return { state: 'signed-out', detail: [`${ctx.workerDir} is not signed in`] }
}

function claudeWorkerUsage($: Engine, ctx: Ctx) {
  return claudeUsage($, 'second account', { CLAUDE_CONFIG_DIR: ctx.workerDir })
}

const claudeWorker: Worker = {
  id: 'claude-worker',
  name: 'Second Claude account',
  vendor: 'anthropic',
  runPattern: /CLAUDE_CONFIG_DIR=\S+\s+claude\s+-p\b/,
  strengths: 'Same Claude quality as this session on a separate meter: the stand-in for anything that needs Claude-level judgment when this account runs low.',
  isTested: true,
  setup: [
    'Optional. To add a second Claude account (say a work or team plan),',
    'run this in your own terminal and sign in with THAT account:',
    '  CLAUDE_CONFIG_DIR=<folder> claude auth login',
    'The folder is "Second Claude account folder" for ai-crew in /config.',
  ],
}

// ---- Codex ---------------------------------------------------------------

// codex app-server exits as soon as its stdin closes, before it answers, so
// the rate-limit read needs a client that keeps the pipe open: a few lines of
// Python, killed after 25 s at the latest.
const CODEX_RATE_LIMITS_PY = `
import json, subprocess, threading
msgs = [
    {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {"clientInfo": {"name": "ai-crew", "version": "1"}}},
    {"jsonrpc": "2.0", "method": "initialized"},
    {"jsonrpc": "2.0", "id": 2, "method": "account/rateLimits/read"},
]
p = subprocess.Popen(["codex", "app-server"], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                     stderr=subprocess.DEVNULL, text=True)
t = threading.Timer(25, p.kill)
t.daemon = True
t.start()
p.stdin.write("".join(json.dumps(m) + "\\n" for m in msgs))
p.stdin.flush()
try:
    for line in p.stdout:
        try:
            m = json.loads(line)
        except ValueError:
            continue
        if m.get("id") == 2:
            print(json.dumps(m))
            break
finally:
    p.kill()
`

async function codexStatus($: Engine): Promise<Status> {
  const v = await version($, 'codex')
  if (!v) return { state: 'missing', detail: ['not installed'] }
  const login = await run($, ['codex', 'login', 'status'], undefined, 15_000)
  const said = `${login?.stdout ?? ''}${login?.stderr ?? ''}`.trim()
  return login?.exitCode === 0 && /logged in/i.test(said)
    ? { state: 'ready', detail: [`${v}, ${firstLine(said)}`] }
    : { state: 'signed-out', detail: [`${v} is installed but not signed in`] }
}

async function codexUsage($: Engine): Promise<string[]> {
  const out = await run($, ['python3', '-c', CODEX_RATE_LIMITS_PY], undefined, 40_000)
  if (!out) return ['Codex: needs python3 and the codex command to read usage']
  let msg: any
  try {
    msg = JSON.parse(out.stdout.trim())
  } catch {
    return ['Codex: no answer from codex app-server (is Codex signed in?)']
  }
  if (msg.error) return [`Codex: ${JSON.stringify(msg.error).slice(0, 200)}`]
  const rl = msg.result?.rateLimits ?? {}
  const lines = [`Codex (ChatGPT ${rl.planType ?? '?'} plan)`]
  for (const key of ['primary', 'secondary']) {
    const b = rl[key]
    if (!b) continue
    const mins = b.windowDurationMins
    const name = mins === 300 ? '5-hour' : mins === 10080 ? 'weekly' : `${mins}-min`
    lines.push(`  ${name.padEnd(30)}${pct(100 - b.usedPercent)} left  ${resets(b.resetsAt)}`)
  }
  if (rl.rateLimitReachedType) lines.push(`  LIMIT REACHED: ${rl.rateLimitReachedType}`)
  return lines
}

const codex: Worker = {
  id: 'codex',
  name: 'Codex',
  vendor: 'openai',
  runPattern: new RegExp(at(String.raw`codex\s+(exec|review)\b`)),
  strengths: 'OpenAI GPT models. Strong at precise code edits, debugging and code review (has a built-in reviewer for uncommitted changes, a branch or a commit).',
  isTested: true,
  setup: [
    'Install: npm install -g @openai/codex   (or see https://developers.openai.com/codex/cli)',
    'Sign in, in your own terminal, with your own ChatGPT account: codex login',
  ],
}

// ---- Gemini (Antigravity) ------------------------------------------------

async function geminiQuota($: Engine) {
  const out = await run($, ['agy', '-p', '/quota', '--output-format', 'json'])
  if (!out) return { error: 'could not run the agy command' }
  try {
    const data = JSON.parse(out.stdout)
    if (data.status !== 'SUCCESS') return { error: String(data.error ?? data.status).slice(0, 200) }
    return { groups: (data.command?.data?.groups ?? []) as any[] }
  } catch {
    return { error: firstLine(out.stderr || out.stdout) || 'no answer' }
  }
}

async function geminiStatus($: Engine): Promise<Status> {
  const v = await version($, 'agy')
  if (!v) return { state: 'missing', detail: ['not installed'] }
  const quota = await geminiQuota($)
  return quota.groups
    ? { state: 'ready', detail: [`agy ${v}, signed in`] }
    : { state: 'signed-out', detail: [`agy ${v} did not answer (${quota.error})`] }
}

async function geminiUsage($: Engine): Promise<string[]> {
  const quota = await geminiQuota($)
  if (!quota.groups) return [`Gemini (Antigravity): ${quota.error}`]
  const lines = ['Gemini (Antigravity)']
  for (const g of quota.groups) {
    for (const b of g.buckets ?? []) {
      const label = `${g.name} ${b.window ?? ''}`.trim()
      lines.push(`  ${label.padEnd(30)}${pct(b.remaining_fraction * 100)} left  ${resets(b.reset_time)}`)
    }
  }
  return lines
}

const gemini: Worker = {
  id: 'gemini',
  name: 'Gemini (Antigravity)',
  vendor: 'google',
  runPattern: new RegExp(at(String.raw`agy\s+(-p|--print|--prompt)\b`)),
  strengths: 'Google Gemini models with a very large context: reading a whole repository or long documents at once, broad second opinions, research-style questions.',
  isTested: true,
  setup: [
    'Install the Antigravity CLI (agy) from https://antigravity.google',
    'Sign in: run `agy` once in your own terminal with your own Google account.',
  ],
}

// ---- GitHub Copilot CLI --------------------------------------------------

async function copilotStatus($: Engine): Promise<Status> {
  const v = await version($, 'copilot')
  if (!v) return { state: 'missing', detail: ['not installed'] }
  return { state: 'unverified', detail: [`${v} installed; the CLI has no sign-in check, so a first run will tell`] }
}

function copilotUsage(): string[] {
  return ['GitHub Copilot: premium requests are not reported to the CLI; see https://github.com/settings/copilot']
}

const copilot: Worker = {
  id: 'copilot',
  name: 'GitHub Copilot CLI',
  vendor: 'github',
  runPattern: new RegExp(at(String.raw`copilot\s+[^\n]*(-s?p|--prompt)\b`)),
  strengths: 'One GitHub Copilot plan reaching models from several vendors (pick with --model): a way to get a GPT, Claude or Gemini model on a separate meter.',
  isTested: false,
  setup: [
    'Install: npm install -g @github/copilot   (Node 22+; or brew install --cask copilot-cli)',
    'Sign in, in your own terminal, with your own GitHub account: copilot login',
  ],
}

// ---- Cursor CLI ----------------------------------------------------------

async function cursorBin($: Engine, ctx: Ctx) {
  if (await version($, 'cursor-agent')) return 'cursor-agent'
  // `agent` is a common name: count it only with Cursor's own folder beside it.
  const hasCursorDir = await $.fs.stat(`${ctx.home}/.cursor`).then(() => true, () => false)
  return hasCursorDir && (await version($, 'agent')) ? 'agent' : undefined
}

async function cursorStatus($: Engine, ctx: Ctx): Promise<Status> {
  const bin = await cursorBin($, ctx)
  if (!bin) return { state: 'missing', detail: ['not installed'] }
  const out = await run($, [bin, 'status'], undefined, 20_000)
  const said = firstLine(`${out?.stdout ?? ''}${out?.stderr ?? ''}`)
  if (out?.exitCode === 0 && !/not (logged|signed) in/i.test(said)) {
    return { state: 'ready', detail: [`\`${bin}\`: ${said}`] }
  }
  return { state: 'signed-out', detail: [`\`${bin}\` is installed but not signed in (${said})`] }
}

function cursorUsage(): string[] {
  return ['Cursor: usage is not reported to the CLI; see your dashboard at https://cursor.com']
}

const cursor: Worker = {
  id: 'cursor',
  name: 'Cursor CLI',
  vendor: 'cursor',
  runPattern: new RegExp(at(String.raw`(cursor-agent|agent)\s+[^\n]*(-p|--print)\b`)),
  strengths: 'A Cursor plan with several vendors\' models (--model): agentic edits across a codebase, read-only Q&A in ask/plan mode.',
  isTested: false,
  setup: [
    'Install: curl https://cursor.com/install -fsS | bash',
    'Sign in, in your own terminal, with your own Cursor account: agent login',
  ],
}

// ---- Qwen Code -----------------------------------------------------------

async function qwenStatus($: Engine): Promise<Status> {
  const v = await version($, 'qwen')
  if (!v) return { state: 'missing', detail: ['not installed'] }
  return { state: 'unverified', detail: [`${v} installed; the CLI has no sign-in check, so a first run will tell`] }
}

function qwenUsage(): string[] {
  return ['Qwen Code: usage depends on your plan or key; see its console']
}

const qwen: Worker = {
  id: 'qwen',
  name: 'Qwen Code',
  vendor: 'alibaba',
  runPattern: new RegExp(at(String.raw`qwen\s+[^\n]*(-p|--prompt)\b`)),
  strengths: 'Qwen coder models (or DeepSeek, Kimi and others through it): a low-cost worker for bulk or mechanical coding.',
  isTested: false,
  setup: [
    'Install: npm install -g @qwen-code/qwen-code@latest   (or brew install qwen-code)',
    'Sign in: run `qwen`, then /auth, with your own QwenCloud or Alibaba ModelStudio',
    'plan or API key (the free Qwen OAuth tier ended on 2026-04-15).',
  ],
}

// ---- Ollama --------------------------------------------------------------

async function ollamaStatus($: Engine): Promise<Status> {
  const v = await version($, 'ollama')
  if (!v) return { state: 'missing', detail: ['not installed'] }
  const list = await run($, ['ollama', 'list'], undefined, 15_000)
  if (!list || list.exitCode !== 0) {
    return { state: 'signed-out', detail: [`${v} installed but the server is not running (start it with \`ollama serve\`)`] }
  }
  const models = list.stdout.trim().split('\n').slice(1).map(l => l.split(/\s+/)[0]).filter(Boolean)
  return models.length > 0
    ? { state: 'ready', detail: [`${v}, models: ${models.slice(0, 8).join(', ')}`] }
    : { state: 'signed-out', detail: [`${v} running but no models pulled (ollama pull <model>)`] }
}

function ollamaUsage(): string[] {
  return ['Ollama: local models, no usage limits']
}

const ollama: Worker = {
  id: 'ollama',
  name: 'Ollama (local models)',
  vendor: 'local',
  runPattern: new RegExp(at(String.raw`ollama\s+(run|launch)\b`)),
  strengths: 'Models running on this machine: free, private, no usage limits, but weaker. Good for simple, bulk or private text tasks.',
  isTested: false,
  setup: [
    'Install from https://ollama.com/download, then pull a model: ollama pull <model>',
    'No account needed for local models.',
  ],
}

export const BUILT_IN: readonly Worker[] = [claudeWorker, codex, gemini, copilot, cursor, qwen, ollama]

// ---- custom workers ------------------------------------------------------

function escapeRe(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function customWorker(spec: CustomWorkerSpec): Worker {
  return {
    id: spec.id,
    name: spec.name ?? spec.id,
    vendor: spec.vendor ?? 'custom',
    runPattern: new RegExp(at(`${escapeRe(spec.command[0] ?? spec.id)}\\s`)),
    strengths: spec.strengths ?? 'A custom worker the user defined.',
    isTested: false,
    setup: [`Defined in the custom workers file as: ${spec.command.join(' ')}`],
    spec,
  }
}

async function customStatus($: Engine, spec: CustomWorkerSpec): Promise<Status> {
  const bin = spec.command[0] ?? spec.id
  const where = await run($, ['sh', '-c', 'command -v "$1"', 'sh', bin], undefined, 10_000)
  return where?.exitCode === 0
    ? { state: 'unverified', detail: [`\`${bin}\` found; sign-in is the tool's own`] }
    : { state: 'missing', detail: [`\`${bin}\` not found`] }
}

async function customUsage($: Engine, spec: CustomWorkerSpec) {
  if (!spec.usageCommand?.length) return [`${spec.name ?? spec.id}: no usage command defined`]
  const out = await run($, spec.usageCommand, undefined, 60_000)
  const text = (out?.stdout || out?.stderr || 'no output').trim().split('\n').slice(0, 12)
  return [spec.name ?? spec.id, ...text.map(l => `  ${l}`)]
}

export async function statusOf($: Engine, w: Worker, ctx: Ctx): Promise<Status> {
  switch (w.id) {
    case 'claude-worker': return claudeWorkerStatus($, ctx)
    case 'codex': return codexStatus($)
    case 'gemini': return geminiStatus($)
    case 'copilot': return copilotStatus($)
    case 'cursor': return cursorStatus($, ctx)
    case 'qwen': return qwenStatus($)
    case 'ollama': return ollamaStatus($)
  }
  return w.spec ? customStatus($, w.spec) : { state: 'missing', detail: ['unknown worker'] }
}

export async function usageOf($: Engine, w: Worker, ctx: Ctx): Promise<string[]> {
  switch (w.id) {
    case 'claude-worker': return claudeWorkerUsage($, ctx)
    case 'codex': return codexUsage($)
    case 'gemini': return geminiUsage($)
    case 'copilot': return copilotUsage()
    case 'cursor': return cursorUsage()
    case 'qwen': return qwenUsage()
    case 'ollama': return ollamaUsage()
  }
  return w.spec ? customUsage($, w.spec) : []
}

export async function loadCustomSpecs($: Engine, file: string): Promise<CustomWorkerSpec[]> {
  let text: string
  try {
    text = String(await $.fs.read(file))
  } catch {
    return []
  }
  try {
    const parsed = JSON.parse(text)
    const list = Array.isArray(parsed) ? parsed : parsed.workers
    return (Array.isArray(list) ? list : []).filter(
      (w: any) => typeof w?.id === 'string' && Array.isArray(w.command) && w.command.length > 0,
    )
  } catch {
    return []
  }
}

// Which workers are installed, from one quick shell run: what the system
// prompt lists, so Claude knows whom it can hand work to.
export async function detectInstalled($: Engine, ctx: Ctx, custom: readonly CustomWorkerSpec[]) {
  const bins = ['codex', 'agy', 'copilot', 'cursor-agent', 'qwen', 'ollama', ...custom.map(c => c.command[0] ?? '')]
  const script = 'for b in "$@"; do command -v "$b" >/dev/null 2>&1 && echo "$b"; done; [ -d "$HOME/.cursor" ] && command -v agent >/dev/null 2>&1 && echo agent; true'
  const out = await run($, ['sh', '-c', script, 'sh', ...bins], undefined, 10_000)
  const found = new Set((out?.stdout ?? '').split('\n').filter(Boolean))
  const hasWorkerDir = await $.fs.stat(ctx.workerDir).then(() => true, () => false)
  const ids: string[] = []
  if (hasWorkerDir) ids.push('claude-worker')
  if (found.has('codex')) ids.push('codex')
  if (found.has('agy')) ids.push('gemini')
  if (found.has('copilot')) ids.push('copilot')
  if (found.has('cursor-agent') || found.has('agent')) ids.push('cursor')
  if (found.has('qwen')) ids.push('qwen')
  if (found.has('ollama')) ids.push('ollama')
  for (const c of custom) if (found.has(c.command[0] ?? '')) ids.push(c.id)
  return ids
}
