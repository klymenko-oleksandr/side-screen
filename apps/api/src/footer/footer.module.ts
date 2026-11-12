import { Controller, Get, Injectable, Module } from '@nestjs/common';
import {
  type ModuleData,
  SnapshotService,
  SnapshotSource,
} from '../snapshot/snapshot';
import { StreamService } from '../stream/stream.service';
import { WORDS } from './words';

/** DI token for the footer: word of the hour (F1) and LeetCode streak (F2, later). */
export abstract class FooterSource extends SnapshotSource<'footer'> {}

/** Word of the hour from the local list; the LeetCode streak stays empty until F2. */
@Injectable()
export class LocalFooterSource extends FooterSource {
  readonly label = 'word list';
  readonly mock = false;

  async fetch(now: Date): Promise<ModuleData<'footer'>> {
    const hoursSinceEpoch = Math.floor(now.getTime() / 3_600_000);
    return {
      word: WORDS[hoursSinceEpoch % WORDS.length] ?? null,
      leetcodeStreakDays: null,
    };
  }
}

@Injectable()
export class FooterService extends SnapshotService<'footer'> {
  protected readonly module = 'footer';
  /** Checked every minute so the word flips close to the hour. */
  protected readonly intervalMs = 60_000;

  constructor(source: FooterSource, stream: StreamService) {
    super(source, stream);
  }
}

@Controller('footer')
export class FooterController {
  constructor(private readonly footer: FooterService) {}

  @Get()
  get() {
    return this.footer.snapshot();
  }
}

@Module({
  controllers: [FooterController],
  providers: [
    FooterService,
    { provide: FooterSource, useClass: LocalFooterSource },
  ],
})
export class FooterModule {}
