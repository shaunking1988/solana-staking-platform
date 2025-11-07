"use client";

import { useState, useEffect, useRef } from "react";
import { X, Search, Sparkles } from "lucide-react";

interface Token {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
}

interface JupiterToken {
  id: string;
  symbol: string;
  name: string;
  icon?: string;
  decimals: number;
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
  const [searchResults, setSearchResults] = useState<Token[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout>();

  // Search using Jupiter V2 API
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    const query = searchQuery.trim();

    if (!query) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        console.log('🔍 Searching Jupiter for:', query);
        
        const response = await fetch(
          `https://lite-api.jup.ag/tokens/v2/search?query=${encodeURIComponent(query)}`
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data: JupiterToken[] = await response.json();
        console.log('✅ Found', data.length, 'tokens');

        // Convert to our Token format
        const tokens: Token[] = data.map(t => ({
          address: t.id,
          symbol: t.symbol,
          name: t.name,
          decimals: t.decimals,
          logoURI: t.icon
        }));

        // Exclude featured tokens
        const featuredAddresses = new Set(featuredTokens.map(t => t.address.toLowerCase()));
        const nonFeatured = tokens.filter(t => 
          !featuredAddresses.has(t.address.toLowerCase())
        );

        setSearchResults(nonFeatured);
      } catch (error) {
        console.error('❌ Search failed:', error);
        setSearchResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 500); // Debounce 500ms

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current);
      }
    };
  }, [searchQuery, featuredTokens]);

  // Filter featured tokens
  const filteredFeatured = searchQuery
    ? featuredTokens.filter((token) => {
        const query = searchQuery.toLowerCase();
        return (
          token.symbol?.toLowerCase().includes(query) ||
          token.name?.toLowerCase().includes(query) ||
          token.address?.toLowerCase().includes(query)
        );
      })
    : featuredTokens;

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setSearchResults([]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const hasResults = filteredFeatured.length > 0 || searchResults.length > 0;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/80 backdrop-blur-sm z-50 p-4">
      <div className="bg-white/[0.02] border border-white/[0.05] p-6 rounded-2xl w-full max-w-md max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl min-w-[44px] min-h-[44px]">✕</button>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Search or paste address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full p-3 pl-10 rounded-lg bg-white/[0.02] text-white border border-white/[0.05] focus:border-[#fb57ff] focus:outline-none"
            autoFocus
          />
          {isSearching && (
            <div 
              className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" 
              style={{ borderColor: '#fb57ff', borderTopColor: 'transparent' }}
            />
          )}
        </div>

        {!searchQuery && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="w-4 h-4" style={{ color: '#fb57ff' }} />
              <span className="text-xs font-semibold text-gray-300 uppercase">Featured Tokens</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {featuredTokens.map((token) => (
                <button
                  key={token.address}
                  onClick={() => {
                    onSelectToken(token);
                    onClose();
                  }}
                  className="flex items-center gap-2 p-3 bg-white/[0.02] hover:bg-white/[0.04] border border-white/[0.05] rounded-lg transition-all"
                  onMouseEnter={(e) => e.currentTarget.style.borderColor = 'rgba(251, 87, 255, 0.3)'}
                  onMouseLeave={(e) => e.currentTarget.style.borderColor = ''}
                >
                  {token.logoURI && (
                    <img src={token.logoURI} alt={token.symbol} className="w-7 h-7 rounded-full" />
                  )}
                  <span className="font-semibold text-white text-sm truncate">{token.symbol}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {searchQuery && (
          <div className="flex-1 overflow-hidden">
            <div className="bg-white/[0.02] border border-white/[0.05] rounded-lg overflow-y-auto max-h-[400px]">
              {filteredFeatured.length > 0 && (
                <>
                  <div className="px-3 py-2 bg-white/[0.02] border-b border-white/[0.05] sticky top-0">
                    <Sparkles className="w-3 h-3 inline mr-2" style={{ color: '#fb57ff' }} />
                    <span className="text-xs font-semibold text-gray-400 uppercase">Featured</span>
                  </div>
                  {filteredFeatured.map((token) => (
                    <button
                      key={token.address}
                      onClick={() => {
                        onSelectToken(token);
                        onClose();
                      }}
                      className="w-full flex items-center gap-3 p-4 hover:bg-white/[0.04] border-b border-white/[0.05] transition-all"
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(251, 87, 255, 0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = ''}
                    >
                      {token.logoURI && (
                        <img src={token.logoURI} alt={token.symbol} className="w-10 h-10 rounded-full" />
                      )}
                      <div className="text-left">
                        <div className="font-semibold text-white">{token.symbol}</div>
                        <div className="text-sm text-gray-400 truncate">{token.name}</div>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {searchResults.length > 0 && (
                <>
                  {filteredFeatured.length > 0 && (
                    <div className="px-3 py-2 bg-white/[0.02] border-b border-white/[0.05] sticky top-0">
                      <span className="text-xs font-semibold text-gray-400 uppercase">Search Results</span>
                    </div>
                  )}
                  {searchResults.map((token) => (
                    <button
                      key={token.address}
                      onClick={() => {
                        onSelectToken(token);
                        onClose();
                      }}
                      className="w-full flex items-center gap-3 p-4 hover:bg-white/[0.04] border-b border-white/[0.05] last:border-0 transition-all"
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(251, 87, 255, 0.1)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = ''}
                    >
                      {token.logoURI && (
                        <img src={token.logoURI} alt={token.symbol} className="w-10 h-10 rounded-full" />
                      )}
                      <div className="text-left flex-1 min-w-0">
                        <div className="font-semibold text-white">{token.symbol}</div>
                        <div className="text-sm text-gray-400 truncate">{token.name}</div>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {!hasResults && !isSearching && (
                <div className="text-center py-12 px-4">
                  <p className="text-gray-400 text-sm">No tokens found</p>
                  <p className="text-gray-500 text-xs mt-2">Try a different search</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}