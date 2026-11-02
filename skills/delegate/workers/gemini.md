# Gemini (Antigravity CLI `agy`): recipe

Sign-in: the user's own Google account (they run `agy` once in their own terminal).
The older `gemini` CLI's free personal tier is shut off, so use `agy`.

## Run

Run it in the foreground with a long Bash timeout (10-60s plus startup). Send
stdin from /dev/null.

```bash
cd <working dir> && agy -p "<self-contained prompt>" \
  --mode <plan|accept-edits> \
  --output-format json --print-timeout 600s < /dev/null
```

- The output is one JSON line with `status` ("SUCCESS" expected), `response` and
  `conversation_id`. Report failures verbatim.
- `--mode plan` is read-only. `--mode accept-edits` edits files AND runs shell
  commands without asking, so use it only for work the user wants done. Never pass
  `--dangerously-skip-permissions` unless the user asks for it.
- Leave out `--model` to use the default. `agy models` lists the others.
- Follow-up: `agy -p "<follow-up>" --conversation <conversation_id> --output-format json ... < /dev/null`

## Known failure: recitation filter

`status: "ERROR"` saying the output "resembles existing copyrighted works" is
Google's recitation filter. Asking Gemini to quote public text verbatim triggers
it, so ask for a summary in its own words. It's not a setup problem.

## Usage

Some model families have a smaller weekly bucket of their own. When it's low,
pick a model that draws on another bucket.
