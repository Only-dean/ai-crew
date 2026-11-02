# Codex (OpenAI Codex CLI): recipe

Sign-in: the user's own ChatGPT account (`codex login`, in their own terminal).

## Run

Run it in the foreground with a long Bash timeout (simple calls take 15-60s, real
work takes minutes). Send stdin from /dev/null, use `-o` to capture just the final
answer, and send the event log to a scratch file:

```bash
codex exec -C <working dir> -s <read-only|workspace-write> \
  --color never -o <scratch>/codex-last.txt \
  "<self-contained prompt>" < /dev/null > <scratch>/codex.log 2>&1
cat <scratch>/codex-last.txt
```

- Exit code 0 means success. On failure, read the tail of codex.log and report it verbatim.
- Outside a git repo, add `--skip-git-repo-check`.
- Add `--ephemeral` for one-shot questions that never need a follow-up.
- `-s read-only` reads files but can't write. `-s workspace-write` edits inside
  `-C`, and `--add-dir <DIR>` grants more writable dirs. Never pass
  `--dangerously-bypass-approvals-and-sandbox`, `--yolo` or `-s danger-full-access`
  unless the user asks for it.
- Leave out `-m` to use the user's default. `codex debug models` lists the others.
  Raise effort (`-c model_reasoning_effort='"high"'`) only when asked: it burns
  the 5-hour window faster.

## Follow-up

Get the session id with `grep -m1 'session id' <scratch>/codex.log | awk '{print $3}'`.
Run the follow-up from the same dir. `resume` defaults to workspace-write, so
re-pin read-only:

```bash
codex exec resume <session-id> -c sandbox_mode='"read-only"' \
  -o <scratch>/codex-last.txt "<follow-up>" < /dev/null > <scratch>/codex.log 2>&1
```

## Built-in code review

From inside the repo:

```bash
codex exec review --uncommitted -o <scratch>/codex-review.txt < /dev/null > <scratch>/codex.log 2>&1
# or: --base main   |   --commit <sha>
```

Codex only sees untracked new files once they're added with `git add -N <file>`.
