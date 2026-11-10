import type { MajorRealm, MinorRealm } from './cultivation.config.js';

export type CultivationProfile = {
  guildId: string; userId: string; totalXp: number; majorIndex: number;
  roleSyncPending: boolean; createdAt: string; updatedAt: string;
};
export type XpLedgerEntry = {
  id: number; guildId: string; userId: string; amount: number; source: string;
  rewardKey: string; sessionId: string | null; earnedDate: string; createdAt: string;
};
export type RealmProgress = {
  profile: CultivationProfile; major: MajorRealm; minor: MinorRealm;
  nextMajor: MajorRealm | null; nextTargetXp: number | null; needsBreakthrough: boolean;
  isMax: boolean; label: string;
};
export type BreakthroughQuestion = {
  entryId: number; simplified: string; traditional: string; pinyin: string; meaningVi: string;
  answer: string | null; correct: boolean | null;
};
export type BreakthroughAttempt = {
  id: string; guildId: string; userId: string; fromMajor: number; toMajor: number;
  deckId: number; status: 'active' | 'passed' | 'failed'; currentIndex: number;
  correctCount: number; questions: BreakthroughQuestion[]; cooldownUntil: string | null;
  messageId: string | null; createdAt: string; updatedAt: string; completedAt: string | null;
};
export type XpAward = { awarded: number; duplicate: boolean; capped: boolean; totalXp: number };

export interface CultivationRepository {
  getOrCreateProfile(guildId: string, userId: string, now: string): CultivationProfile;
  addXp(guildId: string, userId: string, amount: number, source: string, rewardKey: string,
    sessionId: string | null, earnedDate: string, now: string, dailyCap: number,
    limits?: { scopedDailyCap?: number; scopedSources?: string[]; maxTotalXp?: number }): XpAward;
  listLedger(guildId: string, userId: string, limit: number): XpLedgerEntry[];
  getAttempt(id: string): BreakthroughAttempt | null;
  findActiveAttempt(guildId: string, userId: string): BreakthroughAttempt | null;
  latestFailedAttempt(guildId: string, userId: string): BreakthroughAttempt | null;
  createAttempt(attempt: BreakthroughAttempt): void;
  bindAttemptMessage(id: string, messageId: string, now: string): boolean;
  answerAttempt(id: string, index: number, answer: string, correct: boolean, now: string): BreakthroughAttempt | null;
  advanceAttempt(id: string, index: number, now: string, cooldownUntil: string): BreakthroughAttempt | null;
  promote(guildId: string, userId: string, expectedMajor: number, newMajor: number, now: string): boolean;
  setRoleSyncPending(guildId: string, userId: string, pending: boolean, now: string): void;
  setRealmRole(guildId: string, majorIndex: number, roleId: string, now: string): void;
  removeRealmRole(guildId: string, majorIndex: number): void;
  getRealmRoles(guildId: string): Map<number, string>;
  listAttempts(guildId: string, userId: string, limit: number): BreakthroughAttempt[];
}

export class CultivationError extends Error {
  constructor(message: string) { super(message); this.name = 'CultivationError'; }
}
