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

// ── YAPIKLANDIRMA ──────────────────────────
const TOKEN     = process.env.TICKET_TOKEN;
const GUILD_ID  = process.env.GUILD_ID;
const CLIENT_ID = '1505285791918592220';

if (!TOKEN)    { console.error('❌ TICKET_TOKEN env var eksik!'); process.exit(1); }
if (!GUILD_ID) { console.error('❌ GUILD_ID env var eksik!');    process.exit(1); }

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

// Bellekte ticket verileri
const openTickets = new Map(); // key: guildId-userId-typeId, val: channelId
const ticketData  = new Map(); // key: channelId, val: { opener, type, openedAt, claimedBy }

// ── SLASH KOMUTLAR ─────────────────────────
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
    .setName('ticket-kapat')
    .setDescription('🔒 Bulunduğunuz ticket kanalını kapatır'),

  new SlashCommandBuilder()
    .setName('ticket-listesi')
    .setDescription('📋 Şu an açık olan tüm ticketları listeler')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('durum')
    .setDescription('📊 Botun durumunu gösterir'),

  new SlashCommandBuilder()
    .setName('yardim')
    .setDescription('📖 Tüm komutları listeler'),
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

// ── YARDIMCI FONKSİYONLAR ─────────────────
async function sendLog(guild, embed) {
  try {
    const ch = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.name.toLowerCase().includes('ticket-log')
    );
    if (ch) await ch.send({ embeds: [embed] });
  } catch {}
}

function uptimeStr() {
  const u = process.uptime();
  const h = Math.floor(u / 3600);
  const m = Math.floor((u % 3600) / 60);
  const s = Math.floor(u % 60);
  return `${h}sa ${m}dk ${s}sn`;
}

// ── READY ──────────────────────────────────
client.once('ready', () => {
  console.log(`✅ Ticket Bot aktif: ${client.user.tag}`);
  console.log(`✅ ${client.guilds.cache.size} sunucuda aktif`);
  setupWatchdog(client, TOKEN, GUILD_ID);
});

// ── INTERACTION HANDLER ────────────────────
client.on('interactionCreate', async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) await handleCommand(interaction);
    else if (interaction.isButton())       await handleButton(interaction);
  } catch (err) {
    console.error('[HATA]', err);
    const msg = { content: '❌ Bir hata oluştu. Lütfen tekrar deneyin.', ephemeral: true };
    if (interaction.deferred) await interaction.editReply(msg).catch(() => {});
    else if (!interaction.replied) await interaction.reply(msg).catch(() => {});
  }
});

