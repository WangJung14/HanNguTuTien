export type BagWord = { entryId: number; savedAt: string };
export type Awaitable<T> = T | Promise<T>;

export interface BagRepository {
  add(guildId: string, userId: string, entryId: number): Awaitable<boolean>;
  remove(guildId: string, userId: string, entryId: number): Awaitable<boolean>;
  list(guildId: string, userId: string, limit: number, offset: number): Awaitable<BagWord[]>;
  count(guildId: string, userId: string): Awaitable<number>;
}
