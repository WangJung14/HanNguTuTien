export { DictationService } from './application/dictation.service.js';
export { gradeAnswer } from './domain/answer-grader.js';
export { chooseQuestions, eligibleQuestions } from './domain/question-selection.js';
export { DictationAudioError, DictationError } from './domain/dictation.types.js';
export type {
  AudioFormat, AudioProvider, AudioSpeed, DictationMode, DictationQuestion, DictationSession, SynthesizedAudio,
} from './domain/dictation.types.js';
export { AzureSpeechAudioProvider } from './infrastructure/azure-speech-audio.provider.js';
export { PiperAudioProvider } from './infrastructure/piper-audio.provider.js';
export { createAudioProvider } from './infrastructure/audio-provider.factory.js';
export { SqliteDictationRepository } from './infrastructure/sqlite-dictation.repository.js';
export { PostgresDictationRepository } from './infrastructure/postgres-dictation.repository.js';
export { khaobaiDefinition, handleKhaobai } from './presentation/khaobai.command.js';
export {
  handleDictationButton, handleDictationModal, handleDictationSelect,
} from './presentation/dictation-interaction.handler.js';
