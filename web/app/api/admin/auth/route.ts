import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import nacl from "tweetnacl";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { wallet, signature, message } = body;

    console.log('🔍 Auth request received:');
    console.log('  Wallet:', wallet);
    console.log('  Signature (first 20 chars):', signature?.substring(0, 20));
    console.log('  Message:', message);

    // 1️⃣ Validate request body
    if (!wallet || !signature || !message) {
      console.log('❌ Missing required fields');
      return NextResponse.json(
        { error: "Missing required fields: wallet, signature, message" },
        { status: 400 }
      );
    }

    // 2️⃣ Get admin wallet list from environment
    const adminWallets = process.env.ADMIN_WALLETS?.split(",").map((w) =>
      w.trim()
    );

    console.log('🔐 Admin wallets:', adminWallets);

    if (!adminWallets || adminWallets.length === 0) {
      console.error("❌ ADMIN_WALLETS not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // 3️⃣ Check if wallet is in admin list
    if (!adminWallets.includes(wallet)) {
      console.warn(`⚠️ Unauthorized login attempt by wallet: ${wallet}`);
      return NextResponse.json(
        { error: "Wallet not authorized" },
        { status: 403 }
      );
    }

    console.log('✅ Wallet is authorized');

    // 4️⃣ Verify the signature using Solana's method
    try {
      console.log('🔍 Starting signature verification (Solana method)...');
      
      // Convert message to Uint8Array
      const messageBytes = new TextEncoder().encode(message);
      console.log('  Message bytes length:', messageBytes.length);

      // Decode signature from base58
      const signatureBytes = bs58.decode(signature);
      console.log('  Signature bytes length:', signatureBytes.length);
      
      // Create PublicKey object
      const publicKey = new PublicKey(wallet);
      console.log('  Public key:', publicKey.toBase58());

      // Verify using nacl with the correct format
      const isValid = nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        publicKey.toBytes()
      );

      console.log('  Signature valid:', isValid);

      if (!isValid) {
        console.log('❌ Signature verification failed');
        console.log('  Debug info:');
        console.log('    Message (hex):', Buffer.from(messageBytes).toString('hex').substring(0, 40) + '...');
        console.log('    Signature (hex):', Buffer.from(signatureBytes).toString('hex').substring(0, 40) + '...');
        console.log('    PublicKey (hex):', Buffer.from(publicKey.toBytes()).toString('hex'));
        
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }

      console.log('✅ Signature verified successfully');
    } catch (error) {
      console.error("❌ Signature verification error:", error);
      return NextResponse.json(
        { error: "Signature verification failed" },
        { status: 401 }
      );
    }

    // 5️⃣ Get JWT secret
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      console.error("❌ JWT_SECRET not configured");
      return NextResponse.json(
        { error: "Server configuration error" },
        { status: 500 }
      );
    }

    // 6️⃣ Generate JWT token
    const token = jwt.sign(
      { wallet },
      jwtSecret,
      { expiresIn: "24h" }
    );

    console.log(`✅ Admin authenticated: ${wallet}`);

    return NextResponse.json({
      success: true,
      token,
      wallet,
      expiresIn: "24h",
    });
  } catch (error) {
    console.error("❌ Authentication error:", error);
    return NextResponse.json(
      { error: "Authentication failed" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json(
        { valid: false, error: "No token provided" },
        { status: 401 }
      );
    }

    const token = authHeader.split(" ")[1];
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      return NextResponse.json(
        { valid: false, error: "Server configuration error" },
        { status: 500 }
      );
    }

    try {
      const payload = jwt.verify(token, jwtSecret) as { wallet: string };
      return NextResponse.json({
        valid: true,
        wallet: payload.wallet,
      });
    } catch (err: any) {
      if (err.name === "TokenExpiredError") {
        return NextResponse.json(
          { valid: false, error: "Token expired" },
          { status: 401 }
        );
      }
      return NextResponse.json(
        { valid: false, error: "Invalid token" },
        { status: 401 }
      );
    }
  } catch (error) {
    console.error("❌ Token verification error:", error);
    return NextResponse.json(
      { valid: false, error: "Verification failed" },
      { status: 500 }
    );
  }
}