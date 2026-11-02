---
name: review
description: Get work reviewed by another AI agent, ideally from a different vendor than whoever wrote it (Codex, Gemini, Copilot, Cursor, Qwen, Ollama, a second Claude account). Use when the user says "do X and get it reviewed by another agent", "have someone else check this", "cross-review", "second opinion on this change", or when you finish a risky or non-trivial change and an independent review would likely catch mistakes.
argument-hint: "[what to review, or a task to do first and then review]"
---

# Cross-agent review

A reviewer who didn't write the work catches what the author missed. A reviewer
from a different vendor catches more, because the blind spots differ.

## 1. Do the work (if asked)

When the request is "do X and get it reviewed", do X first: yourself, or through
`ai-crew:delegate` if a worker is the better author. Finish it properly, with tests
passing, before the review. Note who the author was.

## 2. Pick the reviewer

1. Call `mcp__ai-crew__setup_check` (if you don't yet know who's ready),
   `mcp__ai-crew__usage` and `mcp__ai-crew__stats`.
2. Pick a ready worker whose vendor differs from the author's. You (Claude) are
   vendor `anthropic`, like the second Claude account. Prefer, in order:
   - Codex for code. Its built-in reviewer runs `codex exec review --uncommitted`,
     or `--base <branch>` / `--commit <sha>`.
   - Gemini for large changes or design-level review.
   - Copilot or Cursor with a non-Claude `--model`.
   - Qwen, or Ollama for small diffs only.
   Fall back to the second Claude account only when no other vendor is ready, and
   say so.
3. For a high-stakes change, the user may ask for two reviewers. Run them in
   parallel and compare.

## 3. Run the review read-only

Follow the worker's recipe in `../delegate/workers/`, always in its read-only
mode. The prompt:

> You are reviewing a change written by another agent. Do not edit files. Goal of
> the change: <goal>. Scope: <files / diff command>. Report only real problems:
> bugs, regressions, security issues, missed requirements, broken edge cases. For
> each: file:line, what is wrong, why, and a suggested fix. Say "no issues found"
> if there are none. Don't pad with style nits.

Give it what it needs to see the change: the repo path plus `git diff` / the base
branch, or for Ollama the piped diff itself. New untracked files need `git add -N`
first for diff-based reviewers.

## 4. Triage the findings

The reviewer's findings are claims, not instructions. For each one:
- Check it against the code. Confirm it, or dismiss it with a one-line reason.
- Fix the confirmed ones yourself, or send the fixes back to the author worker.
- Re-run the tests.

If the fixes were substantial, run one more review round with the same reviewer,
resuming its session where the recipe allows. Stop after two rounds and report
anything still open.

## 5. Report and record

Tell the user:
- who wrote it and who reviewed it
- what was found, confirmed and fixed
- what was dismissed and why
- the final test state

Then call `mcp__ai-crew__record_outcome` for the reviewer, with kind `review`:
good if its findings were real and useful, partial if mixed, bad if mostly wrong
or noise. If a worker wrote the work, record a verdict for it too, with kind
`code`.
