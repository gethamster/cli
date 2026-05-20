import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

import { PreSuggestionSnapshotDispatcher } from './pre-suggestion-snapshot.dispatcher';
import {
  PreSuggestionSnapshotPayload,
  PRE_SUGGESTION_SNAPSHOT_QUEUE,
} from './pre-suggestion-snapshot.types';

describe('PreSuggestionSnapshotDispatcher', () => {
  let dispatcher: PreSuggestionSnapshotDispatcher;
  let mockQueue: jest.Mocked<Pick<Queue, 'add'>>;

  const mockPayload: PreSuggestionSnapshotPayload = {
    documentId: 'doc-1',
    suggestingAgentName: 'Grammar Expert',
    capturedAt: '2026-05-20T10:00:00.000Z',
  };

  beforeEach(async () => {
    mockQueue = {
      add: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PreSuggestionSnapshotDispatcher,
        {
          provide: getQueueToken(PRE_SUGGESTION_SNAPSHOT_QUEUE),
          useValue: mockQueue,
        },
      ],
    }).compile();

    dispatcher = module.get(PreSuggestionSnapshotDispatcher);
  });

  it('enqueues a snapshot job with correct payload and options', () => {
    dispatcher.dispatch(mockPayload);

    expect(mockQueue.add).toHaveBeenCalledWith('snapshot', mockPayload, {
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: true,
    });
  });

  it('does not throw when queue.add rejects', () => {
    mockQueue.add.mockRejectedValue(new Error('Queue unavailable'));

    expect(() => dispatcher.dispatch(mockPayload)).not.toThrow();
  });

  it('calls dispatch synchronously without awaiting the queue', () => {
    let resolved = false;
    mockQueue.add.mockImplementation(() => {
      return new Promise((resolve) => {
        setTimeout(() => {
          resolved = true;
          resolve(undefined as any);
        }, 100);
      });
    });

    dispatcher.dispatch(mockPayload);

    // The dispatch returns immediately -- the promise is not awaited
    expect(resolved).toBe(false);
  });
});