// ── KOMUT İŞLEYİCİ ────────────────────────
async function handleCommand(interaction) {
  const { commandName, guild, member, channel } = interaction;

  // ── /durum ──
  if (commandName === 'durum') {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('📊 Ticket Bot — Durum')
        .setColor(0x57F287)
        .addFields(
          { name: '🏓 Ping',           value: `${client.ws.ping}ms`,            inline: true },
          { name: '⏱️ Uptime',         value: uptimeStr(),                       inline: true },
          { name: '🎫 Açık Ticketlar', value: `${openTickets.size}`,            inline: true },
          { name: '🤖 Bot',            value: client.user.tag,                   inline: true },
          { name: '📡 Sunucu',         value: `${client.guilds.cache.size}`,    inline: true },
          { name: '💚 Durum',           value: '🟢 Online',                      inline: true },
        )
        .setFooter({ text: 'JÖH Ticket v2.0 | Watchdog 🛡️' })
        .setTimestamp()],
      ephemeral: true,
    });
  }

  // ── /yardim ──
  if (commandName === 'yardim') {
    return interaction.reply({
      embeds: [new EmbedBuilder()
        .setTitle('🎫 JÖH Ticket Bot — Komut Listesi')
        .setColor(0x5865F2)
        .addFields(
          { name: '⚙️ Admin Komutları',    value: '\u200b' },
          { name: '/panel',         value: 'Ticket panelini kurar',                 inline: true },
          { name: '/log-kur',       value: 'Log kanalı ayarlar',                   inline: true },
          { name: '/ticket-listesi',value: 'Açık ticketları listeler',             inline: true },
          { name: '👤 Kullanıcı',          value: '\u200b' },
          { name: '/ticket-kapat', value: 'Ticketi kapatır',                      inline: true },
          { name: '/durum',         value: 'Bot durumunu gösterir',               inline: true },
          { name: '/yardim',        value: 'Bu menü',                              inline: true },
          { name: '🖱️ Butonlar',           value: '\u200b' },
          { name: '🔵 Genel / 🔴 Şikayet', value: 'Ticket türleri',               inline: true },
          { name: '🟡 Öneri / 🟢 Ortaklık', value: 'Ticket türleri',              inline: true },
          { name: '🙋 Üstlen / 🔒 Kapat',  value: 'Yetkili aksiyonları',          inline: true },
        )
        .setFooter({ text: 'JÖH Ticket Sistemi v2.0' })
        .setTimestamp()],
      ephemeral: true,
    });
  }

  // ── /ticket-listesi ──
  if (commandName === 'ticket-listesi') {
    if (openTickets.size === 0) {
      return interaction.reply({ content: '✅ Şu an açık ticket bulunmuyor.', ephemeral: true });
    }
    const embed = new EmbedBuilder()
      .setTitle(`🎫 Açık Ticketlar (${openTickets.size})`)
      .setColor(0x5865F2)
      .setTimestamp();
    let i = 0;
    for (const [key, chId] of openTickets.entries()) {
      const ch   = guild.channels.cache.get(chId);
      const data = ticketData.get(chId);
      if (!ch) continue;
      embed.addFields({
        name: `${++i}. ${ch.name}`,
        value: `Açan: <@${data?.opener ?? '?'}> | Tür: ${data?.type ?? '?'} | Üstlenen: ${data?.claimedBy ? `<@${data.claimedBy}>` : 'Yok'}`,
        inline: false,
      });
    }
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // ── /panel ──
  if (commandName === 'panel') {
    const embed = new EmbedBuilder()
      .setTitle('🎫 JÖH Destek Merkezi')
      .setDescription(
        '**Merhaba!** Aşağıdaki butonlardan destek talebi oluşturabilirsiniz.\n\n' +
        '> 🔵 **Genel Destek** — Genel sorular ve yardım\n' +
        '> 🔴 **Şikayet** — Kullanıcı veya yetkili şikayetleri\n' +
        '> 🟡 **Öneri** — Sunucu için önerileriniz\n' +
        '> 🟢 **Ortaklık** — Ortaklık başvuruları\n\n' +
        '> Ticket açtıktan sonra kısa sürede yetkililerimiz dönecektir.'
      )
      .setColor(0x5865F2)
      .setFooter({ text: 'JÖH Destek Sistemi v2.0' })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_genel').setLabel('Genel Destek').setStyle(ButtonStyle.Primary).setEmoji('🔵'),
      new ButtonBuilder().setCustomId('ticket_sikayet').setLabel('Şikayet').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
      new ButtonBuilder().setCustomId('ticket_oneri').setLabel('Öneri').setStyle(ButtonStyle.Secondary).setEmoji('🟡'),
      new ButtonBuilder().setCustomId('ticket_ortaklik').setLabel('Ortaklık').setStyle(ButtonStyle.Success).setEmoji('🟢'),
    );

    await channel.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: '✅ Ticket paneli kuruldu!', ephemeral: true });
  }

  // ── /log-kur ──
  if (commandName === 'log-kur') {
    try { await channel.setName('ticket-logs'); } catch {}
    return interaction.reply({ content: `✅ ${channel} artık **ticket log** kanalı!`, ephemeral: true });
  }

  // ── /ticket-kapat ──
  if (commandName === 'ticket-kapat') {
    if (!ticketData.has(channel.id)) {
      return interaction.reply({ content: '❌ Bu kanal bir ticket kanalı değil.', ephemeral: true });
    }
    await closeTicket(interaction, true);
  }
}

