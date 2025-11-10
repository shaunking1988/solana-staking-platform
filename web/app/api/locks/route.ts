import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET all locks
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const wallet = searchParams.get('wallet');
    const active = searchParams.get('active');

    const where: any = {};

    if (wallet) {
      where.creatorWallet = wallet;
    }

    if (active === 'true') {
      where.isActive = true;
      where.isUnlocked = false;
    }

    const locks = await prisma.lock.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json(locks);
  } catch (error) {
    console.error('Error fetching locks:', error);
    return NextResponse.json(
      { error: 'Failed to fetch locks' },
      { status: 500 }
    );
  }
}

// POST create new lock
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      lockId,
      tokenMint,
      name,
      symbol,
      amount,
      lockDuration,
      creatorWallet,
      poolAddress,
      stakePda,
      logo,
    } = body;

    // Validate required fields
    if (!tokenMint || !name || !symbol || !amount || !lockDuration || !creatorWallet) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Calculate unlock time
    const unlockTime = new Date(Date.now() + lockDuration * 1000);

    const lock = await prisma.lock.create({
      data: {
        lockId: lockId || 0,
        tokenMint,
        name,
        symbol,
        amount: parseFloat(amount),
        lockDuration,
        unlockTime,
        creatorWallet,
        poolAddress: poolAddress || null,
        stakePda: stakePda || null,
        logo: logo || null,
        isActive: true,
        isUnlocked: false,
      },
    });

    return NextResponse.json(lock, { status: 201 });
  } catch (error) {
    console.error('Error creating lock:', error);
    return NextResponse.json(
      { error: 'Failed to create lock' },
      { status: 500 }
    );
  }
}

