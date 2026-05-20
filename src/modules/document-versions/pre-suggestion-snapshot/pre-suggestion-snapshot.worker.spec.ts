import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';

import { PreSuggestionSnapshotWorker } from './pre-suggestion-snapshot.worker';
import { PreSuggestionSnapshotPayload, VERSION_SOURCE_PRE_SUGGESTION } from './pre-suggestion-snapshot.types';
import { DocumentVersionsService } from '../document-versions.service';
import { DocumentsService } from '../../documents/documents.service';
import * as contentHashUtil from '../utils/compute-content-hash';

describe('PreSuggestionSnapshotWorker', () => {
  let worker: PreSuggestionSnapshotWorker;
  let documentVersionsService: jest.Mocked<DocumentVersionsService>;
  let documentsService: jest.Mocked<DocumentsService>;

  const mockDocument = {
    id: 'doc-1',
    content: 'Hello world',
  };

  const mockPayload: PreSuggestionSnapshotPayload = {
    documentId: 'doc-1',
    suggestingAgentName: 'Grammar Expert',
    capturedAt: '2026-05-20T10:00:00.000Z',
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreSuggestionSnapshotWorker,
        {
          provide: DocumentVersionsService,
          useValue: {
            findLatestByDocumentId: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: DocumentsService,
          useValue: {
            findById: jest.fn(),
          },
        },
      ],
    }).compile();

    worker = module.get(PreSuggestionSnapshotWorker);
    documentVersionsService = module.get(DocumentVersionsService);
    documentsService = module.get(DocumentsService);
  });

  function createJob(data: PreSuggestionSnapshotPayload): Job<PreSuggestionSnapshotPayload> {
    return { data } as Job<PreSuggestionSnapshotPayload>;
  }

  it('creates a version when no existing version matches the content hash', async () => {
    documentsService.findById.mockResolvedValue(mockDocument as any);
    jest.spyOn(contentHashUtil, 'computeContentHash').mockReturnValue('hash-abc');
    documentVersionsService.findLatestByDocumentId.mockResolvedValue(null);

    await worker.process(createJob(mockPayload));

    expect(documentVersionsService.create).toHaveBeenCalledWith({
      documentId: 'doc-1',
      content: 'Hello world',
      contentHash: 'hash-abc',
      source: VERSION_SOURCE_PRE_SUGGESTION,
      label: 'Before: Grammar Expert suggestion',
      createdAt: new Date('2026-05-20T10:00:00.000Z'),
    });
  });

  it('skips insert when latest version has the same content hash (dedup)', async () => {
    documentsService.findById.mockResolvedValue(mockDocument as any);
    jest.spyOn(contentHashUtil, 'computeContentHash').mockReturnValue('hash-abc');
    documentVersionsService.findLatestByDocumentId.mockResolvedValue({
      contentHash: 'hash-abc',
    } as any);

    await worker.process(createJob(mockPayload));

    expect(documentVersionsService.create).not.toHaveBeenCalled();
  });

  it('creates a version when latest version has a different content hash', async () => {
    documentsService.findById.mockResolvedValue(mockDocument as any);
    jest.spyOn(contentHashUtil, 'computeContentHash').mockReturnValue('hash-abc');
    documentVersionsService.findLatestByDocumentId.mockResolvedValue({
      contentHash: 'hash-different',
    } as any);

    await worker.process(createJob(mockPayload));

    expect(documentVersionsService.create).toHaveBeenCalled();
  });

  it('skips when document is not found', async () => {
    documentsService.findById.mockResolvedValue(null);

    await worker.process(createJob(mockPayload));

    expect(documentVersionsService.findLatestByDocumentId).not.toHaveBeenCalled();
    expect(documentVersionsService.create).not.toHaveBeenCalled();
  });

  it('does not throw when document service throws', async () => {
    documentsService.findById.mockRejectedValue(new Error('DB connection lost'));

    await expect(worker.process(createJob(mockPayload))).resolves.toBeUndefined();
  });

  it('does not throw when version service throws on create', async () => {
    documentsService.findById.mockResolvedValue(mockDocument as any);
    jest.spyOn(contentHashUtil, 'computeContentHash').mockReturnValue('hash-abc');
    documentVersionsService.findLatestByDocumentId.mockResolvedValue(null);
    documentVersionsService.create.mockRejectedValue(new Error('Insert failed'));

    await expect(worker.process(createJob(mockPayload))).resolves.toBeUndefined();
  });

  it('deduplicates when invoked twice on unchanged content', async () => {
    documentsService.findById.mockResolvedValue(mockDocument as any);
    jest.spyOn(contentHashUtil, 'computeContentHash').mockReturnValue('hash-abc');

    // First call: no existing version
    documentVersionsService.findLatestByDocumentId.mockResolvedValueOnce(null);
    await worker.process(createJob(mockPayload));
    expect(documentVersionsService.create).toHaveBeenCalledTimes(1);

    // Second call: latest version now has the same hash
    documentVersionsService.findLatestByDocumentId.mockResolvedValueOnce({
      contentHash: 'hash-abc',
    } as any);
    await worker.process(createJob(mockPayload));
    expect(documentVersionsService.create).toHaveBeenCalledTimes(1); // still 1
  });
});
