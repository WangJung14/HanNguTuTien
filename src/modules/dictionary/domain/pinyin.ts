// Normalization must match scripts/prepare_dictionary.py.
export function normalizePinyin(input: string): string {
  return input.trim().toLowerCase()
    .replace(/u:/g, 'v')
    .normalize('NFD')
    .replace(/u\u0308/g, 'v')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z]/g, '');
}

const tones: Record<string, string[]> = {
  a: ['a', 'ā', 'á', 'ǎ', 'à'],
  e: ['e', 'ē', 'é', 'ě', 'è'],
  i: ['i', 'ī', 'í', 'ǐ', 'ì'],
  o: ['o', 'ō', 'ó', 'ǒ', 'ò'],
  u: ['u', 'ū', 'ú', 'ǔ', 'ù'],
  ü: ['ü', 'ǖ', 'ǘ', 'ǚ', 'ǜ'],
};

export function pinyinToToneMarks(raw: string): string {
  return raw.split(/\s+/u).filter(Boolean).map((token) => {
    const match = /^(.*?)([0-5])$/u.exec(token);
    if (!match) return token;
    const syllable = (match[1] || '').toLowerCase().replace(/u:/g, 'ü').replace(/v/g, 'ü');
    const tone = Number(match[2]);
    if (!tone || !syllable) return syllable;
    let index = syllable.indexOf('a');
    if (index < 0) index = syllable.indexOf('e');
    if (index < 0 && syllable.includes('ou')) index = syllable.indexOf('o');
    if (index < 0) {
      const matches = [...syllable.matchAll(/[aeiouü]/gu)];
      index = matches.length ? matches[matches.length - 1]!.index : -1;
    }
    if (index < 0) return syllable;
    const vowel = syllable[index]!;
    return syllable.slice(0, index) + (tones[vowel]?.[tone] || vowel) + syllable.slice(index + 1);
  }).join(' ');
}
