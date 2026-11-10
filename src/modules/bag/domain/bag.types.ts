export type BagWord = { entryId: number; savedAt: string };

export interface BagRepository {
  add(guildId: string, userId: string, entryId: number): boolean;
  remove(guildId: string, userId: string, entryId: number): boolean;
  list(guildId: string, userId: string, limit: number, offset: number): BagWord[];
  count(guildId: string, userId: string): number;
}
