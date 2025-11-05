// components/WalletConnect.tsx
// REPLACE YOUR ENTIRE FILE WITH THIS

'use client';

import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { useState } from 'react';

export default function WalletConnect() {
  const { publicKey, disconnect, connected } = useWallet();
  const [showMenu, setShowMenu] = useState(false);

  // If not connected, show the connect button
  if (!connected || !publicKey) {
    return (
      <WalletMultiButton className="!bg-gradient-to-r !from-purple-600 !to-pink-600 hover:!from-purple-700 hover:!to-pink-700 !rounded-lg !font-semibold !transition-all !w-full" />
    );
  }

  // If connected, show wallet info with dropdown
  const address = publicKey.toBase58();
  const shortAddress = `${address.slice(0, 4)}...${address.slice(-4)}`;

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="w-full flex items-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 rounded-lg text-white font-semibold transition-all shadow-md"
      >
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
          </svg>
        </div>
        <div className="flex-1 text-left">
          <div className="text-xs opacity-80">Connected</div>
          <div className="text-sm font-mono">{shortAddress}</div>
        </div>
        <svg 
          className={`w-4 h-4 transition-transform ${showMenu ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown Menu */}
      {showMenu && (
        <>
          {/* Backdrop to close menu */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setShowMenu(false)}
          />
          
          {/* Menu */}
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
            <div className="p-3 border-b border-gray-700">
              <div className="text-xs text-gray-400 mb-1">Wallet Address</div>
              <div className="text-sm font-mono text-white break-all">{address}</div>
            </div>
            
            <button
              onClick={() => {
                navigator.clipboard.writeText(address);
                setShowMenu(false);
              }}
              className="w-full px-4 py-3 text-left text-sm text-gray-300 hover:bg-gray-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Copy Address
            </button>
            
            <button
              onClick={() => {
                disconnect();
                setShowMenu(false);
              }}
              className="w-full px-4 py-3 text-left text-sm text-red-400 hover:bg-gray-700 transition-colors flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Disconnect
            </button>
          </div>
        </>
      )}
    </div>
  );
}