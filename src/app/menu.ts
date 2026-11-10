import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

export const menuDefinition = new SlashCommandBuilder()
  .setName('menu')
  .setDescription('Xem menu hướng dẫn các lệnh của bot');

export function buildMenuEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x6c5ce7)
    .setTitle('📜 Hán Ngữ Tu Tiên — Menu')
    .setDescription('Các lệnh và hướng dẫn nhanh. Nội dung menu này chỉ hiển thị với bạn.')
    .addFields(
      {
        name: '📖 Tra cứu và học từ',
        value: [
          '`/tudien` — tra chữ Hán, Pinyin hoặc nghĩa tiếng Việt; kết quả hiện công khai.',
          '`/tuikho` — xem các từ bạn đã lưu.',
          '`/botu` — tạo và quản lý bộ từ; có thể khám phá hoặc chia sẻ bộ từ.',
          '`/khaobai batdau` — nghe và nhập đáp án; `/khaobai vietgiay` — nghe để tự viết.',
          '`/khaobai tieptuc` — mở lại phiên khảo bài đang làm.',
        ].join('\n'),
      },
      {
        name: '🌀 Tu vi và nhiệm vụ',
        value: [
          '`/tuvi` — xem hồ sơ tu vi công khai.',
          '`/dotpha botu:<ID>` — bắt đầu Thiên Kiếp từ bộ từ có ít nhất 10 từ hợp lệ.',
          '`/lichsutuvi` — xem lịch sử XP và đột phá.',
          '`/nhiemvu`, `/diemdanh`, `/bequan` — nhiệm vụ, chuỗi ngày học và Bế Quan.',
        ].join('\n'),
      },
      {
        name: '🏆 Trò chơi',
        value: [
          '`/leonui solo botu:<ID>` — Vấn Đỉnh một mình.',
          '`/leonui tao botu:<ID>` — tạo phòng chơi cùng server.',
          '`/leonui bangxep` và `/leonui lichsu` — xem bảng xếp hạng/lịch sử.',
          '`/bicanh vao capdo:<HSK>` — vào Bí Cảnh; `/bicanh lichsu` — xem kết quả.',
          '`/boss xem` — xem lịch Boss; các lựa chọn tham gia và bắt đầu hiện khi có phòng.',
        ].join('\n'),
      },
      {
        name: '⚙️ Lệnh quản trị',
        value: [
          '`/xpkenh dat kenh:<kênh>` — chọn nơi đăng thông báo XP.',
          '`/xpkenh xoa` — tắt thông báo XP.',
          '`/xpadmin user:<thành viên>` — xem XP hiện tại, chọn thưởng/phạt, nhập số XP và lý do; thao tác được thông báo công khai.',
          '`/bequancauhinh kenh` — chọn phòng thoại Bế Quan.',
          '`/canhgioirole` — cấu hình role cảnh giới.',
        ].join('\n'),
      },
      {
        name: '💡 Bắt đầu nhanh',
        value: 'Tạo bộ từ bằng `/botu tao`, tra từ bằng `/tudien`, rồi thêm từ vào bộ. Dùng `/khaobai batdau` để luyện nghe. Gọi `/menu` hoặc `/help` bất cứ lúc nào để xem lại.',
      },
    )
    .setFooter({ text: 'Các nút và phiên học cá nhân chỉ chủ phiên mới thao tác được.' });
}
