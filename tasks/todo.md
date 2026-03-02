# GameForge - Task Tracking

## Phase 1 — Foundation (COMPLETE)

### Repo Housekeeping
- [x] Rename PRD to `docs/product_requirements_document.md`
- [x] Update workspace name to `@robcost/gameforge`
- [x] Add `apps/` directory for Next.js and Node.js applications
- [x] Add `apps/*` to npm workspaces in `package.json`
- [x] Update `tsconfig.base.json` custom conditions
- [x] Create `tasks/todo.md` and `tasks/lessons.md`
- [x] Update PRD to reflect npm (not pnpm) and packages/apps directory convention
- [x] Resolve open questions relevant to Phase 1

### Nx Monorepo Setup
- [x] Install Nx plugins: `@nx/next`, `@nx/node`, `@nx/react`, `@nx/vitest`, `@nx/vite` (all 22.5.1)
- [x] Configure `@nx/vitest` plugin in `nx.json`
- [x] Scaffold `packages/shared-types` — TypeScript interfaces from PRD (37 tests)
- [x] Scaffold `packages/game-templates` — Phaser platformer starter template (8 tests)

### Apps
- [x] Scaffold `apps/studio` — Next.js 16 frontend shell with two-panel layout (17 tests)
- [x] Scaffold `apps/orchestrator` — Express + WebSocket backend shell on port 4000 (7 tests)

### Infrastructure
- [x] Docker Compose setup with dev Dockerfiles for studio and orchestrator
- [x] `.env.example` with environment variables
- [x] WebSocket echo server in orchestrator (connectivity proves out in Phase 2)

### Final Verification
- [x] `npx nx run-many -t typecheck` — all projects pass
- [x] `npx nx run-many -t test` — 69 tests, all passing
- [x] `npx nx run-many -t build` — all 4 projects build successfully

---

## Phase 2 — Session & Preview (COMPLETE)

### Orchestrator Backend
- [x] Session Manager — in-memory session registry with state machine (17 tests)
- [x] Project Scaffolder — template copy + npm install (5 tests)
- [x] Vite Manager — per-session dev server lifecycle with port allocation (11 tests)
- [x] Wire HTTP routes — POST/GET sessions with SessionManager dependency (10 tests)
- [x] Wire WebSocket handler — real message routing replacing echo server (11 tests)
- [x] Wire main.ts — connect SessionManager, ViteManager, CORS, graceful shutdown

### Studio Frontend
- [x] Zustand session store — session state, messages, agent states, refresh counter (8 tests)
- [x] WebSocket hook — connection management, message routing to store (7 tests)
- [x] Update page.tsx — "New Game" button with fetch + navigate (server component + client button)
- [x] Update StudioLayout — wire useWebSocket + store, pass props to children (5 tests)
- [x] Update ChatPanel — props-driven with role-based message styling (8 tests)
- [x] Update GamePreview — refreshKey + reset button (6 tests)

### Infrastructure
- [x] Install `cors` + `@types/cors` in orchestrator
- [x] Add `NEXT_PUBLIC_ORCHESTRATOR_URL` and `NEXT_PUBLIC_ORCHESTRATOR_WS_URL` to env/docker
- [x] Fix `getTemplatePath` — resolve to `src/templates/` from both `src/lib/` and `dist/lib/`
- [x] Fix Next.js 16 build — NODE_ENV override for `/_global-error` prerender issue
- [x] Add `global-error.tsx` for proper error boundary

### Final Verification
- [x] `npx nx run-many -t typecheck` — all projects pass
- [x] `npx nx run-many -t test` — 136 tests, all passing
- [x] `npx nx run-many -t build` — all 4 projects build successfully

---

## Phase 3 — Agent Infrastructure (COMPLETE)

### Agent SDK Integration
- [x] Install `@anthropic-ai/claude-agent-sdk` in orchestrator
- [x] MCP Game Tool Server — `createGameToolServer()` with get/set GDD, get project structure, get session info (11 tests)
- [x] Designer system prompt — `buildDesignerPrompt()` with GDD structure, design guidelines
- [x] Developer system prompt — `buildDeveloperPrompt()` with Phaser 3 conventions, entity patterns
- [x] QA system prompt stub — `buildQAPrompt()` placeholder for Phase 6

