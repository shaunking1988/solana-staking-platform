import { useConnection, useWallet, useAnchorWallet } from "@solana/wallet-adapter-react";
import { PublicKey, SystemProgram, SYSVAR_RENT_PUBKEY, Transaction, ComputeBudgetProgram } from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { getProgram, getPDAs, PROGRAM_ID } from "@/lib/anchor-program";
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, ASSOCIATED_TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { upsertStake, deleteStake } from '@/lib/prisma-stakes';

const SECONDS_PER_YEAR = 31_536_000;

/**
 * Hook for user staking functions - Updated for New Contract
 * Uses token mint addresses instead of pool IDs
 */
export function useStakingProgram() {
  const { connection } = useConnection();
  const { publicKey, sendTransaction, wallet: walletAdapter } = useWallet();
  const wallet = walletAdapter?.adapter as any;

  /**
   * Get platform config data including fee collector
   */
  const getPlatformConfig = async (program: any) => {
    try {
      const [platformConfigPDA] = getPDAs.platformConfig();
      const platformConfig = await program.account.platform.fetch(platformConfigPDA, "confirmed");
      return platformConfig;
    } catch (error) {
      console.error("Error fetching platform config:", error);
      return null;
    }
  };

  /**
   * Stake tokens to a pool
   * @param tokenMint - The token mint address (NOT poolId!)
   * @param amount - Amount in token decimals
   * @param referrerCode - Optional referrer wallet address
   */
  const stake = async (
    tokenMint: string,
    amount: number,
    poolId: number = 0,
    referrerCode?: string
  ) => {
    if (!wallet || !publicKey) {
      throw new Error("Wallet not connected");
    }

    const program = getProgram(wallet, connection);
    const tokenMintPubkey = new PublicKey(tokenMint);
    
    // Get platform config to fetch fee collector
    const platformConfig = await getPlatformConfig(program);
    if (!platformConfig) {
      throw new Error("Platform not initialized");
    }

    const feeCollector = platformConfig.feeCollector;
    
    // Get PDAs using NEW structure
    const [platformConfigPDA] = getPDAs.platformConfig();
    const [projectPDA] = getPDAs.project(tokenMintPubkey, poolId);
    const [stakingVaultPDA] = getPDAs.stakingVault(tokenMintPubkey, poolId);
    const [userStakePDA] = getPDAs.userStake(projectPDA, publicKey);

    // Get user's token account
    const userTokenAccount = await getAssociatedTokenAddress(
      tokenMintPubkey,
      publicKey
    );

    // Get fee collector's token account
    const feeCollectorTokenAccount = await getAssociatedTokenAddress(
      tokenMintPubkey,
      feeCollector
    );

    // Check if fee collector token account exists, create if not
    const feeCollectorAccountInfo = await connection.getAccountInfo(feeCollectorTokenAccount);
    const needsInit = !feeCollectorAccountInfo;

    if (needsInit) {
      console.log("⚠️ Fee collector token account doesn't exist, will create it");
    }

    // Convert amount to proper decimals
    const amountBN = new BN(amount);

    // Get project info to check for reflection vault and referrer
    const project = await program.account.project.fetch(projectPDA, "confirmed");
    const reflectionVault = project.reflectionVault;
    const projectReferrer = project.referrer;

    // Determine which referrer to use
    let finalReferrer: PublicKey;
    if (referrerCode) {
      finalReferrer = new PublicKey(referrerCode);
    } else if (projectReferrer) {
      finalReferrer = projectReferrer;
    } else {
      finalReferrer = publicKey;
    }

    // Build accounts object
    const accounts = {
      platform: platformConfigPDA,
      project: projectPDA,
      stake: userStakePDA,
      stakingVault: stakingVaultPDA,
      userTokenAccount: userTokenAccount,
      feeCollectorTokenAccount: feeCollectorTokenAccount,
      feeCollector: feeCollector,
      referrer: finalReferrer,
      reflectionVault: reflectionVault || stakingVaultPDA,
      user: publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
      rent: SYSVAR_RENT_PUBKEY,
    };

    console.log("🔍 Deposit Accounts:", {
      platform: platformConfigPDA.toString(),
      project: projectPDA.toString(),
      stake: userStakePDA.toString(),
      stakingVault: stakingVaultPDA.toString(),
      user: publicKey.toString(),
      amount: amountBN.toString(),
      needsInit,
    });

    try {
      let tx: string;

      if (needsInit) {
        // Create transaction with ATA initialization and stake
        console.log("🔧 Creating fee collector ATA and staking...");
        
        const transaction = new Transaction();
        
        // Add compute budget for complex transaction
        const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
          units: 400000,
        });
        transaction.add(computeBudgetIx);
        
        // Add create ATA instruction
        const createATAIx = createAssociatedTokenAccountInstruction(
          publicKey, // payer
          feeCollectorTokenAccount, // ata address
          feeCollector, // owner
          tokenMintPubkey, // mint
          TOKEN_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID
        );
        transaction.add(createATAIx);
        
        // Add stake instruction
        const stakeIx = await program.methods
          .deposit(tokenMintPubkey, new BN(poolId), amountBN)
          .accountsPartial(accounts)
          .instruction();
        transaction.add(stakeIx);
        
        // Send and confirm transaction
        tx = await sendTransaction(transaction, connection, {
          skipPreflight: false,
        });
        
        console.log("✅ ATA created and stake executed:", tx);
      } else {
        // Execute stake transaction normally
        tx = await program.methods
          .deposit(tokenMintPubkey, new BN(poolId), amountBN)
          .accountsPartial(accounts)
          .rpc({ skipPreflight: false, commitment: 'confirmed' });
      }

      console.log("✅ Transaction signature:", tx);
      
      // Wait for confirmation with timeout
      const confirmation = await connection.confirmTransaction(tx, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log("✅ Transaction confirmed!");
      
      // ✅ NEW: Sync to database
      try {
        const userStake = await getUserStake(tokenMint, poolId);
        if (userStake) {
          await upsertStake(
            publicKey,
            tokenMint,
            poolId,
            userStake.amount,
            userStakePDA.toString()
          );
        }
      } catch (dbError) {
        console.error("⚠️ Database sync failed (non-critical):", dbError);
        // Continue - don't let DB errors break the staking flow
      }
      
      return tx;
      
    } catch (error: any) {
      console.error("Stake transaction error:", error);
      
      // Check if error message indicates the transaction actually succeeded
      if (error.message?.includes("already been processed") || 
          error.message?.includes("AlreadyProcessed")) {
        console.log("⚠️ Transaction was already processed - likely succeeded");
        // Try to get the signature from the error or logs
        const signature = error.signature || error.txSignature;
        if (signature) {
          console.log("✅ Found signature:", signature);
          
          // Try to sync to database even on "already processed" error
          try {
            const userStake = await getUserStake(tokenMint, poolId);
            if (userStake) {
              await upsertStake(
                publicKey,
                tokenMint,
                poolId,
                userStake.amount,
                userStakePDA.toString()
              );
            }
          } catch (dbError) {
            console.error("⚠️ Database sync failed (non-critical):", dbError);
          }
          
          return signature;
        }
        // If we can't get signature, throw a more friendly error
        throw new Error("Transaction may have succeeded. Please refresh to check your balance.");
      }
      
      // Re-throw other errors
      throw error;
    }
  };

 /**
 * Unstake tokens from a pool
 * @param tokenMint - The token mint address
 */
