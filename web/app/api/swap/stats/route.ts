import { NextRequest, NextResponse } from "next/server";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// GET - Fetch swap statistics
export async function GET() {
  try {
    // Get overall statistics
    const stats = await prisma.swapStats.aggregate({
      _count: { id: true },
      _sum: {
        fromAmount: true,
        toAmount: true,
      },
    });

    // Calculate time-based volumes
    const now = new Date();
    const day24Ago = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const day7Ago = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Last 24h volume
    const last24hStats = await prisma.swapStats.aggregate({
      where: {
        createdAt: {
          gte: day24Ago,
        },
      },
      _sum: {
        fromAmount: true,
      },
    });

    // Last 7d volume
    const last7dStats = await prisma.swapStats.aggregate({
      where: {
        createdAt: {
          gte: day7Ago,
        },
      },
      _sum: {
        fromAmount: true,
      },
    });

    // Get top trading pairs
    const topPairsRaw = await prisma.swapStats.groupBy({
      by: ["fromToken", "toToken"],
      _count: { id: true },
      _sum: { fromAmount: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    });

    // Format top pairs for admin panel
    const topPairs = topPairsRaw.map((pair) => ({
      pair: `${pair.fromToken}/${pair.toToken}`,
      volume: pair._sum.fromAmount || 0,
      swaps: pair._count.id,
    }));

    // Calculate total fees (assuming platform fee is 0.5% = 50 basis points)
    // You can adjust this or fetch from config
    const platformFeeBps = 50; // 0.5%
    const totalVolume = stats._sum.fromAmount || 0;
    const totalFees = (totalVolume * platformFeeBps) / 10000;

    // Return data in the format the admin panel expects
    return NextResponse.json({
      totalSwaps: stats._count.id || 0,
      totalVolume: totalVolume,
      totalFees: totalFees,
      last24hVolume: last24hStats._sum.fromAmount || 0,
      last7dVolume: last7dStats._sum.fromAmount || 0,
      topPairs: topPairs,
    });
  } catch (error) {
    console.error("Error fetching swap stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch statistics" },
      { status: 500 }
    );
  }
}

// POST - Record a new swap
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { fromToken, toToken, fromAmount, toAmount, userAddress, feeAmount } = body;

    if (!fromToken || !toToken || !fromAmount || !toAmount) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const swap = await prisma.swapStats.create({
      data: {
        fromToken,
        toToken,
        fromAmount,
        toAmount,
        userAddress: userAddress || "anonymous",
      },
    });

    return NextResponse.json({
      success: true,
      swap,
    });
  } catch (error) {
    console.error("Error recording swap:", error);
    return NextResponse.json(
      { error: "Failed to record swap" },
      { status: 500 }
    );
  }
}