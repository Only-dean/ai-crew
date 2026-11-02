// The inputs of the tools this mod registers, so its own tool.call hooks
// narrow `e` to them.
export {}
declare module 'claude-code' {
  interface McpToolInputs {
    'mcp__ai-crew__usage': {}
    'mcp__ai-crew__setup_check': {}
    'mcp__ai-crew__stats': { days?: number }
    'mcp__ai-crew__record_outcome': {
      worker: string
      kind: string
      verdict: 'good' | 'partial' | 'bad'
      note?: string
    }
  }
}
