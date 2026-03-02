/**
 * Conversation history formatter for agent prompt injection.
 *
 * @remarks
 * Formats `ConversationTurn[]` into a structured string that can be
 * prepended to agent prompts, giving them context from prior turns.
 * Recent turns are included verbatim; older turns are compressed into
 * a concise bullet-point summary. This is a deterministic formatter
 * (no AI call) — fast and predictable.
 *
 * @packageDocumentation
 */

import type { ConversationTurn } from '@robcost/shared-types';

/** Maximum characters per turn in the summary section. */
const SUMMARY_TRUNCATE_LENGTH = 200;

/** Maximum characters per turn in the recent section. */
const RECENT_TRUNCATE_LENGTH = 500;

/** Default number of recent turns to include verbatim. */
const DEFAULT_MAX_RECENT_TURNS = 5;

/**
 * Maps a conversation role to a human-readable label for prompt display.
 *
 * @param role - The role from a ConversationTurn.
 * @returns A bracketed label string (e.g. '[User]', '[Designer]').
 */
function roleLabel(role: ConversationTurn['role']): string {
  switch (role) {
    case 'user':
      return '[User]';
    case 'designer':
      return '[Designer]';
    case 'artist':
      return '[Artist]';
    case 'developer':
      return '[Developer]';
    case 'qa':
      return '[QA]';
    case 'orchestrator':
      return '[System]';
    default:
      return `[${role}]`;
  }
}

/**
 * Truncates a string to a maximum length, appending '...' if truncated.
 *
 * @param text - The string to truncate.
 * @param maxLength - Maximum allowed length.
 * @returns The original or truncated string.
 */
function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength - 3) + '...';
}

/**
 * Compresses older conversation turns into a concise bullet-point summary.
 *
 * @param turns - The turns to summarise (those beyond the recent window).
 * @returns A formatted summary string with one bullet per turn.
 */
function summarizeOlderTurns(turns: ConversationTurn[]): string {
  return turns
    .map((turn) => {
      const label = roleLabel(turn.role);
      const content = truncate(turn.content.replace(/\n/g, ' ').trim(), SUMMARY_TRUNCATE_LENGTH);
      return `- ${label} ${content}`;
    })
    .join('\n');
}

/**
 * Formats conversation history for injection into agent prompts.
 *
 * @remarks
 * When history has more turns than `maxRecentTurns`, older turns are
 * compressed into a "Previous Context" summary section, and the most
 * recent turns are shown verbatim in a "Recent Conversation" section.
 * Returns an empty string when history is empty (first turn).
 *
 * @param history - The full conversation history from the session.
 * @param maxRecentTurns - How many recent turns to include verbatim (default 5).
 * @returns A formatted context string, or empty string if no history.
 */
export function formatConversationContext(
  history: ConversationTurn[],
  maxRecentTurns: number = DEFAULT_MAX_RECENT_TURNS
): string {
  if (history.length === 0) return '';

  const sections: string[] = [];

  if (history.length > maxRecentTurns) {
    // Split into older (summarised) and recent (verbatim)
    const olderTurns = history.slice(0, history.length - maxRecentTurns);
    const recentTurns = history.slice(-maxRecentTurns);

    sections.push(`## Previous Context (summarized)\n${summarizeOlderTurns(olderTurns)}`);
    sections.push(`## Recent Conversation\n${formatRecentTurns(recentTurns)}`);
  } else {
    // All turns fit in the recent window
    sections.push(`## Recent Conversation\n${formatRecentTurns(history)}`);
  }

  return sections.join('\n\n');
}

/**
 * Formats recent turns as verbatim conversation entries.
 *
 * @param turns - The recent turns to format.
 * @returns A formatted string with one entry per turn.
 */
function formatRecentTurns(turns: ConversationTurn[]): string {
  return turns
    .map((turn) => {
      const label = roleLabel(turn.role);
      const content = truncate(turn.content.trim(), RECENT_TRUNCATE_LENGTH);
      return `${label}: ${content}`;
    })
    .join('\n');
}
