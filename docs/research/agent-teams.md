# Anthropic Agent Teams — Technical Reference

> Researched 2026-02-21 from https://code.claude.com/docs/en/agent-teams

## Summary

Agent Teams is a **Claude Code CLI feature** (not the Agent SDK) for running multiple Claude Code instances as a coordinated team. One session is the "lead" that spawns "teammates", each being a fully independent Claude Code session.

## Status: Experimental

Disabled by default. Requires `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`.

## Why NOT Suitable for GameForge Production

1. **Not programmatically controllable** — it's an interactive CLI feature, not an embeddable SDK
2. **Experimental with known issues** — task status lag, no session resumption, slow shutdown
3. **Cannot be embedded in a web application** — requires terminal/tmux environment

## Useful Concepts to Port to Our Implementation

Despite not being directly usable, Agent Teams validates architectural patterns we should implement ourselves:

- **Named role-based agents** with focused responsibilities
- **Shared task lists** with dependency ordering (pending → in progress → completed)
- **Inter-agent messaging** for context sharing
- **Quality gate hooks** (TaskCompleted, TeammateIdle) to enforce standards
- **File-based coordination** — the filesystem as shared state

## Architecture (for reference)

| Component | Role |
|-----------|------|
| Team Lead | Creates team, spawns teammates, coordinates work |
| Teammates | Independent Claude Code sessions working on assigned tasks |
| Task List | Shared file-based work items with dependency tracking |
| Mailbox | Inter-agent messaging system |

## Key Limitations

- Teammates don't inherit the lead's conversation history
- One team per session, no nested teams
- ~7x token cost vs standard sessions
- No per-teammate permission modes at spawn time
- No session resumption for teammates

## Decision

Use the **Agent SDK subagent pattern** for GameForge production. Build our own orchestration layer inspired by Agent Teams' concepts.
