export const QUESTS = {
  collect_words: { name: 'Thu Thập Bí Kíp', target: 5, reward: 10, unit: 'mục từ mới' },
  correct_dictation: { name: 'Rèn Luyện Thần Thức', target: 10, reward: 20, unit: 'câu đúng' },
  complete_session: { name: 'Sư Phụ Chỉ Điểm', target: 1, reward: 15, unit: 'phiên ≥10 câu' },
  meditate_minutes: { name: 'Bế Quan Tĩnh Tâm', target: 15, reward: 10, unit: 'phút' },
} as const;
export type QuestKey = keyof typeof QUESTS;

