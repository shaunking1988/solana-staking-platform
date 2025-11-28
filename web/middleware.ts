import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// This middleware runs on every request
export function middleware(request: NextRequest) {
  return NextResponse.next();
}

// Start Telegram bot on server startup
if (typeof window === 'undefined' && process.env.TELEGRAM_BOT_TOKEN) {
  import('@/lib/prisma').then(({ prisma }) => {
    import('@/lib/telegram-bot-instance').then(({ startTelegramBot }) => {
      try {
        startTelegramBot(prisma);
        console.log('✅ Telegram bot auto-started');
      } catch (error) {
        console.error('❌ Failed to start Telegram bot:', error);
      }
    });
  });
}