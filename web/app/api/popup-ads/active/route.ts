import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  try {
    const now = new Date();
    
    const data = await prisma.popUpAd.findFirst({
      where: {
        isActive: true,
        OR: [
          { startDate: null },
          { startDate: { lte: now } }
        ],
        AND: [
          {
            OR: [
              { endDate: null },
              { endDate: { gte: now } }
            ]
          }
        ]
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json({ success: true, data: data || null });
  } catch (error) {
    console.error('Error fetching active pop-up ad:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch active pop-up ad' },
      { status: 500 }
    );
  }
}