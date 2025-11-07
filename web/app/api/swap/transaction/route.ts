import { NextRequest, NextResponse } from "next/server";
import { 
  Connection,
  PublicKey,
  VersionedTransaction,
  TransactionMessage,
  LAMPORTS_PER_SOL,
  AddressLookupTableAccount,
} from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  createTransferInstruction,
  getAssociatedTokenAddress,
} from "@solana/spl-token";

// Raydium Transaction API
const RAYDIUM_API_BASE = "https://transaction-v1.raydium.io";

// ✅ MAINNET RPC for swaps
const SWAP_RPC_ENDPOINT = process.env.NEXT_PUBLIC_SWAP_RPC_URL || 
                          "https://mainnet.helius-rpc.com/?api-key=2bd046b7-358b-43fe-afe9-1dd227347aee";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userPublicKey, inputMint, outputMint, amount, slippageBps } = body;

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🔵 RAYDIUM SWAP (MAINNET)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('User:', userPublicKey);
    console.log('Amount:', amount, typeof amount);

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
    
    // ✅ Correct priority fee calculation
    const priorityFeeSol = config.priorityFee || 0.0001;
    const priorityFeeLamports = Math.floor(priorityFeeSol * LAMPORTS_PER_SOL);
    
    console.log('💰 Fee Configuration:');
    console.log('- Priority Fee (SOL):', priorityFeeSol);
    console.log('- Priority Fee (lamports):', priorityFeeLamports);
    console.log('- Platform Fee:', config.platformFeeBps / 100, '%');
    console.log('- Treasury:', config.treasuryWallet);

    if (!config.swapEnabled) {
      return NextResponse.json(
        { error: "Swap feature is currently disabled" },
        { status: 403 }
      );
    }

    // Get quote from Raydium
    const raydiumQuoteUrl = `${RAYDIUM_API_BASE}/compute/swap-base-in?` +
      `inputMint=${inputMint}&` +
      `outputMint=${outputMint}&` +
      `amount=${amount}&` +
      `slippageBps=${slippageBps || 50}&` +
      `txVersion=V0`;

    console.log('📡 Getting Raydium quote...');
    const raydiumQuoteResponse = await fetch(raydiumQuoteUrl);

    if (!raydiumQuoteResponse.ok) {
      const errorText = await raydiumQuoteResponse.text();
      console.log('❌ Quote failed:', errorText);
      return NextResponse.json(
        { error: 'Unable to get quote from Raydium' },
        { status: 400 }
      );
    }

    const swapResponse = await raydiumQuoteResponse.json();
    console.log('✅ Raydium quote OK');
    console.log('📊 Expected output:', swapResponse.data?.outputAmount || 'unknown');

    // Get priority fee (optional)
    let computeUnitPrice = priorityFeeLamports;
    try {
      const priorityFeeResponse = await fetch(`${RAYDIUM_API_BASE}/main/auto-fee`);
      if (priorityFeeResponse.ok) {
        const priorityFeeData = await priorityFeeResponse.json();
        computeUnitPrice = priorityFeeData.data?.default?.h || priorityFeeLamports;
        console.log('💰 Using Raydium priority fee:', computeUnitPrice);
      }
    } catch (e) {
      console.log('⚠️ Using config priority fee:', priorityFeeLamports);
    }

    // Create transaction
    console.log('📝 Creating transaction...');
    const txResponse = await fetch(`${RAYDIUM_API_BASE}/transaction/swap-base-in`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        computeUnitPriceMicroLamports: String(computeUnitPrice),
        swapResponse,
        txVersion: 'V0',
        wallet: userPublicKey,
        wrapSol: inputMint === 'So11111111111111111111111111111111111111112',
        unwrapSol: outputMint === 'So11111111111111111111111111111111111111112',
      }),
    });

    if (!txResponse.ok) {
      const errorText = await txResponse.text();
      console.log('❌ Transaction creation failed:', errorText);
      return NextResponse.json(
        { error: 'Failed to create Raydium transaction: ' + errorText },
        { status: 500 }
      );
    }

    const txData = await txResponse.json();
    
    if (!txData.success || !txData.data || txData.data.length === 0) {
      console.log('❌ No transaction data');
      return NextResponse.json(
        { error: 'No transaction data returned from Raydium' },
        { status: 500 }
      );
    }

    console.log('✅ Raydium transaction created');

    // ADD PLATFORM FEE WITH PROPER ALT RESOLUTION
    if (config.platformFeeBps && config.treasuryWallet && config.platformFeeBps > 0) {
      console.log('💰 Adding platform fee...');
      
      try {
        const connection = new Connection(SWAP_RPC_ENDPOINT, 'confirmed');
        
        // Deserialize transaction
        const txBuffer = Buffer.from(txData.data[0].transaction, 'base64');
        const transaction = VersionedTransaction.deserialize(txBuffer);
        
        // Resolve Address Lookup Tables
        console.log('🔍 Resolving', transaction.message.addressTableLookups.length, 'ALTs...');
        
        const lookupTableAccounts: AddressLookupTableAccount[] = [];
        
        for (const lookup of transaction.message.addressTableLookups) {
          const accountInfo = await connection.getAccountInfo(lookup.accountKey);
          if (!accountInfo) {
            throw new Error(`ALT ${lookup.accountKey.toBase58()} not found`);
          }
          
          const lookupTableAccount = new AddressLookupTableAccount({
            key: lookup.accountKey,
            state: AddressLookupTableAccount.deserialize(accountInfo.data),
          });
          
          lookupTableAccounts.push(lookupTableAccount);
        }
        
        console.log('✅ ALTs resolved');
        
        // Decompile with resolved ALTs
        const message = TransactionMessage.decompile(transaction.message, {
          addressLookupTableAccounts: lookupTableAccounts
        });
        
        // Calculate fee
        const outputAmount = swapResponse.data?.outputAmount || swapResponse.outputAmount;
        if (!outputAmount) {
          throw new Error('No output amount in quote');
        }
        
        const feeAmount = Math.floor((Number(outputAmount) * config.platformFeeBps) / 10000);
        console.log('- Fee amount:', feeAmount, '(', config.platformFeeBps / 100, '%)');
        
        // Get token accounts
        const user = new PublicKey(userPublicKey);
        const treasury = new PublicKey(config.treasuryWallet);
        const outputMintPubkey = new PublicKey(outputMint);
        
        const userOutputAccount = await getAssociatedTokenAddress(outputMintPubkey, user);
        const treasuryOutputAccount = await getAssociatedTokenAddress(outputMintPubkey, treasury);
        
        // Create fee transfer instruction
        const feeInstruction = createTransferInstruction(
          userOutputAccount,
          treasuryOutputAccount,
          user,
          BigInt(feeAmount),
          [],
          TOKEN_PROGRAM_ID
        );
        
        // Add fee instruction
        message.instructions.push(feeInstruction);
        
        // Recompile with ALTs
        const newMessage = message.compileToV0Message(lookupTableAccounts);
        const newTransaction = new VersionedTransaction(newMessage);
        
        // Serialize
        const serialized = Buffer.from(newTransaction.serialize()).toString('base64');
        
        console.log('✅ Platform fee added successfully');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        return NextResponse.json({
          swapTransaction: serialized,
          quote: swapResponse,
          source: 'raydium',
          platformFeeApplied: true,
          platformFeeBps: config.platformFeeBps,
          feeAmount: feeAmount.toString(),
        });
        
      } catch (feeError: any) {
        console.error('❌ Fee error:', feeError.message);
        console.log('⚠️ Returning without platform fee');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        
        return NextResponse.json({
          swapTransaction: txData.data[0].transaction,
          quote: swapResponse,
          source: 'raydium',
          platformFeeApplied: false,
          feeError: feeError.message,
        });
      }
    }

    // No fee configured
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    return NextResponse.json({
      swapTransaction: txData.data[0].transaction,
      quote: swapResponse,
      source: 'raydium',
      platformFeeApplied: false,
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