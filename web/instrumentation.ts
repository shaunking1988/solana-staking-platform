import { prisma } from './lib/prisma';
import { startTelegramBot } from './lib/telegram-bot-instance';

// This function is called when the Next.js server starts
export function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // Auto-start Telegram bot when server starts
    if (process.env.TELEGRAM_BOT_TOKEN) {
      console.log('🚀 Starting Telegram bot...');
      startTelegramBot(prisma);
    } else {
      console.warn('⚠️  TELEGRAM_BOT_TOKEN not found. Telegram bot will not start.');
    }
  }
}