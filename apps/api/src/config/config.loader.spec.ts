import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig, parseConfig } from './config.loader';

describe('config', () => {
  it('fills every section with defaults', () => {
    const config = parseConfig({});
    expect(config.server).toEqual({ host: '127.0.0.1', port: 4300 });
    expect(config.ui.showFooter).toBe(false);
    expect(config.power.weights.dtekLiveOutage).toBe(3);
    expect(config.polling.dtekScheduleHours).toBe(6);
    expect(config.mock).toBe(true);
  });

  it('refuses a non-loopback host', () => {
    expect(() => parseConfig({ server: { host: '0.0.0.0' } })).toThrow(
      /loopback/,
    );
  });

  it('rejects malformed repo names', () => {
    expect(() => parseConfig({ dev: { repos: ['just-a-name'] } })).toThrow(
      /owner\/name/,
    );
  });

  describe('loadConfig', () => {
    const makeDir = (files: Record<string, string>) => {
      const dir = mkdtempSync(join(tmpdir(), 'side-screen-'));
      mkdirSync(join(dir, 'config'));
      for (const [name, body] of Object.entries(files))
        writeFileSync(join(dir, 'config', name), body);
      return dir;
    };

    it('prefers the real config over the example', () => {
      const dir = makeDir({
        'side-screen.config.json': JSON.stringify({ server: { port: 5000 } }),
        'side-screen.config.example.json': JSON.stringify({
          server: { port: 6000 },
        }),
      });
      const loaded = loadConfig(dir, {});
      expect(loaded.config.server.port).toBe(5000);
      expect(loaded.usedExample).toBe(false);
    });

    it('falls back to the example and says so', () => {
      const dir = makeDir({ 'side-screen.config.example.json': '{}' });
      expect(loadConfig(dir, {}).usedExample).toBe(true);
    });

    it('honours SIDE_SCREEN_CONFIG', () => {
      const dir = makeDir({
        'custom.json': JSON.stringify({ server: { port: 7000 } }),
      });
      expect(
        loadConfig(dir, { SIDE_SCREEN_CONFIG: 'config/custom.json' }).config
          .server.port,
      ).toBe(7000);
    });

    it('reports invalid JSON with the path', () => {
      const dir = makeDir({ 'side-screen.config.json': '{ nope' });
      expect(() => loadConfig(dir, {})).toThrow(/not valid JSON/);
    });

    it('throws when nothing is found', () => {
      const dir = mkdtempSync(join(tmpdir(), 'side-screen-'));
      expect(() => loadConfig(dir, {})).toThrow(/not found/);
    });
  });
});
