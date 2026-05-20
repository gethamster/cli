import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { Queue } from 'bullmq';

import {
  PreSuggestionSnapshotPayload,
  PRE_SUGGESTION_SNAPSHOT_QUEUE,
} from './pre-suggestion-snapshot.types';

@Injectable()
export class PreSuggestionSnapshotDispatcher {
  private readonly logger = new Logger(PreSuggestionSnapshotDispatcher.name);

  constructor(
    @InjectQueue(PRE_SUGGESTION_SNAPSHOT_QUEUE)
    private readonly queue: Queue<PreSuggestionSnapshotPayload>,
  ) {}

  /**
   * Fire-and-forget dispatch of a pre-suggestion snapshot job.
   * This method MUST NOT be awaited by the caller -- it handles
   * its own errors internally and never throws.
   */
  dispatch(payload: PreSuggestionSnapshotPayload): void {
    this.queue
      .add('snapshot', payload, {
        attempts: 1,
        removeOnComplete: true,
        removeOnFail: true,
      })
      .catch((error: unknown) => {
        this.logger.warn(
          `Failed to enqueue pre-suggestion snapshot for document ${payload.documentId}: ${error instanceof Error ? error.message : String(error)}`,
        );
      });
  }
}
