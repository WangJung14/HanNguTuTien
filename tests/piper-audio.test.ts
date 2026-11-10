import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DictationAudioError } from '../src/modules/dictation/domain/dictation.types.js';
import { PiperAudioProvider } from '../src/modules/dictation/infrastructure/piper-audio.provider.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ));
});

async function createCacheDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'han-ngu-piper-'));
  temporaryDirectories.push(directory);
  return directory;
}

function wav(content = 'test'): Buffer {
  const data = Buffer.alloc(12 + Buffer.byteLength(content));
  data.write('RIFF', 0, 'ascii');
  data.write('WAVE', 8, 'ascii');
  data.write(content, 12, 'ascii');
  return data;
}

describe('Piper audio provider', () => {
  it('posts text, model voice, and normal/slow length_scale to /synthesize', async () => {
    const cacheDirectory = await createCacheDirectory();
    const requests: { url: string; body: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      requests.push({ url, body: String(init.body) });
      return new Response(wav(), { status: 200, headers: { 'Content-Type': 'audio/wav' } });
    }));
    const provider = new PiperAudioProvider({
      baseUrl: 'http://127.0.0.1:5000/',
      model: 'zh_CN-huayan-medium',
      cacheDirectory,
    });

    const normal = await provider.synthesize('你好', 'normal');
    const slow = await provider.synthesize('你好', 'slow');
    expect(normal).toEqual({ data: wav(), format: 'wav' });
    expect(slow.format).toBe('wav');
    expect(requests.map((request) => request.url)).toEqual([
      'http://127.0.0.1:5000/synthesize',
      'http://127.0.0.1:5000/synthesize',
    ]);
    expect(JSON.parse(requests[0]!.body)).toEqual({
      text: '你好',
      voice: 'zh_CN-huayan-medium',
      length_scale: 1,
    });
    expect(JSON.parse(requests[1]!.body)).toEqual({
      text: '你好',
      voice: 'zh_CN-huayan-medium',
      length_scale: 1.25,
    });
  });

  it('reuses cached WAV by text, voice, and length scale', async () => {
    const cacheDirectory = await createCacheDirectory();
    const server = vi.fn(async () => new Response(wav(), { status: 200 }));
    vi.stubGlobal('fetch', server);
    const provider = new PiperAudioProvider({
      baseUrl: 'http://127.0.0.1:5000',
      model: 'voice-a',
      cacheDirectory,
    });
    await provider.synthesize('学习', 'normal');
    await provider.synthesize('学习', 'normal');
    await provider.synthesize('学习', 'slow');
    await new PiperAudioProvider({
      baseUrl: 'http://127.0.0.1:5000',
      model: 'voice-b',
      cacheDirectory,
    }).synthesize('学习', 'normal');
    expect(server).toHaveBeenCalledTimes(3);

    const cacheKey = createHash('sha256')
      .update(['piper-wav-v1', 'voice-a', '1', '学习'].join('\0'))
      .digest('hex');
    expect(await readFile(join(cacheDirectory, `${cacheKey}.wav`))).toEqual(wav());
  });

  it('reports server offline, HTTP failures, timeouts, and invalid WAV responses', async () => {
    const cacheDirectory = await createCacheDirectory();
    const provider = new PiperAudioProvider({
      baseUrl: 'http://127.0.0.1:5000',
      model: 'voice-a',
      cacheDirectory,
      timeoutMs: 1000,
    });
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('fetch failed');
    }));
    await expect(provider.synthesize('你好', 'normal')).rejects
      .toThrow('Không kết nối được Piper TTS');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('error', { status: 500 })));
    await expect(provider.synthesize('你好', 'normal')).rejects.toThrow('HTTP 500');

    vi.stubGlobal('fetch', vi.fn(async () => {
      const error = new Error('timed out');
      error.name = 'TimeoutError';
      throw error;
    }));
    await expect(provider.synthesize('你好', 'normal')).rejects.toThrow('vượt quá thời gian chờ');

    vi.stubGlobal('fetch', vi.fn(async () => new Response('not wav', { status: 200 })));
    await expect(provider.synthesize('你好', 'normal')).rejects.toThrow('WAV hợp lệ');
  });

  it('rejects invalid provider configuration', async () => {
    const cacheDirectory = await createCacheDirectory();
    await expect(new PiperAudioProvider({ model: 'voice', cacheDirectory }).synthesize('你好', 'normal'))
      .rejects.toThrow('PIPER_TTS_URL');
    await expect(new PiperAudioProvider({ baseUrl: 'file:///tmp/piper', model: 'voice', cacheDirectory })
      .synthesize('你好', 'normal')).rejects.toThrow('HTTP(S)');
  });
});
