import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import { verifyAdminToken } from "@/lib/adminMiddleware";

const CONFIG_FILE = path.join(process.cwd(), "data", "featured-tokens.json");

interface FeaturedToken {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  order: number;
  enabled: boolean;
}

// Ensure data directory exists
async function ensureDataDirectory() {
  const dataDir = path.join(process.cwd(), "data");
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

// Default featured tokens (SOL, USDC, USDT)
const DEFAULT_FEATURED_TOKENS: FeaturedToken[] = [
  {
    address: "So11111111111111111111111111111111111111112",
    symbol: "SOL",
    name: "Wrapped SOL",
    decimals: 9,
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png",
    order: 0,
    enabled: true,
  },
  {
    address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
    symbol: "USDC",
    name: "USD Coin",
    decimals: 6,
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png",
    order: 1,
    enabled: true,
  },
  {
    address: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB",
    symbol: "USDT",
    name: "USDT",
    decimals: 6,
    logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB/logo.png",
    order: 2,
    enabled: true,
  },
];

// ====================================================================
// 🔓 PUBLIC ENDPOINT - No authentication required
// Anyone can view featured tokens (needed for frontend token selector)
// ====================================================================
export async function GET() {
  try {
    await ensureDataDirectory();

    try {
      const data = await fs.readFile(CONFIG_FILE, "utf-8");
      const config = JSON.parse(data);
      return NextResponse.json(config);
    } catch (error) {
      // Return default tokens if file doesn't exist
      return NextResponse.json({ featuredTokens: DEFAULT_FEATURED_TOKENS });
    }
  } catch (error) {
    console.error("Failed to read featured tokens:", error);
    return NextResponse.json(
      { error: "Failed to read featured tokens" },
      { status: 500 }
    );
  }
}

// ====================================================================
// 🔒 PROTECTED ENDPOINT - Admin authentication required
// Save/update featured tokens configuration
// ====================================================================
export async function POST(request: NextRequest) {
  // 🛡️ SECURITY CHECK: Verify JWT token and admin status
  const authResult = await verifyAdminToken(request);
  if (!authResult.isValid) {
    return NextResponse.json(
      { error: authResult.error || "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const { featuredTokens } = body;

    // Validate input data
    if (!Array.isArray(featuredTokens)) {
      return NextResponse.json(
        { error: "Invalid featured tokens data" },
        { status: 400 }
      );
    }

    // ✅ Proceed with saving featured tokens (admin verified)
    await ensureDataDirectory();
    await fs.writeFile(
      CONFIG_FILE,
      JSON.stringify({ featuredTokens }, null, 2)
    );

    // 📝 Log admin action for audit trail
    console.log(`[ADMIN] Featured tokens updated by wallet: ${authResult.wallet}`);
    console.log(`[ADMIN] New token count: ${featuredTokens.length}`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to save featured tokens:", error);
    return NextResponse.json(
      { error: "Failed to save featured tokens" },
      { status: 500 }
    );
  }
}
