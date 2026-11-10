import 'dotenv/config';
import { resolve } from 'node:path';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value || value.startsWith('put_your_')) {
    throw new Error(`Missing ${name}. Please configure .env`);
  }
  return value;
}

export function getDictionaryPath(): string {
  return resolve(process.env.DICTIONARY_DB_PATH || './data/cvdict-app.sqlite');
}

export function getProgressPath(): string {
  return resolve(process.env.PROGRESS_DB_PATH || './data/progress.sqlite');
}

export function getDatabaseProvider(): 'sqlite' | 'postgres' {
  const provider = (process.env.DATABASE_PROVIDER || 'sqlite').trim().toLowerCase();
  if (provider === 'sqlite' || provider === 'postgres') return provider;
  throw new Error('DATABASE_PROVIDER must be either "sqlite" or "postgres".');
}

export function getDiscordConfig() {
  return {
    token: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    guildId: required('DISCORD_DEV_GUILD_ID'),
  };
}

export type DictationTtsConfig =
  | {
    provider: 'piper';
    baseUrl?: string;
    model: string;
    timeoutMs: number;
    cacheDirectory?: string;
  }
  | {
    provider: 'azure';
    key?: string;
    region?: string;
    cacheDirectory?: string;
  };

export function getDictationTtsConfig(): DictationTtsConfig {
  const provider = (process.env.DICTATION_TTS_PROVIDER || 'piper').trim().toLowerCase();
  const cacheDirectory = process.env.DICTATION_AUDIO_CACHE_DIR?.trim() || undefined;
  if (provider === 'piper') {
    const rawTimeout = process.env.PIPER_TTS_TIMEOUT_MS?.trim();
    const timeoutMs = rawTimeout ? Number(rawTimeout) : 30_000;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120_000) {
      throw new Error('PIPER_TTS_TIMEOUT_MS must be an integer between 1000 and 120000.');
    }
    return {
      provider,
      baseUrl: process.env.PIPER_TTS_URL?.trim() || undefined,
      model: process.env.PIPER_TTS_MODEL?.trim() || '',
      timeoutMs,
      cacheDirectory,
    };
  }
  if (provider === 'azure') {
    return {
      provider,
      key: process.env.AZURE_SPEECH_KEY?.trim() || undefined,
      region: process.env.AZURE_SPEECH_REGION?.trim() || undefined,
      cacheDirectory,
    };
  }
  throw new Error('DICTATION_TTS_PROVIDER must be either "piper" or "azure".');
}
