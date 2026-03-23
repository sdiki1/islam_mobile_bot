const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

const DATA_FILE = path.resolve(process.cwd(), process.env.DATA_FILE || './data/db.json');

const config = {
  botToken: process.env.BOT_TOKEN || '',
  adminPassword: process.env.ADMIN_PASSWORD || 'change_me',
  adminPort: Number(process.env.ADMIN_PORT || 3000),
  sessionSecret: process.env.SESSION_SECRET || 'replace_with_random_string',
  leadsChatId: Number(process.env.LEADS_CHAT_ID || 0),
  adminChatIds: (process.env.ADMIN_CHAT_IDS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value)),
  dataFile: DATA_FILE,
};

module.exports = { config };
