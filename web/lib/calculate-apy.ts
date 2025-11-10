import { Connection, PublicKey } from "@solana/web3.js";
import { AnchorWallet } from "@solana/wallet-adapter-react";
import { getProgram, getPDAs } from "./anchor-program";

/**
 * Calculate the REAL APY from on-chain data
 * This cannot be faked - it's based on actual deposited rewards
 */
export async function calculateRealAPY(
  connection: Connection,
  wallet: AnchorWallet | undefined,
  tokenMint: string,
  poolId: number = 0
): Promise<{
  realAPY: number;
  totalRewardsDeposited: number;
  totalRewardsClaimed: number;
  availableRewards: number;
  totalStaked: number;
  rewardRate: number;
}> {
  try {
    if (!wallet) {
      throw new Error("Wallet not connected");
    }

    const tokenMintPubkey = new PublicKey(tokenMint);
    const [projectPDA] = getPDAs.project(tokenMintPubkey, poolId);
    
    // Fetch on-chain project data
    const program = getProgram(wallet, connection);
    const projectData = await program.account.project.fetch(projectPDA);
    
    const totalRewardsDeposited = projectData.totalRewardsDeposited.toNumber();
    const totalRewardsClaimed = projectData.totalRewardsClaimed.toNumber();
    const totalStaked = projectData.totalStaked.toNumber();
    const poolDurationSeconds = projectData.poolDurationSeconds.toNumber();
    const rewardRate = projectData.rewardRatePerSecond?.toNumber() || 0;
    
    // Calculate available rewards
    const availableRewards = totalRewardsDeposited - totalRewardsClaimed;
    
    // If no staking yet or no rewards, APY is 0
    if (totalStaked === 0 || availableRewards === 0) {
      return {
        realAPY: 0,
        totalRewardsDeposited,
        totalRewardsClaimed,
        availableRewards,
        totalStaked,
        rewardRate,
      };
    }
    
    // Calculate real APY based on available rewards
    const durationYears = poolDurationSeconds / (365 * 24 * 60 * 60);
    const realAPY = (availableRewards / totalStaked / durationYears) * 100;
    
    return {
      realAPY: Math.max(0, realAPY), // Ensure non-negative
      totalRewardsDeposited,
      totalRewardsClaimed,
      availableRewards,
      totalStaked,
      rewardRate,
    };
    
  } catch (error) {
    console.error("Error calculating real APY:", error);
    return {
      realAPY: 0,
      totalRewardsDeposited: 0,
      totalRewardsClaimed: 0,
      availableRewards: 0,
      totalStaked: 0,
      rewardRate: 0,
    };
  }
}

/**
 * Calculate estimated APY based on planned reward deposit
 * This is used during pool creation to show what APY they'll achieve
 */
export function calculateEstimatedAPY(
  rewardAmount: number,
  expectedTotalStaked: number,
  durationDays: number
): number {
  if (expectedTotalStaked === 0 || rewardAmount === 0 || durationDays === 0) {
    return 0;
  }
  
  const durationYears = durationDays / 365;
  const estimatedAPY = (rewardAmount / expectedTotalStaked / durationYears) * 100;
  
  return Math.max(0, estimatedAPY);
}

/**
 * Calculate required rewards to achieve target APY
 */
export function calculateRequiredRewards(
  targetAPY: number,
  expectedTotalStaked: number,
  durationDays: number
): number {
  if (expectedTotalStaked === 0 || durationDays === 0) {
    return 0;
  }
  
  const durationYears = durationDays / 365;
  const requiredRewards = (targetAPY / 100) * expectedTotalStaked * durationYears;
  
  return Math.max(0, requiredRewards);
}

/**
 * Fetch current pool statistics from chain
 */
export async function getPoolStatistics(
  connection: Connection,
  wallet: AnchorWallet | undefined,
  tokenMint: string,
  poolId: number = 0
) {
  try {
    if (!wallet) {
      throw new Error("Wallet not connected");
    }

    const tokenMintPubkey = new PublicKey(tokenMint);
    const [projectPDA] = getPDAs.project(tokenMintPubkey, poolId);
    
    const program = getProgram(wallet, connection);
    const projectData = await program.account.project.fetch(projectPDA);
    
    return {
      isInitialized: projectData.isInitialized,
      isPaused: projectData.isPaused,
      totalStaked: projectData.totalStaked.toNumber(),
      totalRewardsDeposited: projectData.totalRewardsDeposited.toNumber(),
      totalRewardsClaimed: projectData.totalRewardsClaimed.toNumber(),
      poolDurationSeconds: projectData.poolDurationSeconds.toNumber(),
      lockupSeconds: projectData.lockupSeconds.toNumber(),
      rateBpsPerYear: projectData.rateBpsPerYear.toNumber(),
      poolStartTime: projectData.poolStartTime.toNumber(),
      poolEndTime: projectData.poolEndTime.toNumber(),
    };
  } catch (error) {
    console.error("Error fetching pool statistics:", error);
    return null;
  }
}