### Team Orchestrator
- [x] `TeamOrchestrator` class — manual pipeline coordination (23 tests)
- [x] Sequential pipeline: Designer → Developer → (skip QA) → awaiting_feedback
- [x] Agent execution via SDK `query()` with role-specific prompts, tools, and MCP servers
- [x] Status callbacks streaming to WebSocket client
- [x] State machine transitions during pipeline execution
- [x] Error handling — agent errors, max turns, thrown exceptions

### WebSocket Wiring
- [x] Fire-and-forget dispatch from wsHandler to TeamOrchestrator
- [x] AgentCallbacks mapping to WebSocket messages

### Final Verification
- [x] `npx nx run-many -t typecheck` — all projects pass
- [x] `npx nx run-many -t test` — 88 orchestrator tests, all passing

---

## Phase 4 — Designer Agent (COMPLETE)

- [x] Designer system prompt with GDD structure specification
- [x] `set_design_document` MCP tool for GDD storage
- [x] `get_design_document` MCP tool for GDD retrieval
- [x] Chat integration — user describes game → Designer creates GDD → summary in chat
- [x] GDD update flow — feedback triggers iterating state → Designer updates GDD
- [x] Designer constrained to read-only tools + GDD management (no file writes)

---

## Phase 5 — Developer Agent (COMPLETE)

- [x] Developer system prompt with Phaser 3 coding conventions
- [x] GDD → code generation via SDK `query()` with Write/Edit/Glob/Grep tools
- [x] Mandatory reset key (R) in all generated games
- [x] Vite public directory convention in prompt constraints
- [x] Build error detection via Vite HMR (automatic)
- [x] End-to-end: GDD → working game code → preview updates in iframe
- [x] Output token limit fix — `CLAUDE_CODE_MAX_OUTPUT_TOKENS=65536`

### UX Polish
- [x] Markdown rendering in chat — `react-markdown` with dark-theme styled components
- [x] Agent working indicator — bouncing dots + "Designer/Developer is working..."
- [x] Code activity streaming — tool_use extraction piped to scrolling code preview
- [x] Disabled input during agent execution
- [x] Auto-scroll on new messages

### Final Verification
- [x] `npx nx run-many -t typecheck` — all projects pass
- [x] `npx nx run-many -t test` — 178 tests, all passing

---

## Phase 6 — QA Agent & Playwright (COMPLETE)

### Playwright MCP Tool Server
- [x] Install `playwright` in orchestrator + `npx playwright install chromium`
- [x] `createPlaywrightToolServer()` — 8 tools: navigate_to_game, take_screenshot, press_key, press_keys_sequence, wait, get_console_errors, evaluate_js, submit_qa_results
- [x] Lazy browser init (chromium.launch on first tool call), dispose() closes browser
- [x] Console error listener captures errors for `get_console_errors` tool
- [x] `onScreenshot` callback relays screenshots to WebSocket client (27 tests)

### QA Agent Integration
- [x] Rewrite `qaSystem.ts` — runtime testing prompt with 5 test scenarios (boot, movement, jump, collision, reset)
- [x] Add `onQAScreenshot` to `AgentCallbacks` interface
- [x] Expand `runAgent()` to support `'qa'` role with `'testing'` state, `QA_TOOLS` allowlist, dual MCP servers (game-tools + playwright)
- [x] Rewrite `runPipeline()` — Designer → Developer → QA with retry logic (max 1 retry)
- [x] QA pass/fail determined by `session.qaResults` from `submit_qa_results` tool
- [x] Playwright browser cleanup in `finally` block (dispose even on error)

### WebSocket + Frontend
- [x] Wire `onQAScreenshot` callback in wsHandler.ts
- [x] Handle `qa_screenshot` in `useWebSocket.ts` — renders as markdown image data URI
- [x] Add `img` renderer to `AgentMarkdown.tsx` for screenshot display in chat

### Final Verification
- [x] `npx nx run-many -t typecheck` — all projects pass
- [x] `npx nx run-many -t test` — 213 tests, all passing
- [x] `npx nx run-many -t build` — all 4 projects build successfully

## Phase 7 — Iteration Loop (COMPLETE)

### Conversation Context
- [x] `formatConversationContext()` — conversation history formatter with recent/summary sections (9 tests)
- [x] Inject conversation context into all agent prompts (Designer, Developer, QA)
- [x] Add "Conversation Context" section to all three system prompts
- [x] Record actual agent text output in conversation history (replaces generic `[role completed work]`)
- [x] Record QA pass/fail results in conversation history for iteration context

