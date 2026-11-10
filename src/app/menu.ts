import { EmbedBuilder, SlashCommandBuilder } from 'discord.js';

export const menuDefinition = new SlashCommandBuilder()
  .setName('menu')
  .setDescription('Xem menu hướng dẫn các lệnh của bot');

export function buildMenuEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x6c5ce7)
    .setTitle('📜 Hán Ngữ Tu Tiên — Menu')
    .setDescription('Danh sách tính năng hiện có. Menu này chỉ hiển thị với bạn; các lệnh có nhãn **Admin** cần quyền quản trị tương ứng.')
    .addFields(
      { name: '📖 Từ điển · Túi Càn Khôn · Bộ từ', value: [
        '`/tudien tu:<từ>` — tra chữ Hán, Pinyin hoặc nghĩa tiếng Việt.',
        '`/tuikho [trang]` — xem những từ đã lưu.',
        '`/botu tao|danhsach|xem` — tạo và quản lý bộ từ cá nhân.',
        '`/botu them|bo|chuyen|xoa` — sửa nội dung bộ từ.',
        '`/botu khampha|congkhai|saochep` — chia sẻ và sao chép bộ công khai.',
      ].join('\n') },
      { name: '🎧 Khảo bài · Chính tả', value: [
        '`/khaobai batdau` — làm chính tả bằng phiếu tối đa 10 câu mỗi đợt.',
        '`/khaobai vietgiay` — bot đọc để bạn viết trên giấy, không gửi đáp án.',
        '`/khaobai tieptuc` — mở lại phiên đang hoạt động sau khi thoát/restart.',
      ].join('\n') },
      { name: '🌀 Tu vi · Cảnh giới · Nhiệm vụ', value: [
        '`/tuvi` — xem XP, cảnh giới thực tế và tiến độ.',
        '`/dotpha botu:<ID>` — Thiên Kiếp 10 câu để đột phá đại cảnh giới.',
        '`/lichsutuvi` — lịch sử XP và những lần Thiên Kiếp.',
        '`/nhiemvu` — nhiệm vụ tu luyện hằng ngày.',
        '`/diemdanh` — chuỗi ngày học và lịch sử hoạt động.',
        '`/bequan` — phút Bế Quan, XP và trạng thái hiện tại.',
        '`/bangxeptuvi` — xem Thiên Bảng Tu Vi của server.',
      ].join('\n') },
      { name: '🏔️ Vấn Đỉnh · Bí Cảnh · Boss HSK', value: [
        '`/leonui solo|tao|thamgia|batdau|huy` — solo hoặc thi đấu nhiều người.',
        '`/leonui bangxep|lichsu` — bảng xếp hạng và lịch sử Vấn Đỉnh.',
        '`/bicanh vao capdo:<HSK1–3>` — thí luyện 15 câu; `/bicanh lichsu` — lịch sử.',
        '`/boss xem|thamgia|batdau` — xem, tham gia và bắt đầu Boss cuối tuần.',
        '`/boss bangxep` — bảng đóng góp sát thương Boss.',
      ].join('\n') },
      { name: '⛰️ Tông Môn', value: [
        '`/tongmon tao|danhsach|xem|xin|roi` — lập phái, tìm và gia nhập Tông Môn.',
        '`/tongmon don|duyet|moi` — xử lý thành viên (Tông Chủ/Phó Tông Chủ).',
        '`/tongmon chucvu|chuyengiao|trucxuat|giaitan` — quản trị Tông Môn.',
        '`/tongmon nhiemvu|donggop|bangxep` — nhiệm vụ tuần, CP và xếp hạng.',
      ].join('\n') },
      { name: '⚙️ Quản trị server', value: [
        '**Admin** `/xpkenh dat|xoa` — đặt hoặc tắt kênh thông báo XP.',
        '**Admin** `/xpadmin user:<thành viên>` — thưởng/phạt XP có ledger.',
        '**Admin** `/bequancauhinh kenh|tat` — cấu hình phòng Voice Bế Quan.',
        '**Admin** `/canhgioirole gan|go|dongbo` — ánh xạ và đồng bộ role cảnh giới.',
        '**Admin** `/boss mo|huy` — mở hoặc hủy Boss trong khung sự kiện.',
        '**Admin** `/bangxeptuvi hanhdong:cauhinh|capnhat|tat` — quản lý message Thiên Bảng.',
      ].join('\n') },
      { name: '💡 Tiện ích · Bắt đầu nhanh', value: [
        '`/ping` — kiểm tra bot đang hoạt động.',
        '`/menu`, `/help` — mở lại menu này.',
        'Bắt đầu: `/botu tao` → `/tudien` và lưu từ → thêm vào bộ → `/khaobai batdau`.',
      ].join('\n') },
    )
    .setFooter({ text: 'Nút và phiên học cá nhân chỉ chủ phiên mới thao tác được.' });
}
