import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import nacl from "tweetnacl";
import bs58 from "bs58";

// ====================================================================
// ADMIN AUTHENTICATION ENDPOINT
// POST /api/admin/auth
// Verifies wallet signature and issues JWT token
// ====================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { wallet, signature, message } = body;

    // 1️⃣ Validate request body
    if (!wallet || !signature || !message) {
      return NextResponse.json(
        { error: "Missing required fields: wallet, signature, message" },
        { status: 400 }
      );
    }

    // 2️⃣ Get admin wallet list from environment
    const adminWallets = process.env.ADMIN_WALLETS?.split(",").map((w) =>
      w.trim()
    );

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

    // 4️⃣ Verify the signature
    try {
      // Convert message to bytes
      const messageBytes = new TextEncoder().encode(message);

      // Decode signature and public key from base58
      const signatureBytes = bs58.decode(signature);
      const publicKeyBytes = bs58.decode(wallet);

      // Verify signature
      const isValid = nacl.sign.detached.verify(
        messageBytes,
        signatureBytes,
        publicKeyBytes
      );

      if (!isValid) {
        return NextResponse.json(
          { error: "Invalid signature" },
          { status: 401 }
        );
      }
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
      { wallet }, // Payload
      jwtSecret,
      { expiresIn: "24h" } // Token expires in 24 hours
    );

    // 📝 Log successful authentication
    console.log(`✅ Admin authenticated: ${wallet}`);

    // 7️⃣ Return token to client
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

// ====================================================================
// VERIFY TOKEN ENDPOINT (Optional)
// GET /api/admin/auth
// Allows frontend to check if current token is still valid
// ====================================================================

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