const unstake = async (tokenMint: string, poolId: number = 0, amount?: number) => {
  console.log("🔵 UNSTAKE START");
  
  if (!wallet || !publicKey) {
    throw new Error("Wallet not connected");
  }
  console.log("✅ Wallet connected");

  const program = getProgram(wallet, connection);
  const tokenMintPubkey = new PublicKey(tokenMint);
  console.log("✅ Program initialized, tokenMint:", tokenMint);

  // Get platform config
  const platformConfig = await getPlatformConfig(program);
  if (!platformConfig) {
    throw new Error("Platform not initialized");
  }
  console.log("✅ Platform config fetched");

  const feeCollector = platformConfig.feeCollector;

  // Get PDAs
  const [platformConfigPDA] = getPDAs.platformConfig();
  const [projectPDA] = getPDAs.project(tokenMintPubkey, poolId);
  const [stakingVaultPDA] = getPDAs.stakingVault(tokenMintPubkey, poolId);
  const [userStakePDA] = getPDAs.userStake(projectPDA, publicKey);
  console.log("✅ PDAs generated");

  // Get user stake data to find withdrawal wallet
  const userStake = await program.account.stake.fetch(userStakePDA, "confirmed");
  console.log("✅ User stake fetched, amount:", userStake.amount.toString());
  
  const withdrawalWallet = userStake.withdrawalWallet || publicKey;
  console.log("✅ Withdrawal wallet:", withdrawalWallet.toBase58());

  // Get withdrawal wallet's token account
  const withdrawalTokenAccount = await getAssociatedTokenAddress(
    tokenMintPubkey,
    withdrawalWallet
  );
  console.log("✅ Withdrawal token account:", withdrawalTokenAccount.toBase58());

  // Get fee collector's token account
  const feeCollectorTokenAccount = await getAssociatedTokenAddress(
    tokenMintPubkey,
    feeCollector
  );
  console.log("✅ Fee collector token account:", feeCollectorTokenAccount.toBase58());

  // Get project info to check for referrer AND reflection vault
  const project = await program.account.project.fetch(projectPDA, "confirmed");
  const projectReferrer = project.referrer;
  const reflectionVault = project.reflectionVault;
  
  console.log("✅ Project fetched");
  console.log("   - projectReferrer:", projectReferrer?.toBase58() || "null");
  console.log("   - reflectionVault:", reflectionVault?.toBase58() || "null");

  // If amount not specified, unstake all
  const amountBN = amount ? new BN(amount) : userStake.amount;
  console.log("✅ Amount to withdraw:", amountBN.toString());

  console.log("🔍 ACCOUNT CHECK:");
console.log("  User wallet:", wallet.publicKey.toString());
console.log("  Withdrawal token account:", withdrawalTokenAccount.toString());
console.log("  Fee collector token account:", feeCollectorTokenAccount.toString());
console.log("  Staking vault:", stakingVaultPDA.toString());

// Check if withdrawal token account exists
try {
  const accountInfo = await connection.getAccountInfo(withdrawalTokenAccount);
  if (!accountInfo) {
    console.log("⚠️ WITHDRAWAL TOKEN ACCOUNT DOES NOT EXIST - needs to be created");
  } else {
    console.log("✅ Withdrawal token account exists");
  }
} catch (e) {
  console.log("⚠️ Error checking withdrawal token account:", e);
}

// Check if fee collector token account exists
try {
  const feeAccountInfo = await connection.getAccountInfo(feeCollectorTokenAccount);
  if (!feeAccountInfo) {
    console.log("⚠️ FEE COLLECTOR TOKEN ACCOUNT DOES NOT EXIST");
  } else {
    console.log("✅ Fee collector token account exists");
  }
} catch (e) {
  console.log("⚠️ Error checking fee collector account:", e);
}

  // Build the accounts object
  const accounts = {
    platform: platformConfigPDA,
    project: projectPDA,
    stake: userStakePDA,
    stakingVault: stakingVaultPDA,
    withdrawalWallet: withdrawalWallet,
    withdrawalTokenAccount: withdrawalTokenAccount,
    feeCollectorTokenAccount: feeCollectorTokenAccount,
    feeCollector: feeCollector,
    referrer: projectReferrer || publicKey,
    reflectionVault: reflectionVault || stakingVaultPDA,
    user: publicKey,
    tokenProgram: TOKEN_PROGRAM_ID,
    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
    systemProgram: SystemProgram.programId,
  };

  console.log("🔵 Accounts prepared for withdraw:", {
    platform: accounts.platform.toString(),
    project: accounts.project.toString(),
    stake: accounts.stake.toString(),
    stakingVault: accounts.stakingVault.toString(),
    withdrawalWallet: accounts.withdrawalWallet.toString(),
    withdrawalTokenAccount: accounts.withdrawalTokenAccount.toString(),
    user: accounts.user.toString(),
  });

  try {
    // Check if withdrawal token account exists; create if it doesn't
    const accountInfo = await connection.getAccountInfo(withdrawalTokenAccount);
    
    if (!accountInfo) {
      console.log("⚠️ Creating withdrawal token account...");
      
      // Create the token account instruction
      const createATAIx = createAssociatedTokenAccountInstruction(
        publicKey,              // payer
        withdrawalTokenAccount, // ata
        withdrawalWallet,       // owner
        tokenMintPubkey        // mint
      );
      
      // Build transaction with ATA creation + withdraw
      const transaction = new Transaction();
      transaction.add(createATAIx);
      
      // Add withdraw instruction
      const withdrawIx = await program.methods
        .withdraw(tokenMintPubkey, new BN(poolId), amountBN)
        .accountsPartial(accounts)
        .instruction();
      
      transaction.add(withdrawIx);
      
      // Send as a single transaction
      const tx = await wallet.signAndSendTransaction(transaction);
      console.log("✅ Transaction signature (with ATA creation):", tx);
      
      await connection.confirmTransaction(tx, 'confirmed');
      console.log("✅ Transaction confirmed!");
      
      return tx;
    } else {
      console.log("✅ Withdrawal token account exists, proceeding with withdraw...");
      
      // Normal withdraw without ATA creation
      const tx = await program.methods
        .withdraw(tokenMintPubkey, new BN(poolId), amountBN)
        .accountsPartial(accounts)
        .rpc({ skipPreflight: false, commitment: 'confirmed' });

      console.log("✅ Transaction signature:", tx);
      
      const confirmation = await connection.confirmTransaction(tx, 'confirmed');
      
      if (confirmation.value.err) {
        throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
      }

      console.log("✅ Transaction confirmed!");
      
      // ✅ NEW: Sync to database
      try {
        const userStakeAfter = await getUserStake(tokenMint, poolId);
        if (userStakeAfter && userStakeAfter.amount.toNumber() > 0) {
          // Still has staked amount - update it
          console.log("📊 Partial unstake - updating database with remaining amount:", userStakeAfter.amount.toString());
          await upsertStake(
            publicKey,
            tokenMint,
            poolId,
            userStakeAfter.amount,
            userStakePDA.toString()
          );
        } else {
          // Fully unstaked - delete record
          console.log("🗑️ Full unstake - deleting from database");
          await deleteStake(publicKey, tokenMint, poolId);
        }
      } catch (dbError) {
        console.error("⚠️ Database sync failed (non-critical):", dbError);
        // If getUserStake failed, it likely means fully unstaked
        console.log("🗑️ getUserStake failed (likely full unstake) - attempting delete");
        try {
          await deleteStake(publicKey, tokenMint, poolId);
        } catch (deleteError) {
          console.error("⚠️ Delete also failed:", deleteError);
        }
      }
      
      return tx;
    }
  } catch (error: any) {
    console.error("❌ Unstake transaction error:", error);
    
    if (error.message?.includes("already been processed") || 
        error.message?.includes("AlreadyProcessed")) {
      console.log("⚠️ Transaction was already processed - likely succeeded");
      const signature = error.signature || error.txSignature;
      if (signature) {
        console.log("✅ Found signature:", signature);
        
        // Try to sync to database even on "already processed" error
        try {
          const userStakeAfter = await getUserStake(tokenMint, poolId);
          if (userStakeAfter && userStakeAfter.amount.toNumber() > 0) {
            console.log("📊 Partial unstake - updating database");
            await upsertStake(
              publicKey,
              tokenMint,
              poolId,
              userStakeAfter.amount,
              userStakePDA.toString()
            );
          } else {
            console.log("🗑️ Full unstake - deleting from database");
            await deleteStake(publicKey, tokenMint, poolId);
          }
        } catch (dbError) {
          console.error("⚠️ Database sync failed (non-critical):", dbError);
          // If getUserStake failed, it likely means fully unstaked
          console.log("🗑️ getUserStake failed (likely full unstake) - attempting delete");
          try {
            await deleteStake(publicKey, tokenMint, poolId);
          } catch (deleteError) {
            console.error("⚠️ Delete also failed:", deleteError);
          }
        }
        
        return signature;
      }
      throw new Error("Transaction may have succeeded. Please refresh to check your balance.");
    }
    
    throw error;
  }
};

  /**
   * Claim rewards from a pool
   * @param tokenMint - The token mint address
   */
  const claimRewards = async (tokenMint: string, poolId: number = 0) => {
    if (!wallet || !publicKey) {
      throw new Error("Wallet not connected");
    }

    const program = getProgram(wallet, connection);
    const tokenMintPubkey = new PublicKey(tokenMint);

    // Get platform config
    const platformConfig = await getPlatformConfig(program);
    if (!platformConfig) {
      throw new Error("Platform not initialized");
    }

    const feeCollector = platformConfig.feeCollector;

    // Get PDAs
    const [platformConfigPDA] = getPDAs.platformConfig();
    const [projectPDA] = getPDAs.project(tokenMintPubkey, poolId);
    const [stakingVaultPDA] = getPDAs.stakingVault(tokenMintPubkey, poolId);
    const [rewardVaultPDA] = getPDAs.rewardVault(tokenMintPubkey, poolId);
    const [userStakePDA] = getPDAs.userStake(projectPDA, publicKey);

    // Get user stake data to find withdrawal wallet
    const userStake = await program.account.stake.fetch(userStakePDA, "confirmed");
    const withdrawalWallet = userStake.withdrawalWallet || publicKey;

    // Get withdrawal wallet's token account
    const withdrawalTokenAccount = await getAssociatedTokenAddress(
      tokenMintPubkey,
      withdrawalWallet
    );

    // Get fee collector's token account
    const feeCollectorTokenAccount = await getAssociatedTokenAddress(
      tokenMintPubkey,
      feeCollector
    );

    // Get project info to check for referrer and reflection vault
    const project = await program.account.project.fetch(projectPDA, "confirmed");
    const projectReferrer = project.referrer;
    const reflectionVault = project.reflectionVault;

    const accounts = {
      platform: platformConfigPDA,
      project: projectPDA,
      stake: userStakePDA,
      rewardVault: rewardVaultPDA,
      userTokenAccount: withdrawalTokenAccount,
      feeCollector: feeCollector,
      referrer: projectReferrer || publicKey,
      user: publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: SystemProgram.programId,
    };

    try {
      // Check if withdrawal token account exists; create if it doesn't
      const accountInfo = await connection.getAccountInfo(withdrawalTokenAccount);
      
      if (!accountInfo) {
        console.log("⚠️ Creating withdrawal token account for claim...");
        
        const createATAIx = createAssociatedTokenAccountInstruction(
          publicKey,
          withdrawalTokenAccount,
          withdrawalWallet,
          tokenMintPubkey
        );
        
        const transaction = new Transaction();
        transaction.add(createATAIx);
        
        const claimIx = await program.methods
          .claim(tokenMintPubkey, new BN(poolId))
          .accountsPartial(accounts)
          .instruction();
        
        transaction.add(claimIx);
        
        const tx = await wallet.signAndSendTransaction(transaction);
        console.log("✅ Claim transaction signature (with ATA creation):", tx);
        
        await connection.confirmTransaction(tx, 'confirmed');
        console.log("✅ Transaction confirmed!");
        
        return tx;
      } else {
       const tx = await program.methods
          .claim(tokenMintPubkey, new BN(poolId))
          .accountsPartial(accounts)
          .rpc({ skipPreflight: false, commitment: 'confirmed' });

        console.log("✅ Claim rewards transaction signature:", tx);
        
        const confirmation = await connection.confirmTransaction(tx, 'confirmed');
        
        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }

        console.log("✅ Transaction confirmed!");
        return tx;
      }
    } catch (error: any) {
      console.error("Claim rewards error:", error);
      
      if (error.message?.includes("already been processed") || 
          error.message?.includes("AlreadyProcessed")) {
        console.log("⚠️ Transaction was already processed - likely succeeded");
        const signature = error.signature || error.txSignature;
        if (signature) {
          return signature;
        }
        throw new Error("Transaction may have succeeded. Please refresh to check your rewards.");
      }
      
      throw error;
    }
  };

  /**
   * Claim reflections from a pool
   * @param tokenMint - The token mint address (staking token)
   */
  const claimReflections = async (tokenMint: string, poolId: number = 0) => {
    if (!wallet || !publicKey) {
      throw new Error("Wallet not connected");
    }

    const program = getProgram(wallet, connection);
    const tokenMintPubkey = new PublicKey(tokenMint);

    // Get PDAs
    const [projectPDA] = getPDAs.project(tokenMintPubkey, poolId);
    const [userStakePDA] = getPDAs.userStake(projectPDA, publicKey);
    const [stakingVaultPDA] = getPDAs.stakingVault(tokenMintPubkey, poolId);

    // ✅ FIX 1: Fetch project data to get the reflection vault and reflection token
    const project = await program.account.project.fetch(projectPDA, "confirmed");
    
    if (!project.reflectionVault) {
      throw new Error("Reflections not enabled for this pool");
    }
    
    if (!project.reflectionToken) {
      throw new Error("Reflection token not configured");
    }

    const reflectionVaultPubkey = project.reflectionVault;
    const reflectionTokenMint = project.reflectionToken;

    // Get user stake to find withdrawal wallet
    const userStake = await program.account.stake.fetch(userStakePDA, "confirmed");
    const withdrawalWallet = userStake.withdrawalWallet || publicKey;

    // ✅ FIX 2: Get withdrawal wallet's token account for the REFLECTION TOKEN (not staking token!)
    const userReflectionAccount = await getAssociatedTokenAddress(
      reflectionTokenMint,  // ✅ Use reflection token mint
      withdrawalWallet
    );

    console.log("🔍 Claim Reflections Accounts:", {
      project: projectPDA.toString(),
      stake: userStakePDA.toString(),
      stakingVault: stakingVaultPDA.toString(),
      reflectionVault: reflectionVaultPubkey.toString(),
      reflectionTokenMint: reflectionTokenMint.toString(),
      userReflectionAccount: userReflectionAccount.toString(),
      withdrawalWallet: withdrawalWallet.toString(),
      user: publicKey.toString(),
    });

    try {
      // Check if user's reflection token account exists
      const accountInfo = await connection.getAccountInfo(userReflectionAccount);
      
      if (!accountInfo) {
        console.log("⚠️ Creating reflection token account for user...");
        
        // ✅ Create ATA for reflection token
        const createATAIx = createAssociatedTokenAccountInstruction(
          publicKey,              // payer
          userReflectionAccount,  // ata
          withdrawalWallet,       // owner
          reflectionTokenMint     // mint (reflection token!)
        );
        
        const transaction = new Transaction();
        transaction.add(createATAIx);
        
        const claimIx = await program.methods
          .claimReflections(tokenMintPubkey, new BN(poolId))
          .accounts({
            project: projectPDA,
            stake: userStakePDA,
            stakingVault: stakingVaultPDA,           // ✅ ADDED
            reflectionVault: reflectionVaultPubkey,  // ✅ Fixed
            userReflectionAccount: userReflectionAccount,  // ✅ FIXED NAME
            user: publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .instruction();
        
        transaction.add(claimIx);
        
        const signature = await sendTransaction(transaction, connection);
        console.log("✅ Claim reflections signature (with ATA creation):", signature);
        
        await connection.confirmTransaction(signature, 'confirmed');
        console.log("✅ Transaction confirmed!");
        
        return signature;
      } else {
        const tx = await program.methods
          .claimReflections(tokenMintPubkey, new BN(poolId))
          .accounts({
            project: projectPDA,
            stake: userStakePDA,
            stakingVault: stakingVaultPDA,           // ✅ ADDED
            reflectionVault: reflectionVaultPubkey,  // ✅ Fixed
            userReflectionAccount: userReflectionAccount,  // ✅ FIXED NAME
            user: publicKey,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc({ skipPreflight: false, commitment: 'confirmed' });

        console.log("✅ Claim reflections transaction signature:", tx);
        
        const confirmation = await connection.confirmTransaction(tx, 'confirmed');
        
        if (confirmation.value.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }

        console.log("✅ Transaction confirmed!");
        return tx;
      }
    } catch (error: any) {
      console.error("Claim reflections error:", error);
      
      if (error.message?.includes("already been processed") || 
          error.message?.includes("AlreadyProcessed")) {
        console.log("⚠️ Transaction was already processed - likely succeeded");
        const signature = error.signature || error.txSignature;
        if (signature) {
          return signature;
        }
        throw new Error("Transaction may have succeeded. Please refresh to check your reflections.");
      }
      
      throw error;
    }
  };

  /**
   * Refresh reflections calculation
   * @param tokenMint - The token mint address
   */
  const refreshReflections = async (tokenMint: string, poolId: number = 0) => {
    if (!wallet || !publicKey) {
      throw new Error("Wallet not connected");
    }

    const program = getProgram(wallet, connection);
    const tokenMintPubkey = new PublicKey(tokenMint);

    // Get PDAs
    const [projectPDA] = getPDAs.project(tokenMintPubkey, poolId);
    const [userStakePDA] = getPDAs.userStake(projectPDA, publicKey);

    // ✅ CRITICAL FIX: Fetch the reflection vault from project data, not a PDA!
    const project = await program.account.project.fetch(projectPDA, "confirmed");
    
    if (!project.reflectionVault) {
      throw new Error("Reflections not enabled for this pool");
    }

    // ✅ Use the actual reflection vault address from blockchain
    const reflectionVaultPubkey = project.reflectionVault;

    console.log("🔄 Refreshing reflections...");
    console.log("   Project:", projectPDA.toString());
    console.log("   User Stake:", userStakePDA.toString());
    console.log("   Reflection Vault:", reflectionVaultPubkey.toString());
    
    // Add random padding to compute units to make transaction unique
    const timestamp = Date.now();
    const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({
      units: 200_000 + (timestamp % 10_000),
    });
    
    console.log("🎲 Unique compute units:", 200_000 + (timestamp % 10_000));
    
    const tx = await program.methods
      .refreshReflections(tokenMintPubkey, new BN(poolId))
      .accounts({
        project: projectPDA,
        stake: userStakePDA,
        reflectionVault: reflectionVaultPubkey,  // ✅ Now using correct address!
        user: publicKey,
      })
      .preInstructions([computeBudgetIx])
      .rpc({ 
        skipPreflight: true,  // ✅ Skip simulation to bypass caching
        commitment: 'confirmed',
      });

    console.log("✅ Refresh reflections transaction signature:", tx);
    console.log("⏳ Confirming transaction...");
    
    const confirmation = await connection.confirmTransaction(tx, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    console.log("✅ Transaction confirmed successfully!");

    return tx;
  };

  /**
   * Get user stake info
   * @param tokenMint - The token mint address
   */
  const getUserStake = async (tokenMint: string, poolId: number = 0) => {
    if (!wallet || !publicKey) {
      return null;
    }

    try {
      const program = getProgram(wallet, connection);
      const tokenMintPubkey = new PublicKey(tokenMint);
      const [projectPDA] = getPDAs.project(tokenMintPubkey, poolId);
      const [userStakePDA] = getPDAs.userStake(projectPDA, publicKey);

      const userStake = await program.account.stake.fetch(userStakePDA, "confirmed");
      return userStake;
    } catch (error) {
      // User hasn't staked yet
      return null;
    }
  };

  /**
   * Get project/pool info
   * @param tokenMint - The token mint address
   */
  const getProjectInfo = async (tokenMint: string, poolId: number = 0) => {
    // Use read-only program - no wallet connection required for public data
    const { getReadOnlyProgram } = await import("@/lib/anchor-program");
    const program = getReadOnlyProgram(connection);
    const tokenMintPubkey = new PublicKey(tokenMint);
    const [projectPDA] = getPDAs.project(tokenMintPubkey, poolId);

    const projectData = await program.account.project.fetch(projectPDA, "confirmed");
    return {
      ...projectData,
      address: projectPDA, // Include the PDA address
    };
  };

  /**
   * Calculate dynamic APR for variable pools
   * @param tokenMint - The token mint address
   * @returns APR as percentage (e.g., 15.5 for 15.5%)
   */
  const calculateDynamicAPR = async (tokenMint: string, poolId: number = 0): Promise<number> => {
    try {
      console.log(`🔍 calculateDynamicAPR called for: ${tokenMint}`);
      
      const project = await getProjectInfo(tokenMint, poolId);
      
      if (!project) {
        console.log(`❌ No project data found`);
        return 0;
      }
      
      console.log(`📦 Project data:`, {
        rateMode: project.rateMode,
        rateBpsPerYear: project.rateBpsPerYear.toString(),
        rewardRatePerSecond: project.rewardRatePerSecond.toString(),
        totalStaked: project.totalStaked.toString(),
        poolDuration: project.poolDurationSeconds?.toString() || 'undefined',
      });
      
      // For locked pools (rate_mode = 0), return the static APY from rate_bps_per_year
      if (project.rateMode === 0) {
        const apy = project.rateBpsPerYear.toNumber() / 100;
        console.log(`📊 Locked pool - returning static APY: ${apy}%`);
        return apy;
      }
      
      // For variable pools, calculate dynamic APR
      const rewardRatePerSecond = project.rewardRatePerSecond.toNumber();
      const totalStaked = project.totalStaked.toNumber();
      
      console.log(`🔢 Calculation values:`, {
        rewardRatePerSecond,
        totalStaked,
        SECONDS_PER_YEAR,
      });
      
      // If no one has staked or no rewards, APR is 0
      if (totalStaked === 0) {
        console.log(`⚠️ Total staked is 0 - APR = 0`);
        return 0;
      }
      
      if (rewardRatePerSecond === 0) {
        console.log(`⚠️ Reward rate per second is 0 - APR = 0`);
        console.log(`   This means rewards were deposited but reward_rate_per_second wasn't updated!`);
        return 0;
      }
      
      // Calculate APR: (reward_rate_per_second * seconds_per_year * 100) / total_staked
      const annualRewards = rewardRatePerSecond * SECONDS_PER_YEAR;
      const apr = (annualRewards * 100) / totalStaked;
      
      console.log(`✅ Calculated APR: ${apr.toFixed(2)}%`, {
        annualRewards,
        calculation: `(${rewardRatePerSecond} * ${SECONDS_PER_YEAR} * 100) / ${totalStaked}`,
      });
      
      return apr;
    } catch (error) {
      console.error("❌ Error calculating APR:", error);
      return 0;
    }
  };

  /**
   * Get pool rate (APY for locked, APR for variable)
   * @param tokenMint - The token mint address
   * @returns Object with rate, type, and rate_mode
   */
  const getPoolRate = async (tokenMint: string, poolId: number = 0) => {
    try {
      console.log(`🎯 getPoolRate called for: ${tokenMint}`);
      
      const project = await getProjectInfo(tokenMint, poolId);
      
      if (!project) {
        console.log(`❌ getPoolRate: No project found`);
        return { rate: 0, type: "apy", rateMode: 0 };
      }
      
      const rateMode = project.rateMode;
      console.log(`📋 getPoolRate: rateMode = ${rateMode}`);
      
      if (rateMode === 0) {
        // Locked pool - static APY
        const apy = project.rateBpsPerYear.toNumber() / 100;
        console.log(`🔒 getPoolRate: Locked pool, APY = ${apy}%`);
        return { rate: apy, type: "apy", rateMode: 0 };
      } else {
        // Variable pool - dynamic APR
        console.log(`🔓 getPoolRate: Variable pool, calling calculateDynamicAPR...`);
        const apr = await calculateDynamicAPR(tokenMint, poolId);
        console.log(`✅ getPoolRate: Calculated APR = ${apr}%`);
        return { rate: apr, type: "apr", rateMode: 1 };
      }
    } catch (error) {
      console.error("❌❌❌ Error in getPoolRate:", error);
      console.error("Error details:", {
        message: error.message,
        stack: error.stack,
        tokenMint
      });
      return { rate: 0, type: "apy", rateMode: 0 };
    }
  };

  /**
   * Calculate estimated rewards
   * @param tokenMint - The token mint address
   */
  const calculateRewards = async (tokenMint: string, poolId: number = 0) => {
    if (!wallet || !publicKey) {
      return 0;
    }

    try {
      const userStake = await getUserStake(tokenMint, poolId);
      const project = await getProjectInfo(tokenMint, poolId);

      if (!userStake || !project) return 0;

      // Get pending rewards from the smart contract
      const pendingRewards = userStake.rewardsPending.toNumber();
      
      return pendingRewards;
    } catch (error) {
      console.error("Error calculating rewards:", error);
      return 0;
    }
  };

  return {
    // Core Functions
    stake,
    unstake,
    claimRewards,
    claimReflections,
    refreshReflections,
    
    // Query Functions
    getUserStake,
    getProjectInfo,
    calculateRewards,
    calculateDynamicAPR,
    getPoolRate,
    
    // Status
    connected: !!wallet && !!publicKey,
  };
}