import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyAdminToken } from '@/lib/adminMiddleware';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// GET all pop-up ads (admin)
export async function GET(req: Request) {
  const authResult = await verifyAdminToken(req);
  if (!authResult.isValid) {
    return NextResponse.json(
      { error: authResult.error || "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const data = await prisma.popUpAd.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error fetching pop-up ads:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch pop-up ads' },
      { status: 500 }
    );
  }
}

// POST create new pop-up ad
export async function POST(req: Request) {
  const authResult = await verifyAdminToken(req);
  if (!authResult.isValid) {
    return NextResponse.json(
      { error: authResult.error || "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await req.json();
    
    const data = await prisma.popUpAd.create({
      data: {
        title: body.title,
        description: body.description,
        imageUrl: body.image_url,
        ctaText: body.cta_text,
        ctaLink: body.cta_link,
        isActive: body.is_active ?? true,
        startDate: body.start_date ? new Date(body.start_date) : null,
        endDate: body.end_date ? new Date(body.end_date) : null,
        displayFrequency: body.display_frequency ?? 'once_per_session',
      }
    });

    console.log(`[ADMIN] Pop-up ad created by wallet: ${authResult.wallet}`);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Error creating pop-up ad:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create pop-up ad' },
      { status: 500 }
    );
  }
}