// ── BUTON İŞLEYİCİ ────────────────────────
async function handleButton(interaction) {
  const id = interaction.customId;
  const ticketTypes = ['ticket_genel', 'ticket_sikayet', 'ticket_oneri', 'ticket_ortaklik'];

  if (ticketTypes.includes(id))   await openTicket(interaction, id);
  else if (id === 'ticket_talep') await claimTicket(interaction);
  else if (id === 'ticket_kapat') await closeTicket(interaction, false);
}

// ── TICKET AÇMA ────────────────────────────
async function openTicket(interaction, typeId) {
  const { guild, member } = interaction;
  const typeMap = {
    ticket_genel:    { name: 'Genel Destek', emoji: '🔵', color: 0x5865F2 },
    ticket_sikayet:  { name: 'Şikayet',      emoji: '🔴', color: 0xED4245 },
    ticket_oneri:    { name: 'Öneri',         emoji: '🟡', color: 0xFEE75C },
    ticket_ortaklik: { name: 'Ortaklık',      emoji: '🟢', color: 0x57F287 },
  };
  const type = typeMap[typeId];
  const key  = `${guild.id}-${member.id}-${typeId}`;

  // Zaten açık ticket kontrolü
  if (openTickets.has(key)) {
    const existing = guild.channels.cache.get(openTickets.get(key));
    if (existing) return interaction.reply({ content: `❌ Zaten açık bir ${type.name} ticketınız var: ${existing}`, ephemeral: true });
    openTickets.delete(key); // Kanal silinmişse temizle
  }

  await interaction.deferReply({ ephemeral: true });

  // Kategori bul/oluştur
  let cat = guild.channels.cache.find((c) => c.type === ChannelType.GuildCategory && c.name.toLowerCase().includes('ticket'));
  if (!cat) cat = await guild.channels.create({ name: '🎫 Ticketlar', type: ChannelType.GuildCategory });

  const num = Math.floor(Math.random() * 9000) + 1000;
  const ch  = await guild.channels.create({
    name: `ticket-${num}`,
    type: ChannelType.GuildText,
    parent: cat.id,
    permissionOverwrites: [
      { id: guild.id,       deny:  [PermissionFlagsBits.ViewChannel] },
      { id: member.id,      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] },
      { id: client.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.EmbedLinks] },
    ],
  });

  openTickets.set(key, ch.id);
  ticketData.set(ch.id, { opener: member.id, type: type.name, openedAt: Date.now(), claimedBy: null });

  const embed = new EmbedBuilder()
    .setTitle(`${type.emoji} ${type.name} Talebi`)
    .setDescription(
      `Merhaba ${member}! **${type.name}** talebiniz oluşturuldu.\n\n` +
      '📝 Sorununuzu aşağıya detaylıca yazın.\n' +
      '⏱️ Yetkililerimiz kısa süre içinde yanıt verecektir.\n\n' +
      '> 🔒 Kapatmak için aşağıdaki butonu kullanabilirsiniz.'
    )
    .setColor(type.color)
    .addFields(
      { name: '👤 Açan',     value: `${member}`,                              inline: true },
      { name: '📋 Tür',      value: type.name,                                inline: true },
      { name: '📅 Tarih',    value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
    )
    .setFooter({ text: `Ticket #${num} | JÖH Destek Sistemi` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_talep').setLabel('Talebi Üstlen').setStyle(ButtonStyle.Primary).setEmoji('🙋'),
    new ButtonBuilder().setCustomId('ticket_kapat').setLabel('Ticketı Kapat').setStyle(ButtonStyle.Danger).setEmoji('🔒'),
  );

  await ch.send({ content: `${member}`, embeds: [embed], components: [row] });
  await interaction.editReply({ content: `✅ Ticketınız oluşturuldu: ${ch}` });

  await sendLog(guild, new EmbedBuilder()
    .setTitle('📂 Yeni Ticket Açıldı').setColor(0x5865F2)
    .addFields(
      { name: '👤 Açan',  value: `${member} (${member.id})`,            inline: true },
      { name: '📋 Tür',   value: type.name,                              inline: true },
      { name: '📌 Kanal', value: `${ch}`,                                inline: true },
      { name: '🕐 Tarih', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false },
    ).setFooter({ text: `#${num}` }).setTimestamp()
  );
}

// ── TICKET ÜSTLENME ────────────────────────
async function claimTicket(interaction) {
  if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
    return interaction.reply({ content: '❌ Bu işlem için yetkiniz yok.', ephemeral: true });
  }

  const data = ticketData.get(interaction.channel.id);
  if (!data) return interaction.reply({ content: '❌ Bu kanal bir ticket değil.', ephemeral: true });
  if (data.claimedBy) return interaction.reply({ content: `❌ Bu ticket zaten <@${data.claimedBy}> tarafından üstlenildi.`, ephemeral: true });

  data.claimedBy = interaction.member.id;

  await interaction.reply({
    embeds: [new EmbedBuilder()
      .setTitle('🙋 Ticket Üstlenildi')
      .setDescription(`${interaction.member} bu ticketı üstlendi.`)
      .setColor(0x57F287)
      .setTimestamp()],
  });

  await sendLog(interaction.guild, new EmbedBuilder()
    .setTitle('🙋 Ticket Üstlenildi').setColor(0x57F287)
    .addFields(
      { name: '🎫 Kanal',    value: `${interaction.channel}`, inline: true },
      { name: '👮 Üstlenen', value: `${interaction.member}`,  inline: true },
    ).setTimestamp()
  );
}

