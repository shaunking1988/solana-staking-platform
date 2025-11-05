import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Add these to prevent static generation
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET single pool
export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const pool = await prisma.pool.findUnique({ where: { id: params.id } });
    if (!pool) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(pool);
  } catch (err) {
    console.error("Error fetching pool:", err);
    return NextResponse.json({ error: "Failed to fetch pool" }, { status: 500 });
  }
}

// PATCH update pool (edit / hide / feature)
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const body = await req.json();

    const updated = await prisma.pool.update({
      where: { id: params.id },
      data: {
        name: body.name,
        symbol: body.symbol,
        apr: body.apr !== undefined ? Number(body.apr) : undefined,
        apy: body.apy !== undefined ? Number(body.apy) : undefined,
        type: body.type,
        lockPeriod: body.lockPeriod !== undefined ? Number(body.lockPeriod) : undefined,
        rewards: body.rewards,
        logo: body.logo,
        tokenMint: body.tokenMint || body.mintAddress, // ✅ FIX: Accept both tokenMint and mintAddress
        pairAddress: body.pairAddress,
        poolId: body.poolId !== undefined ? Number(body.poolId) : undefined, // ✅ FIX: Add poolId
        hidden: body.hidden,
        featured: body.featured,
        isPaused: body.isPaused !== undefined ? body.isPaused : undefined, // ✅ FIX: Add isPaused
        isInitialized: body.isInitialized !== undefined ? body.isInitialized : undefined, // ✅ FIX: Add isInitialized
        depositsPaused: body.depositsPaused !== undefined ? body.depositsPaused : undefined, // ✅ FIX: Add pause states
        withdrawalsPaused: body.withdrawalsPaused !== undefined ? body.withdrawalsPaused : undefined,
        claimsPaused: body.claimsPaused !== undefined ? body.claimsPaused : undefined,
        // ✅ Add reflection fields
        hasSelfReflections: body.hasSelfReflections !== undefined ? body.hasSelfReflections : undefined,
        hasExternalReflections: body.hasExternalReflections !== undefined ? body.hasExternalReflections : undefined,
        externalReflectionMint: body.externalReflectionMint !== undefined ? body.externalReflectionMint : undefined,
        reflectionTokenAccount: body.reflectionTokenAccount !== undefined ? body.reflectionTokenAccount : undefined, // ✅ FIX: Add reflection account
        reflectionTokenSymbol: body.reflectionTokenSymbol !== undefined ? body.reflectionTokenSymbol : undefined, // ✅ FIX: Add reflection symbol
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error("Error updating pool:", err);
    return NextResponse.json({ error: "Failed to update pool" }, { status: 500 });
  }
}

// DELETE remove pool
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    await prisma.pool.delete({ where: { id: params.id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Error deleting pool:", err);
    return NextResponse.json({ error: "Failed to delete pool" }, { status: 500 });
  }
}