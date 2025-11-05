"use client";

import { useState, useEffect } from "react";
import PoolCard from "@/components/PoolCard";
import { useToast } from "@/components/ToastContainer";
import { PoolCardSkeleton, LoadingSpinner } from "@/components/SkeletonLoaders";
import { Search, Filter, X, SlidersHorizontal, Grid3x3, List } from "lucide-react";

type Pool = {
  id: string;
  poolId: number; // ✅ NEW: Pool number
  tokenMint: string; // ✅ NEW: Replaces mintAddress
  name: string;
  symbol: string;
  type: "locked" | "unlocked";
  lockPeriod?: number | null;
  apr?: number | null;
  apy?: number | null;
  totalStaked: number;
  rewards?: string | null;
  logo?: string | null;
  pairAddress?: string | null;
  hidden?: boolean;
  featured?: boolean;
  createdAt?: string;
  hasSelfReflections?: boolean;
  hasExternalReflections?: boolean;
  externalReflectionMint?: string | null;
  reflectionTokenAccount?: string | null;
  reflectionTokenSymbol?: string | null;
};

export default function PoolsClient({ pools }: { pools: Pool[] }) {
  const [sortBy, setSortBy] = useState<"az" | "za" | "rate" | "newest">("az");
  const [filterType, setFilterType] = useState<"all" | "locked" | "unlocked">("all");
  const [filterFeatured, setFilterFeatured] = useState(false);
  const [apyMin, setApyMin] = useState<number>(0);
  const [apyMax, setApyMax] = useState<number>(1000);
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  
  const { showInfo } = useToast();

  // Simulate initial loading
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 800);
    return () => clearTimeout(timer);
  }, []);

  // Load saved view preference
  useEffect(() => {
    const savedView = localStorage.getItem("poolsViewMode");
    if (savedView === "list" || savedView === "grid") {
      setViewMode(savedView);
    }
  }, []);

  // Save view preference
  const toggleViewMode = () => {
    const newMode = viewMode === "grid" ? "list" : "grid";
    setViewMode(newMode);
    localStorage.setItem("poolsViewMode", newMode);
  };

  // ✅ NEW: Count pools per token to show "Pool X of Y"
  const poolCountByToken = pools.reduce((acc, pool) => {
    const key = pool.tokenMint;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // ✅ Apply Filters
  const filteredPools = pools.filter((pool) => {
    if (filterType !== "all" && pool.type !== filterType) return false;
    if (filterFeatured && !pool.featured) return false;

    const rate = pool.type === "locked" ? Number(pool.apy ?? 0) : Number(pool.apr ?? 0);
    if (rate < apyMin || rate > apyMax) return false;

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesName = pool.name.toLowerCase().includes(query);
      const matchesSymbol = pool.symbol.toLowerCase().includes(query);
      if (!matchesName && !matchesSymbol) return false;
    }

    return true;
  });

  // ✅ Apply Sorting
  const sortedPools = [...filteredPools].sort((a, b) => {
    if (sortBy === "az") return a.name.localeCompare(b.name);
    if (sortBy === "za") return b.name.localeCompare(a.name);
    if (sortBy === "rate") {
      const rateA = a.type === "locked" ? Number(a.apy ?? 0) : Number(a.apr ?? 0);
      const rateB = b.type === "locked" ? Number(b.apy ?? 0) : Number(b.apr ?? 0);
      return rateB - rateA;
    }
    if (sortBy === "newest") {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA;
    }
    return 0;
  });

  // Clear all filters
  const clearFilters = () => {
    setFilterType("all");
    setFilterFeatured(false);
    setApyMin(0);
    setApyMax(1000);
    setSearchQuery("");
    showInfo("Filters cleared!");
  };

  const hasActiveFilters = filterType !== "all" || filterFeatured || apyMin > 0 || apyMax < 1000 || searchQuery !== "";

  if (isLoading) {
    return (
      <div className="space-y-4 sm:space-y-6">
        <div className="space-y-2">
          <div className="h-8 sm:h-10 w-48 sm:w-64 bg-slate-800 rounded animate-pulse" />
          <div className="h-4 sm:h-5 w-32 sm:w-48 bg-slate-800 rounded animate-pulse" />
        </div>

        <div className="bg-gray-800 rounded-lg p-4 sm:p-6">
          <div className="h-10 w-full bg-slate-700 rounded animate-pulse mb-4" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-10 bg-slate-700 rounded animate-pulse" />
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:gap-5 lg:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <PoolCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="animate-in fade-in duration-500">
      {/* Header - MOBILE RESPONSIVE */}
      <div className="mb-4 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 sm:mb-2">Staking Pools</h1>
          <p className="text-sm sm:text-base text-gray-400">
            Showing <span className="text-purple-400 font-semibold">{sortedPools.length}</span> of{" "}
            <span className="text-purple-400 font-semibold">{pools.length}</span> pools
          </p>
        </div>

        <div className="flex gap-2 w-full sm:w-auto">
          {/* View Toggle Button - MOBILE RESPONSIVE */}
          <button
            onClick={toggleViewMode}
            className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 rounded-lg transition-all active:scale-95 text-sm sm:text-base flex-1 sm:flex-initial min-h-[44px]"
            title={viewMode === "grid" ? "Switch to List View" : "Switch to Grid View"}
          >
            {viewMode === "grid" ? (
              <>
                <List className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">List</span>
              </>
            ) : (
              <>
                <Grid3x3 className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="hidden sm:inline">Grid</span>
              </>
            )}
          </button>

          {/* Toggle Filters Button - MOBILE RESPONSIVE */}
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-gray-800 hover:bg-gray-700 active:bg-gray-600 rounded-lg transition-all active:scale-95 text-sm sm:text-base flex-1 sm:flex-initial min-h-[44px]"
          >
            <SlidersHorizontal className="w-4 h-4 sm:w-5 sm:h-5" />
            <span className="hidden sm:inline">Filters</span>
            {hasActiveFilters && (
              <span className="bg-purple-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
                {[filterType !== "all", filterFeatured, apyMin > 0 || apyMax < 1000, searchQuery !== ""].filter(Boolean).length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Filters Section - MOBILE RESPONSIVE */}
      {showFilters && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 sm:p-6 mb-4 sm:mb-6 animate-in slide-in-from-top duration-300">
          {/* Search Bar - MOBILE RESPONSIVE */}
          <div className="relative mb-4">
            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4 sm:w-5 sm:h-5" />
            <input
              type="text"
              placeholder="Search pools by name or symbol..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 sm:pl-12 pr-10 sm:pr-12 py-2.5 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500 transition-colors text-sm sm:text-base min-h-[48px]"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 sm:right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors active:scale-90"
              >
                <X className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>
            )}
          </div>

          {/* Filter Controls - MOBILE RESPONSIVE */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
            {/* Sort By - MOBILE RESPONSIVE */}
            <div>
              <label className="block text-xs sm:text-sm text-gray-400 mb-2 font-medium">Sort By</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500 transition-colors text-sm sm:text-base min-h-[48px] cursor-pointer"
              >
                <option value="az">A → Z</option>
                <option value="za">Z → A</option>
                <option value="rate">Highest Rate</option>
                <option value="newest">Newest First</option>
              </select>
            </div>

            {/* Pool Type - MOBILE RESPONSIVE */}
            <div>
              <label className="block text-xs sm:text-sm text-gray-400 mb-2 font-medium">Pool Type</label>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as any)}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500 transition-colors text-sm sm:text-base min-h-[48px] cursor-pointer"
              >
                <option value="all">All Pools</option>
                <option value="locked">Locked Only</option>
                <option value="unlocked">Flexible Only</option>
              </select>
            </div>

            {/* APY/APR Range - MOBILE RESPONSIVE */}
            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-xs sm:text-sm text-gray-400 mb-2 font-medium">Min Rate (%)</label>
              <input
                type="number"
                min="0"
                max={apyMax}
                value={apyMin}
                onChange={(e) => setApyMin(Number(e.target.value))}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500 transition-colors text-sm sm:text-base min-h-[48px]"
              />
            </div>

            <div className="sm:col-span-2 lg:col-span-1">
              <label className="block text-xs sm:text-sm text-gray-400 mb-2 font-medium">Max Rate (%)</label>
              <input
                type="number"
                min={apyMin}
                max="1000"
                value={apyMax}
                onChange={(e) => setApyMax(Number(e.target.value))}
                className="w-full px-3 sm:px-4 py-2.5 sm:py-3 bg-gray-900 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-purple-500 transition-colors text-sm sm:text-base min-h-[48px]"
              />
            </div>
          </div>

          {/* Featured Toggle & Clear Button - MOBILE RESPONSIVE */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 sm:gap-4">
            <label className="flex items-center gap-2 sm:gap-3 cursor-pointer bg-gray-900 px-4 py-3 rounded-lg hover:bg-gray-800 transition-colors border border-gray-700 flex-1 sm:flex-initial min-h-[48px]">
              <input
                type="checkbox"
                checked={filterFeatured}
                onChange={(e) => setFilterFeatured(e.target.checked)}
                className="w-4 h-4 sm:w-5 sm:h-5 rounded border-gray-600 text-purple-600 focus:ring-purple-500 focus:ring-offset-gray-900 cursor-pointer"
              />
              <span className="text-sm sm:text-base text-white font-medium">Featured Only ⭐</span>
            </label>

            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white rounded-lg font-semibold transition-all active:scale-95 text-sm sm:text-base min-h-[48px]"
              >
                <X className="w-4 h-4" />
                Clear Filters
              </button>
            )}
          </div>
        </div>
      )}

      {/* Pools Grid/List - MOBILE RESPONSIVE */}
      {sortedPools.length === 0 ? (
        <div className="text-center py-12 sm:py-16 animate-in zoom-in-95 duration-300">
          <div className="text-5xl sm:text-6xl mb-4">🔍</div>
          <p className="text-lg sm:text-xl text-gray-300 mb-2 font-semibold">No pools found</p>
          <p className="text-sm sm:text-base text-gray-500 mb-4">Try adjusting your filters to see more results</p>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:from-purple-700 active:to-indigo-700 text-white rounded-lg font-semibold transition-all active:scale-95 shadow-lg text-sm sm:text-base min-h-[48px]"
            >
              Clear All Filters
            </button>
          )}
        </div>
      ) : viewMode === "grid" ? (
        // GRID VIEW - MOBILE RESPONSIVE
        <div className="grid gap-4 sm:gap-5 lg:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 animate-in fade-in duration-500">
          {sortedPools.map((pool, index) => (
            <div
              key={pool.id}
              className="animate-in slide-in-from-bottom duration-300"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <PoolCard 
                {...pool}
                poolId={pool.poolId}
                tokenMint={pool.tokenMint}
                showPoolNumber={poolCountByToken[pool.tokenMint] > 1}
                totalPoolsForToken={poolCountByToken[pool.tokenMint]}
                reflectionTokenAccount={pool.reflectionTokenAccount}
              />
            </div>
          ))}
        </div>
      ) : (
        // LIST VIEW - MOBILE: Show as cards, DESKTOP: Show as table rows
        <div className="space-y-2 animate-in fade-in duration-500">
          {sortedPools.map((pool, index) => (
            <div
              key={pool.id}
              className="bg-gradient-to-r from-gray-900 to-gray-800 border border-gray-700 hover:border-purple-500/50 rounded-lg p-3 sm:px-4 sm:py-3 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10 animate-in slide-in-from-left duration-300"
              style={{ animationDelay: `${index * 20}ms` }}
            >
              {/* MOBILE: Card Layout */}
              <div className="block lg:hidden space-y-3">
                <div className="flex items-center gap-3">
                  {pool.logo ? (
                    <img src={pool.logo} alt={pool.name} className="w-12 h-12 rounded-full border-2 border-gray-700" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white font-bold text-lg">
                      {pool.symbol.slice(0, 2)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-white truncate">{pool.name}</h3>
                      {pool.featured && <span className="text-yellow-400 text-xs">⭐</span>}
                      {/* ✅ NEW: Show Pool ID Badge */}
                      {poolCountByToken[pool.tokenMint] > 1 && (
                        <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30">
                          Pool #{pool.poolId}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 text-xs">{pool.symbol}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xl font-bold ${
                      (pool.apy || pool.apr || 0) > 100 ? "text-green-400" : 
                      (pool.apy || pool.apr || 0) > 50 ? "text-yellow-400" : "text-gray-300"
                    }`}>
                      {pool.type === "locked" ? pool.apy : pool.apr}%
                    </p>
                    <p className="text-xs text-gray-400">{pool.type === "locked" ? "APY" : "APR"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div className="bg-gray-800/50 p-2 rounded">
                    <p className="text-gray-400 text-xs">Lock Period</p>
                    <p className="text-white font-semibold">{pool.type === "locked" ? `${pool.lockPeriod}d` : "Flexible"}</p>
                  </div>
                  <div className="bg-gray-800/50 p-2 rounded">
                    <p className="text-gray-400 text-xs">Total Staked</p>
                    <p className="text-white font-semibold">${(Number(pool.totalStaked) / 1000).toFixed(0)}K</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <button className="px-3 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-semibold transition-all active:scale-95 text-sm min-h-[44px]">
                    Stake
                  </button>
                  <button className="px-3 py-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-lg font-semibold transition-all active:scale-95 text-sm min-h-[44px]">
                    Rewards
                  </button>
                </div>
              </div>

              {/* DESKTOP: Table Row Layout */}
              <div className="hidden lg:grid lg:grid-cols-12 gap-4 items-center">
                {/* Logo & Name - 3 columns */}
                <div className="col-span-3 flex items-center gap-3 min-w-0">
                  {pool.logo ? (
                    <img src={pool.logo} alt={pool.name} className="w-12 h-12 rounded-full border-2 border-gray-700 flex-shrink-0" />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center text-white font-bold text-lg flex-shrink-0">
                      {pool.symbol.slice(0, 2)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-white truncate" title={pool.name}>
                        {pool.name}
                      </h3>
                      {pool.featured && <span className="text-yellow-400 text-xs flex-shrink-0">⭐</span>}
                      {/* ✅ NEW: Show Pool ID Badge in list view */}
                      {poolCountByToken[pool.tokenMint] > 1 && (
                        <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded border border-purple-500/30 whitespace-nowrap">
                          Pool #{pool.poolId}
                        </span>
                      )}
                    </div>
                    <p className="text-gray-400 text-xs truncate">{pool.symbol}</p>
                  </div>
                </div>

                {/* Stats Grid - 4 columns */}
                <div className="col-span-4 grid grid-cols-4 gap-4">
                  {/* APY/APR */}
                  <div className="text-center">
                    <p className="text-xs text-gray-400 mb-1">{pool.type === "locked" ? "APY" : "APR"}</p>
                    <p className={`text-lg font-bold ${
                      (pool.apy || pool.apr || 0) > 100 ? "text-green-400" : 
                      (pool.apy || pool.apr || 0) > 50 ? "text-yellow-400" : "text-gray-300"
                    }`}>
                      {pool.type === "locked" ? pool.apy : pool.apr}%
                    </p>
                  </div>

                  {/* Lock Period */}
                  <div className="text-center">
                    <p className="text-xs text-gray-400 mb-1">Lock</p>
                    <p className="text-sm font-semibold text-white">
                      {pool.type === "locked" ? `${pool.lockPeriod}d` : "Flex"}
                    </p>
                  </div>

                  {/* TVL */}
                  <div className="text-center">
                    <p className="text-xs text-gray-400 mb-1">Staked</p>
                    <p className="text-sm font-semibold text-white">
                      ${(Number(pool.totalStaked) / 1000).toFixed(0)}K
                    </p>
                  </div>

                  {/* Rewards */}
                  <div className="text-center">
                    <p className="text-xs text-gray-400 mb-1">Rewards</p>
                    <p className="text-sm font-semibold text-green-400 truncate" title={pool.rewards || "0"}>
                      {pool.rewards || "0"}
                    </p>
                  </div>
                </div>

                {/* Actions - 5 columns */}
                <div className="col-span-5 flex gap-2 justify-end">
                  <button className="px-4 py-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white rounded-lg font-semibold transition-all active:scale-95 text-sm whitespace-nowrap">
                    Stake
                  </button>
                  <button className="px-3 py-2 bg-gray-600 hover:bg-gray-700 active:bg-gray-800 text-white rounded-lg font-semibold transition-all active:scale-95 text-sm whitespace-nowrap">
                    Unstake
                  </button>
                  <button className="px-4 py-2 bg-green-600 hover:bg-green-700 active:bg-green-800 text-white rounded-lg font-semibold transition-all active:scale-95 text-sm whitespace-nowrap">
                    Rewards
                  </button>
                  {(pool.hasSelfReflections || pool.hasExternalReflections) && (
                    <button className="px-3 py-2 bg-yellow-600 hover:bg-yellow-700 active:bg-yellow-800 text-white rounded-lg font-semibold transition-all active:scale-95 text-sm whitespace-nowrap">
                      Reflections
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}