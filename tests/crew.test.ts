import { expect, mock, test } from 'claude-code/testing'

const ok = () => ({ result: { stdout: '', stderr: '', interrupted: false } }) as any

test('worker runs stay in the foreground; other commands pass', async ($, on) => {
  mock.store(on)
  mock.env(on, { HOME: '/nowhere' })
  on('tool.call', { tool: 'Bash' }, ok)

  const bg = await $.tool.call({ tool: 'Bash', command: 'cd /x && agy -p "hi"', run_in_background: true })
  expect(bg.deny).toContain('foreground')
  const bgCopilot = await $.tool.call({ tool: 'Bash', command: 'copilot -s -p "hi" --no-ask-user', run_in_background: true })
  expect(bgCopilot.deny).toContain('foreground')

  const fg = await $.tool.call({ tool: 'Bash', command: 'codex exec -C . -s read-only "hi" < /dev/null' })
  expect(fg.deny).toBeUndefined()
  const other = await $.tool.call({ tool: 'Bash', command: 'npm test', run_in_background: true })
  expect(other.deny).toBeUndefined()
  const version = await $.tool.call({ tool: 'Bash', command: 'codex --version', run_in_background: true })
  expect(version.deny).toBeUndefined()
})

test('runs are timed and verdicts show in the stats', async ($, on) => {
  mock.store(on)
  mock.env(on, { HOME: '/nowhere' })
  on('tool.call', { tool: 'Bash' }, ok)

  await $.tool.call({ tool: 'Bash', command: 'codex exec -s read-only "review" < /dev/null' })
  await $.tool.call({ tool: 'mcp__ai-crew__record_outcome', worker: 'codex', kind: 'review', verdict: 'good', note: 'found a real off-by-one' })
  const stats = await $.tool.call({ tool: 'mcp__ai-crew__stats' })
  const text = String(stats.result)
  expect(text).toContain('Codex: 1 runs, 0 failed')
  expect(text).toContain('review     good 1, partial 0, bad 0')
  expect(text).toContain('off-by-one')
})

test('a worker session cannot delegate further', async ($, on) => {
  mock.store(on)
  mock.env(on, { HOME: '/nowhere', AI_CREW_ROLE: 'worker' })
  on('tool.call', { tool: 'Bash' }, ok)

  const nested = await $.tool.call({ tool: 'Bash', command: 'codex exec "hi"' })
  expect(nested.deny).toContain('worker session')
  const second = await $.tool.call({ tool: 'Bash', command: 'CLAUDE_CONFIG_DIR=/w claude -p "hi"' })
  expect(second.deny).toContain('worker session')
  const plain = await $.tool.call({ tool: 'Bash', command: 'ls' })
  expect(plain.deny).toBeUndefined()
})
