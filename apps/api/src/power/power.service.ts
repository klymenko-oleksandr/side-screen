import { Inject, Injectable } from '@nestjs/common';
import { SIDE_SCREEN_CONFIG } from '../config/config.module';
import type { SideScreenConfig } from '../config/config.schema';
import { type ModuleData, SnapshotService } from '../snapshot/snapshot';
import { StreamService } from '../stream/stream.service';
import { PowerSource } from './power.source';

@Injectable()
export class PowerService extends SnapshotService<'power'> {
  protected readonly module = 'power';
  protected readonly intervalMs: number;

  constructor(
    source: PowerSource,
    stream: StreamService,
    @Inject(SIDE_SCREEN_CONFIG) config: SideScreenConfig,
  ) {
    super(source, stream);
    this.intervalMs = config.polling.powerSeconds * 1000;
  }

  protected override summarize(data: ModuleData<'power'>): string {
    const cut = data.nextCut
      ? ` · next cut ${time(data.nextCut.start)}–${time(data.nextCut.end)}`
      : ' · no cut scheduled';
    const tomorrow = data.tomorrow ? ' · tomorrow published' : '';
    return `grid ${data.status} (group ${data.group})${cut}${tomorrow}`;
  }
}

function time(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
