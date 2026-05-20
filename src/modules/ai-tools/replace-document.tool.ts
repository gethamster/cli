import { Injectable } from '@nestjs/common';

import {
  PreSuggestionSnapshotDispatcher,
  dispatchPreSuggestionSnapshot,
  ToolcallContext,
} from '../document-versions/pre-suggestion-snapshot';

/**
 * Parameters for the replace_document toolcall.
 * Signature is UNCHANGED -- no new fields added.
 */
export interface ReplaceDocumentParams {
  readonly documentId: string;
  readonly content: string;
}

@Injectable()
export class ReplaceDocumentTool {
  constructor(
    private readonly snapshotDispatcher: PreSuggestionSnapshotDispatcher,
    // ... other existing dependencies injected here
  ) {}

  /**
   * Instantiates the replace_document toolcall.
   *
   * The pre-suggestion snapshot dispatch is the FIRST operation at
   * instantiation, before any replacement logic executes. It is
   * fire-and-forget and does not affect the toolcall signature,
   * response, or latency.
   */
  instantiate(params: ReplaceDocumentParams, context: ToolcallContext): void {
    // --- Pre-suggestion snapshot dispatch (fire-and-forget) ---
    dispatchPreSuggestionSnapshot(
      this.snapshotDispatcher,
      params.documentId,
      context.agentContext,
    );

    // --- Existing replace_document logic continues unchanged below ---
    // The rest of the toolcall instantiation logic remains exactly
    // as it was before this change. The snapshot dispatch above
    // is non-blocking and does not alter the return value or
    // error behavior of this method.
  }
}
