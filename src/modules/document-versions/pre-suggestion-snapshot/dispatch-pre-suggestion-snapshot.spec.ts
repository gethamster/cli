import { PreSuggestionSnapshotDispatcher } from './pre-suggestion-snapshot.dispatcher';
import { dispatchPreSuggestionSnapshot } from './dispatch-pre-suggestion-snapshot';

describe('dispatchPreSuggestionSnapshot', () => {
  let mockDispatcher: jest.Mocked<PreSuggestionSnapshotDispatcher>;

  beforeEach(() => {
    mockDispatcher = {
      dispatch: jest.fn(),
    } as any;
  });

  it('dispatches a payload with resolved agent name and current timestamp', () => {
    dispatchPreSuggestionSnapshot(mockDispatcher, 'doc-1', { skillName: 'Grammar Expert' });

    expect(mockDispatcher.dispatch).toHaveBeenCalledWith({
      documentId: 'doc-1',
      suggestingAgentName: 'Grammar Expert',
      capturedAt: expect.any(String),
    });

    const payload = mockDispatcher.dispatch.mock.calls[0][0];
    expect(() => new Date(payload.capturedAt)).not.toThrow();
  });

  it('uses the fallback agent name when context is null', () => {
    dispatchPreSuggestionSnapshot(mockDispatcher, 'doc-1', null);

    expect(mockDispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ suggestingAgentName: 'AI Assistant' }),
    );
  });

  it('uses the fallback agent name when context is undefined', () => {
    dispatchPreSuggestionSnapshot(mockDispatcher, 'doc-1', undefined);

    expect(mockDispatcher.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ suggestingAgentName: 'AI Assistant' }),
    );
  });

  it('does not throw when dispatcher.dispatch throws', () => {
    mockDispatcher.dispatch.mockImplementation(() => {
      throw new Error('Dispatch exploded');
    });

    expect(() => {
      dispatchPreSuggestionSnapshot(mockDispatcher, 'doc-1', { skillName: 'Test' });
    }).not.toThrow();
  });
});
