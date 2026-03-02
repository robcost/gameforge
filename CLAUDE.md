<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

# GameForge Project Context

GameForge is an AI-powered game creation platform. Circle 1 MVP is a locally-run builder where users chat with an AI agent team (Designer, Developer, QA) to collaboratively build Phaser 2D games with live preview.

## Key Documents
- **PRD:** `docs/product_requirements_document.md`
- **Task Tracking:** `tasks/todo.md`
- **Lessons Learned:** `tasks/lessons.md`

## Monorepo Structure
- `apps/` — Next.js and Node.js applications (studio frontend, orchestrator backend)
- `packages/` — Shared libraries consumed by apps (shared-types, game-templates)
- `sessions/` — Runtime game project data per session (gitignored)

## Tech Decisions
- **Package manager:** npm (with workspaces)
- **Workspace scope:** `@robcost/gameforge`
- **Language:** TypeScript everywhere
- **Frontend:** Next.js 15 (App Router), Tailwind CSS, Zustand
- **Backend:** Node.js, Express, WebSocket (ws)
- **Game engine:** Phaser 3 (Circle 1), Three.js (Circle 2)
- **AI:** Claude Agent SDK (TypeScript), Claude Opus
- **Build:** Vite (for game projects), Nx (for monorepo)
- **Testing:** Vitest (unit/integration), Playwright (QA agent game testing + E2E)
- **AI SDK:** `@anthropic-ai/claude-agent-sdk` (NOT Agent Teams — see `docs/research/agent-teams.md`)
- **Research docs:** `docs/research/` — always check latest official docs before assuming API shapes

## Testing Requirements

Tests are mandatory. No code is complete without passing tests.

- **Unit tests** for all packages in `packages/` using Vitest
- **Integration tests** for backend API routes and WebSocket handlers
- **Component tests** for React components using Vitest + React Testing Library
- **E2E tests** for critical user flows using Playwright
- **All tests must pass** before any task is marked complete
- **Run tests via Nx:** `npm exec nx test <project>` or `npm exec nx run-many -t test`
- **New code = new tests.** Every new module, function, or component gets corresponding test coverage
- **Test files** live alongside source: `foo.ts` → `foo.test.ts` (or `foo.spec.ts`)

## Documentation-First Rules

- Always check the latest official documentation before assuming how an API or library works
- For Anthropic SDK: https://platform.claude.com/docs/en/agent-sdk/overview
- For Nx plugins: check `node_modules/@nx/<plugin>/PLUGIN.md`
- For any npm package: check type definitions in `node_modules/<pkg>/*.d.ts`
- Research docs are saved in `docs/research/` for reference across sessions
