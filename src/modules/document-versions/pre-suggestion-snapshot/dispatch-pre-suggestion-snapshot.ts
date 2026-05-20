import { PreSuggestionSnapshotDispatcher } from './pre-suggestion-snapshot.dispatcher';
import { PreSuggestionSnapshotPayload } from './pre-suggestion-snapshot.types';
import { AgentContext, resolveSuggestingAgentName } from './resolve-suggesting-agent-name';

/**
 * Context provided by the AI orchestrator when instantiating toolcalls.
 * Shared by apply_diff and replace_document to avoid interface duplication.
 */
export interface ToolcallContext {
  readonly agentContext?: AgentContext | null;
}

/**
 * Shared dispatch function used by both apply_diff and replace_document
 * toolcalls at instantiation time. Constructs the snapshot payload
 * and fires it into the async queue.
 *
 * This function is fire-and-forget: it never throws, never blocks,
 * and never returns a meaningful value. Callers MUST NOT await it.
 */
export function dispatchPreSuggestionSnapshot(
  dispatcher: PreSuggestionSnapshotDispatcher,
  documentId: string,
  agentContext: AgentContext | null | undefined,
): void {
  try {
    const suggestingAgentName = resolveSuggestingAgentName(agentContext);

    const payload: PreSuggestionSnapshotPayload = {
      documentId,
      suggestingAgentName,
      capturedAt: new Date().toISOString(),
    };

    dispatcher.dispatch(payload);
  } catch {
    // Belt-and-suspenders: neither resolveSuggestingAgentName nor dispatcher.dispatch
    // should throw, but guard the entire dispatch site to stay fire-and-forget.
  }
}
