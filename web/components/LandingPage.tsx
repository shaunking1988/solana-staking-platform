"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Shield,
  TrendingUp,
  Zap,
  ArrowRight,
  Check,
  Coins,
  Lock,
  Rocket,
  BarChart3,
  Users,
  Award,
  ChevronRight,
  Send,
  Twitter,
  ExternalLink,
  Mail,
} from "lucide-react";

interface Pool {
  id: string;
  name: string;
  symbol: string;
  logo?: string;
  apy?: number;
  apr?: number;
  type: string;
  totalStaked: number;
  featured: boolean;
}

export default function LandingPage() {
  const router = useRouter();
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(true);
  const [tokenData, setTokenData] = useState({
    totalSupply: "TBA",
    circulatingSupply: "TBA",
    marketCap: "TBA",
    holders: "TBA",
    loading: true,
  });
  const [platformStats, setPlatformStats] = useState({
    totalValueLocked: "TBA",
    activeStakers: "TBA",
    poolsAvailable: "TBA",
    averageReturn: "TBA",
    loading: true,
  });

  // TODO: Add your social media links here
  const socialLinks = {
    telegram: "", // Add your Telegram link here
    twitter: "", // Add your Twitter link here
  };

  // TODO: Add your SolTrax token address here (SPL token mint address)
  // Using BONK as example - replace with your SolTrax token address when deployed
  const SOLTRAX_TOKEN_ADDRESS = "DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263"; // BONK token - Replace with your token mint address

  useEffect(() => {
    fetchFeaturedPools();
    fetchPlatformStats();
    if (SOLTRAX_TOKEN_ADDRESS) {
      fetchTokenData();
      // Refresh token data every 60 seconds
      const interval = setInterval(fetchTokenData, 60000);
      return () => clearInterval(interval);
    }
  }, []);

  const fetchPlatformStats = async () => {
    try {
      const res = await fetch("/api/stats");
      const data = await res.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to fetch stats");
      }

      // Format numbers for display
      const formatNumber = (num: number) => {
        if (num >= 1_000_000) {
          return `${(num / 1_000_000).toFixed(2)}M`;
        } else if (num >= 1_000) {
          return `${(num / 1_000).toFixed(2)}K`;
        }
        return num.toFixed(2);
      };

      // Format whole numbers (no decimals)
      const formatWholeNumber = (num: number) => {
        if (num >= 1_000_000) {
          return `${Math.floor(num / 1_000_000)}M`;
        } else if (num >= 1_000) {
          return `${Math.floor(num / 1_000)}K`;
        }
        return Math.floor(num).toString();
      };

      // Get pools count from database
      const poolsRes = await fetch("/api/pools");
      const poolsData = await poolsRes.json();
      const visiblePools = poolsData.filter((p: any) => !p.hidden);

      // Calculate average APY from visible pools
      const poolsWithAPY = visiblePools.filter((p: any) => p.apy && p.apy > 0);
      const poolsWithAPR = visiblePools.filter((p: any) => p.apr && p.apr > 0);
      
      let averageReturn = 0;
      let returnType = "APY";
      
      if (poolsWithAPY.length > 0) {
        averageReturn = poolsWithAPY.reduce((sum: number, p: any) => sum + p.apy, 0) / poolsWithAPY.length;
        returnType = "APY";
      } else if (poolsWithAPR.length > 0) {
        averageReturn = poolsWithAPR.reduce((sum: number, p: any) => sum + p.apr, 0) / poolsWithAPR.length;
        returnType = "APR";
      }

      setPlatformStats({
        totalValueLocked: data.totalValueLocked > 0 
          ? `${formatNumber(data.totalValueLocked)}` 
          : "TBA",
        activeStakers: data.totalStakers > 0 
          ? formatWholeNumber(data.totalStakers) 
          : "TBA",
        poolsAvailable: visiblePools.length > 0 
          ? visiblePools.length.toString() 
          : "TBA",
        averageReturn: averageReturn > 0 
          ? `${Math.round(averageReturn)}% ${returnType}` 
          : "TBA",
        loading: false,
      });
    } catch (error) {
      console.error("Failed to fetch platform stats:", error);
      setPlatformStats({
        totalValueLocked: "TBA",
        activeStakers: "TBA",
        poolsAvailable: "TBA",
        averageReturn: "TBA",
        loading: false,
      });
    }
  };

  const fetchTokenData = async () => {
    try {
      // Fetch from DexScreener API
      const response = await fetch(
        `https://api.dexscreener.com/latest/dex/tokens/${SOLTRAX_TOKEN_ADDRESS}`
      );
      
      if (!response.ok) {
        throw new Error("Failed to fetch token data");
      }

      const data = await response.json();

      if (data.pairs && data.pairs.length > 0) {
        // Sort pairs by liquidity and get the most liquid pair
        const sortedPairs = data.pairs.sort((a: any, b: any) => {
          const liquidityA = a.liquidity?.usd || 0;
          const liquidityB = b.liquidity?.usd || 0;
          return liquidityB - liquidityA;
        });
        
        const mainPair = sortedPairs[0];

        // Format numbers for display
        const formatNumber = (num: number | string) => {
          const value = typeof num === 'string' ? parseFloat(num) : num;
          if (isNaN(value)) return "TBA";
          
          if (value >= 1_000_000_000) {
            return `${(value / 1_000_000_000).toFixed(2)}B`;
          } else if (value >= 1_000_000) {
            return `${(value / 1_000_000).toFixed(2)}M`;
          } else if (value >= 1_000) {
            return `${(value / 1_000).toFixed(2)}K`;
          }
          return value.toFixed(2);
        };

        // Debug log to see what data we're getting
        console.log("DexScreener main pair data:", mainPair);

        setTokenData({
          totalSupply: mainPair.fdv
            ? `$${formatNumber(mainPair.fdv)}`
            : "TBA",
          circulatingSupply: mainPair.liquidity?.usd
            ? `$${formatNumber(mainPair.liquidity.usd)}`
            : "TBA",
          marketCap: mainPair.marketCap
            ? `$${formatNumber(mainPair.marketCap)}`
            : "TBA",
          holders: mainPair.txns?.h24?.buys && mainPair.txns?.h24?.sells
            ? formatNumber(mainPair.txns.h24.buys + mainPair.txns.h24.sells)
            : "TBA",
          loading: false,
        });
      } else {
        // No pairs found yet
        setTokenData({
          totalSupply: "TBA",
          circulatingSupply: "TBA",
          marketCap: "TBA",
          holders: "TBA",
          loading: false,
        });
      }
    } catch (error) {
      console.error("Failed to fetch token data from DexScreener:", error);
      // Keep showing TBA on error
      setTokenData({
        totalSupply: "TBA",
        circulatingSupply: "TBA",
        marketCap: "TBA",
        holders: "TBA",
        loading: false,
      });
    }
  };

  useEffect(() => {
    fetchFeaturedPools();
  }, []);

  const fetchFeaturedPools = async () => {
    try {
      const res = await fetch("/api/pools");
      const data = await res.json();
      // Get top 3 featured pools
      const featured = data
        .filter((p: Pool) => p.featured && !p.hidden)
        .slice(0, 3);
      setPools(featured);
    } catch (error) {
      console.error("Failed to fetch pools:", error);
    } finally {
      setLoading(false);
    }
  };

  const features = [
    {
      icon: Shield,
      title: "Prioritising Security",
      description:
        "Built on Solana with battle-tested smart contracts. Your assets are protected by industry-leading security.",
      gradient: "from-blue-600 to-cyan-600",
    },
    {
      icon: TrendingUp,
      title: "High APY Returns",
      description:
        "Earn competitive returns on your tokens. Lock for higher yields or stay flexible with unlocked pools.",
      gradient: "from-purple-600 to-pink-600",
    },
    {
      icon: Zap,
      title: "Instant Rewards",
      description:
        "Claim your rewards anytime. Watch your earnings grow in real-time with our transparent reward system.",
      gradient: "from-orange-600 to-red-600",
    },
    {
      icon: Coins,
      title: "Reflection Rewards",
      description:
        "Earn additional tokens through self-reflections or external reflection tokens like USDC, SOL or your favourite SPL.",
      gradient: "from-green-600 to-emerald-600",
    },
  ];

  const stats = [
    { label: "Total Value Locked", value: platformStats.totalValueLocked, icon: Lock },
    { label: "Active Stakers", value: platformStats.activeStakers, icon: Users },
    { label: "Pools Available", value: platformStats.poolsAvailable, icon: BarChart3 },
    { label: "Average APY", value: platformStats.averageReturn, icon: Award },
  ];

  const benefits = [
    "No minimum staking amount!",
    "Withdraw anytime! (unlocked pools)",
    "Claim rewards anytime!",
    "Reflection tokens compatible!",
    "Competetive platform fees!",
    "Lifetime referral program!",
  ];

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Hero Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-slate-900">
        {/* Animated Background Effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse delay-1000" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6 py-20 lg:py-32">
          {/* Social Links - Top Right */}
          <div className="absolute top-8 right-8 flex items-center gap-3">
            <a
              href={socialLinks.telegram || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-10 h-10 bg-slate-800/50 backdrop-blur border border-slate-700 rounded-full hover:bg-slate-800 hover:border-blue-500/50 transition-all group"
              aria-label="Telegram"
            >
              <Send className="w-5 h-5 text-gray-400 group-hover:text-blue-400 transition-colors" />
            </a>
            <a
              href={socialLinks.twitter || "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-10 h-10 bg-slate-800/50 backdrop-blur border border-slate-700 rounded-full hover:bg-slate-800 hover:border-blue-500/50 transition-all group"
              aria-label="Twitter"
            >
              <Twitter className="w-5 h-5 text-gray-400 group-hover:text-blue-400 transition-colors" />
            </a>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            {/* Left: Content */}
            <div className="space-y-8 text-center lg:text-left">
              <div className="inline-block">
                <span className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600/20 border border-blue-500/30 rounded-full text-blue-400 text-sm font-semibold animate-pulse">
                  <Sparkles className="w-4 h-4" />
                  Powered by SolTrax Token
                </span>
              </div>

              <h1 className="text-5xl lg:text-7xl font-bold leading-tight">
                <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                  Stake. Earn.
                </span>
                <br />
                <span className="text-white">Multiply.</span>
              </h1>

              <p className="text-xl text-gray-400 max-w-2xl">
                The most advanced staking platform on Solana. Earn passive income
                with industry-leading APYs and flexible lock periods.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start">
                <button
                  onClick={() => router.push("/dashboard")}
                  className="group flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl hover:from-blue-500 hover:to-purple-500 transition-all font-semibold text-lg shadow-lg shadow-blue-500/50 hover:shadow-xl hover:shadow-blue-500/60 hover:scale-105"
                >
                  <Rocket className="w-5 h-5 group-hover:rotate-12 transition-transform" />
                  Start Staking
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>

                <button
                  onClick={() => router.push("/pools")}
                  className="flex items-center justify-center gap-2 px-8 py-4 bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl hover:bg-slate-800 transition-all font-semibold text-lg"
                >
                  <BarChart3 className="w-5 h-5" />
                  Browse Pools
                </button>
              </div>

              <div className="flex flex-wrap gap-8 justify-center lg:justify-start pt-4">
                {stats.slice(0, 2).map((stat, idx) => (
                  <div key={idx} className="text-center lg:text-left">
                    <div className="flex items-center gap-2 text-3xl font-bold text-white mb-1">
                      <stat.icon className="w-6 h-6 text-blue-400" />
                      {stat.value}
                    </div>
                    <p className="text-sm text-gray-400">{stat.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right: Featured Pools Preview */}
            <div className="lg:block">
              <div className="bg-slate-900/50 backdrop-blur border border-slate-700 rounded-2xl p-6 space-y-4 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-white">
                    🔥 Trending Pools
                  </h3>
                  <span className="text-sm text-gray-400">
                    {pools.length} featured
                  </span>
                </div>

                {loading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className="h-24 bg-slate-800/50 rounded-xl animate-pulse"
                      />
                    ))}
                  </div>
                ) : pools.length > 0 ? (
                  <div className="space-y-3">
                    {pools.map((pool) => (
                      <div
                        key={pool.id}
                        className="flex items-center gap-4 p-4 bg-slate-800/50 rounded-xl hover:bg-slate-800 transition-all cursor-pointer group border border-slate-700 hover:border-blue-500/50"
                      >
                        {pool.logo ? (
                          <img
                            src={pool.logo}
                            alt={pool.symbol}
                            className="w-12 h-12 rounded-full"
                          />
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center font-bold">
                            {pool.symbol.slice(0, 2)}
                          </div>
                        )}
                        <div className="flex-1">
                          <p className="font-semibold text-white">
                            {pool.name}
                          </p>
                          <p className="text-sm text-gray-400">{pool.symbol}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-green-400">
                            {pool.apy
                              ? `${pool.apy}% APY`
                              : pool.apr
                              ? `${pool.apr}% APR`
                              : "Variable"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {pool.type === "locked" ? "🔒 Locked" : "🔓 Flexible"}
                          </p>
                        </div>
                        <ChevronRight className="w-5 h-5 text-gray-600 group-hover:text-blue-400 group-hover:translate-x-1 transition-all" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-400">
                    <p>No featured pools yet</p>
                  </div>
                )}

                <button
                  onClick={() => router.push("/pools")}
                  className="w-full px-4 py-3 bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-lg hover:from-blue-600/30 hover:to-purple-600/30 transition-all font-semibold text-blue-400"
                >
                  View All Pools →
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="relative border-y border-slate-800 bg-slate-900">
        <div className="max-w-7xl mx-auto px-6 py-12">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            {stats.map((stat, idx) => (
              <div key={idx} className="text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <stat.icon className="w-6 h-6 text-blue-400" />
                  {platformStats.loading ? (
                    <div className="h-9 bg-slate-700/50 rounded animate-pulse w-20"></div>
                  ) : (
                    <p className="text-3xl font-bold text-white">{stat.value}</p>
                  )}
                </div>
                <p className="text-sm text-gray-400">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="relative py-20 lg:py-32 bg-gradient-to-b from-slate-900 to-slate-950">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute bottom-0 left-1/3 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
        </div>
        
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <h2 className="text-4xl lg:text-5xl font-bold text-white mb-4">
              Why Choose{" "}
              <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Our Platform
              </span>
            </h2>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto">
              Built for the future of DeFi. Designed for you.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {features.map((feature, idx) => (
              <div
                key={idx}
                className="group p-8 bg-slate-900/50 backdrop-blur border border-slate-700 rounded-2xl hover:border-slate-600 transition-all hover:scale-105"
              >
                <div
                  className={`inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-r ${feature.gradient} mb-6 group-hover:scale-110 transition-transform`}
                >
                  <feature.icon className="w-7 h-7 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-white mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* SolTrax Token Section */}
      <section className="relative py-20 lg:py-32 bg-slate-950">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/4 right-1/3 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-pulse" />
          <div className="absolute bottom-1/4 left-1/3 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl animate-pulse delay-1000" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="text-center mb-16">
            <div className="inline-block mb-6">
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600/20 border border-blue-500/30 rounded-full text-blue-400 text-sm font-semibold">
                <Sparkles className="w-4 h-4" />
                Platform Token
              </span>
            </div>
            <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
              Introducing{" "}
              <span className="bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                SolTrax Token
              </span>
            </h2>
            <p className="text-xl text-gray-400 max-w-3xl mx-auto">
              The native token powering our staking ecosystem. Hold SolTrax to unlock exclusive benefits, 
              earn platform rewards, and participate in governance decisions.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
            {/* Token Info Card */}
            <div className="bg-slate-900/80 backdrop-blur border border-slate-700 rounded-2xl p-8">
              <div className="flex items-center gap-4 mb-6">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                  <Coins className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold text-white">$SOLTRAX</h3>
                  <p className="text-gray-400">Built on Solana</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                  <p className="text-sm text-gray-400 mb-1">Token Symbol</p>
                  <p className="text-lg font-semibold text-white">SOLTRAX</p>
                </div>
                <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                  <p className="text-sm text-gray-400 mb-1">Network</p>
                  <p className="text-lg font-semibold text-white">Solana</p>
                </div>
                <div className="p-4 bg-slate-800/50 rounded-xl border border-slate-700">
                  <p className="text-sm text-gray-400 mb-1">Contract Address</p>
                  <p className="text-sm font-mono text-blue-400">Coming Soon</p>
                </div>
              </div>
            </div>

            {/* Token Benefits */}
            <div className="space-y-4">
              <div className="bg-slate-900/80 backdrop-blur border border-slate-700 rounded-2xl p-6 hover:border-blue-500/50 transition-all">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-r from-blue-600 to-cyan-600 flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-white mb-2">Platform Support Token</h4>
                    <p className="text-gray-400">
                      Token supported by the platform. Transaction fees are used to support the chart and maintain token value.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/80 backdrop-blur border border-slate-700 rounded-2xl p-6 hover:border-purple-500/50 transition-all">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 flex items-center justify-center">
                    <Award className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-white mb-2">Early Access</h4>
                    <p className="text-gray-400">
                      Get early access to new staking pools before they're available to the public. Be first to stake and maximize returns.
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/80 backdrop-blur border border-slate-700 rounded-2xl p-6 hover:border-green-500/50 transition-all">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-r from-green-600 to-emerald-600 flex items-center justify-center">
                    <Users className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="text-xl font-bold text-white mb-2">Governance Rights</h4>
                    <p className="text-gray-400">
                      Vote on platform decisions and new features. Your voice matters in shaping the future of the platform.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Token Stats */}
          <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border border-blue-500/30 rounded-2xl p-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              <div className="text-center">
                <p className="text-sm text-gray-400 mb-2">Total Supply (FDV)</p>
                {tokenData.loading ? (
                  <div className="h-8 bg-slate-700/50 rounded animate-pulse mx-auto w-24"></div>
                ) : (
                  <p className="text-2xl font-bold text-white">{tokenData.totalSupply}</p>
                )}
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-400 mb-2">Liquidity</p>
                {tokenData.loading ? (
                  <div className="h-8 bg-slate-700/50 rounded animate-pulse mx-auto w-24"></div>
                ) : (
                  <p className="text-2xl font-bold text-white">{tokenData.circulatingSupply}</p>
                )}
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-400 mb-2">Market Cap</p>
                {tokenData.loading ? (
                  <div className="h-8 bg-slate-700/50 rounded animate-pulse mx-auto w-24"></div>
                ) : (
                  <p className="text-2xl font-bold text-white">{tokenData.marketCap}</p>
                )}
              </div>
              <div className="text-center">
                <p className="text-sm text-gray-400 mb-2">24h Transactions</p>
                {tokenData.loading ? (
                  <div className="h-8 bg-slate-700/50 rounded animate-pulse mx-auto w-24"></div>
                ) : (
                  <p className="text-2xl font-bold text-white">{tokenData.holders}</p>
                )}
              </div>
            </div>
          </div>

          <div className="text-center mt-12">
            <p className="text-gray-400 mb-6">
              SolTrax will be available for purchase and staking at launch
            </p>
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl hover:from-blue-500 hover:to-purple-500 transition-all font-semibold text-lg shadow-lg shadow-blue-500/50 hover:scale-105"
            >
              <Coins className="w-5 h-5" />
              Get SolTrax Soon
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="relative py-20 bg-gradient-to-b from-slate-950 to-slate-900">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-0 right-1/4 w-96 h-96 bg-green-600/10 rounded-full blur-3xl" />
        </div>
        
        <div className="relative max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
                Everything you need to
                <span className="bg-gradient-to-r from-green-400 to-blue-400 bg-clip-text text-transparent">
                  {" "}
                  maximize returns
                </span>
              </h2>
              <p className="text-xl text-gray-400 mb-8">
                Join thousands of users earning passive income with the most
                flexible staking platform on Solana.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {benefits.map((benefit, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700"
                  >
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-green-600/20 flex items-center justify-center">
                      <Check className="w-4 h-4 text-green-400" />
                    </div>
                    <span className="text-gray-300">{benefit}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-3xl blur-3xl" />
              <div className="relative bg-slate-900/80 backdrop-blur border border-slate-700 rounded-2xl p-8 space-y-6">
                <div className="flex items-center gap-4 pb-6 border-b border-slate-700">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
                    <Rocket className="w-8 h-8 text-white" />
                  </div>
                  <div>
                    <h3 className="text-2xl font-bold text-white">
                      Ready to Start?
                    </h3>
                    <p className="text-gray-400">Connect your wallet now</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 font-bold">
                      1
                    </div>
                    <p className="text-gray-300">Connect your Solana wallet</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 font-bold">
                      2
                    </div>
                    <p className="text-gray-300">Choose a staking pool</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600/20 flex items-center justify-center text-blue-400 font-bold">
                      3
                    </div>
                    <p className="text-gray-300">Stake & earn rewards</p>
                  </div>
                </div>

                <button
                  onClick={() => router.push("/dashboard")}
                  className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl hover:from-blue-500 hover:to-purple-500 transition-all font-semibold text-lg shadow-lg shadow-blue-500/50 hover:scale-105"
                >
                  Launch App →
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* List Your Project Section */}
      <section className="relative py-20 lg:py-32 bg-slate-900">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/2 left-1/4 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl" />
          <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl" />
        </div>
        
        <div className="relative max-w-5xl mx-auto px-6">
          <div className="bg-slate-900/80 backdrop-blur border border-slate-700 rounded-3xl p-12 lg:p-16">
            <div className="text-center mb-12">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 mb-6 animate-pulse">
                <Rocket className="w-10 h-10 text-white" />
              </div>
              
              <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
                List Your Project
                <span className="bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                  {" "}
                  on Our Platform
                </span>
              </h2>
              
              <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-8">
                Join the growing ecosystem of projects offering staking rewards to their communities. 
                Increase engagement, build loyalty, and grow your token holder base.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
              <div className="text-center p-6 bg-slate-800/50 rounded-xl border border-slate-700">
                <div className="w-12 h-12 rounded-full bg-purple-600/20 flex items-center justify-center mx-auto mb-4">
                  <Users className="w-6 h-6 text-purple-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  Grow Your Community
                </h3>
                <p className="text-sm text-gray-400">
                  Attract and retain token holders with staking rewards
                </p>
              </div>

              <div className="text-center p-6 bg-slate-800/50 rounded-xl border border-slate-700">
                <div className="w-12 h-12 rounded-full bg-blue-600/20 flex items-center justify-center mx-auto mb-4">
                  <TrendingUp className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  Increase Token Utility
                </h3>
                <p className="text-sm text-gray-400">
                  Add real value and use cases for your token
                </p>
              </div>

              <div className="text-center p-6 bg-slate-800/50 rounded-xl border border-slate-700">
                <div className="w-12 h-12 rounded-full bg-cyan-600/20 flex items-center justify-center mx-auto mb-4">
                  <Shield className="w-6 h-6 text-cyan-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  Battle-Tested Security
                </h3>
                <p className="text-sm text-gray-400">
                  Built on secure, audited smart contracts
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a
                href="mailto:contact@example.com"
                className="group inline-flex items-center justify-center gap-2 px-8 py-4 bg-gradient-to-r from-purple-600 to-blue-600 rounded-xl hover:from-purple-500 hover:to-blue-500 transition-all font-semibold text-lg shadow-lg shadow-purple-500/50 hover:shadow-xl hover:shadow-purple-500/60 hover:scale-105"
              >
                <Mail className="w-5 h-5" />
                Get in Touch
                <ExternalLink className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </a>

              {socialLinks.telegram && (
                <a
                  href={socialLinks.telegram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 px-8 py-4 bg-slate-800/50 backdrop-blur border border-slate-700 rounded-xl hover:bg-slate-800 hover:border-blue-500/50 transition-all font-semibold text-lg"
                >
                  <Send className="w-5 h-5" />
                  Contact on Telegram
                </a>
              )}
            </div>

            <div className="mt-8 text-center">
              <p className="text-sm text-gray-500">
                We review all applications and respond within 48 hours
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="relative py-20 bg-gradient-to-b from-slate-900 to-slate-950">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl animate-pulse" />
        </div>
        
        <div className="relative max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-4xl lg:text-5xl font-bold text-white mb-6">
            Start Earning Today
          </h2>
          <p className="text-xl text-gray-400 mb-8">
            Join the future of decentralized finance on Solana
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="inline-flex items-center gap-2 px-10 py-5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-xl hover:from-blue-500 hover:to-purple-500 transition-all font-semibold text-xl shadow-2xl shadow-blue-500/50 hover:scale-110"
          >
            <Sparkles className="w-6 h-6" />
            Get Started Now
            <ArrowRight className="w-6 h-6" />
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative border-t border-slate-800 bg-slate-950 py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="text-center md:text-left">
              <p className="text-gray-400">
                © 2025 SolTrax Staking. Built on Solana with ❤️
              </p>
            </div>
            
            {/* Footer Social Links */}
            <div className="flex items-center gap-4">
              <a
                href={socialLinks.telegram || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-10 h-10 bg-slate-800/50 backdrop-blur border border-slate-700 rounded-full hover:bg-slate-800 hover:border-blue-500/50 transition-all group"
                aria-label="Telegram"
              >
                <Send className="w-5 h-5 text-gray-400 group-hover:text-blue-400 transition-colors" />
              </a>
              <a
                href={socialLinks.twitter || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-10 h-10 bg-slate-800/50 backdrop-blur border border-slate-700 rounded-full hover:bg-slate-800 hover:border-blue-500/50 transition-all group"
                aria-label="Twitter"
              >
                <Twitter className="w-5 h-5 text-gray-400 group-hover:text-blue-400 transition-colors" />
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}