import TelegramBot from 'node-telegram-bot-api';
import type { PrismaClient } from '@prisma/client';

interface WalletStat {
  rank: number;
  address: string;
  volumeUsd: number;
  swaps: number;
}

interface SwapStats {
  totalSwaps: number;
  totalVolumeUsd: number;
  totalFeesUsd: number;
  rewardPoolUsd: number;
  last24hVolumeUsd: number;
  last7dVolumeUsd: number;
  topWallets: WalletStat[];
}

export class TelegramBotService {
  private bot: TelegramBot | null = null;
  private prisma: PrismaClient;
  private isRunning = false;
  private bannerImageUrl: string = "https://image2url.com/images/1762876954512-706b19ed-165f-4d8e-a320-a0edaa7abc43.jpg";

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  // Initialize and start the bot
  start() {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
      console.warn('⚠️  TELEGRAM_BOT_TOKEN not found. Telegram bot disabled.');
      return;
    }

    if (this.isRunning) {
      console.warn('⚠️  Telegram bot is already running.');
      return;
    }

    try {
      this.bot = new TelegramBot(token, { polling: true });
      this.isRunning = true;
      this.setupCommands();
      this.setupErrorHandlers();
      console.log('🤖 Telegram bot started successfully!');
    } catch (error) {
      console.error('❌ Failed to start Telegram bot:', error);
    }
  }

  // Stop the bot
  async stop() {
    if (this.bot && this.isRunning) {
      await this.bot.stopPolling();
      this.isRunning = false;
      console.log('🛑 Telegram bot stopped.');
    }
  }

  // Helper: Send message with optional banner image
  private async sendMessageWithBanner(chatId: number, message: string) {
    if (this.bannerImageUrl) {
      try {
        await this.bot!.sendPhoto(chatId, this.bannerImageUrl, {
          caption: message,
          parse_mode: 'Markdown'
        });
      } catch (error) {
        // If image fails, send text only
        console.error('Failed to send banner image:', error);
        await this.bot!.sendMessage(chatId, message, { parse_mode: 'Markdown' });
      }
    } else {
      await this.bot!.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    }
  }

  // Helper: Format numbers
  private formatNumber(num: number, decimals: number = 2): string {
    return num.toLocaleString('en-US', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  // Helper: Shorten wallet address
  private shortenAddress(address: string): string {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  }

  // Helper: Get medal emoji
  private getMedal(rank: number): string {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `${rank}.`;
  }

  // Helper: Get start of current week (Monday 00:00)
  private getWeekStart(): Date {
    const now = new Date();
    const day = now.getDay();
    const diff = day === 0 ? -6 : 1 - day; // If Sunday (0), go back 6 days; else go to Monday
    const monday = new Date(now);
    monday.setDate(now.getDate() + diff);
    monday.setHours(0, 0, 0, 0);
    return monday;
  }

  // Helper: Get end of current week (Sunday 23:59)
  private getWeekEnd(): Date {
    const monday = this.getWeekStart();
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);
    return sunday;
  }

  // Fetch stats from database (same logic as API)
  private async fetchStats(mode: 'week' | 'month' | 'alltime' | number = 'week'): Promise<SwapStats | null> {
    try {
      // Build date filter
      const dateFilter: any = {};
      
      if (mode === 'week') {
        // Current calendar week (Monday 00:00 to Sunday 23:59)
        dateFilter.gte = this.getWeekStart();
        dateFilter.lte = this.getWeekEnd();
      } else if (mode === 'month') {
        // Last 30 days
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        dateFilter.gte = startDate;
        dateFilter.lte = endDate;
      } else if (typeof mode === 'number') {
        // Custom days (rolling)
        const endDate = new Date();
        const startDate = new Date(endDate.getTime() - mode * 24 * 60 * 60 * 1000);
        dateFilter.gte = startDate;
        dateFilter.lte = endDate;
      }
      // 'alltime' = no filter

      const whereClause = Object.keys(dateFilter).length > 0
        ? { createdAt: dateFilter }
        : {};

      // Get overall statistics
      const stats = await this.prisma.swapStats.aggregate({
        where: whereClause,
        _count: { id: true },
        _sum: { volumeUsd: true },
      });

      // Calculate time-based volumes
      const now = new Date();
      const day24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

      const last24hStats = await this.prisma.swapStats.aggregate({
        where: { createdAt: { gte: day24Ago } },
        _sum: { volumeUsd: true },
      });

      const last7dStats = await this.prisma.swapStats.aggregate({
        where: { createdAt: { gte: day7Ago } },
        _sum: { volumeUsd: true },
      });

      // Get top wallets
      const topWalletsRaw = await this.prisma.swapStats.groupBy({
        where: whereClause,
        by: ['userAddress'],
        _count: { id: true },
        _sum: { volumeUsd: true },
        orderBy: { _sum: { volumeUsd: 'desc' } },
        take: 100,
      });

      const topWallets = topWalletsRaw.map((wallet, index) => ({
        rank: index + 1,
        address: wallet.userAddress,
        volumeUsd: wallet._sum.volumeUsd || 0,
        swaps: wallet._count.id,
      }));

      // Get platform fee
      const config = await this.prisma.swapConfig.findFirst();
      const platformFeeBps = config?.platformFeeBps || 100;
      const totalVolumeUsd = stats._sum.volumeUsd || 0;
      const totalFeesUsd = (totalVolumeUsd * platformFeeBps) / 10000;
      
      // Calculate reward pool (40% of fees collected)
      const rewardPoolUsd = totalFeesUsd * 0.4;

      return {
        totalSwaps: stats._count.id || 0,
        totalVolumeUsd,
        totalFeesUsd,
        rewardPoolUsd, // Add reward pool
        last24hVolumeUsd: last24hStats._sum.volumeUsd || 0,
        last7dVolumeUsd: last7dStats._sum.volumeUsd || 0,
        topWallets,
      };
    } catch (error) {
      console.error('Error fetching stats from database:', error);
      return null;
    }
  }

  // Format leaderboard message
  private formatLeaderboard(stats: SwapStats, mode: 'week' | 'month' | 'alltime' | number = 'week', limit: number = 10): string {
    let period: string;
    
    if (mode === 'week') {
      const weekStart = this.getWeekStart();
      const weekEnd = this.getWeekEnd();
      const startStr = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const endStr = weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      period = `This Week (${startStr} - ${endStr})`;
    } else if (mode === 'month') {
      period = 'Last 30 Days';
    } else if (mode === 'alltime') {
      period = 'All Time';
    } else {
      period = `Last ${mode} Days`;
    }
    
    const topWallets = stats.topWallets.slice(0, limit);

    if (topWallets.length === 0) {
      return `📊 *StakePoint Top Traders - ${period}*\n\n❌ No trading data available for this period.`;
    }

    let message = `🏆 *StakePoint Top ${limit} Traders - ${period}*\n\n`;
    message += `📈 Total Volume: $${this.formatNumber(stats.totalVolumeUsd)}\n`;
    message += `🔄 Total Swaps: ${this.formatNumber(stats.totalSwaps, 0)}\n`;
    
    // Show reward pool for weekly leaderboard
    if (mode === 'week') {
      message += `\n🎁 *Reward Pool: $${this.formatNumber(stats.rewardPoolUsd)}*\n`;
      message += `   💎 Distributed to top 10 traders!\n`;
    }
    
    message += `\n━━━━━━━━━━━━━━━━━━━━\n\n`;

    topWallets.forEach((wallet) => {
      const medal = this.getMedal(wallet.rank);
      const address = this.shortenAddress(wallet.address);
      const volume = this.formatNumber(wallet.volumeUsd);
      
      message += `${medal} \`${address}\`\n`;
      message += `   💵 Volume: $${volume}\n`;
      message += `   🔄 Swaps: ${wallet.swaps}\n`;
      
      // Show individual reward for weekly leaderboard (top 10 only - EQUAL SPLIT)
      if (mode === 'week' && wallet.rank <= 10 && stats.rewardPoolUsd > 0) {
        const equalReward = stats.rewardPoolUsd / 10;
        message += `   🎁 Reward: $${this.formatNumber(equalReward)}\n`;
      }
      
      message += `\n`;
    });

    message += `━━━━━━━━━━━━━━━━━━━━\n`;
    message += `📅 Updated: ${new Date().toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })}`;

    return message;
  }

  // Setup bot commands
  private setupCommands() {
    if (!this.bot) return;

    // Command: /start
    this.bot.onText(/\/start/, async (msg) => {
      const chatId = msg.chat.id;
      const welcomeMessage = `
🎯 *Welcome to StakePoint Leaderboard Bot!*

I track the top traders on the StakePoint platform and show weekly rewards!

*Available Commands:*
/toptraders - Show this week's top 10 + rewards (Mon-Sun)
/top10 - Same as /toptraders
/top20 - Show top 20 traders
/monthly - Show top 10 for last 30 days
/alltime - Show all-time top 10 traders
/help - Show this help message

*Weekly Rewards:*
🎁 Reward pool split equally among top 10 traders!
📅 Resets every Monday at 00:00

Let's see who's leading the pack! 🚀
      `;

      await this.sendMessageWithBanner(chatId, welcomeMessage);
    });

    // Command: /help
    this.bot.onText(/\/help/, async (msg) => {
      const chatId = msg.chat.id;
      const helpMessage = `
📚 *StakePoint Leaderboard Bot Commands*

*Leaderboard Commands:*
/toptraders - This week's top 10 (Mon-Sun)
/top10 - Same as /toptraders
/top20 - Top 20 traders (this week)
/monthly - Top 10 for last 30 days
/alltime - All-time top 10 traders

*Rewards:*
• Weekly reward pool split equally among top 10 traders
• Resets every Monday 00:00

*Time Ranges:*
• Weekly: Current week (Monday to Sunday)
• Monthly: Last 30 days
• All Time: Since platform launch

💡 Data updates in real-time from the blockchain!
      `;

      await this.sendMessageWithBanner(chatId, helpMessage);
    });

    // Command: /toptraders or /top10 (calendar week, top 10)
    this.bot.onText(/\/toptraders|\/top10/, async (msg) => {
      const chatId = msg.chat.id;

      await this.bot!.sendMessage(chatId, '⏳ Fetching this week\'s leaderboard...');

      const stats = await this.fetchStats('week');

      if (!stats) {
        await this.bot!.sendMessage(chatId, '❌ Failed to fetch leaderboard data. Please try again later.');
        return;
      }

      const message = this.formatLeaderboard(stats, 'week', 10);
      await this.sendMessageWithBanner(chatId, message);
    });

    // Command: /top20 (calendar week, top 20)
    this.bot.onText(/\/top20/, async (msg) => {
      const chatId = msg.chat.id;

      await this.bot!.sendMessage(chatId, '⏳ Fetching top 20 traders this week...');

      const stats = await this.fetchStats('week');

      if (!stats) {
        await this.bot!.sendMessage(chatId, '❌ Failed to fetch leaderboard data. Please try again later.');
        return;
      }

      const message = this.formatLeaderboard(stats, 'week', 20);
      await this.sendMessageWithBanner(chatId, message);
    });

    // Command: /monthly (30 days, top 10)
    this.bot.onText(/\/monthly/, async (msg) => {
      const chatId = msg.chat.id;

      await this.bot!.sendMessage(chatId, '⏳ Fetching monthly leaderboard...');

      const stats = await this.fetchStats('month');

      if (!stats) {
        await this.bot!.sendMessage(chatId, '❌ Failed to fetch leaderboard data. Please try again later.');
        return;
      }

      const message = this.formatLeaderboard(stats, 'month', 10);
      await this.sendMessageWithBanner(chatId, message);
    });

    // Command: /alltime (all time, top 10)
    this.bot.onText(/\/alltime/, async (msg) => {
      const chatId = msg.chat.id;

      await this.bot!.sendMessage(chatId, '⏳ Fetching all-time leaderboard...');

      const stats = await this.fetchStats('alltime');

      if (!stats) {
        await this.bot!.sendMessage(chatId, '❌ Failed to fetch leaderboard data. Please try again later.');
        return;
      }

      const message = this.formatLeaderboard(stats, 'alltime', 10);
      await this.sendMessageWithBanner(chatId, message);
    });
  }

  // Setup error handlers
  private setupErrorHandlers() {
    if (!this.bot) return;

    this.bot.on('polling_error', (error) => {
      console.error('Telegram bot polling error:', error);
    });

    this.bot.on('error', (error) => {
      console.error('Telegram bot error:', error);
    });
  }

  // Check if bot is running
  isActive(): boolean {
    return this.isRunning;
  }
}