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
  REST,
  Routes,
  SlashCommandBuilder,
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

const { setupWatchdog } = require('./watchdog');

const TOKEN    = process.env.TICKET_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const CLIENT_ID = '1505285791918592220';

const openTickets = new Map();
const ticketLogs  = new Map();

// ── SLASH COMMANDS ────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('panel')
    .setDescription('🎫 Ticket panelini bu kanala kurar')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('log-kur')
    .setDescription('📋 Bu kanalı ticket log kanalı olarak ayarlar')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
  new SlashCommandBuilder()
    .setName('yardim')
    .setDescription('📖 Ticket botunun tüm komutlarını gösterir'),
  new SlashCommandBuilder()
    .setName('ticket-kapat')
    .setDescription('🔒 Bulunduğunuz ticket kanalını kapatır'),
].map((c) => c.toJSON());

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);
  try {
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
    console.log('✅ Slash komutları kaydedildi.');
  } catch (e) {
    console.error('❌ Komut kaydı hatası:', e.message);
  }
}

// ── LOG HELPER ────────────────────────────
async function sendLog(guild, embed) {
  const ch = guild.channels.cache.find(
    (c) => c.type === ChannelType.GuildText && c.name.toLowerCase().includes('ticket-log')
  );
  if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
}

// ── READY ─────────────────────────────────
client.once('ready', async () => {
  console.log(`✅ Ticket Bot aktif: ${client.user.tag}`);
  await registerCommands();
  setupWatchdog(client, TOKEN, GUILD_ID);
});

