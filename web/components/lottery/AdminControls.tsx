"use client";

import { useWallet } from '@solana/wallet-adapter-react';
import { Settings, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export function AdminControls() {
  const { publicKey } = useWallet();

  if (!publicKey) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-900/20 dark:to-indigo-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-6">
      <div className="flex items-start gap-4">
        <div className="bg-purple-100 dark:bg-purple-900/50 p-3 rounded-lg">
          <Settings className="w-6 h-6 text-purple-600 dark:text-purple-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
            Lottery Administration
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            All lottery admin functions are available in the main Admin panel. Use the Admin tab to manage lottery operations.
          </p>
          <Link
            href="/admin"
            className="inline-flex items-center gap-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 py-2 rounded-lg font-medium hover:from-purple-700 hover:to-indigo-700 transition-all"
          >
            Go to Admin Panel
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}