import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { request as httpRequest } from 'node:http';
import type { AddressInfo } from 'node:net';
import request from 'supertest';
import { parseConfig } from '../config/config.loader';
import { AppModule } from './app.module';

/** Reads SSE frames from the stream until `count` named events arrive. */
function readEvents(port: number, count: number): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const req = httpRequest(
      { host: '127.0.0.1', port, path: '/api/stream' },
      (res) => {
        let buffer = '';
        const events: string[] = [];
        res.setEncoding('utf8');
        res.on('data', (chunk: string) => {
          buffer += chunk;
          for (const match of buffer.matchAll(/^event: (.+)$/gm))
            events.push(match[1]);
          buffer = buffer.slice(buffer.lastIndexOf('\n') + 1);
          if (events.length >= count) {
            req.destroy();
            resolve(events);
          }
        });
      },
    );
    req.on('error', (err) =>
      err.message.includes('socket hang up') ? undefined : reject(err),
    );
    req.end();
  });
}

describe('Side Screen API', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppModule.forRoot(parseConfig({ ui: { logLines: 4 } }), {
          serveWeb: false,
        }),
      ],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    await app.listen(0, '127.0.0.1');
  });

  afterAll(() => app.close());

  it('reports health', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(res.body).toMatchObject({ status: 'ok', mock: true });
  });

  it('serves the non-secret UI config', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/ui-config')
      .expect(200);
    expect(res.body).toEqual({
      timezone: 'Europe/Kyiv',
      showFooter: false,
      logLines: 4,
    });
  });

  it.each(['header', 'power', 'today', 'dev', 'footer'])(
    'serves the %s snapshot',
    async (name) => {
      const res = await request(app.getHttpServer())
        .get(`/api/${name}`)
        .expect(200);
      expect(res.body.meta).toMatchObject({ stale: false });
    },
  );

  it('refreshes power on demand', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/power/refresh')
      .expect(200);
    expect(['ON', 'OFF', 'UNCONFIRMED']).toContain(res.body.status);
  });

  it('streams every module snapshot, then the log backlog, on connect', async () => {
    const { port } = app.getHttpServer().address() as AddressInfo;
    const events = await readEvents(port, 6);
    expect(events).toEqual([
      'header',
      'power',
      'today',
      'dev',
      'footer',
      'log-backlog',
    ]);
  });
});
