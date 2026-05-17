// ── WATCHDOG — Otomatik yeniden başlatma sistemi ──────────────────────────────
const { EmbedBuilder, ChannelType } = require('discord.js');

const MAX_RESTARTS    = 10;       // Max yeniden bağlanma denemesi
const RESTART_DELAY   = 5000;    // 5 saniye bekle
const RESET_AFTER     = 60000;   // 1 dakika sorunsuz çalışırsa sayacı sıfırla

let restartCount = 0;
let lastRestartTime = 0;

async function sendCrashLog(client, error, guildId) {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;

    const logCh = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.name.toLowerCase().includes('ticket-log')
    );
    if (!logCh) return;

    await logCh.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('⚠️ Ticket Bot — Hata Bildirimi')
          .setDescription('Bot bir hata ile karşılaştı ve yeniden bağlanmaya çalışıyor.')
          .setColor(0xFF8C00)
          .addFields(
            { name: '❌ Hata',          value: String(error?.message ?? error).slice(0, 1000), inline: false },
            { name: '🔄 Yeniden Deneme', value: `${restartCount}/${MAX_RESTARTS}`,             inline: true },
            { name: '⏱️ Tarih',          value: `<t:${Math.floor(Date.now()/1000)}:F>`,        inline: true },
          )
          .setFooter({ text: 'Watchdog Sistemi — Otomatik Kurtarma' })
          .setTimestamp(),
      ],
    });
  } catch {}
}

async function sendRestartLog(client, guildId) {
  try {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const logCh = guild.channels.cache.find(
      (c) => c.type === ChannelType.GuildText && c.name.toLowerCase().includes('ticket-log')
    );
    if (!logCh) return;
    await logCh.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('✅ Ticket Bot — Yeniden Bağlandı')
          .setDescription('Bot başarıyla yeniden bağlandı ve aktif.')
          .setColor(0x57F287)
          .addFields({ name: '⏱️ Tarih', value: `<t:${Math.floor(Date.now()/1000)}:F>`, inline: true })
          .setTimestamp(),
      ],
    });
  } catch {}
}

function setupWatchdog(client, TOKEN, GUILD_ID) {
  // Discord.js built-in hataları
  client.on('error', async (error) => {
    console.error('[WATCHDOG] Client error:', error.message);
    await sendCrashLog(client, error, GUILD_ID);
  });

  client.on('shardDisconnect', async (event, shardId) => {
    console.warn(`[WATCHDOG] Shard ${shardId} bağlantısı kesildi. Kod: ${event.code}`);
    if (event.code === 1000) return; // Normal kapanma
    await attemptReconnect(client, TOKEN, GUILD_ID);
  });

  client.on('shardReconnecting', (shardId) => {
    console.log(`[WATCHDOG] Shard ${shardId} yeniden bağlanıyor...`);
  });

  client.on('shardResume', async (shardId) => {
    console.log(`[WATCHDOG] Shard ${shardId} yeniden bağlandı.`);
    await sendRestartLog(client, GUILD_ID);
    // Sayacı sıfırla
    setTimeout(() => { restartCount = 0; }, RESET_AFTER);
  });

  // Yakalanmamış hatalar
  process.on('unhandledRejection', async (reason) => {
    console.error('[WATCHDOG] Unhandled Rejection:', reason);
    await sendCrashLog(client, reason, GUILD_ID);
  });

  process.on('uncaughtException', async (error) => {
    console.error('[WATCHDOG] Uncaught Exception:', error.message);
    await sendCrashLog(client, error, GUILD_ID);
    await attemptReconnect(client, TOKEN, GUILD_ID);
  });

  // Heartbeat kontrolü — her 30 saniyede ping at
  setInterval(() => {
    if (client.ws.ping === -1) {
      console.warn('[WATCHDOG] Ping -1 — bağlantı yok, yeniden bağlanılıyor...');
      attemptReconnect(client, TOKEN, GUILD_ID);
    } else {
      console.log(`[WATCHDOG] Ping: ${client.ws.ping}ms ✅`);
    }
  }, 30000);

  console.log('[WATCHDOG] ✅ Watchdog sistemi aktif.');
}

async function attemptReconnect(client, TOKEN, GUILD_ID) {
  const now = Date.now();
  if (now - lastRestartTime < RESTART_DELAY) return;
  if (restartCount >= MAX_RESTARTS) {
    console.error('[WATCHDOG] Max yeniden bağlanma denemesine ulaşıldı. Process yeniden başlatılıyor...');
    process.exit(1); // Railway otomatik yeniden başlatır
  }
  lastRestartTime = now;
  restartCount++;
  console.log(`[WATCHDOG] Yeniden bağlanma denemesi ${restartCount}/${MAX_RESTARTS}...`);
  await new Promise((r) => setTimeout(r, RESTART_DELAY));
  try {
    await client.login(TOKEN);
    console.log('[WATCHDOG] ✅ Yeniden bağlandı!');
  } catch (e) {
    console.error('[WATCHDOG] Yeniden bağlanma başarısız:', e.message);
    process.exit(1);
  }
}

module.exports = { setupWatchdog };
