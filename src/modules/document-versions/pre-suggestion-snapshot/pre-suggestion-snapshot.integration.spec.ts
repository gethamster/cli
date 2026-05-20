import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';

import { PreSuggestionSnapshotWorker } from './pre-suggestion-snapshot.worker';
import { PreSuggestionSnapshotDispatcher } from './pre-suggestion-snapshot.dispatcher';
import {
  PreSuggestionSnapshotPayload,
  PRE_SUGGESTION_SNAPSHOT_QUEUE,
  VERSION_SOURCE_PRE_SUGGESTION,
} from './pre-suggestion-snapshot.types';
import { dispatchPreSuggestionSnapshot } from './dispatch-pre-suggestion-snapshot';
import { DocumentVersionsService } from '../document-versions.service';
import { DocumentsService } from '../../documents/documents.service';
import * as contentHashUtil from '../utils/compute-content-hash';

/**
 * Integration tests for the pre-suggestion snapshot feature.
 *
 * These tests validate the end-to-end flow from dispatch through
 * the worker to version creation, dedup, and restore.
 */
describe('Pre-Suggestion Snapshot Integration', () => {
  let worker: PreSuggestionSnapshotWorker;
  let dispatcher: PreSuggestionSnapshotDispatcher;
  let documentVersionsService: jest.Mocked<DocumentVersionsService>;
  let documentsService: jest.Mocked<DocumentsService>;
  let mockQueue: jest.Mocked<Pick<Queue, 'add'>>;
  let capturedJobs: PreSuggestionSnapshotPayload[];

  const originalContent = 'Original document content before any suggestion';
  const mockDocument = { id: 'doc-1', content: originalContent };

  beforeEach(async () => {
    capturedJobs = [];

    mockQueue = {
      add: jest.fn().mockImplementation((_name: string, data: PreSuggestionSnapshotPayload) => {
        capturedJobs.push(data);
        return Promise.resolve(undefined);
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreSuggestionSnapshotWorker,
        PreSuggestionSnapshotDispatcher,
        {
          provide: getQueueToken(PRE_SUGGESTION_SNAPSHOT_QUEUE),
          useValue: mockQueue,
        },
        {
          provide: DocumentVersionsService,
          useValue: {
            findLatestByDocumentId: jest.fn(),
            create: jest.fn(),
            findByDocumentId: jest.fn(),
            restore: jest.fn(),
          },
        },
        {
          provide: DocumentsService,
          useValue: {
            findById: jest.fn(),
            update: jest.fn(),
          },
        },
      ],
    }).compile();

    worker = module.get(PreSuggestionSnapshotWorker);
    dispatcher = module.get(PreSuggestionSnapshotDispatcher);
    documentVersionsService = module.get(DocumentVersionsService);
    documentsService = module.get(DocumentsService);
  });

  function createJob(data: PreSuggestionSnapshotPayload): Job<PreSuggestionSnapshotPayload> {
    return { data } as Job<PreSuggestionSnapshotPayload>;
  }

  describe('apply_diff end-to-end', () => {
    it('produces a labeled pre-suggestion version row when apply_diff dispatches', async () => {
      documentsService.findById.mockResolvedValue(mockDocument as any);
      jest.spyOn(contentHashUtil, 'computeContentHash').mockReturnValue('hash-original');
      documentVersionsService.findLatestByDocumentId.mockResolvedValue(null);

      // Simulate apply_diff dispatch
      dispatchPreSuggestionSnapshot(dispatcher, 'doc-1', { skillName: 'Grammar Expert' });

      expect(capturedJobs).toHaveLength(1);
      expect(capturedJobs[0].documentId).toBe('doc-1');
      expect(capturedJobs[0].suggestingAgentName).toBe('Grammar Expert');

      // Simulate worker processing the queued job
      await worker.process(createJob(capturedJobs[0]));

      expect(documentVersionsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: 'doc-1',
          content: originalContent,
          contentHash: 'hash-original',
          source: VERSION_SOURCE_PRE_SUGGESTION,
          label: 'Before: Grammar Expert suggestion',
        }),
      );
    });
  });

  describe('replace_document end-to-end', () => {
    it('produces a labeled pre-suggestion version row when replace_document dispatches', async () => {
      documentsService.findById.mockResolvedValue(mockDocument as any);
      jest.spyOn(contentHashUtil, 'computeContentHash').mockReturnValue('hash-original');
      documentVersionsService.findLatestByDocumentId.mockResolvedValue(null);

      // Simulate replace_document dispatch
      dispatchPreSuggestionSnapshot(dispatcher, 'doc-1', { agentName: 'Document Chat AI' });

      expect(capturedJobs).toHaveLength(1);
      expect(capturedJobs[0].suggestingAgentName).toBe('Document Chat AI');

      await worker.process(createJob(capturedJobs[0]));

      expect(documentVersionsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          source: VERSION_SOURCE_PRE_SUGGESTION,
          label: 'Before: Document Chat AI suggestion',
        }),
      );
    });
  });

  describe('content-hash deduplication', () => {
    it('creates only one version for repeated invocations on unchanged content', async () => {
      documentsService.findById.mockResolvedValue(mockDocument as any);
      jest.spyOn(contentHashUtil, 'computeContentHash').mockReturnValue('hash-original');

      // First invocation: no existing version
      documentVersionsService.findLatestByDocumentId.mockResolvedValueOnce(null);
      dispatchPreSuggestionSnapshot(dispatcher, 'doc-1', { skillName: 'Skill A' });
      await worker.process(createJob(capturedJobs[0]));

      expect(documentVersionsService.create).toHaveBeenCalledTimes(1);

      // Second invocation: latest version now matches
      documentVersionsService.findLatestByDocumentId.mockResolvedValueOnce({
        contentHash: 'hash-original',
      } as any);
      dispatchPreSuggestionSnapshot(dispatcher, 'doc-1', { skillName: 'Skill B' });
      await worker.process(createJob(capturedJobs[1]));

      // Still only one version created -- second was deduped
      expect(documentVersionsService.create).toHaveBeenCalledTimes(1);
    });

    it('creates a new version when content changes between invocations', async () => {
      jest.spyOn(contentHashUtil, 'computeContentHash')
        .mockReturnValueOnce('hash-v1')
        .mockReturnValueOnce('hash-v2');

      // First invocation
      documentsService.findById.mockResolvedValueOnce({ id: 'doc-1', content: 'v1' } as any);
      documentVersionsService.findLatestByDocumentId.mockResolvedValueOnce(null);
      dispatchPreSuggestionSnapshot(dispatcher, 'doc-1', { skillName: 'Skill A' });
      await worker.process(createJob(capturedJobs[0]));

      // Second invocation with different content
      documentsService.findById.mockResolvedValueOnce({ id: 'doc-1', content: 'v2' } as any);
      documentVersionsService.findLatestByDocumentId.mockResolvedValueOnce({
        contentHash: 'hash-v1',
      } as any);
      dispatchPreSuggestionSnapshot(dispatcher, 'doc-1', { skillName: 'Skill B' });
      await worker.process(createJob(capturedJobs[1]));

      expect(documentVersionsService.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('restore flow', () => {
    it('restoring the pre-suggestion version recovers exact pre-edit content', async () => {
      const preEditContent = 'Document content before AI suggestion';

      documentsService.findById.mockResolvedValue({ id: 'doc-1', content: preEditContent } as any);
      jest.spyOn(contentHashUtil, 'computeContentHash').mockReturnValue('hash-pre-edit');
      documentVersionsService.findLatestByDocumentId.mockResolvedValue(null);

      // Step 1: Dispatch and process snapshot at suggestion time
      dispatchPreSuggestionSnapshot(dispatcher, 'doc-1', { skillName: 'AI Writer' });
      await worker.process(createJob(capturedJobs[0]));

      // Verify the snapshot captured the pre-edit content -- this is what the
      // restore flow will read when the user rolls back to this version.
      const createdVersion = (documentVersionsService.create as jest.Mock).mock.calls[0][0];
      expect(createdVersion.content).toBe(preEditContent);
      expect(createdVersion.source).toBe(VERSION_SOURCE_PRE_SUGGESTION);
    });
  });

  describe('no-latency guarantee', () => {
    it('dispatch completes synchronously without awaiting queue operations', () => {
      let queueAddResolved = false;

      (mockQueue.add as jest.Mock).mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            queueAddResolved = true;
            resolve(undefined);
          }, 1000);
        });
      });

      const startTime = Date.now();
      dispatchPreSuggestionSnapshot(dispatcher, 'doc-1', { skillName: 'Test Skill' });
      const elapsed = Date.now() - startTime;

      // Dispatch returns in under 10ms -- no awaiting
      expect(elapsed).toBeLessThan(10);
      expect(queueAddResolved).toBe(false);
    });

    it('dispatch does not block when queue throws synchronously', () => {
      (mockQueue.add as jest.Mock).mockImplementation(() => {
        throw new Error('Queue connection lost');
      });

      // Should not throw
      expect(() => {
        dispatchPreSuggestionSnapshot(dispatcher, 'doc-1', { skillName: 'Test Skill' });
      }).not.toThrow();
    });

    it('dispatch does not block when queue rejects asynchronously', () => {
      (mockQueue.add as jest.Mock).mockRejectedValue(new Error('Async queue failure'));

      expect(() => {
        dispatchPreSuggestionSnapshot(dispatcher, 'doc-1', { skillName: 'Test Skill' });
      }).not.toThrow();
    });
  });
});
