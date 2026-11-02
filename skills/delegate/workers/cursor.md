# Cursor CLI: recipe (untested)

Sign-in: the user's own Cursor account (`agent login`, in their own terminal).
The binary is `agent` (older installs: `cursor-agent`); `/crew-setup` says which
one it found. Written from Cursor's docs, so expect to adjust on the first real
run.

## Run

Run it in the foreground with a long Bash timeout and stdin from /dev/null. Users
have reported print mode hanging, so let the Bash timeout catch it, and report a
hang as a failure.

Read-only (questions, reviews):
```bash
agent -p "<self-contained prompt>" --mode ask --trust --workspace <working dir> \
  --output-format json < /dev/null > <scratch>/cursor.json 2> <scratch>/cursor.err
```

Edits (only for work the user wants done): replace `--mode ask` with `--force`.
Without `--force`, print mode only proposes changes.

- The JSON is one object: the answer is in `result`, the session in `session_id`,
  and `is_error` flags failure. On failure there is no JSON, only stderr.
- `--model <model>` picks a model, and `agent models` lists them.
- Follow-up: `--resume <session_id>`.
- Usage isn't readable from the CLI. The user checks their Cursor dashboard.
