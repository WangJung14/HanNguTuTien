export const SECT_CONFIG = {
  defaultMaxMembers: 50,
  dailyContributionCap: 100,
  minCreateXp: 100,
  quests: {
    correct_answers: { target: 100, reputation: 100, label: 'Bách Luyện Chính Âm' },
    completed_sessions: { target: 20, reputation: 100, label: 'Đồng Tâm Tu Học' },
    active_members: { target: 5, reputation: 100, label: 'Ngũ Tử Đồng Tu' },
  },
} as const;
export type SectQuestKey = keyof typeof SECT_CONFIG.quests;

export function vietnamWeekKey(now = new Date()): string {
  const local = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(now);
  const get = (type: string) => local.find((part) => part.type === type)?.value ?? '';
  const dayIndex: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const date = new Date(`${get('year')}-${get('month')}-${get('day')}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() - (dayIndex[get('weekday')] ?? 0));
  return date.toISOString().slice(0, 10);
}
