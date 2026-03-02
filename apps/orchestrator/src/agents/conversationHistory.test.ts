import { describe, it, expect } from 'vitest';
import type { ConversationTurn } from '@robcost/shared-types';
import { formatConversationContext } from './conversationHistory.js';

/** Helper to create a ConversationTurn with defaults. */
function turn(
  role: ConversationTurn['role'],
  content: string,
  timestamp = Date.now()
): ConversationTurn {
  return { role, content, timestamp };
}

describe('formatConversationContext', () => {
  it('returns empty string for empty history', () => {
    expect(formatConversationContext([])).toBe('');
  });

  it('returns Recent Conversation only when turns <= maxRecentTurns', () => {
    const history: ConversationTurn[] = [
      turn('user', 'Make a platformer'),
      turn('designer', 'Created GDD with 2 levels'),
    ];

    const result = formatConversationContext(history, 5);

    expect(result).toContain('## Recent Conversation');
    expect(result).not.toContain('## Previous Context');
    expect(result).toContain('[User]: Make a platformer');
    expect(result).toContain('[Designer]: Created GDD with 2 levels');
  });

  it('returns both sections when turns > maxRecentTurns', () => {
    const history: ConversationTurn[] = [
      turn('user', 'Make a platformer'),
      turn('designer', 'Created GDD'),
      turn('developer', 'Implemented the game'),
      turn('user', 'Add double jump'),
      turn('designer', 'Updated GDD with double jump'),
      turn('developer', 'Added double jump code'),
      turn('qa', 'All tests passed'),
    ];

    const result = formatConversationContext(history, 3);

    expect(result).toContain('## Previous Context (summarized)');
    expect(result).toContain('## Recent Conversation');
    // Older turns appear as bullet summary
    expect(result).toContain('- [User] Make a platformer');
    expect(result).toContain('- [Designer] Created GDD');
    expect(result).toContain('- [Developer] Implemented the game');
    expect(result).toContain('- [User] Add double jump');
    // Recent turns appear verbatim
    expect(result).toContain('[Designer]: Updated GDD with double jump');
    expect(result).toContain('[Developer]: Added double jump code');
    expect(result).toContain('[QA]: All tests passed');
  });

  it('uses default maxRecentTurns of 5', () => {
    const history: ConversationTurn[] = [
      turn('user', 'Turn 1'),
      turn('designer', 'Turn 2'),
      turn('developer', 'Turn 3'),
      turn('qa', 'Turn 4'),
      turn('user', 'Turn 5'),
      turn('designer', 'Turn 6'),
      turn('developer', 'Turn 7'),
    ];

    const result = formatConversationContext(history);

    // 7 turns > default 5 → should have summary section
    expect(result).toContain('## Previous Context (summarized)');
    // First 2 turns in summary
    expect(result).toContain('- [User] Turn 1');
    expect(result).toContain('- [Designer] Turn 2');
    // Last 5 turns in recent
    expect(result).toContain('[Developer]: Turn 3');
    expect(result).toContain('[QA]: Turn 4');
    expect(result).toContain('[User]: Turn 5');
    expect(result).toContain('[Designer]: Turn 6');
    expect(result).toContain('[Developer]: Turn 7');
  });

  it('truncates long content in summary section', () => {
    const longContent = 'A'.repeat(300);
    const history: ConversationTurn[] = [
      turn('user', longContent),
      turn('designer', 'Short'),
      turn('developer', 'Recent 1'),
    ];

    const result = formatConversationContext(history, 2);

    // Summary should have truncated content (200 chars max)
    expect(result).toContain('## Previous Context');
    // Should end with ...
    expect(result).toMatch(/A{197}\.\.\./);
  });

  it('truncates long content in recent section', () => {
    const longContent = 'B'.repeat(600);
    const history: ConversationTurn[] = [
      turn('user', longContent),
    ];

    const result = formatConversationContext(history, 5);

    // Recent should have truncated content (500 chars max)
    expect(result).toContain('[User]:');
    expect(result).toMatch(/B{497}\.\.\./);
  });

  it('labels all role types correctly', () => {
    const history: ConversationTurn[] = [
      turn('user', 'User message'),
      turn('designer', 'Designer message'),
      turn('developer', 'Developer message'),
      turn('qa', 'QA message'),
      turn('orchestrator', 'System message'),
    ];

    const result = formatConversationContext(history);

    expect(result).toContain('[User]: User message');
    expect(result).toContain('[Designer]: Designer message');
    expect(result).toContain('[Developer]: Developer message');
    expect(result).toContain('[QA]: QA message');
    expect(result).toContain('[System]: System message');
  });

  it('handles content with newlines by collapsing them in summary', () => {
    const history: ConversationTurn[] = [
      turn('user', 'Line 1\nLine 2\nLine 3'),
      turn('designer', 'Response'),
      turn('developer', 'Recent turn'),
    ];

    const result = formatConversationContext(history, 2);

    // In summary, newlines should be replaced with spaces
    expect(result).toContain('- [User] Line 1 Line 2 Line 3');
  });

  it('trims whitespace from content', () => {
    const history: ConversationTurn[] = [
      turn('user', '  padded message  '),
    ];

    const result = formatConversationContext(history);

    expect(result).toContain('[User]: padded message');
  });
});
