# Ollama (local models): recipe (untested)

No account: the models run on this machine, free and private, with no usage
limits. They're weaker and slower than the hosted workers, so give them simple,
bulk or privacy-sensitive work. `/crew-setup` lists the pulled models.

## Text in, text out (no file access)

`ollama run` answers once and exits. Whatever is piped in rides along with the
prompt, so pass it the content to work on:

```bash
git diff | ollama run <model> "Review this diff for bugs. List each issue with file and line." \
  > <scratch>/ollama.txt 2> <scratch>/ollama.err
```

The model can't read files itself. Give it everything it needs in the pipe, and
keep it inside the model's context window.

## Agentic (reads and edits files)

`ollama launch` runs Claude Code itself on a local model, so file work goes through
a known agent. Mark it as a worker and deny delegation, just like the
second-account recipe:

```bash
cd <working dir> && AI_CREW_ROLE=worker ollama launch claude --model <model> --yes -- \
  -p "<self-contained prompt>" --output-format json \
  --settings '{"autoMemoryEnabled":false,"permissions":{"deny":["Skill(ai-crew:delegate)","Skill(ai-crew:review)","Bash(codex:*)","Bash(agy:*)","Bash(copilot:*)","Bash(cursor-agent:*)","Bash(agent:*)","Bash(qwen:*)","Bash(ollama:*)","Bash(claude:*)"]}}' \
  < /dev/null > <scratch>/ollama.json 2> <scratch>/ollama.err
```

This needs a model with a large context (64k+ tokens) to work well.
