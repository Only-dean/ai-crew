# Second Claude account: recipe

A worker is a separate `claude -p` run with `CLAUDE_CONFIG_DIR` set to the user's
second Claude account. The folder is in `$AI_CREW_CLAUDE_WORKER_DIR`, which the mod
sets. That run bills only the second account. Sign-in, in the user's own terminal,
with that account: `CLAUDE_CONFIG_DIR=<folder> claude auth login`.

The worker has the plugins, skills and settings the user installed under that
account. If it has ai-crew too, `AI_CREW_ROLE=worker` stops it from delegating.

## Run

Run it from the project directory. Always pass `AI_CREW_ROLE=worker` and the
inline `--settings` below: together they stop the worker from delegating further
and from writing memory.

```bash
cd <project dir> && AI_CREW_ROLE=worker CLAUDE_CONFIG_DIR="$AI_CREW_CLAUDE_WORKER_DIR" claude -p "<self-contained prompt>" \
  --model opus \
  --settings '{"autoMemoryEnabled":false,"permissions":{"deny":["Skill(ai-crew:delegate)","Skill(ai-crew:review)","Bash(codex:*)","Bash(agy:*)","Bash(copilot:*)","Bash(cursor-agent:*)","Bash(agent:*)","Bash(qwen:*)","Bash(ollama:*)","Bash(claude:*)","Bash(*CLAUDE_CONFIG_DIR*)"]}}' \
  --output-format json < /dev/null > <scratch>/worker.json 2> <scratch>/worker.err
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print("error:",d["is_error"],"session:",d["session_id"],"denials:",d.get("permission_denials")); print(d["result"])' <scratch>/worker.json
```

- Use `opus` by default and `sonnet` for bulk, mechanical work.
- Run it in the foreground with a long Bash timeout (600000 ms at most), and size
  each task to finish in under ~9 minutes. For a genuinely longer task, use Bash
  `run_in_background: true` with the same command and wait for the exit
  notification. Never poll it.
- `permission_denials` lists anything the worker was blocked from. Report those.
- For a follow-up, run from the SAME directory and add `--resume <session_id>`.
- A model-specific weekly meter ("week (<model>)") is a sub-cap inside the
  all-models pool. When all-models is low, move the work to another account or
  worker, not to another model on the same account.
