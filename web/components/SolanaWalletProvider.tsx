"use client";

import { FC, ReactNode, useMemo } from 'react';
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react';
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui';
import { PhantomWalletAdapter, SolflareWalletAdapter } from '@solana/wallet-adapter-wallets';
import { clusterApiUrl } from '@solana/web3.js';

// ✅ ADD: Mobile wallet adapter imports
import {
  SolanaMobileWalletAdapter,
  createDefaultAuthorizationResultCache,
  createDefaultAddressSelector,
  createDefaultWalletNotFoundHandler,
} from "@solana-mobile/wallet-adapter-mobile";

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

  // ✅ ADD: Determine network from endpoint
  const network = useMemo(() => {
    if (endpoint.includes('devnet')) return 'devnet';
    if (endpoint.includes('testnet')) return 'testnet';
    return 'mainnet-beta';
  }, [endpoint]);

  const wallets = useMemo(() => {
    // ✅ ADD: Detect if we're on mobile
    const isMobile =
      typeof window !== 'undefined' &&
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
        navigator.userAgent
      );

    console.log('📱 Is Mobile:', isMobile);

    // Base wallets
    const baseWallets = [
      new PhantomWalletAdapter(),
      new SolflareWalletAdapter(),
    ];

    // ✅ ADD: Prepend mobile adapter on mobile devices
    if (isMobile) {
      return [
        new SolanaMobileWalletAdapter({
          addressSelector: createDefaultAddressSelector(),
          appIdentity: {
           name: 'StakePoint',
            uri: typeof window !== 'undefined' ? window.location.origin : '',
            icon: typeof window !== 'undefined' ? `${window.location.origin}/favicon.jpg` : '',
          },
          authorizationResultCache: createDefaultAuthorizationResultCache(),
          cluster: network as 'devnet' | 'testnet' | 'mainnet-beta',
          onWalletNotFound: createDefaultWalletNotFoundHandler(),
        }),
        ...baseWallets,
      ];
    }

    return baseWallets;
  }, [network]);

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect>
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
};