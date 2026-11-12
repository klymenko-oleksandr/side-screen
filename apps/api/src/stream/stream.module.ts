import { Global, Module } from '@nestjs/common';
import { LogBuffer, logBuffer } from '../logging/log-buffer';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';

@Global()
@Module({
  controllers: [StreamController],
  providers: [StreamService, { provide: LogBuffer, useValue: logBuffer }],
  exports: [StreamService, LogBuffer],
})
export class StreamModule {}
