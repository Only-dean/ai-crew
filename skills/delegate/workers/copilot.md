# GitHub Copilot CLI: recipe (untested)

Sign-in: the user's own GitHub account with a Copilot plan (`copilot login`, in
their own terminal). Written from GitHub's docs, so expect to adjust flags on the
first real run. Tell the user if something differs, and record the outcome.

## Run

Run it in the foreground with a long Bash timeout, sending stdin from /dev/null.
`-s` prints only the answer, and `--no-ask-user` stops it waiting for input.

Read-only (questions, reviews):
```bash
cd <working dir> && copilot -s -p "<self-contained prompt>" --no-ask-user \
  --deny-tool='write, shell' < /dev/null > <scratch>/copilot.txt 2> <scratch>/copilot.err
```

Edits (only for work the user wants done):
```bash
cd <working dir> && copilot -s -p "<self-contained prompt>" --no-ask-user \
  --allow-tool='write, shell(git:*), shell(npm test)' < /dev/null > <scratch>/copilot.txt 2> <scratch>/copilot.err
```

- In a non-interactive run, Copilot denies any tool it needs approval for unless a
  flag allows it. Grant narrowly with `shell(<cmd>)` patterns. Use `--allow-all` /
  `--yolo` only if the user asks.
- `--model=<model>` picks among the plan's models (GPT, Claude, Gemini). That's
  useful for reaching a vendor whose own account is low. Leave it out for the
  default.
- `--output-format=json` gives JSONL instead of text.
- `--continue` picks up the latest session for a follow-up.
- Usage: premium requests aren't readable from the CLI. The user checks
  https://github.com/settings/copilot.
