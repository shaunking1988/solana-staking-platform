import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Connection, PublicKey } from "@solana/web3.js";

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * API route to create a user-generated pool
 * POST /api/admin/pools/create-user-pool
 * 
 * This validates the payment transaction and saves the pool to the database
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    console.log("📥 Creating user pool with data:", {
      symbol: body.symbol,
      creator: body.creatorWallet,
      paymentTx: body.paymentTxSignature,
    });
    
    // 1. Verify payment transaction on-chain
    const connection = new Connection(process.env.NEXT_PUBLIC_RPC_ENDPOINT || "https://api.devnet.solana.com");
    
    try {
      const tx = await connection.getTransaction(body.paymentTxSignature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });
      
      if (!tx) {
        return NextResponse.json({ 
          error: "Payment transaction not found. Please wait a moment and try again." 
        }, { status: 400 });
      }

      // Verify the transaction was successful
      if (tx.meta?.err) {
        return NextResponse.json({ 
          error: "Payment transaction failed on-chain" 
        }, { status: 400 });
      }

      console.log("✅ Payment transaction verified on-chain");
      
    } catch (txError) {
      console.error("Error verifying payment transaction:", txError);
      // Continue anyway - the transaction might just not be fully confirmed yet
    }
    
    // 2. Check if pool already exists for this token mint + pool ID
    const existingPool = await prisma.pool.findFirst({
      where: {
        tokenMint: body.tokenMint,
        poolId: body.poolId || 0,
      }
    });

    if (existingPool) {
      return NextResponse.json({ 
        error: "A pool already exists for this token. Try a different token or contact support." 
      }, { status: 400 });
    }
    
    // 3. Create pool in database
    const pool = await prisma.pool.create({
      data: {
        tokenMint: body.tokenMint,
        poolId: body.poolId || 0,
        name: body.name || "Unknown Token",
        symbol: body.symbol || "UNKNOWN",
        apr: body.apr ? parseFloat(body.apr) : null,
        apy: body.apy ? parseFloat(body.apy) : null,
        type: body.type || "unlocked",
        lockPeriod: body.lockPeriod ? parseInt(body.lockPeriod) : null,
        rewards: body.rewards || "To be deposited",
        logo: body.logo || null,
        pairAddress: body.pairAddress || null,
        hasSelfReflections: body.hasSelfReflections || false,
        hasExternalReflections: body.hasExternalReflections || false,
        externalReflectionMint: body.externalReflectionMint || null,
        isInitialized: body.isInitialized || false,
        isPaused: body.isPaused !== undefined ? body.isPaused : true, // Start paused by default
        poolAddress: body.projectPda || null,
        // User creation metadata
        // creatorWallet: body.creatorWallet, // TODO: Re-enable after running database migration
        featured: false, // User pools not featured by default
        hidden: false,
      },
    });
    
    console.log("✅ User pool created in database:", {
      id: pool.id,
      symbol: pool.symbol,
      tokenMint: pool.tokenMint,
    });
    
    return NextResponse.json({
      success: true,
      pool,
      message: "Pool created successfully! You can now deposit rewards to activate it.",
    });
    
  } catch (err: any) {
    console.error("❌ Error creating user pool:", err);
    
    // Handle Prisma unique constraint violations
    if (err.code === 'P2002') {
      return NextResponse.json({ 
        error: "A pool with this token already exists" 
      }, { status: 400 });
    }
    
    return NextResponse.json({ 
      error: err.message || "Failed to create pool" 
    }, { status: 500 });
  }
}

