import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Add these to prevent static generation
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// ✅ GET ALL POOLS
export async function GET() {
  const pools = await prisma.pool.findMany({ 
    orderBy: { createdAt: "desc" } 
  });
  return NextResponse.json(pools);
}

// ✅ CREATE POOL - FIXED with poolId support
export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    console.log("📥 Creating pool with data:", body);
    
    const pool = await prisma.pool.create({
      data: {
        // ✅ FIXED: Use tokenMint instead of mintAddress
        tokenMint: body.mintAddress || body.tokenMint,
        poolId: body.poolId ? parseInt(body.poolId) : 0,
        name: body.name,
        symbol: body.symbol,
        apr: body.apr ? parseFloat(body.apr) : null,
        apy: body.apy ? parseFloat(body.apy) : null,
        type: body.type,
        lockPeriod: body.lockPeriod ? parseInt(body.lockPeriod) : null,
        rewards: body.rewards,
        logo: body.logo,
        pairAddress: body.pairAddress,
        hasSelfReflections: body.hasSelfReflections || false,
        hasExternalReflections: body.hasExternalReflections || false,
        externalReflectionMint: body.externalReflectionMint || null,
      },
    });
    
    console.log("✅ Pool created:", pool);
    return NextResponse.json(pool);
  } catch (err: any) {
    console.error("❌ Error creating pool:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ✅ UPDATE POOL (PUT for full updates) - FIXED with poolId
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    
    console.log("📥 Updating pool (PUT) with data:", body);
    
    const pool = await prisma.pool.update({
      where: { id: body.id },
      data: {
        tokenMint: body.mintAddress || body.tokenMint,
        poolId: body.poolId ?? 0,
        name: body.name,
        symbol: body.symbol,
        apr: body.apr ? parseFloat(body.apr) : null,
        apy: body.apy ? parseFloat(body.apy) : null,
        type: body.type,
        lockPeriod: body.lockPeriod ? parseInt(body.lockPeriod) : null,
        rewards: body.rewards,
        logo: body.logo,
        pairAddress: body.pairAddress,
        hasSelfReflections: body.hasSelfReflections || false,
        hasExternalReflections: body.hasExternalReflections || false,
        externalReflectionMint: body.externalReflectionMint || null,
      },
    });
    
    console.log("✅ Pool updated (PUT):", pool);
    return NextResponse.json(pool);
  } catch (err: any) {
    console.error("❌ Error updating pool (PUT):", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// ✅ UPDATE POOL (PATCH for partial updates) - FIXED VERSION
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, ...updateData } = body;
    
    if (!id) {
      return NextResponse.json({ error: "Pool ID is required" }, { status: 400 });
    }
    
    console.log("📥 Updating pool (PATCH):", id);
    console.log("📥 Update data:", updateData);
    
    // Convert string numbers to proper types if needed
    const processedData: any = {};
    
    for (const [key, value] of Object.entries(updateData)) {
      if (value === null || value === undefined) {
        processedData[key] = null;
      } 
      // ✅ FIXED: Handle mintAddress → tokenMint mapping
      else if (key === 'mintAddress') {
        processedData['tokenMint'] = value;
      }
      // ✅ FIXED: Handle poolId
      else if (key === 'poolId') {
        processedData[key] = parseInt(value as string);
      }
      else if (key === 'apy' || key === 'apr') {
        // Handle APY/APR - remove % sign if present and convert to number
        const numValue = typeof value === 'string' ? value.replace('%', '') : value;
        processedData[key] = numValue ? parseFloat(numValue as string) : null;
      } else if (key === 'lockPeriod' || key === 'poolDuration') {
        processedData[key] = value ? parseInt(value as string) : null;
      } else if (key === 'isInitialized' || key === 'isPaused' || key === 'hidden' || 
                 key === 'featured' || key === 'depositsPaused' || key === 'withdrawalsPaused' || 
                 key === 'claimsPaused' || key === 'isEmergencyUnlocked' ||
                 key === 'hasSelfReflections' || key === 'hasExternalReflections' ||
                 key === 'referralEnabled') {
        // Boolean fields
        processedData[key] = Boolean(value);
      } else if (key === 'platformFeePercent' || key === 'flatSolFee' || 
                 key === 'referralSplitPercent' || key === 'totalStaked' || key === 'views') {
        // Numeric fields
        processedData[key] = value ? parseFloat(value as string) : null;
      } else {
        // String fields (name, symbol, logo, tokenMint, etc.)
        processedData[key] = value;
      }
    }
    
    // ✅ CRITICAL FIX: Auto-update type field based on lockPeriod
    if ('lockPeriod' in processedData) {
      const lockPeriod = processedData.lockPeriod;
      processedData.type = (lockPeriod === null || lockPeriod === 0 || lockPeriod === '0') 
        ? 'unlocked' 
        : 'locked';
      console.log(`🔧 Auto-setting type to "${processedData.type}" based on lockPeriod:`, lockPeriod);
    }
    
    console.log("📤 Processed data for update:", processedData);
    
    const pool = await prisma.pool.update({
      where: { id },
      data: processedData,
    });
    
    console.log("✅ Pool updated (PATCH):", pool);
    
    return NextResponse.json(pool);
  } catch (err: any) {
    console.error("❌ Error updating pool (PATCH):", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}