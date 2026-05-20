import { Injectable } from '@nestjs/common';

import {
  PreSuggestionSnapshotDispatcher,
  dispatchPreSuggestionSnapshot,
  ToolcallContext,
} from '../document-versions/pre-suggestion-snapshot';

/**
 * Parameters for the apply_diff toolcall.
 * Signature is UNCHANGED -- no new fields added.
 */
export interface ApplyDiffParams {
  readonly documentId: string;
  readonly diffs: ReadonlyArray<{
    readonly search: string;
    readonly replace: string;
  }>;
}

@Injectable()
export class ApplyDiffTool {
  constructor(
    private readonly snapshotDispatcher: PreSuggestionSnapshotDispatcher,
    // ... other existing dependencies injected here
  ) {}

  /**
   * Instantiates the apply_diff toolcall.
   *
   * The pre-suggestion snapshot dispatch is the FIRST operation at
   * instantiation, before any diff logic executes. It is fire-and-forget
   * and does not affect the toolcall signature, response, or latency.
   */
  instantiate(params: ApplyDiffParams, context: ToolcallContext): void {
    // --- Pre-suggestion snapshot dispatch (fire-and-forget) ---
    dispatchPreSuggestionSnapshot(
      this.snapshotDispatcher,
      params.documentId,
      context.agentContext,
    );

    // --- Existing apply_diff logic continues unchanged below ---
    // The rest of the toolcall instantiation logic remains exactly
    // as it was before this change. The snapshot dispatch above
    // is non-blocking and does not alter the return value or
    // error behavior of this method.
  }
}
