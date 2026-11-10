export const XP_CONFIG = {
  dailyCap: 200,
  correctFirstTry: 10,
  correctAfterReplay: 7,
  correctAfterHint: 4,
  completion: { 5: 10, 10: 20, 20: 40 } as Record<number, number>,
  perfectTenFirstTry: 30,
  breakthroughCooldownMs: 6 * 60 * 60 * 1000,
} as const;

export type MinorRealm = { key: string; name: string; minXp: number };
export type MajorRealm = {
  key: string;
  name: string;
  minXp: number;
  color: number;
  minors: MinorRealm[];
};

export const REALMS: readonly MajorRealm[] = [
  { key: 'pham_nhan', name: 'Phàm Nhân', minXp: 0, color: 0x95a5a6, minors: [{ key: 'pham_nhan', name: 'Phàm Nhân', minXp: 0 }] },
  { key: 'luyen_khi', name: 'Luyện Khí', minXp: 100, color: 0x2ecc71, minors: [
    ['1', 100], ['2', 250], ['3', 400], ['4', 600], ['5', 800], ['6', 1000], ['7', 1250], ['8', 1500], ['9', 1750],
  ].map(([layer, minXp]) => ({ key: `tang_${layer}`, name: `tầng ${layer}`, minXp: Number(minXp) })) },
  { key: 'truc_co', name: 'Trúc Cơ', minXp: 2000, color: 0x1abc9c, minors: [
    { key: 'so_ky', name: 'sơ kỳ', minXp: 2000 }, { key: 'trung_ky', name: 'trung kỳ', minXp: 3000 }, { key: 'hau_ky', name: 'hậu kỳ', minXp: 4000 },
  ] },
  { key: 'kim_dan', name: 'Kim Đan', minXp: 5000, color: 0xf1c40f, minors: [{ key: 'kim_dan', name: 'Kim Đan', minXp: 5000 }] },
  { key: 'nguyen_anh', name: 'Nguyên Anh', minXp: 10000, color: 0xe67e22, minors: [{ key: 'nguyen_anh', name: 'Nguyên Anh', minXp: 10000 }] },
  { key: 'hoa_than', name: 'Hóa Thần', minXp: 20000, color: 0x9b59b6, minors: [{ key: 'hoa_than', name: 'Hóa Thần', minXp: 20000 }] },
  { key: 'luyen_hu', name: 'Luyện Hư', minXp: 30000, color: 0x3498db, minors: [{ key: 'luyen_hu', name: 'Luyện Hư', minXp: 30000 }] },
  { key: 'hop_the', name: 'Hợp Thể', minXp: 45000, color: 0x34495e, minors: [{ key: 'hop_the', name: 'Hợp Thể', minXp: 45000 }] },
  { key: 'dai_thua', name: 'Đại Thừa', minXp: 65000, color: 0xe74c3c, minors: [{ key: 'dai_thua', name: 'Đại Thừa', minXp: 65000 }] },
  { key: 'do_kiep', name: 'Độ Kiếp', minXp: 90000, color: 0x8e44ad, minors: [{ key: 'do_kiep', name: 'Độ Kiếp', minXp: 90000 }] },
  { key: 'phi_thang', name: 'Phi Thăng', minXp: 120000, color: 0xffffff, minors: [{ key: 'phi_thang', name: 'Phi Thăng', minXp: 120000 }] },
] as const;

