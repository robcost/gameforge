/**
 * Orchestrator entry point — wires Express, WebSocket, and all runtime services.
 *
 * @remarks
 * Creates the HTTP server with CORS-enabled REST routes and a WebSocket
 * handler for real-time studio communication. Manages graceful shutdown
 * of Vite dev server processes on SIGTERM/SIGINT.
 *
 * @packageDocumentation
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { resolve } from 'node:path';
import { createHttpRouter } from './server/httpRoutes.js';
import { attachWebSocketHandler } from './server/wsHandler.js';
import { SessionManager } from './sessions/sessionManager.js';
import { ViteManager } from './vite/viteManager.js';
import { scaffoldProject } from './sessions/projectScaffolder.js';
import { TeamOrchestrator } from './agents/teamOrchestrator.js';
import { AssetGenerator } from './assets/assetGenerator.js';
import { MusicGenerator } from './music/musicGenerator.js';

const host = process.env.HOST ?? 'localhost';
const port = process.env.ORCHESTRATOR_PORT
  ? Number(process.env.ORCHESTRATOR_PORT)
  : 4000;

// Create runtime service instances
const sessionsDir = resolve(process.cwd(), 'sessions');
const sessionManager = new SessionManager({ persistenceDir: sessionsDir });
const viteManager = new ViteManager();

// Restore persisted sessions from disk
const restoredCount = sessionManager.loadPersistedSessions();
if (restoredCount > 0) {
  console.log(`[ orchestrator ] restored ${restoredCount} session(s) from disk`);
}
// Create asset and music generators if Google AI API key is configured
const googleApiKey = process.env['GOOGLE_AI_API_KEY'];
const assetGenerator = googleApiKey ? new AssetGenerator(googleApiKey) : null;
const musicGenerator = googleApiKey ? new MusicGenerator(googleApiKey) : null;
if (googleApiKey) {
  console.log('[ orchestrator ] Google AI asset generation enabled');
  console.log('[ orchestrator ] Google Lyria music generation enabled');
}

const teamOrchestrator = new TeamOrchestrator({ sessionManager, viteManager, assetGenerator, musicGenerator });

// Set up Express with CORS for the studio frontend
const app = express();
app.use(
  cors({
    origin: [
      'http://localhost:4001',
      'http://127.0.0.1:4001',
      `http://localhost:${port}`,
    ],
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    credentials: true,
  })
);
app.use(createHttpRouter({ sessionManager, viteManager }));

// Create HTTP server and attach WebSocket handler
const server = createServer(app);
attachWebSocketHandler(server, {
  sessionManager,
  viteManager,
  scaffoldProject,
  teamOrchestrator,
});

// Start listening
server.listen(port, host, () => {
  console.log(`[ orchestrator ] http://${host}:${port}`);
});

// Graceful shutdown — flush session state, then stop Vite dev servers
function shutdown() {
  console.log('[ orchestrator ] shutting down...');
  sessionManager.flushAll();
  viteManager.stopAll();
  server.close(() => {
    console.log('[ orchestrator ] stopped');
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { app, server };
