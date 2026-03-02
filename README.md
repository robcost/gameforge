# GameForge - Agentic Game Creator

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js 20+](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)

AI-powered game creation platform. Describe your game in plain English, watch an AI agent team build it collaboratively with live preview. Supports 2D games with Phaser 3 and 3D games with Three.js.

**GameForge is a learning repo** — it demonstrates how to build a multi-agent AI pipeline using the [Claude Agent SDK](https://docs.anthropic.com/en/docs/agents-and-tools/claude-agent-sdk) and [Google Gemini](https://ai.google.dev/) (Nano Banana for sprites, Lyria for music) to orchestrate a team of specialized AI agents that collaborate to produce working Phaser 3 (2D) and Three.js (3D) games.

## What You Can Learn

- **Claude Agent SDK patterns** — programmatic agent control, subagents, structured tool use
- **MCP tool servers** — building custom Model Context Protocol tools for agent capabilities
- **Multi-agent orchestration** — designing pipelines where agents hand off work to each other
- **Google Gemini Nano Banana** — generating game sprites and backgrounds from text descriptions
- **Google Lyria** — composing background music via the RealTime WebSocket API
- **Phaser 3 + Three.js game development** — scaffolding, code generation, and live preview for 2D and 3D games
- **Full-stack TypeScript** — Nx monorepo, Next.js, Express, WebSocket, Zustand

## How the AI Agent Pipeline Works

When a user describes a game in the chat, the orchestrator runs a sequential pipeline of specialized agents:

```
User Message
    │
    ▼
┌─────────────┐     Creates a Game Design Document (GDD)
│  Designer    │     with mechanics, art direction, and audio specs
└──────┬──────┘
       │
       ▼
┌─────────────┐     Generates sprites and backgrounds via
│  Artist      │     Google Gemini Nano Banana (runs if GDD has artDirection)
└──────┬──────┘
       │
       ▼
┌─────────────┐     Composes background music via Google Lyria
│  Musician    │     RealTime API (runs if GDD has musicDirection)
└──────┬──────┘
       │
       ▼
┌─────────────┐     Writes Phaser 3 or Three.js TypeScript code
│  Developer   │     using the GDD and generated assets via MCP file tools
└──────┬──────┘
       │
       ▼
┌─────────────┐     Launches the game in Playwright, captures
│  QA          │     screenshots, reports bugs back to the user
└──────┬──────┘
       │
       ▼
  User Feedback → loops back to Designer for iteration
```

Each agent uses the Claude Agent SDK with custom MCP tool servers. The orchestrator manages conversation context so agents can see prior work and iterate based on QA feedback.

## Key Files to Study

| File | What It Demonstrates |
|---|---|
| [`apps/orchestrator/src/agents/teamOrchestrator.ts`](apps/orchestrator/src/agents/teamOrchestrator.ts) | Pipeline orchestration — how agents are sequenced and handed context |
| [`apps/orchestrator/src/tools/gameToolServer.ts`](apps/orchestrator/src/tools/gameToolServer.ts) | MCP tool server — custom file tools that agents use to read/write game code |
| [`apps/orchestrator/src/agents/prompts/`](apps/orchestrator/src/agents/prompts/) | Agent system prompts — how each agent role is defined |
| [`apps/orchestrator/src/assets/assetGenerator.ts`](apps/orchestrator/src/assets/assetGenerator.ts) | Gemini Nano Banana integration — text-to-image generation for game sprites |
| [`apps/orchestrator/src/music/musicGenerator.ts`](apps/orchestrator/src/music/musicGenerator.ts) | Lyria RealTime API — WebSocket streaming for music composition |
| [`apps/orchestrator/src/tools/assetToolServer.ts`](apps/orchestrator/src/tools/assetToolServer.ts) | MCP tools for asset generation — `generate_asset`, `get_asset_status` |
| [`apps/orchestrator/src/tools/musicToolServer.ts`](apps/orchestrator/src/tools/musicToolServer.ts) | MCP tools for music generation — `generate_music`, `get_music_status` |
| [`docs/research/`](docs/research/) | API research notes — Claude Agent SDK, Gemini Nano Banana, Lyria, Phaser, Three.js |

## Architecture

```
apps/
  studio/          Next.js 16 frontend (port 4001) — chat + game preview
  orchestrator/    Express + WebSocket backend (port 4000) — AI agent pipeline

packages/
  shared-types/    TypeScript types shared across apps (messages, sessions, agents)
  game-templates/  Phaser 3 and Three.js starter templates for scaffolding

sessions/          Runtime game project data per session (gitignored)
```

## Quick Start

### Prerequisites

- Node.js 20+
- npm 10+
- An `ANTHROPIC_API_KEY` for Claude (required)
- A `GOOGLE_AI_API_KEY` for asset/music generation (optional)

### Setup

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env.local
# Edit .env.local and set ANTHROPIC_API_KEY (and optionally GOOGLE_AI_API_KEY)

# Build shared packages
npx nx run-many -t build --projects=shared-types,game-templates
```

### Development

Run the orchestrator and studio in separate terminals:

```bash
# Terminal 1 — Orchestrator backend
npx nx serve orchestrator

# Terminal 2 — Studio frontend
npx nx dev studio
```

Then open http://localhost:4001 in your browser.

### Docker

```bash
# Start all services
docker-compose up

# Start with E2E test runner
docker-compose --profile e2e up
```

Health checks are configured for both services. The studio waits for the orchestrator to be healthy before starting.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes | Claude API key for the AI agent pipeline |
| `GOOGLE_AI_API_KEY` | No | Google AI API key — enables Artist (Nano Banana) and Musician (Lyria) agents |
| `ORCHESTRATOR_PORT` | No | Orchestrator HTTP/WS port (default: 4000) |
| `STUDIO_PORT` | No | Studio frontend port (default: 4001) |
| `NEXT_PUBLIC_ORCHESTRATOR_URL` | No | Studio → orchestrator REST URL (default: http://localhost:4000) |
| `NEXT_PUBLIC_ORCHESTRATOR_WS_URL` | No | Studio → orchestrator WebSocket URL (default: ws://localhost:4000) |

## Testing

Tests are mandatory for all code. Run them with:

```bash
# All tests
npx nx run-many -t test

# Single project
npx nx test studio
npx nx test orchestrator
npx nx test shared-types
npx nx test game-templates

# Type checking
npx nx run-many -t typecheck
```

## Building

```bash
# Build all projects
npx nx run-many -t build

# Build specific project
npx nx build orchestrator

# View the project dependency graph
npx nx graph
```

## Tech Stack

- **Frontend:** Next.js 16 (App Router), Tailwind CSS, Zustand
- **Backend:** Node.js, Express, WebSocket (ws), esbuild
- **Game Engines:** Phaser 3 (2D), Three.js (3D)
- **AI:** Claude Agent SDK (TypeScript), Claude Opus
- **Asset Generation:** Google Gemini Nano Banana (sprites, backgrounds)
- **Music Generation:** Google Lyria RealTime API (background music)
- **Build:** Nx monorepo, Vite (game projects)
- **Testing:** Vitest (unit/integration), Playwright (QA + E2E)

## Documentation

- [`docs/research/`](docs/research/) — API research notes on Claude Agent SDK, Gemini Nano Banana, Lyria, Phaser 3, Three.js
- [`docs/demo-walkthrough.md`](docs/demo-walkthrough.md) — Step-by-step walkthrough of a demo session

## Build Journey

This project was built iteratively in phases. See [`tasks/todo.md`](tasks/todo.md) for the full phase-by-phase development log, and [`tasks/lessons.md`](tasks/lessons.md) for lessons learned during the build.

## License

[MIT](LICENSE)
