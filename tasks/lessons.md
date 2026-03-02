# GameForge - Lessons Learned

This file tracks learnings from issues, failures, and corrections encountered during development.

---

## 2026-02-21: TypeScript-only project — no Python references

**Issue:** Research docs included Python SDK references even though GameForge is strictly TypeScript-only.

**Rule:** When saving research from official docs that cover multiple languages, strip all non-TypeScript content before saving to project docs. GameForge is TypeScript everywhere — no Python, no exceptions.

---

## 2026-02-21: `import.meta.url` resolves differently in dist/ vs src/

**Issue:** `getTemplatePath` in game-templates used `import.meta.url` to resolve `../templates/` relative to the current file. This works from `src/lib/templates.ts` but breaks when Nx builds the package to `dist/lib/templates.js` (since `dist/templates/` doesn't exist — templates stay in `src/templates/`).

**Root Cause:** Nx `test` target has `dependsOn: ["^build"]`, so dependency packages are compiled to `dist/` before consumer tests run. The built JS uses `dist/` paths.

**Fix:** Resolve up to the package root (2 levels from either `src/lib/` or `dist/lib/`) then always reference `src/templates/`. This is stable because template assets live in source, not in the compiled output.

**Rule:** When using `import.meta.url` or `import.meta.dirname` for asset path resolution in Nx workspace packages, always resolve relative to the package root rather than the current file's sibling directories. Assets that aren't compiled by tsc will only exist under `src/`.

---

## 2026-02-21: `import.meta.dirname` not available in CJS esbuild output

**Issue:** The orchestrator uses `@nx/esbuild:esbuild` with `format: ["cjs"]`. TypeScript's `import.meta.dirname` is ESM-only and fails tsc checking when the output format is CJS (`TS1470: 'import.meta' meta-property is not allowed in files which will build into CommonJS output`).

**Fix:** Use `process.cwd()` instead. The orchestrator always runs from the workspace root via `nx serve`, so `process.cwd()` reliably returns the monorepo root.

**Rule:** For Nx apps built with esbuild CJS format, avoid `import.meta.dirname`/`import.meta.url`. Use `process.cwd()` when the app always runs from the workspace root, or use `__dirname` (available in CJS).

---

## 2026-02-21: Next.js 16 + Nx build fails on `/_global-error` prerender

**Issue:** `next build` fails with `TypeError: Cannot read properties of null (reading 'useContext')` during prerendering of the internal `/_global-error` page. This is a known Next.js 16 bug triggered by non-standard `NODE_ENV` values during build.

**Root Cause:** `.env.local` had `NODE_ENV=development` which overrides Next.js's internal `NODE_ENV=production` during builds. Next.js 16's `/_global-error` prerender fails when NODE_ENV is not `production`.

**Fix:** Set `NODE_ENV=production` via the Nx build target `env` option in `apps/studio/package.json`. Also added a fallback in `next.config.js` that normalizes NODE_ENV.

**Rule:** Never set `NODE_ENV` in `.env` or `.env.local` files — let Next.js manage it automatically (`development` for dev, `production` for build). If Nx or other tooling overrides it, use the target's `env` option to force `production` during builds. See https://github.com/vercel/next.js/issues/87719.

---

## 2026-02-21: Claude model IDs — use short names, not dated suffixes

**Issue:** Used `claude-sonnet-4-5-20250514` as the default model in TeamOrchestrator. This model ID doesn't exist or isn't accessible, causing "model not found" errors at runtime.

**Root Cause:** Research docs referenced outdated/incorrect model IDs with date suffixes. The actual model IDs are short: `claude-sonnet-4-6`, `claude-opus-4-6`, `claude-haiku-4-5-20251001`.

**Fix:** Changed default model from `claude-sonnet-4-5-20250514` to `claude-sonnet-4-6`.

**Rule:** Always use the canonical short model IDs: `claude-opus-4-6`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`. Do not guess dated suffixes. Verify model IDs against the system context or official API docs before hardcoding.

---

## 2026-02-24: Vite `public/` directory path convention

**Issue:** Template `index.html` referenced `href="/public/style.css"` which caused a Vite warning: "Files in the public directory are served at the root path. Instead of /public/style.css, use /style.css."

**Root Cause:** Vite serves files from `public/` at the web root — `public/style.css` is accessible as `/style.css`, not `/public/style.css`.

**Fix:** Changed the template's `index.html` to use `href="/style.css"`. Added a constraint to the developer agent prompt about this convention.

**Rule:** In Vite projects, files in the `public/` directory are served at root. Always reference them without the `/public/` prefix (e.g., `/style.css` not `/public/style.css`).

---

## 2026-02-24: Claude Agent SDK stream events use `thinking_delta`, not `text_delta`

**Issue:** Streaming handler checked for `content_block.type === 'text'` and `delta.type === 'text_delta'` but the model was generating `thinking` content blocks with `thinking_delta` events (extended thinking). All 1600+ stream events fell through silently, leaving the UI stuck on "Thinking...".

**Root Cause:** Claude models with extended thinking enabled emit `content_block_start` with `type: 'thinking'` and `content_block_delta` with `delta: { type: 'thinking_delta', thinking: '...' }` instead of `text` / `text_delta`. This applies to Haiku 4.5, Sonnet 4.6, and Opus 4.6 when thinking is active.

**Fix:** Handle both `'text'` and `'thinking'` content block types at start, and extract text from either `delta.text` (text_delta) or `delta.thinking` (thinking_delta) during deltas.

**Rule:** When processing Claude Agent SDK `stream_event` messages, always handle both `text` and `thinking` content block types. The thinking blocks contain the model's reasoning and are the primary content during agentic tool use. Use diagnostic logging (`JSON.stringify` on first event of each type) when stream events don't behave as expected.

---

## 2026-02-26: Google Lyria RealTime API requires `apiVersion: 'v1alpha'`

**Issue:** The Lyria RealTime music generation API (`models/lyria-realtime-exp`) is only available through the v1alpha API version in the `@google/genai` SDK.

**Fix:** Pass `apiVersion: 'v1alpha'` when constructing the `GoogleGenAI` client:
```typescript
new GoogleGenAI({ apiKey, apiVersion: 'v1alpha' })
```

**Rule:** When using experimental Google AI features (Lyria music, etc.), always check which API version they require. Lyria needs `v1alpha`. The default API version won't expose `client.live.music`.

---

## 2026-02-26: WAV encoding from raw PCM — no external libraries needed

**Issue:** Lyria streams raw 16-bit PCM at 48kHz stereo. Needed to save as playable WAV files.

**Solution:** WAV format is trivially simple — a 44-byte RIFF header followed by raw PCM data. Wrote a `createWavHeader()` function instead of adding ffmpeg or audio library dependencies.

**Rule:** When dealing with raw PCM audio data, WAV encoding is a ~20 line function (44-byte header). Don't reach for external audio libraries unless you need actual audio processing (resampling, effects, format conversion).

---

## 2026-02-26: Claude Agent Skills are static SKILL.md files — not for dynamic agents

**Issue:** Considered using Claude Agent Skills for the Musician agent. After research, found they're filesystem-based instructional packages (SKILL.md files) designed for progressive disclosure — not executable code.

**Assessment:** Our architecture uses dynamic, session-scoped prompts + MCP tool servers that inject runtime context (session ID, GDD state, project path). Skills can't do this — they're static instruction sets discovered at startup.

**Rule:** Claude Agent Skills are for adding domain knowledge to general-purpose agents (like Claude Code). For purpose-built agent systems with dynamic context injection and custom MCP tools, continue using our programmatic prompt + tool server pattern.
