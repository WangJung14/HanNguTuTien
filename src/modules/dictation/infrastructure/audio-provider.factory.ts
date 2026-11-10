import type { DictationTtsConfig } from '../../../config/env.js';
import type { AudioProvider } from '../domain/dictation.types.js';
import { AzureSpeechAudioProvider } from './azure-speech-audio.provider.js';
import { PiperAudioProvider } from './piper-audio.provider.js';

export function createAudioProvider(config: DictationTtsConfig): AudioProvider {
  if (config.provider === 'azure') {
    return new AzureSpeechAudioProvider({
      key: config.key,
      region: config.region,
      cacheDirectory: config.cacheDirectory,
    });
  }
  return new PiperAudioProvider({
    baseUrl: config.baseUrl,
    model: config.model,
    timeoutMs: config.timeoutMs,
    cacheDirectory: config.cacheDirectory,
  });
}
