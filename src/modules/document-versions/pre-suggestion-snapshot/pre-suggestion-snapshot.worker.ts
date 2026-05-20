import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { DocumentVersionsService } from '../document-versions.service';
import { DocumentsService } from '../../documents/documents.service';
import {
  PreSuggestionSnapshotPayload,
  PRE_SUGGESTION_SNAPSHOT_QUEUE,
  VERSION_SOURCE_PRE_SUGGESTION,
  buildSnapshotLabel,
} from './pre-suggestion-snapshot.types';
import { computeContentHash } from '../utils/compute-content-hash';

@Processor(PRE_SUGGESTION_SNAPSHOT_QUEUE)
export class PreSuggestionSnapshotWorker extends WorkerHost {
  private readonly logger = new Logger(PreSuggestionSnapshotWorker.name);

  constructor(
    private readonly documentVersionsService: DocumentVersionsService,
    private readonly documentsService: DocumentsService,
  ) {
    super();
  }

  async process(job: Job<PreSuggestionSnapshotPayload>): Promise<void> {
    const { documentId, suggestingAgentName, capturedAt } = job.data;

    try {
      await this.createSnapshotIfNeeded(documentId, suggestingAgentName, capturedAt);
    } catch (error) {
      this.logger.warn(
        `Pre-suggestion snapshot failed for document ${documentId}: ${error instanceof Error ? error.message : String(error)}`,
      );
      // Fail silently -- never propagate errors back to the dispatch site.
      // The next suggestion will capture state again if needed.
    }
  }

  private async createSnapshotIfNeeded(
    documentId: string,
    suggestingAgentName: string,
    capturedAt: string,
  ): Promise<void> {
    const document = await this.documentsService.findById(documentId);
    if (!document) {
      this.logger.warn(`Document ${documentId} not found, skipping snapshot`);
      return;
    }

    const contentHash = computeContentHash(document.content);

    const latestVersion = await this.documentVersionsService.findLatestByDocumentId(documentId);
    if (latestVersion && latestVersion.contentHash === contentHash) {
      this.logger.log(`Dedup hit for document ${documentId}, skipping snapshot`);
      return;
    }

    await this.documentVersionsService.create({
      documentId,
      content: document.content,
      contentHash,
      source: VERSION_SOURCE_PRE_SUGGESTION,
      label: buildSnapshotLabel(suggestingAgentName),
      createdAt: new Date(capturedAt),
    });

    this.logger.log(`Pre-suggestion snapshot created for document ${documentId}`);
  }
}
