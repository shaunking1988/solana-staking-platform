import { NextRequest, NextResponse } from "next/server";
import { 
  Connection, 
  PublicKey, 
  Transaction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { 
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
} from "@solana/spl-token";
import { 
  Liquidity,
  LiquidityPoolKeys,
  Token,
  TokenAmount,
  LIQUIDITY_STATE_LAYOUT_V4,
  MARKET_STATE_LAYOUT_V3,
} from "@raydium-io/raydium-sdk";
import BN from "bn.js";

// Jupiter API endpoints
const JUPITER_QUOTE_API = "https://lite-api.jup.ag/swap/v1/quote";
const JUPITER_SWAP_API = "https://lite-api.jup.ag/swap/v1/swap";

// Raydium Program IDs
const RAYDIUM_V4_PROGRAM_ID = new PublicKey("675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8");

// ✅ MAINNET RPC for swaps (separate from staking devnet RPC)
const SWAP_RPC_ENDPOINT = process.env.NEXT_PUBLIC_SWAP_RPC_URL || 
                          "https://mainnet.helius-rpc.com/?api-key=2bd046b7-358b-43fe-afe9-1dd227347aee";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userPublicKey, inputMint, outputMint, amount, slippageBps } = body;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔄 SWAP TRANSACTION (MAINNET)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('User:', userPublicKey);
    console.log('Amount:', amount);
    console.log('RPC:', SWAP_RPC_ENDPOINT.split('?')[0] + '...');

    if (!userPublicKey || !inputMint || !outputMint || !amount) {
      return NextResponse.json(
        { error: "Missing required parameters" },
        { status: 400 }
      );
    }

    // Get swap configuration
    const configRes = await fetch(
      `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/swap/config`
    );
    const config = await configRes.json();
    
    // Convert priority fee from SOL to microLamports
    const priorityFeeSol = config.priorityFee || 0.0001;
    const priorityFeeLamports = Math.floor(priorityFeeSol * LAMPORTS_PER_SOL);
    const priorityFeeMicroLamports = priorityFeeLamports * 1000;
    
    console.log('✅ Config loaded:');
    console.log('- Priority fee:', priorityFeeLamports, 'lamports');
    console.log('- Platform fee:', config.platformFeeBps, 'bps');

    if (!config.swapEnabled) {
      return NextResponse.json(
        { error: "Swap feature is currently disabled" },
        { status: 403 }
      );
    }

    // STEP 1: Try Jupiter first
    console.log('');
    console.log('🟣 JUPITER (MAINNET)');

    try {
      const quoteUrl = new URL(JUPITER_QUOTE_API);
      quoteUrl.searchParams.append('inputMint', inputMint);
      quoteUrl.searchParams.append('outputMint', outputMint);
      quoteUrl.searchParams.append('amount', amount.toString());
      quoteUrl.searchParams.append('slippageBps', (slippageBps || 50).toString());

      const quoteResponse = await fetch(quoteUrl.toString(), {
        method: 'GET',
        headers: { 'Accept': 'application/json' },
      });

      if (quoteResponse.ok) {
        const quoteData = await quoteResponse.json();
        console.log('✅ Jupiter quote OK');

        const swapResponse = await fetch(JUPITER_SWAP_API, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
          },
          body: JSON.stringify({
            quoteResponse: quoteData,
            userPublicKey,
            wrapAndUnwrapSol: true,
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: priorityFeeLamports, // ✅ Use your priority fee
            ...(config.platformFeeBps && config.treasuryWallet && {
              platformFeeBps: config.platformFeeBps,
              feeAccount: config.treasuryWallet,
            }),
          }),
        });

        if (swapResponse.ok) {
          const swapData = await swapResponse.json();
          console.log('✅ Jupiter transaction created');
          console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
          
          return NextResponse.json({
            swapTransaction: swapData.swapTransaction,
            quote: quoteData,
            source: 'jupiter',
          });
        }
      }

      console.log('🔄 Jupiter failed, trying Raydium...');
      
    } catch (jupiterError: any) {
      console.log('⚠️ Jupiter error:', jupiterError.message);
    }

    // STEP 2: Raydium Fallback
    console.log('');
    console.log('🔵 RAYDIUM (MAINNET)');

    const raydiumQuoteUrl = new URL(
      `${process.env.NEXT_PUBLIC_BASE_URL || "http://localhost:3000"}/api/swap/raydium-quote`
    );
    raydiumQuoteUrl.searchParams.append('inputMint', inputMint);
    raydiumQuoteUrl.searchParams.append('outputMint', outputMint);
    raydiumQuoteUrl.searchParams.append('amount', amount.toString());
    raydiumQuoteUrl.searchParams.append('slippageBps', (slippageBps || 50).toString());

    const raydiumQuoteResponse = await fetch(raydiumQuoteUrl.toString());

    if (!raydiumQuoteResponse.ok) {
      const error = await raydiumQuoteResponse.json();
      return NextResponse.json(
        { error: 'Unable to get quote from both Jupiter and Raydium' },
        { status: 400 }
      );
    }

    const raydiumQuote = await raydiumQuoteResponse.json();
    console.log('✅ Raydium quote OK');

    // ✅ Use dedicated mainnet RPC for swaps
    const connection = new Connection(SWAP_RPC_ENDPOINT, {
      commitment: 'confirmed',
      confirmTransactionInitialTimeout: 60000,
    });

    console.log('✅ Connected to mainnet RPC');

    const user = new PublicKey(userPublicKey);
    const poolId = new PublicKey(raydiumQuote.poolId);
    const inputMintPubkey = new PublicKey(inputMint);
    const outputMintPubkey = new PublicKey(outputMint);

    // Fetch pool
    const poolInfo = await connection.getAccountInfo(poolId);
    if (!poolInfo) throw new Error('Pool not found');

    const poolState = LIQUIDITY_STATE_LAYOUT_V4.decode(poolInfo.data);

    // Fetch market
    const marketInfo = await connection.getAccountInfo(poolState.marketId);
    if (!marketInfo) throw new Error('Market not found');

    const marketState = MARKET_STATE_LAYOUT_V3.decode(marketInfo.data);

    // Construct pool keys
    const poolKeys: LiquidityPoolKeys = {
      id: poolId,
      baseMint: poolState.baseMint,
      quoteMint: poolState.quoteMint,
      lpMint: poolState.lpMint,
      baseDecimals: poolState.baseDecimal.toNumber(),
      quoteDecimals: poolState.quoteDecimal.toNumber(),
      lpDecimals: poolState.baseDecimal.toNumber(),
      version: 4,
      programId: RAYDIUM_V4_PROGRAM_ID,
      authority: Liquidity.getAssociatedAuthority({ 
        programId: RAYDIUM_V4_PROGRAM_ID, 
        poolId 
      }).publicKey,
      openOrders: poolState.openOrders,
      targetOrders: poolState.targetOrders,
      baseVault: poolState.baseVault,
      quoteVault: poolState.quoteVault,
      withdrawQueue: poolState.withdrawQueue,
      lpVault: poolState.lpVault,
      marketVersion: 3,
      marketProgramId: poolState.marketProgramId,
      marketId: poolState.marketId,
      marketAuthority: Liquidity.getAssociatedAuthority({
        programId: poolState.marketProgramId,
        marketId: poolState.marketId,
      }).publicKey,
      marketBaseVault: marketState.baseVault,
      marketQuoteVault: marketState.quoteVault,
      marketBids: marketState.bids,
      marketAsks: marketState.asks,
      marketEventQueue: marketState.eventQueue,
      lookupTableAccount: PublicKey.default,
    };

    const swapInDirection = poolKeys.baseMint.equals(inputMintPubkey);

    const inputToken = new Token(
      TOKEN_PROGRAM_ID,
      inputMintPubkey,
      swapInDirection ? poolKeys.baseDecimals : poolKeys.quoteDecimals,
    );

    const outputToken = new Token(
      TOKEN_PROGRAM_ID,
      outputMintPubkey,
      swapInDirection ? poolKeys.quoteDecimals : poolKeys.baseDecimals,
    );

    const amountIn = new TokenAmount(inputToken, amount, false);

    const userInputAccount = await getAssociatedTokenAddress(inputMintPubkey, user);
    const userOutputAccount = await getAssociatedTokenAddress(outputMintPubkey, user);

    const transaction = new Transaction();

    // ✅ Use your priority fee
    console.log('💰 Priority fee:', priorityFeeMicroLamports, 'microLamports');
    
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({ units: 600000 }),
      ComputeBudgetProgram.setComputeUnitPrice({ microLamports: priorityFeeMicroLamports })
    );

    // Check if output account exists
    const outputAccountInfo = await connection.getAccountInfo(userOutputAccount);
    if (!outputAccountInfo) {
      transaction.add(
        createAssociatedTokenAccountInstruction(
          user,
          userOutputAccount,
          user,
          outputMintPubkey
        )
      );
    }

    // Build swap instruction
    const { innerTransaction } = Liquidity.makeSwapInstruction({
      poolKeys,
      userKeys: {
        tokenAccountIn: userInputAccount,
        tokenAccountOut: userOutputAccount,
        owner: user,
      },
      amountIn: amountIn.raw,
      amountOut: new BN(raydiumQuote.otherAmountThreshold),
      fixedSide: 'in',
    });

    innerTransaction.instructions.forEach(ix => transaction.add(ix));

    // ✅ Get FRESH blockhash from mainnet
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('finalized');
    transaction.recentBlockhash = blockhash;
    transaction.lastValidBlockHeight = lastValidBlockHeight;
    transaction.feePayer = user;

    console.log('✅ Transaction ready');
    console.log('- Fresh blockhash from mainnet');
    console.log('- Valid until block:', lastValidBlockHeight);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const serializedTransaction = transaction.serialize({
      requireAllSignatures: false,
      verifySignatures: false,
    });

    return NextResponse.json({
      swapTransaction: serializedTransaction.toString('base64'),
      quote: raydiumQuote,
      source: 'raydium',
      blockhash,
      lastValidBlockHeight,
    });

  } catch (error: any) {
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.error('❌ ERROR:', error.message);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    return NextResponse.json(
      { error: error.message || "Failed to create swap transaction" },
      { status: 500 }
    );
  }
}