import { REALMS } from '../domain/cultivation.config.js';
import type { CultivationRepository, RealmProgress } from '../domain/cultivation.types.js';

export class RealmService {
  constructor(private readonly repository: CultivationRepository) {}

  getProgress(guildId: string, userId: string): RealmProgress {
    const value = this.repository.getOrCreateProfile(guildId, userId, new Date().toISOString());
    const major = REALMS[value.majorIndex] ?? REALMS[0]!;
    const nextMajor = REALMS[value.majorIndex + 1] ?? null;
    const unlockedMinor = [...major.minors].reverse().find((minor) => value.totalXp >= minor.minXp) ?? major.minors[0]!;
    const nextMinor = major.minors.find((minor) => minor.minXp > value.totalXp) ?? null;
    const needsBreakthrough = Boolean(nextMajor && value.totalXp >= nextMajor.minXp);
    const nextTargetXp = needsBreakthrough ? nextMajor!.minXp : (nextMinor?.minXp ?? nextMajor?.minXp ?? null);
    const minorSuffix = unlockedMinor.name === major.name ? '' : ` ${unlockedMinor.name}`;
    return {
      profile: value, major, minor: unlockedMinor, nextMajor, nextTargetXp, needsBreakthrough,
      isMax: !nextMajor, label: `${major.name}${minorSuffix}${needsBreakthrough ? ' · viên mãn' : ''}`,
    };
  }
}
