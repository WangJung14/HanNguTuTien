import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AzureSpeechAudioProvider } from '../src/modules/dictation/infrastructure/azure-speech-audio.provider.js';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    rm(directory, { recursive: true, force: true }),
  ));
});

describe('Azure Speech audio provider', () => {
  it('uses cached audio without requiring a configured Azure key', async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), 'han-ngu-dictation-'));
    temporaryDirectories.push(cacheDirectory);
    const cacheKey = createHash('sha256')
      .update('azure-zh-CN-XiaoxiaoNeural-v1\0normal\0学习')
      .digest('hex');
    const cachedAudio = Buffer.from('cached-mp3');
    await writeFile(join(cacheDirectory, `${cacheKey}.mp3`), cachedAudio);

    const provider = new AzureSpeechAudioProvider({ cacheDirectory });
    await expect(provider.synthesize('学习', 'normal')).resolves.toEqual({
      data: cachedAudio,
      format: 'mp3',
    });
  });

  it('reports missing TTS configuration when no cached audio exists', async () => {
    const cacheDirectory = await mkdtemp(join(tmpdir(), 'han-ngu-dictation-'));
    temporaryDirectories.push(cacheDirectory);
    const provider = new AzureSpeechAudioProvider({ cacheDirectory });
    await expect(provider.synthesize('你好', 'normal')).rejects.toThrow('AZURE_SPEECH_KEY');
  });
});
