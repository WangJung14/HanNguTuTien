import { XP_CONFIG } from '../domain/cultivation.config.js';
import type { CultivationRepository, XpAward } from '../domain/cultivation.types.js';

export type DictationRewardQuestion = {
  sessionId: string; questionIndex: number; isCorrect: boolean | null;
  usedHint: boolean; replayCount: number;
};

export class XpService {
  constructor(private readonly repository: CultivationRepository) {}

  async awardQuestion(guildId: string, userId: string, question: DictationRewardQuestion): Promise<XpAward> {
    if (!question.isCorrect) return this.noAward(guildId, userId);
    const amount = question.usedHint ? XP_CONFIG.correctAfterHint
      : question.replayCount > 0 ? XP_CONFIG.correctAfterReplay : XP_CONFIG.correctFirstTry;
    return this.award(guildId, userId, amount, 'dictation_correct',
      `dictation:${question.sessionId}:question:${question.questionIndex}`, question.sessionId);
  }

  async awardCompletion(guildId: string, userId: string, sessionId: string, questionCount: number,
    correctCount: number, allFirstTry: boolean): Promise<XpAward[]> {
    const amount = XP_CONFIG.completion[questionCount] ?? 0;
    const rewards = amount > 0 ? [await this.award(guildId, userId, amount, 'dictation_complete',
      `dictation:${sessionId}:complete`, sessionId)] : [];
    if (questionCount === 10 && correctCount === 10 && allFirstTry) {
      rewards.push(await this.award(guildId, userId, XP_CONFIG.perfectTenFirstTry, 'dictation_perfect_10',
        `dictation:${sessionId}:perfect10`, sessionId));
    }
    return rewards;
  }

  history(guildId: string, userId: string, limit = 15) {
    return this.repository.listLedger(guildId, userId, limit);
  }

  async awardExternal(guildId: string, userId: string, amount: number, source: string, rewardKey: string,
    options?: { sessionId?: string; scopedDailyCap?: number; scopedSources?: string[]; maxTotalXp?: number; now?: Date }): Promise<XpAward> {
    const now = options?.now ?? new Date();
    return this.repository.addXp(guildId, userId, amount, source, rewardKey, options?.sessionId ?? null,
      vietnamDate(now), now.toISOString(), XP_CONFIG.dailyCap, {
        scopedDailyCap: options?.scopedDailyCap, scopedSources: options?.scopedSources,
        maxTotalXp: options?.maxTotalXp,
      });
  }

  private async award(guildId: string, userId: string, amount: number, source: string,
    rewardKey: string, sessionId: string | null): Promise<XpAward> {
    const now = new Date();
    return this.repository.addXp(guildId, userId, amount, source, rewardKey, sessionId,
      vietnamDate(now), now.toISOString(), XP_CONFIG.dailyCap);
  }
  private async noAward(guildId: string, userId: string): Promise<XpAward> {
    const profile = await this.repository.getOrCreateProfile(guildId, userId, new Date().toISOString());
    return { awarded: 0, duplicate: false, capped: false, totalXp: profile.totalXp };
  }
}

export function vietnamDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}