// ── TICKET KAPATMA ─────────────────────────
async function closeTicket(interaction, isSlash) {
  const data = ticketData.get(interaction.channel.id);
  if (isSlash) await interaction.deferReply({ ephemeral: true });
  else         await interaction.deferReply();

  const dur = data ? (() => {
    const s = Math.floor((Date.now() - data.openedAt) / 1000);
    return s < 60 ? `${s}sn` : s < 3600 ? `${Math.floor(s / 60)}dk` : `${Math.floor(s / 3600)}sa`;
  })() : '?';

  await sendLog(interaction.guild, new EmbedBuilder()
    .setTitle('🔒 Ticket Kapatıldı').setColor(0xED4245)
    .addFields(
      { name: '🎫 Kanal',    value: interaction.channel.name,                         inline: true },
      { name: '👤 Açan',     value: data ? `<@${data.opener}>` : '?',                 inline: true },
      { name: '👮 Kapatan',  value: `${interaction.member}`,                           inline: true },
      { name: '📋 Tür',      value: data?.type ?? '?',                                 inline: true },
      { name: '👮 Üstlenen', value: data?.claimedBy ? `<@${data.claimedBy}>` : 'Yok', inline: true },
      { name: '⏱️ Süre',     value: dur,                                               inline: true },
    ).setTimestamp()
  );

  const closeEmbed = new EmbedBuilder()
    .setTitle('🔒 Ticket Kapatılıyor')
    .setDescription('Bu ticket kapatıldı. Kanal **5 saniye** içinde silinecek.')
    .setColor(0xED4245)
    .setTimestamp();

  if (isSlash) await interaction.editReply({ content: '✅ Ticket kapatılıyor...' });
  else         await interaction.editReply({ embeds: [closeEmbed] });

  setTimeout(async () => {
    // Map'ten temizle
    for (const [k, v] of openTickets.entries()) {
      if (v === interaction.channel.id) { openTickets.delete(k); break; }
    }
    ticketData.delete(interaction.channel.id);
    await interaction.channel.delete('Ticket kapatıldı').catch(() => {});
  }, 5000);
}

// ── BAŞLAT ─────────────────────────────────
console.log('🚀 Ticket Bot başlatılıyor...');
console.log(`📋 CLIENT_ID : ${CLIENT_ID}`);
console.log(`📋 GUILD_ID  : ${GUILD_ID}`);
console.log(`📋 TOKEN     : ${TOKEN.slice(0, 20)}...`);

registerCommands().then(() => {
  client.login(TOKEN).catch((err) => {
    console.error('❌ Login hatası:', err.message);
    process.exit(1);
  });
});
