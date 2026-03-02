# Claude Agent SDK — Technical Reference

> Researched 2026-02-21 from https://platform.claude.com/docs/en/agent-sdk/overview

## Overview

The Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`) exposes the same agent loop, tools, and context management that power Claude Code as a programmable TypeScript library. Unlike the Anthropic Client SDK where you implement tool execution yourself, the Agent SDK lets Claude handle tools autonomously. (A Python SDK also exists but GameForge is TypeScript-only.)

Under the hood, the SDK spawns a Claude Code CLI process and communicates via JSON over stdio.

## Installation

```bash
npm install @anthropic-ai/claude-agent-sdk
```

Auth: `ANTHROPIC_API_KEY` environment variable.

## Core API — `query()`

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Find and fix bugs in auth.py",
  options: {
    allowedTools: ["Read", "Edit", "Bash"],
    permissionMode: "acceptEdits"
  }
})) {
  if (message.type === "result") console.log(message.result);
}
```

Returns an async generator streaming `SDKMessage` objects as the agent works.

## Built-in Tools

No implementation needed — these are provided by the runtime:
`Read`, `Write`, `Edit`, `Bash`, `Glob`, `Grep`, `WebSearch`, `WebFetch`, `Task` (subagents), `AskUserQuestion`, `TodoWrite`, `NotebookEdit`, `BashOutput`, `KillBash`

## Custom Tools (via MCP)

```typescript
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const server = createSdkMcpServer({
  name: "my-tools",
  tools: [
    tool("get_weather", "Get temperature", {
      latitude: z.number(),
      longitude: z.number()
    }, async (args) => {
      return { content: [{ type: "text", text: `Temp: 72F` }] };
    })
  ]
});
```

MCP tool naming convention: `mcp__{server_name}__{tool_name}`

## Subagents (Multi-Agent)

Define named agents with descriptions, prompts, specific tools, and optionally different models. Include `Task` in parent's `allowedTools`.

```typescript
agents: {
  "code-reviewer": {
    description: "Expert code reviewer for security.",
    prompt: "You are a code review specialist...",
    tools: ["Read", "Grep", "Glob"],
    model: "sonnet"
  },
  "test-runner": {
    description: "Runs and analyzes test suites.",
    prompt: "You are a test execution specialist...",
    tools: ["Bash", "Read", "Grep"]
  }
}
```

**Constraint:** Subagents CANNOT spawn their own subagents (one level deep only).

## Multi-Turn Sessions

Capture `session_id` from init message, pass as `resume` in subsequent calls. Sessions can be forked.

## Model Selection

- Full model IDs: `"claude-opus-4-6"`, `"claude-sonnet-4-5-20250514"`
- Subagent shorthand: `"sonnet" | "opus" | "haiku" | "inherit"`
- `fallbackModel` for resilience

## Permission Modes

`"default" | "acceptEdits" | "bypassPermissions" | "plan"`

## Key Types

- `Options` — full configuration (40+ properties)
- `Query` — async generator with `interrupt()`, `setModel()`, `rewindFiles()`
- `SDKMessage` — union of all message types
- `SDKResultMessage` — final result with cost, usage, structured output
- `AgentDefinition` — subagent configuration
- `PermissionMode` — permission level enum

## Implications for GameForge

- The orchestrator backend will use `query()` to drive agent execution
- Designer, Developer, and QA will be defined as subagents
- Custom game-specific tools (file ops scoped to session, Vite build, Playwright) will be MCP servers via `createSdkMcpServer()`
- The orchestrator manages session state and routes user messages to the appropriate agent
- Streaming messages from `query()` can be relayed to the frontend via WebSocket

## Reference Links

- [SDK Overview](https://platform.claude.com/docs/en/agent-sdk/overview)
- [TypeScript Reference](https://platform.claude.com/docs/en/agent-sdk/typescript)
- [Subagents](https://platform.claude.com/docs/en/agent-sdk/subagents)
- [Custom Tools](https://platform.claude.com/docs/en/agent-sdk/custom-tools)
- [GitHub](https://github.com/anthropics/claude-agent-sdk-typescript)
