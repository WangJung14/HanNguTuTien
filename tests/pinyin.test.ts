import { describe, expect, it } from 'vitest';
import { normalizePinyin, pinyinToToneMarks } from '../src/modules/dictionary/domain/pinyin.js';

describe('Pinyin handling', () => {
  it('converts numbered tone input to friendly format', () => {
    expect(pinyinToToneMarks('ni3 hao3')).toBe('nǐ hǎo');
    expect(pinyinToToneMarks('xue2 xi2')).toBe('xué xí');
    expect(pinyinToToneMarks('peng2 you5')).toBe('péng you');
    expect(pinyinToToneMarks('xie4 xie5')).toBe('xiè xie');
    expect(pinyinToToneMarks('nv3')).toBe('nǚ');
  });
  it('normalizes for accent-insensitive indexing', () => {
    expect(normalizePinyin('xuéxí')).toBe('xuexi');
    expect(normalizePinyin('xue2 xi2')).toBe('xuexi');
    expect(normalizePinyin('nǚ')).toBe('nv');
    expect(normalizePinyin('nü')).toBe('nv');
    expect(normalizePinyin('nu:3')).toBe('nv');
    expect(normalizePinyin('nv3')).toBe('nv');
    expect(normalizePinyin('lǜ')).toBe('lv');
  });
});
