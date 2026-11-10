import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AudioProvider, AudioSpeed } from '../domain/dictation.types.js';
import { DictationAudioError } from '../domain/dictation.types.js';

export type PiperAudioConfig = {
  baseUrl?: string;
  model: string;
  timeoutMs?: number;
  cacheDirectory?: string;
};

const LENGTH_SCALE: Record<AudioSpeed, number> = {
  normal: 1,
  slow: 1.25,
};
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export class PiperAudioProvider implements AudioProvider {
  private readonly cacheDirectory: string;
  private readonly inFlight = new Map<string, Promise<{ data: Buffer; format: 'wav' }>>();

  constructor(private readonly config: PiperAudioConfig) {
    this.cacheDirectory = resolve(config.cacheDirectory ?? './data/dictation-audio-cache');
  }

  async synthesize(text: string, speed: AudioSpeed): Promise<{ data: Buffer; format: 'wav' }> {
    const baseUrl = this.config.baseUrl?.trim();
    const model = this.config.model.trim();
    if (!baseUrl) {
      throw new DictationAudioError('Chưa cấu hình PIPER_TTS_URL cho Piper HTTP Server.');
    }
    if (!model) {
      throw new DictationAudioError('Chưa cấu hình PIPER_TTS_MODEL để xác định giọng và cache Piper.');
    }
    let synthesizeUrl: string;
    try {
      const parsed = new URL(baseUrl);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Unsupported protocol.');
      if (parsed.username || parsed.password || parsed.search || parsed.hash) {
        throw new Error('Credentials, query strings, and fragments are not allowed.');
      }
      parsed.pathname = `${parsed.pathname.replace(/\/+$/u, '')}/synthesize`;
      synthesizeUrl = parsed.toString();
    } catch (error) {
      throw new DictationAudioError('PIPER_TTS_URL phải là một địa chỉ HTTP(S) hợp lệ.', { cause: error });
    }

    const lengthScale = LENGTH_SCALE[speed];
    const cacheKey = createHash('sha256')
      .update(`piper-wav-v1\0${model}\0${lengthScale}\0${text}`)
      .digest('hex');
    const cachePath = resolve(this.cacheDirectory, `${cacheKey}.wav`);
    const pending = this.inFlight.get(cacheKey);
    if (pending) return pending;

    const request = this.loadOrCreate(cachePath, synthesizeUrl, text, model, lengthScale);
    this.inFlight.set(cacheKey, request);
    try {
      return await request;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  private async loadOrCreate(
    cachePath: string,
    synthesizeUrl: string,
    text: string,
    model: string,
    lengthScale: number,
  ): Promise<{ data: Buffer; format: 'wav' }> {
    try {
      const cached = await readFile(cachePath);
      assertWav(cached);
      return { data: cached, format: 'wav' };
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // A missing cache file is the normal path.
      } else {
        throw new DictationAudioError('Không thể đọc hoặc xác thực cache WAV của Piper.', { cause: error });
      }
    }

    let response: Response;
    try {
      response = await fetch(synthesizeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'audio/wav, application/octet-stream' },
        body: JSON.stringify({ text, voice: model, length_scale: lengthScale }),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 30_000),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === 'TimeoutError';
      throw new DictationAudioError(
        timedOut
          ? 'Piper TTS vượt quá thời gian chờ. Hãy kiểm tra model hoặc tăng PIPER_TTS_TIMEOUT_MS.'
          : 'Không kết nối được Piper TTS. Hãy kiểm tra Piper HTTP Server và PIPER_TTS_URL.',
        { cause: error },
      );
    }
    if (!response.ok) {
      throw new DictationAudioError(`Piper TTS trả lỗi HTTP ${response.status} khi tạo audio.`);
    }

    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_AUDIO_BYTES) {
      throw new DictationAudioError('Piper TTS trả về file audio vượt quá giới hạn 20 MB.');
    }
    let audio: Buffer;
    try {
      audio = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      throw new DictationAudioError('Không thể nhận dữ liệu WAV từ Piper TTS.', { cause: error });
    }
    if (audio.length > MAX_AUDIO_BYTES) {
      throw new DictationAudioError('Piper TTS trả về file audio vượt quá giới hạn 20 MB.');
    }
    try {
      assertWav(audio);
    } catch (error) {
      throw new DictationAudioError('Piper TTS không trả về audio WAV hợp lệ.', { cause: error });
    }

    try {
      await mkdir(this.cacheDirectory, { recursive: true });
      await writeFile(cachePath, audio, { flag: 'wx' });
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') {
        throw new DictationAudioError('Không thể lưu cache WAV của Piper.', { cause: error });
      }
    }
    return { data: audio, format: 'wav' };
  }
}

function assertWav(audio: Buffer): void {
  if (audio.length < 12 ||
      audio.toString('ascii', 0, 4) !== 'RIFF' ||
      audio.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Invalid WAV header.');
  }
}
