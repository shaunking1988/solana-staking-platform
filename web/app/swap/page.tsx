"use client";

import { useState, useEffect } from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { VersionedTransaction } from "@solana/web3.js";
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
  const { publicKey, signTransaction } = useWallet();
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
          
          console.log('✅ Config loaded:', {
            swapEnabled: data.swapEnabled,
            platformFeeBps: data.platformFeeBps,
            platformFeePercentage: platformFeePercentage + '%',
            treasuryWallet: data.treasuryWallet,
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
            platformFeePercentage: 1.0, // 1% default
            maxSlippage: 50.0, // 50% default
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
      
      const quoteResponse = await fetch(
        `/api/swap/quote?` +
        `inputMint=${fromToken.address}&` +
        `outputMint=${toToken.address}&` +
        `amount=${amount}&` +
        `slippageBps=${Math.floor(slippage * 100)}`
      );

      if (!quoteResponse.ok) {
        console.error('❌ Quote API error:', quoteResponse.status);
        const errorData = await quoteResponse.json();
        console.error('Error details:', errorData);
        setToAmount("");
        return;
      }

      const quote = await quoteResponse.json();
      console.log('📊 Quote received from:', quote.source);
      
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
    if (!publicKey || !signTransaction || !fromToken || !toToken || !fromAmount) {
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

      console.log('🔄 Requesting swap transaction...');

      const response = await fetch("/api/swap/transaction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userPublicKey: publicKey.toString(),
          inputMint: fromToken.address,
          outputMint: toToken.address,
          amount: amount,
          slippageBps: Math.floor(slippage * 100),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('❌ Transaction API error:', errorData);
        throw new Error(errorData.error || 'Failed to create transaction');
      }

      const data = await response.json();
      
      if (!data.swapTransaction) {
        throw new Error('No transaction returned from API');
      }

      console.log('✅ Transaction received from:', data.source);
      console.log('📝 Signing transaction...');

      const swapTransactionBuf = Buffer.from(data.swapTransaction, "base64");
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
      
      const signedTransaction = await signTransaction(transaction);

      console.log('✅ Signed, sending to network...');

      const rawTransaction = signedTransaction.serialize();
      const txid = await connection.sendRawTransaction(rawTransaction, {
        skipPreflight: true,
        maxRetries: 3,
      });

      console.log('✅ Transaction sent:', txid);
      setLastTxSignature(txid);

      // Show pending with link
      showInfo(`📤 Transaction sent! Confirming... View: https://solscan.io/tx/${txid}`);

      // Wait for confirmation with better error handling
      try {
        const latestBlockhash = await connection.getLatestBlockhash('finalized');
        
        await connection.confirmTransaction({
          signature: txid,
          blockhash: latestBlockhash.blockhash,
          lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
        }, 'confirmed');

        console.log('✅ Transaction confirmed!');
        showSuccess(`✅ Swap successful! TX: ${txid.slice(0, 8)}...`);
        
        setFromAmount("");
        setToAmount("");
        
      } catch (confirmError: any) {
        console.warn('⚠️ Confirmation issue:', confirmError.message);
        
        // Check actual status
        const status = await connection.getSignatureStatus(txid);
        
        if (status.value?.confirmationStatus === 'confirmed' || 
            status.value?.confirmationStatus === 'finalized') {
          console.log('✅ Transaction actually confirmed');
          showSuccess(`✅ Swap successful! TX: ${txid.slice(0, 8)}...`);
          setFromAmount("");
          setToAmount("");
        } else if (status.value?.err) {
          console.error('❌ Transaction failed:', status.value.err);
          throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
        } else {
          showInfo(`⏳ Transaction pending. Check: https://solscan.io/tx/${txid}`);
        }
      }
      
      // Record stats with USD value
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
            txid: txid,
            source: data.source,
          }),
        });
      } catch (statsError) {
        console.error('Stats recording failed:', statsError);
      }

    } catch (error: any) {
      console.error("❌ Swap error:", error);
      
      if (error.message?.includes('User rejected')) {
        showError("❌ Transaction cancelled");
      } else if (error.message?.includes('insufficient funds')) {
        showError("❌ Insufficient balance");
      } else if (error.message?.includes('Blockhash not found')) {
        showError("❌ Transaction expired. Try again.");
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
            Powered by StakePoint
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
              Swaps routed through Raydium
            </p>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5" style={{ color: '#fb57ff' }} />
              <span className="font-semibold text-white">Best Prices</span>
            </div>
            <p className="text-sm text-gray-500">
              Supports low-liquidity tokens
            </p>
          </div>

          <div className="bg-white/[0.02] border border-white/[0.05] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-5 h-5" style={{ color: '#fb57ff' }} />
              <span className="font-semibold text-white">User Swap Rewards</span>
            </div>
            <p className="text-sm text-gray-500">
              1% of transactions collected towards user rewards
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