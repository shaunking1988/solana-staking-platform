"use client";
import { useState, useEffect } from "react";
import { useWallet, useConnection, useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, Transaction, SYSVAR_RENT_PUBKEY } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { Plus, X, Loader2, Check, AlertCircle, Code } from "lucide-react";
import { getProgram, getPDAs } from "@/lib/anchor-program";
import { calculateEstimatedAPY, calculateRequiredRewards } from "@/lib/calculate-apy";
import IntegrateModal from "@/components/IntegrateModal";
import * as anchor from "@coral-xyz/anchor";

const ADMIN_WALLET = new PublicKey("9zS3TWXEWQnYU2xFSMB7wvv7JuBJpcPtxw9kaf1STzvR");
const POOL_CREATION_FEE = 1 * 1_000_000_000; // 1 SOL in lamports

interface UserToken {
  mint: string;
  balance: number;
  decimals: number;
  symbol?: string;
  name?: string;
  logoURI?: string;
  programId: string;
  price?: number;
  liquidity?: number;
  marketCap?: number;
}

interface CreatePoolModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreatePoolModal({ onClose, onSuccess }: CreatePoolModalProps) {
  const { publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [userTokens, setUserTokens] = useState<UserToken[]>([]);
  const [selectedToken, setSelectedToken] = useState<UserToken | null>(null);
  const [createdPoolId, setCreatedPoolId] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showIntegrateModal, setShowIntegrateModal] = useState(false);
  const [urlCopied, setUrlCopied] = useState(false);
  
  const [poolConfig, setPoolConfig] = useState({
    rewardAmount: "1000",
    duration: "90",
    enableReflections: false,
    reflectionType: "self" as "self" | "external",
    externalReflectionMint: "",
  });

  // Fetch user's tokens
  useEffect(() => {
    if (publicKey && step === 1) {
      fetchUserTokens();
    }
  }, [publicKey, step]);

  const fetchUserTokens = async () => {
    if (!publicKey) return;
    
    setLoading(true);
    setStatusMessage("Loading your tokens...");
    
    try {
      console.log("🔍 Fetching tokens for wallet:", publicKey.toString());
      console.log("🌐 RPC Endpoint:", connection.rpcEndpoint);
      
      // Check SOL balance first
      const balance = await connection.getBalance(publicKey);
      console.log("💰 SOL Balance:", balance / 1_000_000_000, "SOL");
      
      // Check network by trying to get genesis hash
      const genesisHash = await connection.getGenesisHash();
      console.log("🔗 Network Genesis Hash:", genesisHash);
      console.log("📍 Network:", 
        genesisHash === "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d" ? "MAINNET" :
        genesisHash === "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG" ? "DEVNET" :
        "UNKNOWN"
      );
      
      // Fetch regular SPL tokens
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_PROGRAM_ID }
      );
      console.log("✅ Found", tokenAccounts.value.length, "SPL token accounts");

