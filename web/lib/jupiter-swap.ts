import { Connection, PublicKey, VersionedTransaction } from "@solana/web3.js";

const JUPITER_QUOTE_API = "https://lite-api.jup.ag/swap/v1/quote";
const JUPITER_SWAP_API = "https://lite-api.jup.ag/swap/v1/swap";

export interface JupiterQuoteResponse {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  platformFee: null | {
    amount: string;
    feeBps: number;
  };
  priceImpactPct: string;
  routePlan: any[];
  contextSlot?: number;
  timeTaken?: number;
}

export interface JupiterSwapResponse {
  swapTransaction: string;
  lastValidBlockHeight: number;
  prioritizationFeeLamports?: number;
}

/**
 * Get a quote from Jupiter
 */
export async function getJupiterQuote(
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number = 50,
  platformFeeBps?: number,
  feeAccount?: string
): Promise<JupiterQuoteResponse | null> {
  try {
    console.log("🔍 Fetching Jupiter quote...");
    
    const params = new URLSearchParams({
      inputMint,
      outputMint,
      amount: amount.toString(),
      slippageBps: slippageBps.toString(),
    });

    // Add platform fee if provided
    if (platformFeeBps && platformFeeBps > 0) {
      params.append("platformFeeBps", platformFeeBps.toString());
      console.log(`💰 Adding platform fee: ${platformFeeBps} bps (${platformFeeBps / 100}%)`);
    }

    const response = await fetch(`${JUPITER_QUOTE_API}?${params}`);
    
    if (!response.ok) {
      console.error(`❌ Jupiter quote failed: ${response.status}`);
      return null;
    }

    const quote = await response.json();
    console.log("✅ Jupiter quote received:", {
      inAmount: quote.inAmount,
      outAmount: quote.outAmount,
      priceImpact: quote.priceImpactPct,
      platformFee: quote.platformFee,
    });
    
    return quote;
  } catch (error) {
    console.error("❌ Jupiter quote error:", error);
    return null;
  }
}

/**
 * Get swap transaction from Jupiter
 */
export async function getJupiterSwapTransaction(
  userPublicKey: string,
  quoteResponse: JupiterQuoteResponse,
  priorityFeeLamports: number = 10000,
  feeAccount?: string
): Promise<JupiterSwapResponse | null> {
  try {
    console.log("🔄 Fetching Jupiter swap transaction...");
    
    const requestBody: any = {
      userPublicKey,
      quoteResponse,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: {
        priorityLevelWithMaxLamports: {
          maxLamports: priorityFeeLamports,
          priorityLevel: "high",
        },
      },
    };

    // Add fee account if platform fee is enabled
    if (feeAccount && quoteResponse.platformFee) {
      requestBody.feeAccount = feeAccount;
      console.log(`💰 Fee account: ${feeAccount}`);
    }

    const response = await fetch(JUPITER_SWAP_API, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      console.error(`❌ Jupiter swap transaction failed: ${response.status}`);
      const errorData = await response.json();
      console.error("Error details:", errorData);
      return null;
    }

    const swapData = await response.json();
    console.log("✅ Jupiter swap transaction received");
    
    return swapData;
  } catch (error) {
    console.error("❌ Jupiter swap transaction error:", error);
    return null;
  }
}

/**
 * Execute Jupiter swap
 */
export async function executeJupiterSwap(
  connection: Connection,
  userPublicKey: PublicKey,
  inputMint: string,
  outputMint: string,
  amount: number,
  slippageBps: number,
  signTransaction: (tx: VersionedTransaction) => Promise<VersionedTransaction>,
  platformFeeBps?: number,
  feeAccount?: string
): Promise<string | null> {
  try {
    console.log("🚀 Starting Jupiter swap...");
    
    // Step 1: Get quote
    const quote = await getJupiterQuote(
      inputMint, 
      outputMint, 
      amount, 
      slippageBps,
      platformFeeBps,
      feeAccount
    );
    if (!quote) {
      throw new Error("Failed to get quote from Jupiter");
    }

    // Step 2: Get swap transaction
    const swapData = await getJupiterSwapTransaction(
      userPublicKey.toString(),
      quote,
      10000,
      feeAccount
    );
    
    if (!swapData || !swapData.swapTransaction) {
      throw new Error("Failed to get swap transaction from Jupiter");
    }

    // Step 3: Deserialize and sign transaction
    const swapTransactionBuf = Buffer.from(swapData.swapTransaction, "base64");
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    
    console.log("📝 Signing transaction...");
    const signedTransaction = await signTransaction(transaction);

    // Step 4: Send transaction
    console.log("📤 Sending transaction...");
    const rawTransaction = signedTransaction.serialize();
    const txid = await connection.sendRawTransaction(rawTransaction, {
      skipPreflight: false,
      maxRetries: 3,
    });

    console.log(`✅ Jupiter swap transaction sent: ${txid}`);
    return txid;
  } catch (error: any) {
    console.error("❌ Jupiter swap failed:", error.message);
    return null;
  }
}

