import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getTelegramBot, startTelegramBot, stopTelegramBot } from "@/lib/telegram-bot-instance";

// GET - Check bot status
export async function GET(req: NextRequest) {
  try {
    const bot = getTelegramBot(prisma);
    const isActive = bot.isActive();

    return NextResponse.json({
      status: isActive ? "running" : "stopped",
      enabled: !!process.env.TELEGRAM_BOT_TOKEN,
    });
  } catch (error) {
    console.error("Error checking bot status:", error);
    return NextResponse.json(
      { error: "Failed to check bot status" },
      { status: 500 }
    );
  }
}

// POST - Start or stop the bot
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return NextResponse.json(
        { error: "TELEGRAM_BOT_TOKEN not configured" },
        { status: 400 }
      );
    }

    if (action === "start") {
      const bot = startTelegramBot(prisma);
      return NextResponse.json({
        success: true,
        status: "running",
        message: "Telegram bot started successfully",
      });
    } else if (action === "stop") {
      await stopTelegramBot();
      return NextResponse.json({
        success: true,
        status: "stopped",
        message: "Telegram bot stopped successfully",
      });
    } else {
      return NextResponse.json(
        { error: "Invalid action. Use 'start' or 'stop'" },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error("Error controlling bot:", error);
    return NextResponse.json(
      { error: "Failed to control bot" },
      { status: 500 }
    );
  }
}