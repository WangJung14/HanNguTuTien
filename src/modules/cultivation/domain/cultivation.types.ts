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
export type AdminXpAction = 'reward' | 'penalty';
export type AdminXpAdjustment = {
  id: string; guildId: string; userId: string; actorId: string; action: AdminXpAction;
  amount: number; reason: string; previousTotalXp: number; newTotalXp: number;
  previousMajorIndex: number; newMajorIndex: number; createdAt: string; duplicate: boolean;
};

export type Awaitable<T> = T | Promise<T>;

export interface CultivationRepository {
  getOrCreateProfile(guildId: string, userId: string, now: string): Awaitable<CultivationProfile>;
  addXp(guildId: string, userId: string, amount: number, source: string, rewardKey: string,
    sessionId: string | null, earnedDate: string, now: string, dailyCap: number,
    limits?: { scopedDailyCap?: number; scopedSources?: string[]; maxTotalXp?: number }): Awaitable<XpAward>;
  listLedger(guildId: string, userId: string, limit: number): Awaitable<XpLedgerEntry[]>;
  getAttempt(id: string): Awaitable<BreakthroughAttempt | null>;
  findActiveAttempt(guildId: string, userId: string): Awaitable<BreakthroughAttempt | null>;
  latestFailedAttempt(guildId: string, userId: string): Awaitable<BreakthroughAttempt | null>;
  createAttempt(attempt: BreakthroughAttempt): Awaitable<void>;
  bindAttemptMessage(id: string, messageId: string, now: string): Awaitable<boolean>;
  answerAttempt(id: string, index: number, answer: string, correct: boolean, now: string): Awaitable<BreakthroughAttempt | null>;
  advanceAttempt(id: string, index: number, now: string, cooldownUntil: string): Awaitable<BreakthroughAttempt | null>;
  promote(guildId: string, userId: string, expectedMajor: number, newMajor: number, now: string): Awaitable<boolean>;
  setRoleSyncPending(guildId: string, userId: string, pending: boolean, now: string): Awaitable<void>;
  setRealmRole(guildId: string, majorIndex: number, roleId: string, now: string): Awaitable<void>;
  removeRealmRole(guildId: string, majorIndex: number): Awaitable<void>;
  getRealmRoles(guildId: string): Awaitable<Map<number, string>>;
  getXpAnnouncementChannel(guildId: string): Awaitable<string | null>;
  setXpAnnouncementChannel(guildId: string, channelId: string | null, now: string): Awaitable<void>;
  adjustXpAsAdmin(guildId: string, userId: string, actorId: string, adjustmentId: string,
    action: AdminXpAction, amount: number, reason: string, now: string): Awaitable<AdminXpAdjustment>;
  listAttempts(guildId: string, userId: string, limit: number): Awaitable<BreakthroughAttempt[]>;
}

export class CultivationError extends Error {
  constructor(message: string) { super(message); this.name = 'CultivationError'; }
}
