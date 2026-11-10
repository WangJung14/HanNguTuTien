import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { AudioProvider, AudioSpeed } from '../domain/dictation.types.js';
import { DictationAudioError } from '../domain/dictation.types.js';

type AzureSpeechConfig = {
  key?: string;
  region?: string;
  cacheDirectory?: string;
};

export class AzureSpeechAudioProvider implements AudioProvider {
  private readonly cacheDirectory: string;
  private readonly inFlight = new Map<string, Promise<{ data: Buffer; format: 'mp3' }>>();

  constructor(private readonly config: AzureSpeechConfig) {
    this.cacheDirectory = resolve(config.cacheDirectory ?? './data/dictation-audio-cache');
  }

  async synthesize(text: string, speed: AudioSpeed): Promise<{ data: Buffer; format: 'mp3' }> {
    const cacheKey = createHash('sha256')
      .update(`azure-zh-CN-XiaoxiaoNeural-v1\0${speed}\0${text}`)
      .digest('hex');
    const cachePath = resolve(this.cacheDirectory, `${cacheKey}.mp3`);
    const pending = this.inFlight.get(cacheKey);
    if (pending) return pending;

    const request = this.loadOrCreate(
      cachePath, text, speed, this.config.key?.trim(), this.config.region?.trim(),
    );
    this.inFlight.set(cacheKey, request);
    try {
      return await request;
    } finally {
      this.inFlight.delete(cacheKey);
    }
  }

  private async loadOrCreate(
    cachePath: string,
    text: string,
    speed: AudioSpeed,
    key?: string,
    region?: string,
  ): Promise<{ data: Buffer; format: 'mp3' }> {
    try {
      return { data: await readFile(cachePath), format: 'mp3' };
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        // A missing cache entry is the normal path; other filesystem failures are surfaced below.
      } else {
        throw new DictationAudioError('Không thể đọc cache audio khảo bài.', { cause: error });
      }
    }

    if (!key || !region) {
      throw new DictationAudioError(
        'Audio chưa được cấu hình. Hãy thiết lập AZURE_SPEECH_KEY và AZURE_SPEECH_REGION để tạo audio tiếng Trung.',
      );
    }
    const ssmlText = escapeXml(text);
    const prosody = speed === 'slow' ? '<prosody rate="-25%">' : '';
    const prosodyClose = speed === 'slow' ? '</prosody>' : '';
    const ssml = `<speak version="1.0" xml:lang="zh-CN"><voice name="zh-CN-XiaoxiaoNeural">${prosody}${ssmlText}${prosodyClose}</voice></speak>`;
    let response: Response;
    try {
      response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'HanNguTuTien-DiscordBot',
        },
        body: ssml,
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new DictationAudioError('Không kết nối được Azure Speech để tạo audio tiếng Trung.', { cause: error });
    }
    if (!response.ok) {
      throw new DictationAudioError(`Azure Speech không tạo được audio (HTTP ${response.status}).`);
    }

    let audio: Buffer;
    try {
      audio = Buffer.from(await response.arrayBuffer());
    } catch (error) {
      throw new DictationAudioError('Không thể nhận dữ liệu audio từ Azure Speech.', { cause: error });
    }
    if (!audio.length) throw new DictationAudioError('Azure Speech trả về audio rỗng.');
    try {
      await mkdir(this.cacheDirectory, { recursive: true });
      await writeFile(cachePath, audio, { flag: 'wx' });
    } catch (error) {
      if (!(error instanceof Error) || !('code' in error) || error.code !== 'EEXIST') {
        throw new DictationAudioError('Không thể lưu cache audio khảo bài.', { cause: error });
      }
    }
    return { data: audio, format: 'mp3' };
  }
}

function escapeXml(text: string): string {
  return text.replace(/&/gu, '&amp;').replace(/</gu, '&lt;').replace(/>/gu, '&gt;')
    .replace(/"/gu, '&quot;').replace(/'/gu, '&apos;');
}
