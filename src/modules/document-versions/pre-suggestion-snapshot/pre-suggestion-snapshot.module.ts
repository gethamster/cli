import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { DocumentVersionsModule } from '../document-versions.module';
import { DocumentsModule } from '../../documents/documents.module';
import { PreSuggestionSnapshotDispatcher } from './pre-suggestion-snapshot.dispatcher';
import { PreSuggestionSnapshotWorker } from './pre-suggestion-snapshot.worker';
import { PRE_SUGGESTION_SNAPSHOT_QUEUE } from './pre-suggestion-snapshot.types';

@Module({
  imports: [
    BullModule.registerQueue({
      name: PRE_SUGGESTION_SNAPSHOT_QUEUE,
    }),
    DocumentVersionsModule,
    DocumentsModule,
  ],
  providers: [PreSuggestionSnapshotWorker, PreSuggestionSnapshotDispatcher],
  exports: [PreSuggestionSnapshotDispatcher],
})
export class PreSuggestionSnapshotModule {}
