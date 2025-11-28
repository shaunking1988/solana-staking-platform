import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { startTelegramBot } from '@/lib/telegram-bot-instance';

export const dynamic = 'force-dynamic';

let botStarted = false;

export async function GET() {
  if (!botStarted && process.env.TELEGRAM_BOT_TOKEN) {
    try {
      startTelegramBot(prisma);
      botStarted = true;
      return NextResponse.json({ success: true, message: 'Bot started' });
    } catch (error: any) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
  }
  
  return NextResponse.json({ success: true, message: 'Bot already running' });
}