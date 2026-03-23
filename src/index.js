const { config } = require('./config');
const { Store } = require('./store');
const { createBot } = require('./bot');
const { createAdminApp } = require('./admin');

async function bootstrap() {
  const store = new Store(config.dataFile);

  const botService = createBot({
    token: config.botToken,
    store,
    leadsChatId: config.leadsChatId,
    adminChatIds: config.adminChatIds,
  });

  const adminApp = createAdminApp({
    store,
    adminPassword: config.adminPassword,
    sessionSecret: config.sessionSecret,
    botApi: {
      sendMessage: async (tgId, text) => {
        await botService.bot.telegram.sendMessage(tgId, text);
      },
    },
  });

  const server = adminApp.listen(config.adminPort, () => {
    // eslint-disable-next-line no-console
    console.log(`Admin panel is running on http://localhost:${config.adminPort}`);
  });

  await botService.launch();
  // eslint-disable-next-line no-console
  console.log('Telegram bot started');

  const shutdown = (signal) => {
    // eslint-disable-next-line no-console
    console.log(`Received ${signal}. Shutting down...`);
    botService.stop(signal);
    server.close(() => {
      process.exit(0);
    });
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', error);
  process.exit(1);
});
