import { execFile } from 'node:child_process';
import { Inject, Injectable } from '@nestjs/common';
import { SIDE_SCREEN_CONFIG } from '../../config/config.module';
import type { SideScreenConfig } from '../../config/config.schema';

export interface BatteryReading {
  pct: number;
  onAc: boolean;
}

export interface PingReading {
  online: boolean;
  latencyMs: number | null;
  /** ms epoch of the check. */
  at: number;
}

/**
 * `pmset -g batt` on macOS:
 *   Now drawing from 'AC Power'
 *    -InternalBattery-0 (id=4653155)	100%; charged; 0:00 remaining present: true
 */
export function parsePmset(output: string): BatteryReading | null {
  const source = /drawing from '([^']+)'/.exec(output)?.[1];
  const pct = /(\d{1,3})%/.exec(output)?.[1];
  if (!source || pct === undefined) return null;
  return { pct: Number(pct), onAc: /AC Power/i.test(source) };
}

/** Round-trip time from `ping -c 1` output (macOS and Linux both print `time=12.3 ms`). */
export function parsePingTime(output: string): number | null {
  const ms = /time[=<]([\d.]+)\s*ms/.exec(output)?.[1];
  return ms === undefined ? null : Math.round(Number(ms));
}

function run(cmd: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(cmd, args, { timeout: timeoutMs }, (err, stdout) =>
      err ? reject(err) : resolvePromise(stdout),
    );
  });
}

/** The MacBook's own signals: charger and battery via `pmset`, internet via `ping` (PRD P4). */
@Injectable()
export class MacSignals {
  private lastPing: PingReading | null = null;
  private pinging = false;

  constructor(
    @Inject(SIDE_SCREEN_CONFIG) private readonly config: SideScreenConfig,
  ) {}

  /** Null off macOS or when pmset fails. */
  async battery(): Promise<BatteryReading | null> {
    if (process.platform !== 'darwin') return null;
    try {
      return parsePmset(await run('pmset', ['-g', 'batt'], 3000));
    } catch {
      return null;
    }
  }

  /**
   * Latest internet check. Pings in the background at most every `pingSeconds`,
   * so the 5-second power tick never waits on the network.
   */
  internet(now: Date): PingReading | null {
    const due =
      !this.lastPing ||
      now.getTime() - this.lastPing.at >=
        this.config.polling.pingSeconds * 1000;
    if (due && !this.pinging) void this.ping(now);
    return this.lastPing;
  }

  private async ping(now: Date): Promise<void> {
    this.pinging = true;
    const host = this.config.power.pingHost;
    // -t is the timeout on macOS, -W on Linux.
    const args =
      process.platform === 'darwin'
        ? ['-c', '1', '-t', '2', host]
        : ['-c', '1', '-W', '2', host];
    try {
      const latencyMs = parsePingTime(await run('ping', args, 4000));
      this.lastPing = {
        online: latencyMs !== null,
        latencyMs,
        at: now.getTime(),
      };
    } catch {
      this.lastPing = { online: false, latencyMs: null, at: now.getTime() };
    } finally {
      this.pinging = false;
    }
  }
}
