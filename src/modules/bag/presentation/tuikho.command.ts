import { ChatInputCommandInteraction, MessageFlags, SlashCommandBuilder } from 'discord.js';
import type { BagService } from '../application/bag.service.js';
import { buildBagMessage } from './bag-ui.js';

export const tuikhoDefinition = new SlashCommandBuilder()
  .setName('tuikho')
  .setDescription('Xem các từ đã lưu trong Túi Càn Khôn')
  .addIntegerOption((option) => option
    .setName('trang')
    .setDescription('Trang muốn xem (mỗi trang tối đa 10 từ)')
    .setMinValue(1).setMaxValue(10000));

export async function handleTuikho(interaction: ChatInputCommandInteraction, service: BagService) {
  if (!interaction.guildId) {
    await interaction.reply({ content: 'Hãy sử dụng lệnh trong server Discord.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const page = interaction.options.getInteger('trang') ?? 1;
  await interaction.editReply(buildBagMessage(service, interaction.guildId, interaction.user.id, page));
}
