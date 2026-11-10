import type { ButtonInteraction } from 'discord.js';
import { MessageFlags } from 'discord.js';
import type { BagService } from '../application/bag.service.js';
import { buildBagMessage } from './bag-ui.js';

export async function handleBagButton(interaction: ButtonInteraction, service: BagService,
  quest?: { recordSavedWord(guildId:string,userId:string,entryId:number):Promise<void> }) {
  const parts = interaction.customId.split(':');
  if (parts[0] !== 'bag') return;
  const action = parts[1];
  const ownerId = parts[2];
  const entryId = Number(parts[3]);
  const page = Number(parts[4] || 1);

  if (!interaction.guildId || ownerId !== interaction.user.id) {
    await interaction.reply({ content: '⛔ Đây là túi của đạo hữu khác!', flags: MessageFlags.Ephemeral });
    return;
  }
  if (!Number.isSafeInteger(entryId) || entryId <= 0) {
    await interaction.reply({ content: 'Nút lưu từ không hợp lệ.', flags: MessageFlags.Ephemeral });
    return;
  }
  if (action === 'add') {
    // ACK trong 3 giây, sau đó mới ghi DB.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const { created, entry } = await service.save(interaction.guildId, interaction.user.id, entryId);
    if(created)await quest?.recordSavedWord(interaction.guildId,interaction.user.id,entryId);
    await interaction.editReply(created
      ? `✅ Đã thu thập **${entry.simplified}** vào Túi Càn Khôn! Xem bằng \`/tuikho\`.`
      : `📦 **${entry.simplified}** đã có trong Túi Càn Khôn rồi.`);
  } else if (action === 'remove') {
    await interaction.deferUpdate();
    const safePage = Number.isSafeInteger(page) && page > 0 ? page : 1;
    await service.remove(interaction.guildId, interaction.user.id, entryId);
    await interaction.editReply(await buildBagMessage(service, interaction.guildId, interaction.user.id, safePage));
  } else {
    await interaction.reply({ content: 'Nút không được hỗ trợ.', flags: MessageFlags.Ephemeral });
  }
}
