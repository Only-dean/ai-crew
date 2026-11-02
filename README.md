# ai-crew

A [Claude Code](https://claude.com/claude-code) mod that makes Claude the
controller of a crew of other AI agents. Claude hands them tasks, missions and
reviews, checks their work, and learns which worker does well at what. It also
shows how much usage every account has left.

> **Bring your own accounts.** This mod contains no accounts, keys or logins.
> Every worker runs on the accounts *you* sign in to on your own computer, and
> its usage counts against your own plans. The mod only calls the tools you
> install. It never reads or copies their credential files.

---

## Getting started

### Step 1: Install the mod

In a Claude Code terminal session, type:

```
/plugin install ai-crew --marketplace Only-dean/ai-crew
```

Answer `y` to add the marketplace, then press Enter to install for your user.

<details>
<summary>Other ways to install</summary>

From a shell:

```
claude plugin install ai-crew --marketplace Only-dean/ai-crew
```

In the Claude desktop app (where `/plugin` doesn't run): click **+** next to
the prompt box, then **Plugins**, then **Add marketplace** with
`Only-dean/ai-crew`, then **Add plugin**.

</details>

### Step 2: Install and sign in to the workers you want

You need **at least one**, and you can pick any mix. Run these in your **own
terminal**, not through Claude, because the sign-ins open a browser:

| Worker | Install | Sign in with **your** account |
|---|---|---|
| **Codex** (OpenAI) | `npm install -g @openai/codex` | `codex login` with your ChatGPT account |
| **Gemini** (Google) | Antigravity CLI from [antigravity.google](https://antigravity.google) | run `agy` once, sign in with Google |
| **GitHub Copilot** | `npm install -g @github/copilot` (Node 22+) | `copilot login` with your GitHub account |
| **Cursor** | `curl https://cursor.com/install -fsS \| bash` | `agent login` with your Cursor account |
| **Qwen Code** | `npm install -g @qwen-code/qwen-code@latest` | run `qwen`, then `/auth` (needs a QwenCloud/ModelStudio plan or API key; the free tier ended 2026-04-15) |
| **Ollama** (local, free) | [ollama.com/download](https://ollama.com/download), then `ollama pull <model>` | no account needed |
| **A second Claude account** (e.g. work) | nothing extra | `CLAUDE_CONFIG_DIR=~/.claude-worker claude auth login`, signing in with the **other** account |

The second Claude account lives in its own folder (`~/.claude-worker` by
default). To use a different folder, change "Second Claude account folder" for
ai-crew in `/config`.

### Step 3: Check your setup

Start a new Claude Code session and type:

```
/crew-setup
```

Every worker you set up should show `[ready]`, or `[found]` for tools whose
sign-in can't be checked from outside. Anything else comes with the exact
steps to fix it. Run `/crew-setup` again after fixing.

### Step 4: Use it

Just ask in plain words:

- "Fix the failing test and get it reviewed by another agent."
- "Ask Codex why this function leaks memory."
- "Get a second opinion from Gemini on this design."
- "Split this migration across agents."
- "Which worker has the most usage left?"

Claude also decides by itself when a worker helps: an independent review of a
risky change, parallel subtasks, or your Claude usage running low. It tells
you when it does. Small tasks it keeps.

**Requirements:** macOS or Linux, Claude Code, and `python3` (used to read
Codex's usage).

---

## What's inside

| | |
|---|---|
| `/crew-setup` | Which workers are installed and signed in, with sign-in steps for anything missing |
| `/crew-usage` | Remaining usage for Claude and every installed worker |
| `/crew-stats` | Each worker's track record: runs, failures, median time, verdicts per kind of task |
| Skill `ai-crew:delegate` | How Claude picks a worker, writes the prompt, runs it, verifies and records |
| Skill `ai-crew:review` | Cross-vendor review: the reviewer comes from a different company than the author |
| Tools `usage`, `setup_check`, `stats`, `record_outcome` | What Claude calls to choose workers and learn from results |

**Tested status:** Codex, Gemini and the second Claude account are tested end
to end. The Copilot, Cursor, Qwen and Ollama recipes follow those tools'
documentation and show as "untested" in `/crew-setup`. If one needs different
flags, please [open an issue](https://github.com/Only-dean/ai-crew/issues).

## Adding your own workers

Any CLI that takes a prompt can be a worker. List them in
`~/.config/ai-crew/workers.json` (the path can be changed in `/config`). This
example shows the format; check your tool's own flags:

```json
[
  {
    "id": "opencode",
    "name": "OpenCode",
    "vendor": "multi",
    "command": ["opencode", "run", "{prompt}"],
    "readOnlyArgs": [],
    "editArgs": [],
    "usageCommand": ["opencode", "stats"],
    "strengths": "Many providers (OpenRouter, DeepSeek, Mistral, Grok ...) through one CLI."
  }
]
```

`command` is required, and `{prompt}` marks where the prompt goes. Claude adds
`readOnlyArgs` for questions and reviews and `editArgs` for changes, and asks
you before letting a custom worker edit files when neither is given. New
workers show up in `/crew-setup` at once, and in Claude's worker list from the
next session.

## How delegation stays safe

- **Claude is the only controller.** Workers are told not to delegate further.
  A Claude worker runs with `AI_CREW_ROLE=worker` and a deny-list that blocks
  every worker CLI and these skills, with its memory writes off.
- **Read-only by default.** Codex runs `read-only`, Gemini `plan`, Cursor
  `ask`, Qwen `plan`, and Copilot without write or shell tools, unless you
  asked for changes.
- **Foreground runs.** Worker runs stay in the foreground so their results get
  checked. The mod refuses background runs, except the supervised
  second-Claude form.
- **Verified results.** Claude treats worker output as untrusted: it checks
  diffs and re-runs tests before telling you what happened, and records a
  verdict that later choices learn from.

## Uninstall

```
/plugin uninstall ai-crew@ai-crew
```

Your worker CLIs and their sign-ins are untouched. Remove them with each
tool's own uninstall and logout commands.

## License

[MIT](LICENSE)