// ── SLASH COMMAND HANDLER ─────────────────
client.on('interactionCreate', async (interaction) => {
  // ── COMMANDS ──
  if (interaction.isChatInputCommand()) {
    const { commandName } = interaction;

    if (commandName === 'yardim') {
      const embed = new EmbedBuilder()
        .setTitle('🎫 JÖH Ticket Bot — Yardım')
        .setDescription('Aşağıda botun tüm komutları ve açıklamaları yer almaktadır.')
        .setColor(0x5865F2)
        .addFields(
          { name: '⚙️ Kurulum Komutları (Admin)', value: '\u200b', inline: false },
          { name: '/panel',      value: 'Ticket panelini bu kanala kurar',             inline: true },
          { name: '/log-kur',    value: 'Bu kanalı log kanalı olarak ayarlar',         inline: true },
          { name: '\u200b',      value: '\u200b',                                       inline: false },
          { name: '🎫 Kullanıcı Komutları', value: '\u200b',                           inline: false },
          { name: '/yardim',     value: 'Bu yardım menüsünü gösterir',                 inline: true },
          { name: '/ticket-kapat', value: 'Bulunduğunuz ticketi kapatır',              inline: true },
          { name: '\u200b',      value: '\u200b',                                       inline: false },
          { name: '🖱️ Panel Butonları', value: '\u200b',                              inline: false },
          { name: '🔵 Genel Destek',   value: 'Genel destek talebi açar',             inline: true },
          { name: '🔴 Şikayet',         value: 'Şikayet talebi açar',                  inline: true },
          { name: '🟡 Öneri',           value: 'Öneri talebi açar',                    inline: true },
          { name: '🟢 Ortaklık',        value: 'Ortaklık talebi açar',                 inline: true },
          { name: '🙋 Talebi Üstlen',   value: 'Yetkililer için: ticketi üstlenir',    inline: true },
          { name: '🔒 Ticketı Kapat',   value: 'Ticketi kapatır ve kanalı siler',      inline: true },
        )
        .setFooter({ text: 'JÖH Ticket Sistemi v2.0' })
        .setTimestamp();
      return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    if (commandName === 'panel') {
      const embed = new EmbedBuilder()
        .setTitle('🎫 Destek Merkezi')
        .setDescription(
          '**Merhaba!** Aşağıdaki butonlardan destek talebi açabilirsiniz.\n\n' +
          '🔵 **Genel Destek** — Genel sorular ve yardım talepleri\n' +
          '🔴 **Şikayet** — Kullanıcı veya yetkili şikayetleri\n' +
          '🟡 **Öneri** — Sunucu için önerileriniz\n' +
          '🟢 **Ortaklık** — Ortaklık başvuruları\n\n' +
          '> Ticket açtıktan sonra kısa sürede yetkililerimiz dönecektir.'
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

      await interaction.channel.send({ embeds: [embed], components: [row] });
      return interaction.reply({ content: '✅ Ticket paneli kuruldu!', ephemeral: true });
    }

    if (commandName === 'log-kur') {
      try { await interaction.channel.setName('ticket-logs'); } catch {}
      return interaction.reply({ content: '✅ Bu kanal **ticket-logs** olarak ayarlandı!', ephemeral: true });
    }

    if (commandName === 'ticket-kapat') {
      const log = ticketLogs.get(interaction.channel.id);
      if (!log) return interaction.reply({ content: '❌ Bu kanal bir ticket kanalı değil.', ephemeral: true });
      await handleTicketClose(interaction);
    }
  }

  // ── BUTTONS ──
  if (interaction.isButton()) {
    const id = interaction.customId;
    if (['ticket_genel','ticket_sikayet','ticket_oneri','ticket_ortaklik'].includes(id)) await handleTicketOpen(interaction, id);
    else if (id === 'ticket_kapat')  await handleTicketClose(interaction);
    else if (id === 'ticket_sil')    await handleTicketDelete(interaction);
    else if (id === 'ticket_talep')  await handleTicketClaim(interaction);
  }
});

// ── TICKET FUNCTIONS ──────────────────────
async function handleTicketOpen(interaction, typeId) {
  const guild  = interaction.guild;
  const member = interaction.member;
  const typeMap = {
    ticket_genel:    { name: 'Genel Destek', emoji: '🔵', color: 0x5865F2 },
    ticket_sikayet:  { name: 'Şikayet',      emoji: '🔴', color: 0xED4245 },
    ticket_oneri:    { name: 'Öneri',         emoji: '🟡', color: 0xFEE75C },
    ticket_ortaklik: { name: 'Ortaklık',      emoji: '🟢', color: 0x57F287 },
  };
  const type = typeMap[typeId];

  const existingKey = `${guild.id}-${member.id}-${typeId}`;
  if (openTickets.has(existingKey)) {
    const existing = guild.channels.cache.get(openTickets.get(existingKey));
    if (existing) return interaction.reply({ content: `❌ Zaten açık bir ${type.name} ticketınız var: ${existing}`, ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  let category = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('ticket'));
  if (!category) category = await guild.channels.create({ name: '🎫 Ticketlar', type: ChannelType.GuildCategory });

  const ticketNumber = Math.floor(Math.random() * 9000) + 1000;
  const channel = await guild.channels.create({
    name: `ticket-${ticketNumber}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      { id: guild.id,       deny: [PermissionFlagsBits.ViewChannel] },
      { id: member.id,      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels] },
    ],
  });

  openTickets.set(existingKey, channel.id);
  ticketLogs.set(channel.id, { opener: member.id, type: type.name, openedAt: Date.now(), claimedBy: null });

  const embed = new EmbedBuilder()
    .setTitle(`${type.emoji} ${type.name} Talebi`)
    .setDescription(
      `Merhaba ${member}, **${type.name}** talebi oluşturuldu!\n\n` +
      '📝 Sorununuzu detaylı açıklayın.\n⏱️ Yetkililerimiz kısa sürede dönecektir.\n\n' +
      '> Kapatmak için `/ticket-kapat` veya aşağıdaki butonu kullanın.'
    )
    .setColor(type.color)
    .addFields(
      { name: '👤 Açan',     value: `${member}`,                                inline: true },
      { name: '📋 Kategori', value: type.name,                                  inline: true },
      { name: '📅 Tarih',    value: `<t:${Math.floor(Date.now()/1000)}:F>`,    inline: true },
    )
    .setFooter({ text: `Ticket #${ticketNumber}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_talep').setLabel('Talebi Üstlen').setStyle(ButtonStyle.Primary).setEmoji('🙋'),
    new ButtonBuilder().setCustomId('ticket_kapat').setLabel('Ticketı Kapat').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
  );

  await channel.send({ content: `${member}`, embeds: [embed], components: [row] });
  await interaction.editReply({ content: `✅ Ticketınız oluşturuldu: ${channel}` });

  await sendLog(guild, new EmbedBuilder()
    .setTitle('📂 Yeni Ticket Açıldı').setColor(0x5865F2)
    .addFields(
      { name: '👤 Açan',   value: `${member} (${member.id})`, inline: true },
      { name: '📋 Tür',    value: type.name,                  inline: true },
      { name: '📌 Kanal',  value: `${channel}`,               inline: true },
      { name: '🕐 Tarih',  value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: false },
    ).setFooter({ text: `#${ticketNumber}` }).setTimestamp()
  );
}

async function handleTicketClaim(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages))
    return interaction.reply({ content: '❌ Yetkili olmanız gerekiyor.', ephemeral: true });

  const log = ticketLogs.get(interaction.channel.id);
  if (log) log.claimedBy = interaction.member.id;

  await interaction.reply({ embeds: [new EmbedBuilder().setTitle('🙋 Ticket Üstlenildi').setDescription(`${interaction.member} bu ticketı üstlendi.`).setColor(0x57F287).setTimestamp()] });

  await sendLog(interaction.guild, new EmbedBuilder()
    .setTitle('🙋 Ticket Üstlenildi').setColor(0x57F287)
    .addFields(
      { name: '🎫 Kanal',    value: `${interaction.channel}`, inline: true },
      { name: '👮 Üstlenen', value: `${interaction.member}`,  inline: true },
    ).setTimestamp()
  );
}

async function handleTicketClose(interaction) {
  const isSlash = interaction.isChatInputCommand?.() ?? false;
  if (isSlash) await interaction.deferReply({ ephemeral: true });
  else await interaction.deferReply();

  const log = ticketLogs.get(interaction.channel.id);
  const duration = log ? Math.floor((Date.now() - log.openedAt) / 1000) : 0;
  const dur = duration < 60 ? `${duration}s` : duration < 3600 ? `${Math.floor(duration/60)}dk` : `${Math.floor(duration/3600)}sa`;

  await sendLog(interaction.guild, new EmbedBuilder()
    .setTitle('🔒 Ticket Kapatıldı').setColor(0xED4245)
    .addFields(
      { name: '🎫 Kanal',    value: interaction.channel.name,                        inline: true },
      { name: '👤 Açan',     value: log ? `<@${log.opener}>` : '?',                  inline: true },
      { name: '👮 Kapatan',  value: `${interaction.member}`,                          inline: true },
      { name: '📋 Tür',      value: log?.type ?? '?',                                inline: true },
      { name: '👮 Üstlenen', value: log?.claimedBy ? `<@${log.claimedBy}>` : 'Yok', inline: true },
      { name: '⏱️ Süre',     value: dur,                                             inline: true },
    ).setTimestamp()
  );

  const msg = isSlash ? '✅ Ticket kapatılıyor, kanal 5 saniye içinde silinecek.' : undefined;
  if (isSlash) await interaction.editReply({ content: msg });
  else await interaction.editReply({ embeds: [new EmbedBuilder().setTitle('🔒 Kapatılıyor...').setDescription('Kanal 5 saniye içinde silinecek.').setColor(0xED4245).setTimestamp()] });

  setTimeout(async () => {
    for (const [k, v] of openTickets.entries()) if (v === interaction.channel.id) { openTickets.delete(k); break; }
    ticketLogs.delete(interaction.channel.id);
    await interaction.channel.delete('Ticket kapatıldı').catch(() => {});
  }, 5000);
}

async function handleTicketDelete(interaction) {
  for (const [k, v] of openTickets.entries()) if (v === interaction.channel.id) { openTickets.delete(k); break; }
  ticketLogs.delete(interaction.channel.id);
  await interaction.channel.delete('Ticket silindi').catch(() => {});
}

client.login(TOKEN);
