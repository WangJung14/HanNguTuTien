import { createServer, type Server } from 'node:http';
import type { Client } from 'discord.js';

export function startHealthServer(client: Client): Server {
  const rawPort = process.env.PORT || '3000';
  const port = Number(rawPort);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  const startedAt = Date.now();
  const server = createServer((request, response) => {
    if (request.method !== 'GET' || request.url?.split('?')[0] !== '/health') {
      response.writeHead(404, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ error: 'not_found' }));
      return;
    }
    const discordReady = client.isReady();
    response.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(JSON.stringify({
      status: discordReady ? 'ok' : 'degraded',
      discord: discordReady ? 'ready' : 'not_ready',
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
      timestamp: new Date().toISOString(),
    }));
  });
  server.listen(port, '0.0.0.0', () => console.log(`Health server listening on 0.0.0.0:${port}`));
  return server;
}

export function closeHealthServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}
