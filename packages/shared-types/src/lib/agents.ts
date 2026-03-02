/**
 * Agent role and status type definitions for the GameForge agent team.
 *
 * @remarks
 * The agent team follows a designer → developer → QA pipeline.
 * The orchestrator coordinates handoffs between agents and presents
 * a unified conversational experience to the user.
 *
 * @packageDocumentation
 */

/** Roles available in the agent team. */
export type AgentRole = 'designer' | 'artist' | 'musician' | 'developer' | 'qa' | 'orchestrator';

/** All valid agent roles as a readonly array for runtime validation. */
export const AGENT_ROLES: readonly AgentRole[] = [
  'designer',
  'artist',
  'musician',
  'developer',
  'qa',
  'orchestrator',
] as const;

/** Current operational status of an agent. */
export type AgentStatus = 'idle' | 'thinking' | 'working' | 'done' | 'error';

/** All valid agent statuses as a readonly array for runtime validation. */
export const AGENT_STATUSES: readonly AgentStatus[] = [
  'idle',
  'thinking',
  'working',
  'done',
  'error',
] as const;

/**
 * Snapshot of each agent's current status within a session.
 *
 * @remarks
 * Used by the orchestrator to track which agents are active and
 * relay status information to the frontend.
 */
export type AgentStates = Record<AgentRole, AgentStatus>;

/**
 * Creates a default AgentStates object with all agents idle.
 *
 * @returns An AgentStates record with every role set to 'idle'.
 */
export function createDefaultAgentStates(): AgentStates {
  return {
    designer: 'idle',
    artist: 'idle',
    musician: 'idle',
    developer: 'idle',
    qa: 'idle',
    orchestrator: 'idle',
  };
}

/**
 * Type guard that checks if a string is a valid {@link AgentRole}.
 *
 * @param value - The string to check.
 * @returns `true` if the value is a valid AgentRole.
 */
export function isAgentRole(value: string): value is AgentRole {
  return (AGENT_ROLES as readonly string[]).includes(value);
}

/**
 * Type guard that checks if a string is a valid {@link AgentStatus}.
 *
 * @param value - The string to check.
 * @returns `true` if the value is a valid AgentStatus.
 */
export function isAgentStatus(value: string): value is AgentStatus {
  return (AGENT_STATUSES as readonly string[]).includes(value);
}
