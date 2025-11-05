"use client";

import { useState, useEffect } from "react";
import { X, Search, Sparkles } from "lucide-react";

interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

interface TokenSelectModalProps {
  featuredTokens?: Token[];
  isOpen: boolean;
  onClose: () => void;
  onSelectToken: (token: Token) => void;
  title?: string;
}

export default function TokenSelectModal({
  featuredTokens = [],
  isOpen,
  onClose,
  onSelectToken,
  title = "Select a token",
}: TokenSelectModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [allTokens, setAllTokens] = useState<Token[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch token list on mount
  useEffect(() => {
    const fetchTokens = async () => {
      setIsLoading(true);
      try {
        const response = await fetch("https://token.jup.ag/strict");
        const data = await response.json();
        setAllTokens(data);
      } catch (error) {
        console.error("Failed to fetch tokens:", error);
      } finally {
        setIsLoading(false);
      }
    };

    if (isOpen && allTokens.length === 0) {
      fetchTokens();
    }
  }, [isOpen, allTokens.length]);

  // Filter tokens based on search
  const filteredTokens = allTokens.filter(
    (token) =>
      token.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      token.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      token.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-[90vw] sm:max-w-md max-h-[80vh] flex flex-col shadow-2xl border border-gray-800">
        {/* Header - Mobile optimized */}
        <div className="flex items-center justify-between p-4 sm:p-6 border-b border-gray-800">
          <h2 className="text-lg sm:text-xl font-bold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-800 rounded-lg transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close modal"
          >
            <X className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
          </button>
        </div>

        {/* Search Bar - Mobile optimized */}
        <div className="p-4 sm:p-6 border-b border-gray-800">
          <div className="relative">
            <Search className="absolute left-3 sm:left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-gray-800 text-white rounded-xl pl-10 sm:pl-12 pr-4 py-3 sm:py-4 
                       focus:outline-none focus:ring-2 focus:ring-purple-500 
                       placeholder-gray-500 text-sm sm:text-base min-h-[44px]"
              autoFocus
            />
          </div>
        </div>

        {/* Featured Tokens - Mobile optimized grid */}
        {featuredTokens.length > 0 && !searchQuery && (
          <div className="p-4 sm:p-6 border-b border-gray-800">
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <Sparkles className="w-4 h-4 text-purple-400" />
              <span className="text-xs sm:text-sm font-semibold text-gray-400 uppercase tracking-wider">
                Featured
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
              {featuredTokens.map((token) => (
                <button
                  key={token.address}
                  onClick={() => {
                    onSelectToken(token);
                    onClose();
                  }}
                  className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 bg-gray-800 hover:bg-gray-750 
                           rounded-xl transition-all hover:scale-105 min-h-[44px]"
                >
                  {token.logoURI ? (
                    <img
                      src={token.logoURI}
                      alt={token.symbol}
                      className="w-6 h-6 sm:w-7 sm:h-7 rounded-full flex-shrink-0"
                    />
                  ) : (
                    <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex-shrink-0" />
                  )}
                  <span className="font-semibold text-white text-xs sm:text-sm truncate">
                    {token.symbol}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Token List - Mobile optimized scrolling */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-12 sm:py-16">
              <div className="w-8 h-8 sm:w-10 sm:h-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredTokens.length === 0 ? (
            <div className="text-center py-12 sm:py-16 px-4">
              <p className="text-gray-400 text-sm sm:text-base">No tokens found</p>
              <p className="text-gray-500 text-xs sm:text-sm mt-2">
                Try a different search term
              </p>
            </div>
          ) : (
            <div className="p-2 sm:p-3 space-y-1">
              {filteredTokens.map((token) => (
                <button
                  key={token.address}
                  onClick={() => {
                    onSelectToken(token);
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 sm:gap-4 p-3 sm:p-4 hover:bg-gray-800 
                           rounded-xl transition-colors text-left min-h-[56px] sm:min-h-[64px]"
                >
                  {token.logoURI ? (
                    <img
                      src={token.logoURI}
                      alt={token.symbol}
                      className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex-shrink-0"
                    />
                  ) : (
                    <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-white text-sm sm:text-base">
                      {token.symbol}
                    </div>
                    <div className="text-xs sm:text-sm text-gray-400 truncate">
                      {token.name}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}