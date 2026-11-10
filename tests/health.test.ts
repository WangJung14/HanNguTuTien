import { afterEach, describe, expect, it } from 'vitest';
import type { Client } from 'discord.js';
import { once } from 'node:events';
import { closeHealthServer, startHealthServer } from '../src/shared/http/health-server.js';

const originalPort = process.env.PORT;
afterEach(() => { if (originalPort === undefined) delete process.env.PORT; else process.env.PORT = originalPort; });

describe('health endpoint', () => {
  it('returns non-sensitive gateway state without querying storage', async () => {
    process.env.PORT = '32189';
    let ready = false;
    const client = { isReady: () => ready } as unknown as Client;
    const server = startHealthServer(client);
    try {
      if (!server.listening) await once(server, 'listening');
      const starting = await fetch('http://127.0.0.1:32189/health').then(response => response.json()) as Record<string, unknown>;
      expect(starting).toMatchObject({ status: 'degraded', discord: 'not_ready' });
      expect(starting).not.toHaveProperty('databaseUrl');
      ready = true;
      const healthy = await fetch('http://127.0.0.1:32189/health').then(response => response.json()) as Record<string, unknown>;
      expect(healthy).toMatchObject({ status: 'ok', discord: 'ready' });
    } finally { await closeHealthServer(server); }
  });
});