      // Fetch Token-2022 tokens
      const token2022Accounts = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { programId: TOKEN_2022_PROGRAM_ID }
      );
      console.log("✅ Found", token2022Accounts.value.length, "Token-2022 accounts");

      const allAccounts = [
        ...tokenAccounts.value.map(acc => ({ ...acc, programId: "SPL Token", programIdKey: TOKEN_PROGRAM_ID.toString() })),
        ...token2022Accounts.value.map(acc => ({ ...acc, programId: "Token-2022", programIdKey: TOKEN_2022_PROGRAM_ID.toString() }))
      ];

      console.log("📊 Total accounts to process:", allAccounts.length);

      const tokens: UserToken[] = [];
      let processed = 0;

      for (const account of allAccounts) {
        try {
          const parsed = account.account.data.parsed.info;
          const tokenAmount = parsed.tokenAmount;
          
          // Check both uiAmount and raw amount
          const balance = tokenAmount.uiAmount || 0;
          const rawAmount = tokenAmount.amount;
          
          console.log(`Token ${parsed.mint}:`, {
            balance,
            rawAmount,
            decimals: tokenAmount.decimals,
            programId: account.programId
          });
          
          // Include tokens with any amount (even 0) to see what's in the wallet
          // Users might want to create a pool for a token they'll deposit later
          if (rawAmount !== "0") {
            const mint = parsed.mint;
            processed++;
            setStatusMessage(`Fetching metadata... (${processed}/${allAccounts.length})`);
            
            // Fetch token info from BirdEye
            try {
              const response = await fetch(`/api/birdeye/token-info?address=${mint}`);
              const result = await response.json();
              
              // Use fallback if API returns error
              const tokenInfo = result.fallback || result;
              
              tokens.push({
                mint,
                balance,
                decimals: tokenAmount.decimals,
                symbol: tokenInfo.symbol || "UNKNOWN",
                name: tokenInfo.name || "Unknown",
                logoURI: tokenInfo.logoURI,
                programId: account.programIdKey,
                price: tokenInfo.price,
                liquidity: tokenInfo.liquidity,
                marketCap: tokenInfo.marketCap,
              });
              
              console.log(`✅ Added token:`, tokenInfo.symbol || "UNKNOWN");
            } catch (err) {
              console.error(`❌ Failed to fetch info for ${mint}:`, err);
              // Still add token but without metadata
              tokens.push({
                mint,
                balance,
                decimals: tokenAmount.decimals,
                programId: account.programIdKey,
                symbol: "UNKNOWN",
                name: "Unknown",
              });
            }
          }
        } catch (parseError) {
          console.error("Error parsing token account:", parseError);
        }
      }

      console.log("🎉 Total tokens loaded:", tokens.length);

      // Sort by balance first, then liquidity/market cap
      tokens.sort((a, b) => {
        // First sort by balance (tokens with balance on top)
        if (a.balance > 0 && b.balance === 0) return -1;
        if (a.balance === 0 && b.balance > 0) return 1;
        
        // Then by liquidity/market cap
        const aValue = a.liquidity || a.marketCap || 0;
        const bValue = b.liquidity || b.marketCap || 0;
        return bValue - aValue;
      });

      setUserTokens(tokens);
      setStatusMessage("");
    } catch (error) {
      console.error("❌ Error fetching tokens:", error);
      setStatusMessage("Error loading tokens. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreatePool = async () => {
    if (!publicKey || !signTransaction || !selectedToken || !wallet) {
      setError("Please connect your wallet");
      return;
    }
    
    setError(null); // Clear any previous errors

    setLoading(true);
    
    try {
      // Setup
      const program = getProgram(wallet, connection);
      const tokenMintPubkey = new PublicKey(selectedToken.mint);
      
      // Check if pool already exists (both on-chain and in database) and find next available poolId
      let poolId = 0;
      let poolExists = true;
      
      console.log("🔍 Checking if pool already exists for this token...");
      
      while (poolExists && poolId < 10) { // Max 10 pools per token
        const [projectPDA] = getPDAs.project(tokenMintPubkey, poolId);
        
        // Check on-chain
        let onChainExists = false;
        try {
          await program.account.project.fetch(projectPDA);
          onChainExists = true;
        } catch (error) {
          // Pool doesn't exist on-chain
        }
        
        // Check database
        let dbExists = false;
        try {
          const dbCheck = await fetch(`/api/pools/by-token/${selectedToken.mint}`);
          if (dbCheck.ok) {
            const pools = await dbCheck.json();
            dbExists = pools.some((p: any) => p.poolId === poolId);
          }
        } catch (error) {
          console.log("⚠️ Could not check database, continuing...");
        }
        
        if (onChainExists || dbExists) {
          console.log(`⚠️ Pool ${poolId} already exists (onChain: ${onChainExists}, db: ${dbExists}), trying next...`);
          poolId++;
        } else {
          console.log(`✅ Found available poolId: ${poolId}`);
          poolExists = false;
        }
      }
      
      if (poolExists) {
        throw new Error("Maximum number of pools (10) reached for this token. Please contact support.");
      }

      const [projectPDA] = getPDAs.project(tokenMintPubkey, poolId);
      const [stakingVaultPDA] = getPDAs.stakingVault(tokenMintPubkey, poolId);
      const [rewardVaultPDA] = getPDAs.rewardVault(tokenMintPubkey, poolId);
      
      // ✅ Detect token program type early
      const mintInfo = await connection.getAccountInfo(tokenMintPubkey);
      if (!mintInfo) {
        throw new Error("Token mint not found");
      }
      const tokenProgramId = mintInfo.owner.equals(TOKEN_2022_PROGRAM_ID) 
        ? TOKEN_2022_PROGRAM_ID 
        : TOKEN_PROGRAM_ID;
      console.log(`✅ Token program detected: ${tokenProgramId.toString()}`);
      
      console.log(`🎯 Creating pool with poolId: ${poolId}`);

      // Get user's token account
      const userTokenAccount = await connection.getParsedTokenAccountsByOwner(
        publicKey,
        { mint: tokenMintPubkey }
      );
      
      if (userTokenAccount.value.length === 0) {
        throw new Error("No token account found for this token");
      }
      
      const userTokenAccountPubkey = userTokenAccount.value[0].pubkey;
      
      // Verify balance
      const rewardAmount = parseFloat(poolConfig.rewardAmount);
      const userBalance = userTokenAccount.value[0].account.data.parsed.info.tokenAmount.uiAmount;
      if (userBalance < rewardAmount) {
        throw new Error(`Insufficient balance. You have ${userBalance} ${selectedToken.symbol} but need ${rewardAmount}`);
      }
      
      const rewardAmountWithDecimals = new anchor.BN(rewardAmount * Math.pow(10, selectedToken.decimals));
      
      // Transaction 1: Payment
      setStatusMessage("Step 1/4: Processing payment...");
      console.log("💰 Transaction 1: Payment");
      const paymentTx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: publicKey,
          toPubkey: ADMIN_WALLET,
          lamports: POOL_CREATION_FEE,
        })
      );
      
      const { blockhash } = await connection.getLatestBlockhash();
      paymentTx.recentBlockhash = blockhash;
      paymentTx.feePayer = publicKey;
      
      const signedPaymentTx = await signTransaction(paymentTx);
      const paymentSignature = await connection.sendRawTransaction(signedPaymentTx.serialize());
      await connection.confirmTransaction(paymentSignature, "confirmed");
      console.log("✅ Payment successful:", paymentSignature);

      // Transaction 2: Create Project
      setStatusMessage("Step 2/4: Creating pool on-chain...");
      console.log("🏗️ Transaction 2: Create Project");
      const createProjectTx = await program.methods
        .createProject(tokenMintPubkey, new anchor.BN(poolId)) // Pass tokenMint AND poolId
        .accounts({
          project: projectPDA,
          stakingVault: stakingVaultPDA,
          rewardVault: rewardVaultPDA,
          tokenMint: tokenMintPubkey, // Use "tokenMint" not "tokenMintAccount"
          admin: publicKey,
          systemProgram: SystemProgram.programId,
          tokenProgram: tokenProgramId,  // ✅ Use detected token program
          rent: SYSVAR_RENT_PUBKEY,
        })
        .rpc();
      console.log("✅ Project created:", createProjectTx);

      // Transaction 3: Initialize Pool
      setStatusMessage("Step 3/4: Initializing pool parameters...");
      console.log("⚙️ Transaction 3: Initialize Pool");
      const initParams = {
        rateBpsPerYear: new anchor.BN(0), // Not used for dynamic pools
        rateMode: 1, // Variable pool = dynamic APR (auto-calculated based on rewards/staked)
        lockupSeconds: new anchor.BN(parseInt(poolConfig.duration) * 86400), // Lock for full duration
        poolDurationSeconds: new anchor.BN(parseInt(poolConfig.duration) * 86400),
        referrer: null,
        referrerSplitBps: null,
        enableReflections: poolConfig.enableReflections,
        reflectionToken: poolConfig.enableReflections && poolConfig.reflectionType === "external" && poolConfig.externalReflectionMint
          ? new PublicKey(poolConfig.externalReflectionMint)
          : poolConfig.enableReflections && poolConfig.reflectionType === "self"
          ? tokenMintPubkey
          : null,
      };

      const initPoolTx = await program.methods
        .initializePool(
          tokenMintPubkey,        // token_mint
          new anchor.BN(poolId),  // pool_id
          initParams              // params struct
        )
        .accounts({
          project: projectPDA,
          stakingVault: stakingVaultPDA,
          reflectionTokenMint: null,
          reflectionTokenAccount: null,
          admin: publicKey,
          associatedTokenProgram: null,
          systemProgram: SystemProgram.programId,
          tokenProgram: tokenProgramId,  // ✅ Use detected token program
        })
        .rpc();
      console.log("✅ Pool initialized:", initPoolTx);

      // Transaction 4: Deposit Rewards
      setStatusMessage("Step 4/4: Depositing rewards...");
      console.log("💎 Transaction 4: Deposit Rewards");
      
      const depositRewardsTx = await program.methods
        .depositRewards(
          tokenMintPubkey,           // token_mint
          new anchor.BN(poolId),     // pool_id
          rewardAmountWithDecimals   // amount
        )
        .accounts({
          project: projectPDA,
          rewardVault: rewardVaultPDA,
          adminTokenAccount: userTokenAccountPubkey,
          tokenMintAccount: tokenMintPubkey,  // ✅ Add token mint account
          admin: publicKey,
          tokenProgram: tokenProgramId,  // ✅ Use detected token program
        })
        .rpc();
      console.log("✅ Rewards deposited:", depositRewardsTx);

      // TODO: Admin transfer temporarily disabled due to PDA mismatch
      // The TransferAdmin struct expects PDA without poolId, but user pools use poolId
      // This will be fixed in next program update
      // 
      // For now, pool creators retain admin rights and can:
      // - Deposit more rewards
      // - Claim unclaimed tokens
      // - Still earn staking rewards as regular users

      setStatusMessage("Finalizing pool...");
      console.log("✅ Pool finalized");

      // Save to database
      setStatusMessage("Saving pool information...");
      
      const poolData = {
        name: selectedToken.name,
        symbol: selectedToken.symbol,
        tokenMint: selectedToken.mint,
        logo: selectedToken.logoURI,
        apr: "0", // Dynamic - calculated on frontend based on actual stakes
        apy: "0", // Dynamic - calculated on frontend based on actual stakes
        type: "locked",
        lockPeriod: poolConfig.duration, // Lock period equals duration
        rewards: selectedToken.symbol,
        poolId: poolId,
        hasSelfReflections: poolConfig.enableReflections && poolConfig.reflectionType === "self",
        hasExternalReflections: poolConfig.enableReflections && poolConfig.reflectionType === "external",
        externalReflectionMint: poolConfig.reflectionType === "external" ? poolConfig.externalReflectionMint : null,
        isInitialized: true,
        isPaused: false, // Pool is active - rewards already deposited in tx 4
        paymentTxSignature: paymentSignature,
        createTxSignature: createProjectTx,
        initTxSignature: initPoolTx,
        creatorWallet: publicKey.toString(),
        projectPda: projectPDA.toString(),
      };

      const response = await fetch("/api/admin/pools/create-user-pool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(poolData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to save pool to database");
      }

      const savedPool = await response.json();
      console.log("✅ Pool saved to database:", savedPool);

      // Show success modal with shareable URL - DON'T refresh yet
      setCreatedPoolId(savedPool.pool.id);
      setShowSuccessModal(true);
      setStatusMessage("");
      setLoading(false);
      // Don't call onSuccess() here - let user see the share URL first!

    } catch (error: any) {
      console.error("Error creating pool:", error);
      setStatusMessage("");
      setError(error.message || "Failed to create pool. Please try again.");
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <div className={`fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto ${showSuccessModal ? 'hidden' : ''}`}>
      <div className="bg-black/90 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto border border-white/[0.05]">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-white/[0.05] sticky top-0 bg-black/90 z-10">
          <h2 className="text-2xl font-bold flex items-center gap-2" style={{ background: 'linear-gradient(45deg, white, #fb57ff)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>
            <Plus className="w-6 h-6" style={{ color: '#fb57ff' }} />
            Create Your Staking Pool
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-4 p-6 border-b border-white/[0.1]">
          <div className={`flex items-center gap-2 ${step >= 1 ? 'text-[#fb57ff]' : 'text-gray-500'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'text-white' : 'bg-gray-700'}`} style={step >= 1 ? { background: 'linear-gradient(45deg, black, #fb57ff)' } : {}}>
              {step > 1 ? <Check className="w-5 h-5" /> : '1'}
            </div>
            <span className="text-sm font-medium hidden md:block">Select Token</span>
          </div>
          <div className="w-12 h-0.5 bg-white/[0.1]" />
          <div className={`flex items-center gap-2 ${step >= 2 ? 'text-[#fb57ff]' : 'text-gray-500'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'text-white' : 'bg-gray-700'}`} style={step >= 2 ? { background: 'linear-gradient(45deg, black, #fb57ff)' } : {}}>
              {step > 2 ? <Check className="w-5 h-5" /> : '2'}
            </div>
            <span className="text-sm font-medium hidden md:block">Configure</span>
          </div>
          <div className="w-12 h-0.5 bg-white/[0.1]" />
          <div className={`flex items-center gap-2 ${step >= 3 ? 'text-[#fb57ff]' : 'text-gray-500'}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 3 ? 'text-white' : 'bg-gray-700'}`} style={step >= 3 ? { background: 'linear-gradient(45deg, black, #fb57ff)' } : {}}>
              3
            </div>
            <span className="text-sm font-medium hidden md:block">Confirm</span>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="mx-6 mt-6 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm font-semibold text-red-300 mb-1">Error</p>
                <p className="text-sm text-red-200">{error}</p>
              </div>
              <button 
                onClick={() => setError(null)}
                className="text-red-400 hover:text-red-300 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Status Message */}
        {statusMessage && (
          <div className="mx-6 mt-4 p-3 bg-white/[0.02] border border-[#fb57ff]/30 rounded-lg">
            <div className="flex items-center gap-2 text-sm" style={{ color: '#fb57ff' }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              {statusMessage}
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {/* Step 1: Select Token */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="bg-white/[0.02] border border-white/[0.1] rounded-lg p-4">
                <p className="text-gray-300 text-sm flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  Select a token from your wallet to create a staking pool. Only tokens with balance are shown.
                </p>
              </div>
              
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin" style={{ color: '#fb57ff' }} />
                </div>
              ) : (
                <div className="grid gap-3 max-h-96 overflow-y-auto">
                  {userTokens.map((token) => (
                    <button
                      key={token.mint}
                      onClick={() => {
                        setSelectedToken(token);
                        setError(null);
                        setStep(2);
                      }}
                      className="flex items-center gap-4 p-4 bg-white/[0.02] hover:bg-white/[0.05] border border-white/[0.05] rounded-lg transition-colors text-left"
                    >
                      {token.logoURI ? (
                        <img src={token.logoURI} alt={token.symbol} className="w-12 h-12 rounded-full" />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-gray-700 flex items-center justify-center">
                          <span className="text-xl font-bold">{token.symbol?.[0] || "?"}</span>
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="font-semibold text-white">{token.name || "Unknown"}</div>
                        <div className="text-sm text-gray-400">{token.symbol}</div>
                        <div className="text-xs text-gray-500 font-mono">{token.mint.slice(0, 8)}...{token.mint.slice(-4)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-white font-medium">{token.balance.toLocaleString()}</div>
                        {token.price && token.balance > 0 && (
                          <div className="text-xs text-gray-400">${(token.balance * token.price).toLocaleString(undefined, {maximumFractionDigits: 2})}</div>
                        )}
                        <div className="text-xs font-semibold mt-1" style={{ color: token.programId.includes("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") ? '#60a5fa' : '#fb57ff' }}>
                          {token.programId.includes("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA") ? "SPL Token" : "Token-2022"}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {!loading && userTokens.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 text-gray-600" />
                  <p>No tokens found in your wallet</p>
                  <p className="text-sm mt-2">Make sure you have tokens with a balance &gt; 0</p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Configure Pool */}
          {step === 2 && selectedToken && (
            <div className="space-y-6">
              <div className="flex items-center gap-4 p-4 bg-white/[0.02] border border-white/[0.05] rounded-lg">
                {selectedToken.logoURI && (
                  <img src={selectedToken.logoURI} alt={selectedToken.symbol} className="w-16 h-16 rounded-full" />
                )}
                <div className="flex-1">
                  <div className="font-bold text-xl text-white">{selectedToken.name}</div>
                  <div className="text-gray-400">{selectedToken.symbol}</div>
                  {selectedToken.price && (
                    <div className="text-sm text-gray-500">${selectedToken.price.toFixed(6)} per token</div>
                  )}
                </div>
              </div>

              <div className="bg-white/[0.02] border border-[#fb57ff]/30 rounded-lg p-4 space-y-2">
                <p className="text-sm" style={{ color: '#fb57ff' }}>
                  💡 APY is automatically calculated based on rewards you deposit. More rewards = Higher APY!
                </p>
                <p className="text-sm text-gray-300">
                  ⚠️ Make sure you have {poolConfig.rewardAmount} {selectedToken.symbol} in your wallet to deposit as rewards!
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  How many {selectedToken.symbol} tokens will you deposit as rewards?
                </label>
                <input
                  type="number"
                  value={poolConfig.rewardAmount}
                  onChange={(e) => setPoolConfig({ ...poolConfig, rewardAmount: e.target.value })}
                  className="w-full p-3 bg-white/[0.02] border border-white/[0.1] rounded-lg text-white focus:outline-none transition-colors"
                  onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(251, 87, 255, 0.5)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                  placeholder="1000"
                  min="0"
                />
                <p className="text-xs text-gray-500 mt-1">
                  You must deposit these rewards before users can stake
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Pool Duration (days)</label>
                <input
                  type="number"
                  value={poolConfig.duration}
                  onChange={(e) => setPoolConfig({ ...poolConfig, duration: e.target.value })}
                  className="w-full p-3 bg-white/[0.02] border border-white/[0.1] rounded-lg text-white focus:outline-none transition-colors"
                  onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(251, 87, 255, 0.5)'}
                  onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                  placeholder="90"
                  min="1"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Tokens will be locked for the entire duration
                </p>
              </div>

              {/* Reflection Configuration */}
              <div className="bg-white/[0.02] border border-white/[0.1] rounded-lg p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="block text-sm font-medium text-gray-300">
                      Enable Reflections
                    </label>
                    <p className="text-xs text-gray-500 mt-1">
                      Distribute additional rewards to stakers from trading fees or external tokens
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPoolConfig({ ...poolConfig, enableReflections: !poolConfig.enableReflections })}
                    className={`relative w-12 h-6 rounded-full transition-colors ${
                      poolConfig.enableReflections ? 'bg-[#fb57ff]' : 'bg-gray-700'
                    }`}
                  >
                    <div
                      className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                        poolConfig.enableReflections ? 'transform translate-x-6' : ''
                      }`}
                    />
                  </button>
                </div>

                {poolConfig.enableReflections && (
                  <div className="space-y-4 pt-2 border-t border-white/[0.05]">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Reflection Type</label>
                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => setPoolConfig({ ...poolConfig, reflectionType: "self" })}
                          className={`p-3 rounded-lg border transition-colors ${
                            poolConfig.reflectionType === "self"
                              ? 'border-[#fb57ff] bg-[#fb57ff]/10 text-white'
                              : 'border-white/[0.1] bg-white/[0.02] text-gray-400 hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="font-semibold text-sm">Self Reflection</div>
                          <div className="text-xs mt-1">Same token as staking</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPoolConfig({ ...poolConfig, reflectionType: "external" })}
                          className={`p-3 rounded-lg border transition-colors ${
                            poolConfig.reflectionType === "external"
                              ? 'border-[#fb57ff] bg-[#fb57ff]/10 text-white'
                              : 'border-white/[0.1] bg-white/[0.02] text-gray-400 hover:bg-white/[0.05]'
                          }`}
                        >
                          <div className="font-semibold text-sm">External Token</div>
                          <div className="text-xs mt-1">Different reward token</div>
                        </button>
                      </div>
                    </div>

                    {poolConfig.reflectionType === "external" && (
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          External Reflection Token Mint Address
                        </label>
                        <input
                          type="text"
                          value={poolConfig.externalReflectionMint}
                          onChange={(e) => setPoolConfig({ ...poolConfig, externalReflectionMint: e.target.value })}
                          className="w-full p-3 bg-white/[0.02] border border-white/[0.1] rounded-lg text-white focus:outline-none transition-colors font-mono text-sm"
                          onFocus={(e) => e.currentTarget.style.borderColor = 'rgba(251, 87, 255, 0.5)'}
                          onBlur={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.1)'}
                          placeholder="Enter token mint address"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                          The mint address of the token to use for reflections
                        </p>
                      </div>
                    )}

                    <div className="bg-white/[0.02] border border-white/[0.1] rounded-lg p-3">
                      <p className="text-xs text-gray-400 leading-relaxed">
                        <strong className="text-gray-300">💡 How Reflections Work:</strong><br /><br />
                        When reflections are enabled, a <strong>reflection vault</strong> is automatically initialized and owned by the staking vault. This vault accumulates additional rewards that are distributed proportionally to all stakers.<br /><br />
                        <strong>• Self Reflection:</strong> Distributes the same token (e.g., SOL holders earn more SOL)<br />
                        <strong>• External Token:</strong> Distributes a different token (e.g., SOL holders earn USDC)<br /><br />
                        <strong className="text-[#fb57ff]">⚠️ Important:</strong> You must specify the exact mint address for reflections. This prevents spam tokens from being counted toward APY calculations and ensures only legitimate rewards are distributed to your stakers.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Dynamic APY Info */}
              <div className="bg-white/[0.02] border border-[#fb57ff]/30 rounded-lg p-4">
                <div className="text-center">
                  <div className="text-sm text-gray-400 mb-2">APY Calculation</div>
                  <div className="text-sm text-gray-300">
                    APY will be calculated automatically based on:
                  </div>
                  <div className="text-xs text-gray-400 mt-2">
                    • Rewards you deposit: {poolConfig.rewardAmount} {selectedToken.symbol}
                  </div>
                  <div className="text-xs text-gray-400">
                    • Actual tokens staked by users
                  </div>
                  <div className="text-xs text-gray-400">
                    • Pool duration: {poolConfig.duration} days
                  </div>
                  <div className="text-xs text-[#fb57ff] mt-3 font-medium">
                    ✨ APY updates in real-time on the pools page
                  </div>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setError(null);
                    setStep(1);
                  }}
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.05] rounded-lg font-semibold transition-colors disabled:opacity-50"
                  onMouseEnter={(e) => !loading && (e.currentTarget.style.borderColor = 'rgba(251, 87, 255, 0.3)')}
                  onMouseLeave={(e) => !loading && (e.currentTarget.style.borderColor = '')}
                >
                  Back
                </button>
                <button
                  onClick={() => {
                    setError(null);
                    setStep(3);
                  }}
                  disabled={loading}
                  className="flex-1 px-6 py-3 rounded-lg font-semibold transition-all disabled:opacity-50"
                  style={{ background: 'linear-gradient(45deg, black, #fb57ff)' }}
                  onMouseEnter={(e) => !loading && (e.currentTarget.style.background = 'linear-gradient(45deg, #fb57ff, black)')}
                  onMouseLeave={(e) => !loading && (e.currentTarget.style.background = 'linear-gradient(45deg, black, #fb57ff)')}
                >
                  Continue to Payment
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Confirm & Pay */}
          {step === 3 && selectedToken && (
            <div className="space-y-6">
              <div className="bg-white/[0.02] border border-white/[0.1] rounded-lg p-4">
                <p className="text-gray-300 text-sm font-semibold mb-2">
                  ⚠️ Pool Creation Fee: 1 SOL
                </p>
                <p className="text-gray-400 text-xs">
                  You will sign 4 transactions:
                </p>
                <ul className="list-disc list-inside text-gray-400 text-xs mt-2 space-y-1">
                  <li>Transaction 1: Pay 1 SOL to platform</li>
                  <li>Transaction 2: Create pool on-chain</li>
                  <li>Transaction 3: Initialize parameters</li>
                  <li>Transaction 4: Deposit {poolConfig.rewardAmount} {selectedToken.symbol}</li>
                </ul>
              </div>

              <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg p-6 space-y-4">
                <div className="text-center mb-4">
                  <div className="text-3xl font-bold mb-2">{selectedToken.symbol} Pool</div>
                  {selectedToken.logoURI && (
                    <img src={selectedToken.logoURI} alt={selectedToken.symbol} className="w-20 h-20 rounded-full mx-auto" />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="text-gray-400 text-sm">Token:</div>
                  <div className="text-white font-medium text-sm text-right">{selectedToken.name}</div>

                  <div className="text-gray-400 text-sm">APY:</div>
                  <div className="font-bold text-sm text-right" style={{ color: '#fb57ff' }}>Dynamic</div>

                  <div className="text-gray-400 text-sm">Reward Deposit:</div>
                  <div className="text-white font-medium text-sm text-right">{parseFloat(poolConfig.rewardAmount).toLocaleString()} {selectedToken.symbol}</div>

                  <div className="text-gray-400 text-sm">Lock Duration:</div>
                  <div className="text-white font-medium text-sm text-right">
                    {poolConfig.duration} days (Full Duration)
                  </div>

                  <div className="text-gray-400 text-sm">Pool Duration:</div>
                  <div className="text-white font-medium text-sm text-right">{poolConfig.duration} days</div>

                  <div className="text-gray-400 text-sm">Status:</div>
                  <div className="font-medium text-sm text-right" style={{ color: '#fb57ff' }}>Ready to Launch</div>
                </div>

                <div className="border-t border-white/[0.05] pt-4 mt-4">
                  <p className="text-xs text-gray-500">
                    Your pool will be fully initialized and ready for users to stake.
                    APY will update automatically based on actual stakes.
                  </p>
                </div>
              </div>

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setError(null);
                    setStep(2);
                  }}
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.05] rounded-lg font-semibold transition-colors disabled:opacity-50"
                  onMouseEnter={(e) => !loading && (e.currentTarget.style.borderColor = 'rgba(251, 87, 255, 0.3)')}
                  onMouseLeave={(e) => !loading && (e.currentTarget.style.borderColor = '')}
                >
                  Back
                </button>
                <button
                  onClick={handleCreatePool}
                  disabled={loading}
                  className="flex-1 px-6 py-3 rounded-lg font-semibold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(45deg, black, #fb57ff)' }}
                  onMouseEnter={(e) => !loading && (e.currentTarget.style.background = 'linear-gradient(45deg, #fb57ff, black)')}
                  onMouseLeave={(e) => !loading && (e.currentTarget.style.background = 'linear-gradient(45deg, black, #fb57ff)')}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      Creating Pool...
                    </>
                  ) : (
                    <>Create Pool</>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>

    {/* Success Modal */}
    {showSuccessModal && createdPoolId && (
      <div className="fixed inset-0 bg-black/90 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
        <div className="bg-black border-2 border-[#fb57ff] rounded-2xl max-w-md w-full p-8 animate-in fade-in zoom-in duration-300">
          <div className="text-center mb-6">
            <div className="w-20 h-20 bg-[#fb57ff]/20 border-2 border-[#fb57ff] rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-10 h-10" style={{ color: '#fb57ff' }} />
            </div>
            <h2 className="text-3xl font-bold mb-2" style={{ 
              background: 'linear-gradient(45deg, white, #fb57ff)', 
              WebkitBackgroundClip: 'text', 
              WebkitTextFillColor: 'transparent' 
            }}>
              Pool Created! 🎉
            </h2>
            <p className="text-gray-400">Your staking pool is now live</p>
          </div>

          <div className="bg-white/[0.02] border border-[#fb57ff]/20 rounded-lg p-4 mb-6">
            <p className="text-sm font-semibold mb-3" style={{ color: '#fb57ff' }}>
              🔗 Share Your Pool
            </p>
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/pool/${createdPoolId}`}
                readOnly
                className="flex-1 px-3 py-2 bg-white/[0.05] border border-white/[0.1] rounded text-sm text-white font-mono"
                onClick={(e) => e.currentTarget.select()}
              />
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`${typeof window !== 'undefined' ? window.location.origin : ''}/pool/${createdPoolId}`);
                  setUrlCopied(true);
                  setTimeout(() => setUrlCopied(false), 2000);
                }}
                className="px-4 py-2 bg-[#fb57ff]/20 hover:bg-[#fb57ff]/30 border border-[#fb57ff]/50 rounded transition-all text-sm font-semibold min-w-[70px]"
                style={urlCopied ? { background: 'linear-gradient(45deg, black, #fb57ff)' } : {}}
              >
                {urlCopied ? '✓ Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-xs text-gray-400">
              💡 Share this link with your community to let them stake in your pool!
            </p>
          </div>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => {
                setShowSuccessModal(false);  // Hide success modal
                setShowIntegrateModal(true);  // Show integrate modal
              }}
              className="w-full px-4 py-3 bg-white/[0.05] hover:bg-white/[0.08] border border-[#fb57ff]/30 rounded-lg font-semibold transition-all hover:border-[#fb57ff] text-white flex items-center justify-center gap-2"
            >
              <Code className="w-4 h-4" />
              Integrate on Your Website
            </button>
            
            <div className="flex gap-3">
              <button
                onClick={() => {
                  window.open(`/pool/${createdPoolId}`, '_blank');
                }}
                className="flex-1 px-4 py-3 bg-white/[0.05] hover:bg-white/[0.08] border border-[#fb57ff]/30 rounded-lg font-semibold transition-all hover:border-[#fb57ff] text-white"
              >
                View Pool
              </button>
              <button
                onClick={() => {
                  onSuccess(); // Refresh the pools list
                  onClose();   // Close the modal
                }}
                className="flex-1 px-4 py-3 rounded-lg font-semibold transition-all hover:opacity-90"
                style={{ background: 'linear-gradient(45deg, #fb57ff, black)' }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Integrate Modal */}
    {createdPoolId && (
      <IntegrateModal
        isOpen={showIntegrateModal}
        onClose={() => setShowIntegrateModal(false)}
        poolId={createdPoolId}
      />
    )}
    </>
  );
}

