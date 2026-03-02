# GameForge Demo Walkthrough

Step-by-step guide for demonstrating GameForge Circle 1 MVP.

## Prerequisites

1. Orchestrator running on port 4000
2. Studio running on port 4001
3. Valid `ANTHROPIC_API_KEY` set in `.env.local`

## Demo Script

### 1. Landing Page

Open http://localhost:4001. You'll see the GameForge landing page with:
- Hero section with title and description
- "New Game" button
- Session list (empty on first visit, populated after creating sessions)

### 2. Create a New Session

Click **New Game**. This:
- Creates a session via `POST /api/sessions`
- Navigates to `/studio/{sessionId}`
- Shows the two-panel studio layout: Chat (left 40%) + Preview (right 60%)

### 3. Describe Your Game

Type a game description in the chat input:

> "Create a simple platformer game with a blue square character that can jump between platforms. Add coins to collect and a score counter."

Press **Send**. Watch the agent pipeline:
1. **Orchestrator** status changes to "working"
2. **Designer** creates a Game Design Document
3. **Developer** writes Phaser code (you'll see live code activity streaming)
4. Preview panel shows a loading spinner during scaffolding
5. Game appears in the preview iframe when Vite is ready
6. **QA** tests the game with Playwright, captures screenshots

### 4. Review QA Results

After the pipeline completes:
- QA screenshots appear inline in the chat
- QA agent reports test results and observations
- Session enters "awaiting_feedback" state
- Chat input re-enables for your response

### 5. Iterate

Send a follow-up message to refine the game:

> "Make the character red instead of blue, and add a double-jump ability"

The pipeline runs again with your feedback, updating the game in-place.

### 6. Session Persistence

Demonstrate persistence:
- **Page refresh**: Refresh the browser. Chat history, agent states, and preview all restore automatically.
- **Server restart**: Stop the orchestrator, restart it. Navigate back to the session URL. The session loads from disk, Vite restarts, and the preview comes back.

### 7. Session List

Navigate back to http://localhost:4001. The landing page now shows your session(s) with:
- Genre label
- Status badge (green for ready/awaiting_feedback, amber for working, red for error)
- Message count
- Relative time (e.g., "2m ago")

Click a session card to resume it.

### 8. Connection Resilience

Demonstrate WebSocket reconnection:
- While in the studio, stop the orchestrator briefly
- The connection indicator turns amber ("Reconnecting...")
- Chat input disables with "Reconnecting to server..." placeholder
- Restart the orchestrator
- Connection auto-reconnects, indicator turns green
- Chat input re-enables

### 9. Error Handling

Demonstrate error feedback:
- Stop the orchestrator
- On the landing page, click "New Game"
- An error message appears below the button (e.g., "Failed to fetch")
- Start the orchestrator again
- Click "New Game" again — error clears and session creates successfully

## Key Technical Points

- **AI Agent Pipeline**: Designer -> Developer -> QA, orchestrated via Claude Agent SDK
- **Real-time Updates**: WebSocket pushes agent status, messages, code activity, and screenshots
- **File Persistence**: Sessions saved as `sessions/{id}/session.json`, debounced writes, sync flush on shutdown
- **Live Preview**: Each session gets its own Vite dev server, embedded via iframe with sandbox
- **Iteration Loop**: QA results feed back to the pipeline for continuous improvement
