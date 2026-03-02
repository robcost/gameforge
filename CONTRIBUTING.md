# Contributing to GameForge

GameForge is primarily a learning repo showcasing AI agent patterns with the Claude Agent SDK and Google Gemini. Contributions are welcome — especially bug fixes, documentation improvements, and additional research notes.

## Getting Started

1. Fork and clone the repo
2. Install dependencies: `npm install`
3. Copy env config: `cp .env.example .env.local` and add your API keys
4. Build shared packages: `npx nx run-many -t build --projects=shared-types,game-templates`
5. Run tests: `npx nx run-many -t test`

## Project Structure

```
apps/
  studio/          Next.js frontend (chat + game preview)
  orchestrator/    Express backend (AI agent pipeline)

packages/
  shared-types/    TypeScript types shared across apps
  game-templates/  Phaser 3 starter templates
```

## Development Rules

- **Tests are mandatory.** Every new module, function, or component gets corresponding test coverage. All tests must pass before any change is considered complete.
- **TypeScript everywhere.** Use TSDoc comments on all public APIs.
- **Run via Nx.** Use `npx nx test <project>`, `npx nx build <project>`, etc. — not the underlying tooling directly.

## Running Tests

```bash
# All tests
npx nx run-many -t test

# Single project
npx nx test orchestrator

# Type checking
npx nx run-many -t typecheck
```

## Pull Requests

- Keep changes focused and minimal
- Include tests for any new functionality
- Ensure all existing tests still pass
- Describe what you changed and why in the PR description
