# Qwen Code: recipe (untested)

Sign-in: the user's own QwenCloud or Alibaba ModelStudio plan or API key, set up
by running `qwen` and then `/auth` in their own terminal. The free Qwen OAuth tier
ended on 2026-04-15. Qwen Code can also point at DeepSeek, Kimi, OpenRouter and
others. Written from Qwen's docs, so expect to adjust on the first real run.

## Run

Run it in the foreground with a long Bash timeout and stdin from /dev/null:

```bash
cd <working dir> && qwen -p "<self-contained prompt>" --approval-mode plan \
  --output-format json < /dev/null > <scratch>/qwen.json 2> <scratch>/qwen.err
python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); r=d[-1]; print("error:",r.get("is_error"),"session:",r.get("session_id")); print(r.get("result"))' <scratch>/qwen.json
```

- `--approval-mode plan` is read-only. `auto-edit` applies edits but still needs
  approval for shell. `yolo` approves everything, so use it only if the user asks.
- The JSON is an array of messages, and the last one (`type: "result"`) holds
  `result` and `session_id`.
- `--model <model>` (e.g. a qwen3-coder model) picks the model.
- Follow-up: `qwen --resume <session_id> -p "..."` from the same dir.
