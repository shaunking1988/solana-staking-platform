"use client";
import { useWallet } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp } from "lucide-react";

interface UserStake {
  id: string;
  tokenMint: string;
  poolId: number;
  stakedAmount: string;
  poolName: string;
  poolSymbol: string;
  poolLogo?: string;
  apy?: number;
  apr?: number;
  type: "locked" | "unlocked";
}

export function UserStakedPools() {
  const { connected, publicKey } = useWallet();
  const router = useRouter();
  const [stakes, setStakes] = useState<UserStake[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalStaked, setTotalStaked] = useState(0);

  useEffect(() => {
    if (!connected || !publicKey) {
      setStakes([]);
      setLoading(false);
      return;
    }

    const fetchUserStakes = async () => {
      try {
        setLoading(true);
        console.log('📊 Fetching user stakes for:', publicKey.toString());

        const response = await fetch(`/api/stakes/user/${publicKey.toString()}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch user stakes');
        }

        const data = await response.json();
        console.log('✅ User stakes received:', data);

        setStakes(data.stakes || []);
        setTotalStaked(data.totalStaked || 0);

      } catch (error) {
        console.error('❌ Error fetching user stakes:', error);
        setStakes([]);
      } finally {
        setLoading(false);
      }
    };

    fetchUserStakes();

    // Refresh every 30 seconds
    const interval = setInterval(fetchUserStakes, 30000);
    return () => clearInterval(interval);
  }, [connected, publicKey]);

  if (!connected) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 sm:p-6 border border-gray-700">
        <h2 className="text-lg sm:text-xl font-bold text-white mb-4">Your Staked Pools</h2>
        <div className="text-center py-8">
          <p className="text-gray-400">Connect your wallet to view your stakes</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 sm:p-6 border border-gray-700">
        <h2 className="text-lg sm:text-xl font-bold text-white mb-4">Your Staked Pools</h2>
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-900 border border-gray-700 rounded-lg p-4 animate-pulse">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gray-700"></div>
                  <div>
                    <div className="w-24 h-4 bg-gray-700 rounded mb-2"></div>
                    <div className="w-16 h-3 bg-gray-700 rounded"></div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="w-20 h-4 bg-gray-700 rounded mb-2"></div>
                  <div className="w-16 h-3 bg-gray-700 rounded"></div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (stakes.length === 0) {
    return (
      <div className="bg-gray-800 rounded-lg p-4 sm:p-6 border border-gray-700">
        <h2 className="text-lg sm:text-xl font-bold text-white mb-4">Your Staked Pools</h2>
        <div className="text-center py-8">
          <div className="text-gray-400 mb-4">You haven't staked in any pools yet</div>
          <button
            onClick={() => router.push('/pools')}
            className="px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-semibold transition-all"
          >
            Browse Pools
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-800 rounded-lg p-4 sm:p-6 border border-gray-700">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg sm:text-xl font-bold text-white">Your Staked Pools</h2>
        <div className="text-right">
          <div className="text-xs sm:text-sm text-gray-400">Total Staked</div>
          <div className="text-base sm:text-lg font-bold text-white">
            {totalStaked.toLocaleString(undefined, { maximumFractionDigits: 2 })} Tokens
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {stakes.map((stake) => (
          <div
            key={stake.id}
            onClick={() => router.push(`/pools?highlight=${stake.tokenMint}`)}
            className="bg-gradient-to-r from-gray-900 to-gray-800 border border-gray-700 hover:border-purple-500 rounded-lg p-3 sm:p-4 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between">
              {/* Left side - Pool info */}
              <div className="flex items-center gap-3">
                {stake.poolLogo ? (
                  <img
                    src={stake.poolLogo}
                    alt={stake.poolName}
                    className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-gray-700 group-hover:border-purple-500 transition-all"
                  />
                ) : (
                  <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-purple-600 to-pink-600 flex items-center justify-center text-white font-bold text-sm">
                    {stake.poolSymbol.slice(0, 2)}
                  </div>
                )}
                <div>
                  <div className="font-bold text-white group-hover:text-purple-400 transition-colors text-sm sm:text-base">
                    {stake.poolName}
                  </div>
                  <div className="text-xs text-gray-400">
                    {stake.poolSymbol} • Pool #{stake.poolId}
                  </div>
                </div>
              </div>

              {/* Right side - Stake amount & APY */}
              <div className="text-right">
                <div className="font-bold text-white flex items-center gap-2 justify-end text-sm sm:text-base">
                  <TrendingUp className="w-4 h-4 text-green-400" />
                  {(Number(stake.stakedAmount) / 1e9).toLocaleString(undefined, {
                    maximumFractionDigits: 2,
                  })}
                </div>
                <div className="text-xs text-gray-400">
                  {stake.type === "locked" && stake.apy ? (
                    <span className="text-green-400">{stake.apy}% APY</span>
                  ) : stake.type === "unlocked" && stake.apr ? (
                    <span className="text-yellow-400">{stake.apr}% APR</span>
                  ) : (
                    "Staked"
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => router.push('/pools')}
        className="w-full mt-4 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-all text-sm"
      >
        View All Pools
      </button>
    </div>
  );
}