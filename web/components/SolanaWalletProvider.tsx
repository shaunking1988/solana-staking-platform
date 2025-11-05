"use client";
import { FC, ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

require('@solana/wallet-adapter-react-ui/styles.css');

export const SolanaWalletProvider: FC<{ children: ReactNode }> = ({ children }) => {
  // Use custom RPC URL from environment or fallback to default devnet
  const endpoint = useMemo(() => {
    const rpcEndpoint = process.env.NEXT_PUBLIC_RPC_ENDPOINT || clusterApiUrl('devnet');
    
    // DEBUG: Log which endpoint is being used
    console.log('🔗 RPC ENDPOINT:', rpcEndpoint);
    console.log('📋 All env vars:', {
      RPC_ENDPOINT: process.env.NEXT_PUBLIC_RPC_ENDPOINT,
      NETWORK: process.env.NEXT_PUBLIC_SOLANA_NETWORK,
      BASE_URL: process.env.NEXT_PUBLIC_BASE_URL
    });
    
    return rpcEndpoint;
  }, []);

  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ],
    []
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};