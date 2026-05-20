import { buildSnapshotLabel, VERSION_SOURCE_PRE_SUGGESTION } from './pre-suggestion-snapshot.types';

describe('buildSnapshotLabel', () => {
  it('formats the label with a named skill', () => {
    expect(buildSnapshotLabel('Grammar Expert')).toBe('Before: Grammar Expert suggestion');
  });

  it('formats the label with the fallback AI name', () => {
    expect(buildSnapshotLabel('AI Assistant')).toBe('Before: AI Assistant suggestion');
  });

  it('handles a single-word agent name', () => {
    expect(buildSnapshotLabel('Copilot')).toBe('Before: Copilot suggestion');
  });
});

describe('VERSION_SOURCE_PRE_SUGGESTION', () => {
  it('is the string "pre_suggestion"', () => {
    expect(VERSION_SOURCE_PRE_SUGGESTION).toBe('pre_suggestion');
  });
});
