import type { DictionaryEntry } from '../../dictionary/domain/dictionary.types.js';
import { pinyinToToneMarks } from '../../dictionary/domain/pinyin.js';
import type { NewDictationQuestion } from './dictation.types.js';

export type EligibleQuestion = NewDictationQuestion & { pinyinKey: string };

function pinyinKey(raw: string): string | null {
  const normalized = raw.trim().normalize('NFC').toLocaleLowerCase('zh-CN');
  if (!normalized || /[,;|/，；、()[\]{}]/u.test(normalized)) return null;
  const syllables = normalized.split(/\s+/u);
  if (!syllables.every((syllable) => /^[a-züv:]+[0-5]?$/u.test(syllable))) return null;
  return syllables.join(' ');
}

export function eligibleQuestions(entries: DictionaryEntry[]): EligibleQuestion[] {
  const candidates = entries.flatMap((entry) => {
    const reading = pinyinKey(entry.pinyinRaw);
    if (!reading || !/^\p{Script=Han}+$/u.test(entry.simplified)) return [];
    const meaning = entry.meanings.find((item) => !/^LT:/u.test(item)) ?? entry.meanings[0] ?? '';
    return [{
      entryId: entry.id,
      simplified: entry.simplified,
      traditional: entry.traditional || entry.simplified,
      pinyin: pinyinToToneMarks(entry.pinyinRaw),
      meaningVi: meaning,
      pinyinKey: reading,
    }];
  });

  const readingsByWord = new Map<string, Set<string>>();
  for (const candidate of candidates) {
    const readings = readingsByWord.get(candidate.simplified) ?? new Set<string>();
    readings.add(candidate.pinyinKey);
    readingsByWord.set(candidate.simplified, readings);
  }

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if ((readingsByWord.get(candidate.simplified)?.size ?? 0) > 1) return false;
    const key = `${candidate.simplified}\u0000${candidate.pinyinKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function chooseQuestions(
  candidates: EligibleQuestion[],
  count: number,
  random: () => number = Math.random,
): NewDictationQuestion[] {
  if (![5, 10, 20].includes(count)) throw new Error('Số câu phải là 5, 10 hoặc 20.');
  if (count > candidates.length) throw new Error(`Chỉ có ${candidates.length} từ đủ điều kiện trong bộ này.`);
  const shuffled = [...candidates];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) {
      throw new Error('Nguồn ngẫu nhiên trả về giá trị không hợp lệ.');
    }
    const swapIndex = Math.floor(value * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  return shuffled.slice(0, count).map(({ pinyinKey: _pinyinKey, ...question }) => question);
}
