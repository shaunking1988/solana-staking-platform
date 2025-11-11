import type { PrismaClient } from '@prisma/client';
import { TelegramBotService } from './telegram-bot';

// Singleton instance
let botInstance: TelegramBotService | null = null;

export function getTelegramBot(prisma: PrismaClient): TelegramBotService {
  if (!botInstance) {
    botInstance = new TelegramBotService(prisma);
  }
  return botInstance;
}

export function startTelegramBot(prisma: PrismaClient) {
  const bot = getTelegramBot(prisma);
  bot.start();
  return bot;
}

export async function stopTelegramBot() {
  if (botInstance) {
    await botInstance.stop();
  }
}