### Iteration Pipeline
- [x] Full pipeline: user concept → design → develop → test → feedback → iterate
- [x] Context management — deterministic summary of older turns, last 5 verbatim
- [x] State machine already supports: `awaiting_feedback → iterating → designing → ...`

### Error Recovery
- [x] Error state recovery — user sends message in error state → transitions to ready → reruns pipeline
- [x] Recovery notification message to user via `onAgentMessage`

### Frontend Robustness
- [x] WebSocket reconnection with exponential backoff (1s, 2s, 4s... max 30s, 10 attempts)
- [x] Connection status indicator (green=Connected, amber=Reconnecting, red=Disconnected)
- [x] `ConnectionState` type exported from `useWebSocket` hook

### Final Verification
- [x] `npx nx run-many -t typecheck` — all projects pass
- [x] `npx nx run-many -t test` — 241 tests, all passing
- [x] `npx nx run-many -t build` — verified via typecheck

---

## Phase 8 — Polish & Demo (COMPLETE)

### Session Resource Management
- [x] `DELETE /api/sessions/:id` endpoint — stops Vite, removes session, optional disk cleanup via `?cleanup=true`
- [x] `SessionManager.deleteSessionFiles()` — removes session directory from disk
- [x] `SessionManager.maxSessions` option — returns null from `createSession()` at limit (default: unlimited)
- [x] `SessionManager.sessionCount` getter
- [x] `ViteManager` LRU eviction — `maxConcurrent` option (default: 5), evicts oldest idle server at capacity
- [x] `ViteManager.touchSession()` — updates last-accessed timestamp on WebSocket activity
- [x] `ViteManager` idle timeout — periodic check stops servers idle > 30 minutes
- [x] `main.ts` — updated CORS (added DELETE), wired deps object to `createHttpRouter`
- [x] `wsHandler.ts` — touch Vite session on `session_resume` and `user_message`, handle null from `createSession`

### Session Persistence (infrastructure built in Phase 7)
- [x] `sessionPersistence.ts` — debounced writes, `session_resume` reconnection, `session_restore` message
- [x] Server restart recovery — `loadPersistedSessions()` on startup

### UI Polish
- [x] Preview fullscreen toggle button (Fullscreen API on preview container)
- [x] Session delete buttons on SessionTray and SessionList (with confirmation dialog)
- [x] Delete removes from API with disk cleanup, updates local list
- [x] Deleting current session navigates home

### Documentation
- [x] Updated README.md — architecture, quick start, environment variables, tech stack
- [x] Updated tasks/todo.md — Phase 8 completion

### Final Verification
- [x] `npx nx run-many -t typecheck` — all projects pass
- [x] `npx nx run-many -t test` — 437 tests (325 orchestrator + 112 studio), all passing

---

## Artist Agent — AI Asset Generation (COMPLETE)

### Google Gemini Imagen Integration
- [x] `AssetGenerator` class — Gemini Imagen API wrapper for sprite/asset generation
- [x] `assetToolServer.ts` — MCP tools: `generate_asset`, `get_asset_status`
- [x] Artist system prompt — `buildArtistPrompt()` with art direction, sprite conventions
- [x] Wire Artist into pipeline: Designer → **Artist** → Developer → QA
- [x] Conditional execution — only runs when GDD has `artDirection`
- [x] `generating_assets` session state + transitions
- [x] Frontend: asset generation progress messages in chat
- [x] Fix oversized sprites — constrain to 64x64 or style-appropriate sizes
- [x] Fix sprite contamination — isolated generation per asset, no multi-sprite sheets
- [x] Fix transparency — proper PNG alpha channel handling
- [x] All tests passing (256 orchestrator tests after fixes)

---

## Musician Agent — AI Music Generation (COMPLETE)

### Shared Types
- [x] `MusicDirection` interface (genre, mood, tempo, instruments, notes)
- [x] `AudioReference` interface (key, filename, durationSeconds, description)
- [x] Extended `AudioConfig` with `musicDirection` and `musicTrack` fields
- [x] Added `'musician'` to `AgentRole` type and `AGENT_ROLES` array
- [x] Added `'generating_music'` to `SessionState` with transitions
- [x] Added `MusicGenerationProgressPayload` to server messages

