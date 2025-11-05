"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { isAdmin } from "@/lib/adminAuth";
import { ShieldAlert, Lock } from "lucide-react";

export default function AdminGuard({ children }: { children: React.ReactNode }) {
  const { publicKey, connected } = useWallet();

  // Not connected
  if (!connected || !publicKey) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 p-6">
        <div className="max-w-md w-full bg-gray-800/50 border-2 border-red-500/50 rounded-2xl p-8 text-center">
          <Lock className="w-16 h-16 text-red-400 mx-auto mb-4" />
          <h1 className="text-3xl font-bold text-white mb-2">Admin Access Required</h1>
          <p className="text-gray-400 mb-6">
            Please connect your wallet to access the admin panel
          </p>
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
            <p className="text-yellow-300 text-sm">
              ⚠️ Only authorized wallets can access this area
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Connected but not admin
  if (!isAdmin(publicKey.toString())) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 to-gray-800 p-6">
        <div className="max-w-md w-full bg-gray-800/50 border-2 border-red-500/50 rounded-2xl p-8 text-center">
          <ShieldAlert className="w-16 h-16 text-red-400 mx-auto mb-4 animate-pulse" />
          <h1 className="text-3xl font-bold text-white mb-2">Access Denied</h1>
          <p className="text-gray-400 mb-6">
            Your wallet is not authorized to access the admin panel
          </p>
          
          <div className="bg-gray-900/50 border border-gray-700 rounded-lg p-4 mb-6">
            <p className="text-xs text-gray-500 mb-1">Connected Wallet:</p>
            <p className="text-gray-300 font-mono text-sm break-all">
              {publicKey.toString()}
            </p>
          </div>

          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
            <p className="text-red-300 text-sm font-semibold mb-2">
              🚫 Unauthorized Access
            </p>
            <p className="text-red-400 text-xs">
              This incident has been logged. If you believe this is an error, please contact the administrator.
            </p>
          </div>

          <button
            onClick={() => window.location.href = "/"}
            className="mt-6 w-full px-4 py-3 bg-gray-700 hover:bg-gray-600 text-white rounded-lg font-semibold transition-all"
          >
            Return to Home
          </button>
        </div>
      </div>
    );
  }

  // Admin access granted
  return <>{children}</>;
}