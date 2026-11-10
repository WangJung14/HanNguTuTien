export type DictationStatus = 'active' | 'completed' | 'expired';
export type DictationMode = 'discord' | 'paper';
export type AudioSpeed = 'normal' | 'slow';
export type AudioFormat = 'wav' | 'mp3';
export type SynthesizedAudio = { data: Buffer; format: AudioFormat };

export type DictationSession = {
  id: string;
  guildId: string;
  userId: string;
  deckId: number;
  deckName: string;
  questionCount: number;
  currentIndex: number;
  status: DictationStatus;
  mode: DictationMode;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  channelId: string;
  messageId: string | null;
};

export type DictationQuestion = {
  sessionId: string;
  questionIndex: number;
  entryId: number;
  simplified: string;
  traditional: string;
  pinyin: string;
  meaningVi: string;
  answer: string | null;
  isCorrect: boolean | null;
  usedHint: boolean;
  replayCount: number;
  answeredAt: string | null;
};

export type NewDictationQuestion = Pick<
  DictationQuestion,
  'entryId' | 'simplified' | 'traditional' | 'pinyin' | 'meaningVi'
>;

export type NewDictationSession = Pick<
  DictationSession,
  'id' | 'guildId' | 'userId' | 'deckId' | 'deckName' | 'questionCount' | 'channelId' | 'mode'
> & {
  expiresAt: string;
};

export interface DictationRepository {
  findActive(guildId: string, userId: string, now: string): DictationSession | null;
  findSession(sessionId: string): DictationSession | null;
  findQuestion(sessionId: string, questionIndex: number): DictationQuestion | null;
  findQuestions(sessionId: string): DictationQuestion[];
  createSession(
    session: NewDictationSession,
    questions: NewDictationQuestion[],
    now: string,
  ): DictationSession;
  bindMessage(sessionId: string, messageId: string, now: string, expiresAt: string): boolean;
  markHint(sessionId: string, questionIndex: number, now: string, expiresAt: string): boolean;
  incrementReplay(sessionId: string, questionIndex: number, now: string, expiresAt: string): boolean;
  submitAnswer(
    sessionId: string,
    questionIndex: number,
    answer: string,
    isCorrect: boolean,
    now: string,
    expiresAt: string,
  ): boolean;
  advance(sessionId: string, questionIndex: number, now: string, expiresAt: string): DictationSession | null;
  expire(sessionId: string, now: string): void;
}

export interface AudioProvider {
  synthesize(text: string, speed: AudioSpeed): Promise<SynthesizedAudio>;
}

export class DictationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DictationError';
  }
}

export class DictationAudioError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'DictationAudioError';
  }
}