### Music Generator Service
- [x] `MusicGenerator` class — Google Lyria RealTime WebSocket API wrapper
- [x] PCM→WAV encoding — 44-byte RIFF header generator (no external audio libs)
- [x] `buildWeightedPrompts()` — constructs weighted prompts from MusicDirection
- [x] Stream duration configurable (default 30s), cost tracking
- [x] Unit tests for WAV header, prompt building, constructor defaults

### Music Tool Server
- [x] `createMusicToolServer()` — MCP tools for Musician agent
- [x] `generate_music` tool — calls MusicGenerator, updates GDD audio.musicTrack
- [x] `get_music_status` tool — returns current music track info
- [x] Tool server tests

### Musician Agent Prompt
- [x] `buildMusicianPrompt()` — workflow, genre→style mapping, tempo guidance
- [x] Prompt engineering tips for effective music generation
- [x] Prompt generation tests

### Pipeline Integration
- [x] Wired into `teamOrchestrator.ts` — Designer → Artist → **Musician** → Developer → QA
- [x] Conditional execution — only runs when GDD has `audio.musicDirection` AND API key present
- [x] Added `onMusicProgress` to `AgentCallbacks`
- [x] Updated Designer prompt with `musicDirection` fields in GDD spec
- [x] Updated Developer prompt with audio loading instructions (Phaser + Three.js)
- [x] Updated `main.ts` — MusicGenerator instantiation alongside AssetGenerator
- [x] Updated frontend — Musician label in ChatPanel, music progress in WebSocket handler

### Final Verification
- [x] `npx nx run-many -t typecheck` — all projects pass
- [x] `npx nx run-many -t test` — 436 tests (289 orchestrator + 42 shared-types + 105 studio)

---

## Agent Skills — Developer Best Practices (COMPLETE)

### Skill Packages
- [x] `phaser-development/SKILL.md` — Phaser 3 coding conventions, entity patterns, scene lifecycle
- [x] `phaser-development/references/PERFORMANCE.md` — Object pooling, texture atlases, render optimization
- [x] `phaser-development/references/ANIMATION.md` — Sprite sheets, tweens, timeline sequences
- [x] `phaser-development/references/PITFALLS.md` — Scene cleanup, timer leaks, physics gotchas
- [x] `threejs-development/SKILL.md` — Three.js patterns, scene graph, materials
- [x] `threejs-development/references/PERFORMANCE.md` — Geometry instancing, LOD, GPU culling
- [x] `threejs-development/references/PITFALLS.md` — Memory leaks, dispose patterns, animation gotchas
- [x] Skills loader with YAML frontmatter parsing (7 test suites)
- [x] Developer prompts reference Skill packages with "See Skills:" pointers

---

## Share Link Feature — Publish & Share Games Locally (COMPLETE)

### Shared Types
- [x] `publishedAt` and `publishedUrl` fields on `Session` interface
- [x] `publishedUrl` field on `SessionRestorePayload` for reconnect persistence

### Game Publisher Module
- [x] `buildGameProject()` — runs `npx vite build` in session project directory (5 tests)
- [x] Returns dist path on success, throws descriptive errors on failure

### HTTP Routes
- [x] `POST /api/sessions/:id/publish` — triggers Vite production build, returns shareable URL
- [x] `GET /games/:sessionId/*` — serves built static files with path traversal protection
- [x] `GET /games/:sessionId` — redirects to trailing slash
- [x] Injected `buildGameProject` dependency for testability (10 new tests)

### Backend Wiring
- [x] `SessionManager.createSession()` initializes `publishedAt: null`, `publishedUrl: null`
- [x] `sendSessionRestore()` includes `publishedUrl` in restore payload

### Frontend
- [x] `SessionState.publishedUrl` + `setPublishedUrl` action in Zustand store
- [x] `RestoreSessionData` includes `publishedUrl` for reconnect
- [x] WebSocket hook passes `publishedUrl` from `session_restore` to store
- [x] Share button in `GamePreview` toolbar (before publish / publishing / after publish states)
- [x] Copy button for shareable URL (uses `navigator.clipboard.writeText`)
- [x] `StudioLayout` wires `handlePublish` (POST to orchestrator) and passes props to GamePreview
- [x] 7 new frontend component tests

### Final Verification
- [x] `npx nx run-many -t typecheck` — all projects pass
- [x] `npx nx run-many -t test` — 515 tests (13 game-templates + 42 shared-types + 339 orchestrator + 121 studio), all passing
