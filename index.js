const {
  Client,
  GatewayIntentBits,
  Partials,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ChannelType,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
  ],
  partials: [Partials.Channel, Partials.Message],
});

const TOKEN = process.env.TICKET_TOKEN;
const openTickets = new Map();

client.once('ready', () => {
  console.log(`✅ Ticket Bot aktif: ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.guild) return;

  if (message.content === '!ticket-panel') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply('❌ Bu komutu kullanmak için yönetici yetkisi gereklidir.');
    }

    const embed = new EmbedBuilder()
      .setTitle('🎫 Destek Merkezi')
      .setDescription(
        '**Merhaba!** Aşağıdaki butonları kullanarak destek talebi oluşturabilirsiniz.\n\n' +
        '🔵 **Genel Destek** — Genel sorular ve yardım talepleri\n' +
        '🔴 **Şikayet** — Kullanıcı veya yetkili şikayetleri\n' +
        '🟡 **Öneri** — Sunucu için önerileriniz\n' +
        '🟢 **Ortaklık** — Ortaklık başvuruları\n\n' +
        '> Ticket açtıktan sonra kısa süre içinde yetkililerimiz size dönecektir.'
      )
      .setColor(0x5865F2)
      .setFooter({ text: 'JÖH Destek Sistemi' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_genel').setLabel('Genel Destek').setStyle(ButtonStyle.Primary).setEmoji('🔵'),
      new ButtonBuilder().setCustomId('ticket_sikayet').setLabel('Şikayet').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
      new ButtonBuilder().setCustomId('ticket_oneri').setLabel('Öneri').setStyle(ButtonStyle.Secondary).setEmoji('🟡'),
      new ButtonBuilder().setCustomId('ticket_ortaklik').setLabel('Ortaklık').setStyle(ButtonStyle.Success).setEmoji('🟢'),
    );

    await message.channel.send({ embeds: [embed], components: [row] });
    await message.delete().catch(() => {});
  }
});

client.on('interactionCreate', async (interaction) => {
  if (interaction.isButton()) {
    const id = interaction.customId;

    if (id.startsWith('ticket_') && !id.includes('kapat') && !id.includes('sil') && !id.includes('talep')) {
      await handleTicketOpen(interaction, id);
    } else if (id === 'ticket_kapat') {
      await handleTicketClose(interaction);
    } else if (id === 'ticket_sil') {
      await handleTicketDelete(interaction);
    } else if (id === 'ticket_talep') {
      await handleTicketClaim(interaction);
    }
  }
});

async function handleTicketOpen(interaction, typeId) {
  const guild = interaction.guild;
  const member = interaction.member;

  const typeMap = {
    ticket_genel: { name: 'Genel Destek', emoji: '🔵', color: 0x5865F2 },
    ticket_sikayet: { name: 'Şikayet', emoji: '🔴', color: 0xED4245 },
    ticket_oneri: { name: 'Öneri', emoji: '🟡', color: 0xFEE75C },
    ticket_ortaklik: { name: 'Ortaklık', emoji: '🟢', color: 0x57F287 },
  };

  const type = typeMap[typeId];

  const existingKey = `${guild.id}-${member.id}-${typeId}`;
  if (openTickets.has(existingKey)) {
    const existing = guild.channels.cache.get(openTickets.get(existingKey));
    if (existing) {
      return interaction.reply({
        content: `❌ Zaten açık bir ${type.name} ticketınız var: ${existing}`,
        ephemeral: true,
      });
    }
  }

  await interaction.deferReply({ ephemeral: true });

  let category = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('ticket')
  );

  if (!category) {
    category = await guild.channels.create({
      name: '🎫 Ticketlar',
      type: ChannelType.GuildCategory,
    });
  }

  const ticketNumber = Math.floor(Math.random() * 9000) + 1000;
  const channelName = `${type.emoji.replace(/[^a-zA-Z0-9]/g, '')}-ticket-${ticketNumber}`;

  const channel = await guild.channels.create({
    name: channelName,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel],
      },
      {
        id: member.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      {
        id: client.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
      },
    ],
  });

  openTickets.set(existingKey, channel.id);

  const embed = new EmbedBuilder()
    .setTitle(`${type.emoji} ${type.name} Talebi`)
    .setDescription(
      `Merhaba ${member}, **${type.name}** talebi oluşturuldu!\n\n` +
      '📝 Lütfen sorununuzu/talebinizi detaylı olarak açıklayın.\n' +
      '⏱️ Yetkililerimiz en kısa sürede size dönecektir.\n\n' +
      '> Ticket\'ı kapatmak için aşağıdaki butonu kullanabilirsiniz.'
    )
    .setColor(type.color)
    .addFields(
      { name: '👤 Açan', value: `${member}`, inline: true },
      { name: '📋 Kategori', value: type.name, inline: true },
      { name: '📅 Tarih', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
    )
    .setFooter({ text: `Ticket #${ticketNumber}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_talep').setLabel('Talebi Üstlen').setStyle(ButtonStyle.Primary).setEmoji('🙋'),
    new ButtonBuilder().setCustomId('ticket_kapat').setLabel('Ticketı Kapat').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
  );

  await channel.send({ content: `${member}`, embeds: [embed], components: [row] });

  await interaction.editReply({
    content: `✅ Ticketınız oluşturuldu: ${channel}`,
  });
}

async function handleTicketClaim(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({ content: '❌ Bu butonu kullanmak için yetkili olmanız gerekiyor.', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle('🙋 Ticket Üstlenildi')
    .setDescription(`${interaction.member} bu ticketı üstlendi. En kısa sürede yardımcı olacak.`)
    .setColor(0x57F287)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleTicketClose(interaction) {
  await interaction.deferReply();

  const embed = new EmbedBuilder()
    .setTitle('🔒 Ticket Kapatılıyor')
    .setDescription(`${interaction.member} tarafından ticket kapatıldı.\n\nKanal 5 saniye içinde silinecek...`)
    .setColor(0xED4245)
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_sil').setLabel('Kanalı Sil').setStyle(ButtonStyle.Danger).setEmoji('🗑️'),
  );

  await interaction.editReply({ embeds: [embed], components: [row] });

  setTimeout(async () => {
    for (const [key, channelId] of openTickets.entries()) {
      if (channelId === interaction.channel.id) {
        openTickets.delete(key);
        break;
      }
    }
    await interaction.channel.delete('Ticket kapatıldı').catch(() => {});
  }, 5000);
}

async function handleTicketDelete(interaction) {
  for (const [key, channelId] of openTickets.entries()) {
    if (channelId === interaction.channel.id) {
      openTickets.delete(key);
      break;
    }
  }
  await interaction.channel.delete('Ticket silindi').catch(() => {});
}

client.login(TOKEN);
