"use client";

import { useState, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { 
  VersionedTransaction, 
  Transaction, 
  PublicKey,
  Connection 
} from "@solana/web3.js";
import {
  createTransferInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { ArrowDownUp, Settings, Info, TrendingUp, Zap, ExternalLink } from "lucide-react";
import { useToast } from "@/components/ToastContainer";
import TokenSelectModal from "./TokenSelectModal";

interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

interface SwapConfig {
  swapEnabled: boolean;
  platformFeePercentage: number;
  maxSlippage: number;
  priorityFee: number;
}

export default function SwapPage() {
  const { publicKey, signTransaction, signAllTransactions } = useWallet();
  const { connection } = useConnection();
  const { showSuccess, showError, showInfo } = useToast();

  // State
  const [tokens, setTokens] = useState<Token[]>([]);
  const [featuredTokens, setFeaturedTokens] = useState<Token[]>([]);
  const [config, setConfig] = useState<SwapConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [swapping, setSwapping] = useState(false);

  // Form state
  const [fromToken, setFromToken] = useState<Token | null>(null);
  const [toToken, setToToken] = useState<Token | null>(null);
  const [fromAmount, setFromAmount] = useState("");
  const [toAmount, setToAmount] = useState("");
  const [slippage, setSlippage] = useState(0.5);
  
  // UI state
  const [showTokenSelect, setShowTokenSelect] = useState<"from" | "to" | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [lastTxSignature, setLastTxSignature] = useState<string | null>(null);

  // Load config from API - MAINNET CONFIGURATION
  useEffect(() => {
    const loadConfig = async () => {
      try {
        const res = await fetch("/api/swap/config");
        
        if (res.ok) {
          const data = await res.json();
          
          console.log('📋 Loaded swap config from API:', data);
          
          // Convert basis points to percentage
          const platformFeePercentage = (data.platformFeeBps || 100) / 100;
          const maxSlippage = (data.maxSlippageBps || 5000) / 100;
          
          setConfig({
            swapEnabled: data.swapEnabled ?? true,
            platformFeePercentage, // e.g., 100 bps = 1%
            maxSlippage, // e.g., 5000 bps = 50%
            priorityFee: 0.0001
          });
          
          console.log('✅ Config loaded successfully:', {
            swapEnabled: data.swapEnabled,
            platformFeePercentage: platformFeePercentage + '%',
            maxSlippage: maxSlippage + '%',
          });
          
          // Verify platform fee is reasonable
          if (platformFeePercentage > 5) {
            console.warn('⚠️ Platform fee is high:', platformFeePercentage + '%');
            showInfo(`⚠️ Platform fee is ${platformFeePercentage}% - this seems high!`);
          }
          
          // Update slippage if it exceeds max
          if (slippage > maxSlippage) {
            setSlippage(maxSlippage);
          }
        } else {
          console.error('❌ Failed to load config:', res.status);
          // Use defaults
          setConfig({
            swapEnabled: true,
            platformFeePercentage: 1.0,
            maxSlippage: 50.0,
            priorityFee: 0.0001
          });
        }
      } catch (error) {
        console.error("❌ Failed to load config:", error);
        setConfig({
          swapEnabled: true,
          platformFeePercentage: 1.0,
          maxSlippage: 50.0,
          priorityFee: 0.0001
        });
      }
    };

    loadConfig();
  }, []);

  // Load tokens and featured tokens
  useEffect(() => {
    loadTokens();
  }, []);

  const loadTokens = async () => {
    setLoading(true);
    try {
      // Load featured tokens from admin panel
      try {
        const featuredRes = await fetch("/api/admin/featured-tokens");
        if (featuredRes.ok) {
          const featuredData = await featuredRes.json();
          const enabledFeaturedTokens = (featuredData.featuredTokens || [])
            .filter((ft: any) => ft.enabled)
            .sort((a: any, b: any) => a.order - b.order);
          
          setFeaturedTokens(enabledFeaturedTokens);
          console.log('✅ Loaded featured tokens:', enabledFeaturedTokens.length);
        }
      } catch (featuredError) {
        console.error("Failed to load featured tokens:", featuredError);
      }

      // Default tokens for mainnet
      const sol = {
        address: "So11111111111111111111111111111111111111112",
        symbol: "SOL",
        name: "Wrapped SOL",
        decimals: 9,
        logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/So11111111111111111111111111111111111111112/logo.png"
      };
      const usdc = {
        address: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
        symbol: "USDC",
        name: "USD Coin",
        decimals: 6,
        logoURI: "https://raw.githubusercontent.com/solana-labs/token-list/main/assets/mainnet/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v/logo.png"
      };
      
      setFromToken(sol);
      setToToken(usdc);
    } catch (error) {
      console.error("Failed to load tokens:", error);
    } finally {
      setLoading(false);
    }
  };

  // Get quote when amount changes - with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (fromToken && toToken && fromAmount && parseFloat(fromAmount) > 0) {
        getQuote();
      } else {
        setToAmount("");
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [fromToken, toToken, fromAmount, slippage]);

  const getQuote = async () => {
    if (!fromToken || !toToken || !fromAmount) return;

    setQuoteLoading(true);
    try {
      const amount = (parseFloat(fromAmount) * Math.pow(10, fromToken.decimals)).toFixed(0);
      
      console.log('🔍 Fetching quote:', {
        from: fromToken.symbol,
        to: toToken.symbol,
        fromAmount,
        amountLamports: amount,
      });
      
      // Jupiter Legacy Swap API - proven stable endpoint
      const params = new URLSearchParams({
        inputMint: fromToken.address,
        outputMint: toToken.address,
        amount: amount,
        slippageBps: Math.floor(slippage * 100).toString(),
        onlyDirectRoutes: 'false',
        swapMode: 'ExactIn',
        asLegacyTransaction: 'true', // FORCE LEGACY - avoids ALT issues
      });

      const quoteResponse = await fetch(
        `https://lite-api.jup.ag/swap/v1/quote?${params}`
      );

      if (!quoteResponse.ok) {
        console.error('❌ Quote API error:', quoteResponse.status);
        const errorData = await quoteResponse.text();
        console.error('Error details:', errorData);
        setToAmount("");
        return;
      }

      const quote = await quoteResponse.json();
      console.log('📊 Quote received');
      console.log('📊 Route:', quote.routePlan?.map((r: any) => r.swapInfo?.label).join(' → '));
      
      if (quote.outAmount) {
        const outAmountDecimal = parseFloat(quote.outAmount) / Math.pow(10, toToken.decimals);
        const displayDecimals = outAmountDecimal < 0.01 ? 8 : 6;
        setToAmount(outAmountDecimal.toFixed(displayDecimals));
      } else {
        console.error('❌ No outAmount in quote');
        setToAmount("");
      }
    } catch (error) {
      console.error("❌ Failed to get quote:", error);
      setToAmount("");
    } finally {
      setQuoteLoading(false);
    }
  };

  const handleSwap = async () => {
    if (!publicKey || !signAllTransactions || !fromToken || !toToken || !fromAmount) {
      showError("❌ Please connect wallet and fill in all fields");
      return;
    }

    if (!config?.swapEnabled) {
      showError("❌ Swap feature is currently disabled");
      return;
    }

    setSwapping(true);
    setLastTxSignature(null);
    
    try {
      const amount = (parseFloat(fromAmount) * Math.pow(10, fromToken.decimals)).toFixed(0);

      console.log('🔄 Getting Jupiter quote...');

      // Step 1: Get Jupiter quote (Legacy API - lite-api)
      const quoteParams = new URLSearchParams({
        inputMint: fromToken.address,
        outputMint: toToken.address,
        amount: amount,
        slippageBps: Math.floor(slippage * 100).toString(),
        onlyDirectRoutes: 'false',
        swapMode: 'ExactIn',
        asLegacyTransaction: 'true', // MUST match swap request
      });

      const quoteResponse = await fetch(`https://lite-api.jup.ag/swap/v1/quote?${quoteParams}`);
      if (!quoteResponse.ok) throw new Error('Failed to get Jupiter quote');
      
      const quoteData = await quoteResponse.json();
      console.log('✅ Quote received');
      console.log('📊 Route:', quoteData.routePlan?.map((r: any) => r.swapInfo?.label).join(' → '));

      // Step 2: Get Jupiter swap transaction (Legacy API - lite-api)
      console.log('📝 Creating swap transaction...');
      
      const swapResponse = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quoteData,
          userPublicKey: publicKey.toString(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true, // Estimate compute units accurately
          skipUserAccountsRpcCalls: false, // Check accounts exist
          asLegacyTransaction: true, // CRITICAL - Must use legacy to avoid ALT issues
          prioritizationFeeLamports: {
            priorityLevelWithMaxLamports: {
              priorityLevel: 'high', // Use high priority for better inclusion
              maxLamports: 5000000 // Max 0.005 SOL for priority fees
            }
          },
          // Don't specify blockhashSlotsToExpiry - we'll replace with fresh blockhash anyway
        }),
      });

      if (!swapResponse.ok) {
        const errorText = await swapResponse.text();
        console.error('Swap API error:', swapResponse.status, errorText);
        
        let errorDetail = 'Unknown error';
        try {
          const errorJson = JSON.parse(errorText);
          errorDetail = errorJson.error || errorJson.message || errorText;
        } catch {
          errorDetail = errorText;
        }
        
        throw new Error(`Failed to create swap transaction: ${errorDetail}`);
      }
      
      const swapData = await swapResponse.json();
      
      // Validate response
      if (!swapData.swapTransaction) {
        console.error('Invalid swap response:', swapData);
        throw new Error('No swap transaction in response');
      }
      
      console.log('✅ Transaction received from Jupiter');
      console.log('📊 lastValidBlockHeight:', swapData.lastValidBlockHeight);
      console.log('📊 prioritizationFeeLamports:', swapData.prioritizationFeeLamports);
      
      const txReceivedTime = Date.now();

      // Use connection from wallet
      const rpcConnection = connection;

      // Deserialize swap transaction (legacy format when asLegacyTransaction: true)
      const jupiterTxBuffer = Buffer.from(swapData.swapTransaction, 'base64');
      let jupiterTx: Transaction;
      
      try {
        // Try legacy first (since we're using asLegacyTransaction: true)
        jupiterTx = Transaction.from(jupiterTxBuffer);
        console.log('📝 Deserialized as Legacy Transaction');
        console.log('📊 Transaction details:', {
          signatures: jupiterTx.signatures.length,
          instructions: jupiterTx.instructions.length,
          feePayer: jupiterTx.feePayer?.toString(),
          recentBlockhash: jupiterTx.recentBlockhash,
        });
      } catch (e) {
        console.error('Failed to deserialize transaction:', e);
        throw new Error('Transaction deserialization failed');
      }

      // CRITICAL FIX: Get a FRESH blockhash right now and replace Jupiter's
      // Jupiter's blockhash might already be old by the time we get it
      console.log('🔄 Getting fresh blockhash...');
      const { blockhash: freshBlockhash, lastValidBlockHeight: freshLastValidBlockHeight } = 
        await rpcConnection.getLatestBlockhash('finalized');
      
      console.log('📊 Replacing blockhash:', {
        old: jupiterTx.recentBlockhash,
        new: freshBlockhash,
        lastValidBlockHeight: freshLastValidBlockHeight
      });
      
      jupiterTx.recentBlockhash = freshBlockhash;
      jupiterTx.feePayer = publicKey;

      // Use the fresh lastValidBlockHeight instead of Jupiter's
      const lastValidBlockHeight = freshLastValidBlockHeight;

      const transactionsToSign: (VersionedTransaction | Transaction)[] = [jupiterTx];
      
      // Step 3: Prepare fee transaction if applicable
      if (config.platformFeeBps > 0 && toToken.address !== 'So11111111111111111111111111111111111111112') {
        console.log('💰 Preparing platform fee transaction...');
        
        const feeTransaction = new Transaction();
        
        const outputAmount = BigInt(quoteData.outAmount);
        const feeAmount = (outputAmount * BigInt(config.platformFeeBps)) / BigInt(10000);
        
        const treasuryPubkey = new PublicKey(config.treasuryWallet);
        const outputMintPubkey = new PublicKey(toToken.address);
        const userOutputAccount = await getAssociatedTokenAddress(outputMintPubkey, publicKey);
        const treasuryOutputAccount = await getAssociatedTokenAddress(outputMintPubkey, treasuryPubkey);
        
        // Check if treasury account exists
        const treasuryAccountInfo = await rpcConnection.getAccountInfo(treasuryOutputAccount);
        
        if (!treasuryAccountInfo) {
          console.log('📝 Creating treasury token account...');
          feeTransaction.add(
            createAssociatedTokenAccountInstruction(
              publicKey,
              treasuryOutputAccount,
              treasuryPubkey,
              outputMintPubkey
            )
          );
        }
        
        // Add fee transfer
        feeTransaction.add(
          createTransferInstruction(
            userOutputAccount,
            treasuryOutputAccount,
            publicKey,
            feeAmount,
            [],
            TOKEN_PROGRAM_ID
          )
        );
        
        const { blockhash } = await rpcConnection.getLatestBlockhash('finalized');
        feeTransaction.recentBlockhash = blockhash;
        feeTransaction.feePayer = publicKey;
        
        transactionsToSign.push(feeTransaction);
        console.log('✅ Fee transaction prepared');
      }

      // Sign all transactions at once
      const txCount = transactionsToSign.length;
      console.log(`📝 Please sign ${txCount} transaction(s)...`);
      
      // Log transaction details before signing
      transactionsToSign.forEach((tx, i) => {
        const txName = i === 0 ? 'Swap' : 'Fee';
        console.log(`📋 ${txName} transaction:`, {
          instructions: tx.instructions.length,
          feePayer: tx.feePayer?.toString(),
          hasBlockhash: !!tx.recentBlockhash,
        });
      });
      
      showInfo(`Please sign ${txCount} transaction${txCount > 1 ? 's' : ''} in your wallet`);
      
      let signedTransactions: Transaction[];
      try {
        signedTransactions = await signAllTransactions(transactionsToSign);
        const signingTime = Date.now() - txReceivedTime;
        console.log(`✅ All transactions signed (took ${signingTime}ms)`);
      } catch (signError: any) {
        console.error('❌ Signing failed:', signError);
        throw new Error(`Failed to sign transaction: ${signError.message || 'User rejected or wallet error'}`);
      }

      // Execute transactions in sequence
      for (let i = 0; i < signedTransactions.length; i++) {
        const tx = signedTransactions[i];
        const txName = i === 0 ? 'Swap' : 'Fee';
        
        console.log(`📤 Sending ${txName} transaction...`);
        showInfo(`Sending ${txName} transaction...`);
        
        let signature: string;
        let retryCount = 0;
        const maxRetries = 2; // Reduce retries since we'll fail fast
        
        // Send transaction with retry for network issues only
        while (retryCount < maxRetries) {
          try {
            const rawTransaction = tx.serialize();
            signature = await rpcConnection.sendRawTransaction(rawTransaction, {
              skipPreflight: true, // CRITICAL - Skip simulation to send faster
              maxRetries: 3,
              preflightCommitment: 'confirmed',
            });
            
            // Success - break retry loop
            console.log(`✅ ${txName} transaction sent:`, signature);
            
            // Immediately verify the transaction exists
            console.log(`🔍 Verifying transaction was accepted...`);
            await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms for propagation
            
            const quickCheck = await rpcConnection.getSignatureStatus(signature);
            console.log(`📊 Initial status:`, {
              exists: quickCheck.value !== null,
              status: quickCheck.value?.confirmationStatus,
            });
            
            if (quickCheck.value === null) {
              console.warn(`⚠️ Transaction signature not found immediately after sending`);
            }
            
            break;
            
          } catch (sendError: any) {
            retryCount++;
            
            if (sendError.message?.includes('block height exceeded') || 
                sendError.message?.includes('Blockhash not found')) {
              console.error(`❌ ${txName} blockhash expired - transaction took too long to sign`);
              throw new Error('Transaction expired while signing. Please try the swap again and sign faster.');
            }
            
            // Network errors - retry
            if (sendError.message?.includes('429') || 
                sendError.message?.includes('timeout')) {
              console.warn(`⚠️ Network error on attempt ${retryCount}`);
              
              if (retryCount >= maxRetries) {
                throw new Error('Network error sending transaction. Please try again.');
              }
              
              await new Promise(resolve => setTimeout(resolve, 500));
              continue;
            }
            
            // Other error - don't retry
            throw sendError;
          }
        }
        
        if (i === 0) {
          setLastTxSignature(signature!);
        }
        
        showInfo(`⏳ Confirming ${txName} transaction...`);
        
        try {
          // Use lastValidBlockHeight from Jupiter for proper confirmation
          const confirmation = await rpcConnection.confirmTransaction({
            signature: signature!,
            blockhash: tx.recentBlockhash!,
            lastValidBlockHeight: i === 0 ? lastValidBlockHeight : undefined
          }, 'confirmed');
          
          if (confirmation.value.err) {
            throw new Error(`${txName} transaction failed: ${JSON.stringify(confirmation.value.err)}`);
          }
          
          console.log(`✅ ${txName} confirmed!`);
          showSuccess(`✅ ${txName} confirmed! ${signature!.slice(0, 8)}...`);
          
        } catch (confirmError: any) {
          console.warn(`⚠️ ${txName} confirmation timeout:`, confirmError.message);
          
          // If confirmation times out, check actual status
          const status = await rpcConnection.getSignatureStatus(signature!);
          
          console.log(`📊 Transaction status check:`, {
            signature: signature,
            confirmationStatus: status.value?.confirmationStatus,
            err: status.value?.err,
            slot: status.value?.slot,
          });
          
          if (status.value?.confirmationStatus === 'confirmed' || 
              status.value?.confirmationStatus === 'finalized') {
            console.log(`✅ ${txName} actually confirmed`);
            showSuccess(`✅ ${txName} confirmed! ${signature!.slice(0, 8)}...`);
          } else if (status.value?.err) {
            console.error(`❌ ${txName} failed:`, status.value.err);
            throw new Error(`${txName} transaction failed: ${JSON.stringify(status.value.err)}`);
          } else if (status.value === null) {
            // Transaction doesn't exist on-chain
            console.error(`❌ ${txName} not found on-chain - may have been dropped`);
            throw new Error(`${txName} transaction was not found on-chain. It may have been dropped or the RPC is slow. Please try again.`);
          } else {
            // Transaction is still pending
            console.log(`⏳ ${txName} still pending, likely will confirm`);
            showInfo(`⏳ ${txName} sent but not yet confirmed. Check: https://solscan.io/tx/${signature}`);
          }
        }
      }

      // All transactions confirmed
      showSuccess('🎉 Swap completed successfully!');
      
      setFromAmount("");
      setToAmount("");
      
      // Record stats
      try {
        const { calculateSwapVolumeUSD } = await import('@/lib/price-utils');
        
        const { volumeUsd, priceUsd } = await calculateSwapVolumeUSD(
          fromToken.address,
          parseFloat(fromAmount) * Math.pow(10, fromToken.decimals),
          fromToken.decimals
        );
        
        await fetch("/api/swap/stats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fromToken: fromToken.symbol,
            toToken: toToken.symbol,
            fromAmount: parseFloat(fromAmount),
            toAmount: parseFloat(toAmount),
            userAddress: publicKey.toString(),
            volumeUsd: volumeUsd,
            priceUsd: priceUsd,
            txid: lastTxSignature,
            source: 'jupiter',
          }),
        });
      } catch (statsError) {
        console.error('Stats recording failed:', statsError);
      }

    } catch (error: any) {
      console.error("❌ Swap error:", error);
      
      if (error.message?.includes('User rejected') || 
          error.message?.includes('user rejected') ||
          error.message?.includes('User cancelled') ||
          error.message?.includes('Failed to sign transaction') ||
          error.name === 'WalletSignTransactionError') {
        showError("❌ Transaction cancelled or wallet signing failed");
      } else if (error.message?.includes('expired while signing')) {
        showError("❌ Transaction expired while signing. Please try again and sign faster.");
      } else if (error.message?.includes('insufficient funds')) {
        showError("❌ Insufficient balance");
      } else if (error.message?.includes('block height exceeded') || 
                 error.message?.includes('Blockhash not found')) {
        showError("❌ Transaction expired. Please try again.");
      } else if (error.message?.includes('Network error')) {
        showError("❌ Network error. Please try again.");
      } else {
        showError(`❌ Swap failed: ${error.message}`);
      }
    } finally {
      setSwapping(false);
    }
  };

  const switchTokens = () => {
    const temp = fromToken;
    setFromToken(toToken);
    setToToken(temp);
    setFromAmount(toAmount);
    setToAmount("");
  };

  // Helper to get explorer link
  const getExplorerLink = (signature: string) => {
    return `https://solscan.io/tx/${signature}`;
  };

  return (
    <div className="min-h-screen p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <h1 
            className="text-4xl font-bold"
            style={{ background: 'linear-gradient(45deg, white, #fb57ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
          >
            Token Swap
          </h1>
          <p className="text-gray-500">
            Powered by Jupiter • Best prices across all Solana DEXs
          </p>
          {config && config.platformFeePercentage > 3 && (
            <div className="mt-2 border rounded-lg p-2" style={{ background: 'rgba(251, 87, 255, 0.2)', borderColor: 'rgba(251, 87, 255, 0.5)' }}>
              <p className="text-sm" style={{ color: '#fb57ff' }}>
                ⚠️ Platform fee is {config.platformFeePercentage}% - verify this is correct in admin settings
              </p>
            </div>
          )}
          {config && !config.swapEnabled && (
            <div className="mt-4 bg-red-500/20 border border-red-500 rounded-lg p-3">
              <p className="text-red-200 font-semibold">⚠️ Swap Disabled</p>
              <p className="text-red-300 text-sm">
                Swapping is currently disabled by the administrator
              </p>
            </div>
          )}
        </div>

        {/* Swap Card */}
        <div className="bg-white/[0.02] backdrop-blur border border-white/[0.05] rounded-2xl p-6 space-y-4">
          {/* Settings Button */}
          <div className="flex justify-end">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-lg hover:bg-white/[0.05] transition-all"
            >
              <Settings className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Settings Panel */}
          {showSettings && (
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-4 space-y-3">
              <div>
                <label className="text-sm text-gray-500 mb-2 block">Slippage Tolerance</label>
                <div className="flex gap-2">
                  {[0.1, 0.5, 1.0].map((value) => (
                    <button
                      key={value}
                      onClick={() => setSlippage(value)}
                      disabled={config && value > config.maxSlippage}
                      className={`flex-1 px-3 py-2 rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                        slippage === value
                          ? "text-white"
                          : "bg-white/[0.05] text-gray-300 hover:bg-white/[0.08]"
                      }`}
                      style={slippage === value ? { background: 'linear-gradient(45deg, black, #fb57ff)' } : {}}
                    >
                      {value}%
                    </button>
                  ))}
                  <input
                    type="number"
                    value={slippage}
                    onChange={(e) => {
                      const value = parseFloat(e.target.value) || 0.5;
                      if (!config || value <= config.maxSlippage) {
                        setSlippage(value);
                      }
                    }}
                    max={config?.maxSlippage}
                    className="w-20 px-3 py-2 bg-white/[0.05] border border-white/[0.05] rounded-lg text-white text-center focus:outline-none"
                    style={{ borderColor: 'rgba(251, 87, 255, 0.3)' }}
                    step="0.1"
                    min="0.1"
                  />
                </div>
                {config && (
                  <p className="text-xs text-gray-500 mt-2">
                    Max slippage: {config.maxSlippage}%
                  </p>
                )}
              </div>
            </div>
          )}

          {/* From Token */}
          <div className="space-y-2">
            <label className="text-sm text-gray-500">You Pay</label>
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={() => setShowTokenSelect("from")}
                  className="flex items-center gap-2 px-3 py-2 bg-white/[0.05] rounded-lg hover:bg-white/[0.08] transition-all"
                >
                  {fromToken?.logoURI && (
                    <img src={fromToken.logoURI} alt={fromToken.symbol} className="w-6 h-6 rounded-full" />
                  )}
                  <span className="font-semibold">{fromToken?.symbol || "Select"}</span>
                  <span className="text-gray-400">▼</span>
                </button>
                <input
                  type="number"
                  value={fromAmount}
                  onChange={(e) => setFromAmount(e.target.value)}
                  placeholder="0.00"
                  disabled={config && !config.swapEnabled}
                  className="flex-1 bg-transparent text-right text-2xl font-bold focus:outline-none disabled:opacity-50"
                />
              </div>
            </div>
          </div>

          {/* Switch Button */}
          <div className="flex justify-center -my-2">
            <button
              onClick={switchTokens}
              disabled={config && !config.swapEnabled}
              className="p-2 bg-white/[0.05] border-4 border-[#060609] rounded-xl hover:bg-white/[0.08] transition-all disabled:opacity-50"
            >
              <ArrowDownUp className="w-5 h-5" style={{ color: '#fb57ff' }} />
            </button>
          </div>

          {/* To Token */}
          <div className="space-y-2">
            <label className="text-sm text-gray-500">You Receive</label>
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
              <div className="flex items-center gap-3 mb-2">
                <button
                  onClick={() => setShowTokenSelect("to")}
                  className="flex items-center gap-2 px-3 py-2 bg-white/[0.05] rounded-lg hover:bg-white/[0.08] transition-all"
                >
                  {toToken?.logoURI && (
                    <img src={toToken.logoURI} alt={toToken.symbol} className="w-6 h-6 rounded-full" />
                  )}
                  <span className="font-semibold">{toToken?.symbol || "Select"}</span>
                  <span className="text-gray-400">▼</span>
                </button>
                <div className="flex-1 text-right text-2xl font-bold">
                  {quoteLoading ? (
                    <span className="text-gray-500">Loading...</span>
                  ) : (
                    toAmount || "0.00"
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Info */}
          {fromAmount && toAmount && config && (
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Rate</span>
                <span className="text-white">
                  1 {fromToken?.symbol} ≈ {(parseFloat(toAmount) / parseFloat(fromAmount)).toFixed(6)} {toToken?.symbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Platform Fee ({config.platformFeePercentage.toFixed(2)}%)</span>
                <span className="text-white">
                  {((parseFloat(fromAmount) * config.platformFeePercentage) / 100).toFixed(6)} {fromToken?.symbol}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Slippage Tolerance</span>
                <span className="text-white">{slippage}%</span>
              </div>
            </div>
          )}

          {/* Last Transaction Link */}
          {lastTxSignature && (
            <a
              href={getExplorerLink(lastTxSignature)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 p-3 bg-green-500/20 border border-green-500/30 rounded-lg hover:bg-green-500/30 transition-all"
            >
              <span className="text-sm text-green-200">View last transaction on Solscan</span>
              <ExternalLink className="w-4 h-4 text-green-400" />
            </a>
          )}

          {/* Swap Button */}
          <button
            onClick={handleSwap}
            disabled={
              swapping ||
              !publicKey ||
              !fromToken ||
              !toToken ||
              !fromAmount ||
              parseFloat(fromAmount) <= 0 ||
              (config && !config.swapEnabled)
            }
            className="w-full py-4 rounded-xl font-bold text-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(45deg, black, #fb57ff)' }}
          >
            {swapping ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                Swapping...
              </>
            ) : !publicKey ? (
              "Connect Wallet"
            ) : config && !config.swapEnabled ? (
              "Swap Disabled"
            ) : (
              <>
                <Zap className="w-5 h-5" />
                Swap
              </>
            )}
          </button>

          {/* Warning */}
          {!publicKey && (
            <div className="border rounded-lg p-3 flex items-start gap-2" style={{ background: 'rgba(251, 87, 255, 0.2)', borderColor: 'rgba(251, 87, 255, 0.5)' }}>
              <Info className="w-5 h-5 flex-shrink-0 mt-0.5" style={{ color: '#fb57ff' }} />
              <p className="text-sm" style={{ color: '#fb57ff' }}>
                Please connect your wallet to start swapping
              </p>
            </div>
          )}
        </div>

        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Zap className="w-5 h-5" style={{ color: '#fb57ff' }} />
              <span className="font-semibold text-white">Fast Swaps</span>
            </div>
            <p className="text-sm text-gray-500">
              Powered by Jupiter aggregator
            </p>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5" style={{ color: '#fb57ff' }} />
              <span className="font-semibold text-white">Best Prices</span>
            </div>
            <p className="text-sm text-gray-500">
              Routes through all DEXs including Raydium
            </p>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-5 h-5" style={{ color: '#fb57ff' }} />
              <span className="font-semibold text-white">Platform Fee</span>
            </div>
            <p className="text-sm text-gray-500">
              1% fee supports platform development
            </p>
          </div>
        </div>
      </div>

      {/* Token Select Modal */}
      <TokenSelectModal
        featuredTokens={featuredTokens}
        isOpen={showTokenSelect !== null}
        onSelectToken={(token) => {
          if (showTokenSelect === "from") {
            setFromToken(token);
          } else {
            setToToken(token);
          }
          setShowTokenSelect(null);
        }}
        onClose={() => setShowTokenSelect(null)}
        title={showTokenSelect === "from" ? "Select token to pay" : "Select token to receive"}
      />
    </div>
  );
}