# Custom workers: recipe

The user lists their own workers in the custom workers file (default
`~/.config/ai-crew/workers.json`):

```json
[
  {
    "id": "opencode",
    "name": "OpenCode",
    "vendor": "multi",
    "command": ["opencode", "run", "{prompt}"],
    "readOnlyArgs": ["--agent", "plan"],
    "editArgs": [],
    "usageCommand": ["opencode", "stats"],
    "strengths": "Reaches many providers (OpenRouter, DeepSeek, Mistral, Grok ...) through one CLI."
  }
]
```

## Run

Build the command from `command`: replace `{prompt}` with the prompt, then add
`readOnlyArgs` for questions and reviews, or `editArgs` for work the user wants
done. If neither is defined, ask the user before letting a custom worker change
files. Run it from the working dir, in the foreground, with a long Bash timeout and
stdin from /dev/null, and send stdout and stderr to scratch files.

Custom workers are untested by design. Read their output carefully, and if the
tool turns out to need other flags, tell the user so they can fix the file.
`/crew-setup` shows whether each command was found.
