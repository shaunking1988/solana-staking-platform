// app/install/page.tsx
"use client";

import { usePWAInstall } from "@/hooks/usePWAInstall";
import { Download, Check } from "lucide-react";
import Link from "next/link";

export default function InstallPage() {
  const { isInstallable, isInstalled, installApp } = usePWAInstall();

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="w-24 h-24 mx-auto rounded-3xl bg-gradient-to-r from-purple-600 to-pink-600 flex items-center justify-center">
          {isInstalled ? (
            <Check className="w-12 h-12 text-white" />
          ) : (
            <Download className="w-12 h-12 text-white" />
          )}
        </div>

        {isInstalled ? (
          <div className="space-y-4">
            <h1 className="text-3xl font-bold text-white">App Installed!</h1>
            <p className="text-gray-400">Launch StakePoint from your home screen</p>
          </div>
        ) : isInstallable ? (
          <div className="space-y-4">
            <h1 className="text-3xl font-bold text-white">Install StakePoint</h1>
            <p className="text-gray-400">Get instant access from your home screen</p>
            <button
              onClick={installApp}
              className="w-full py-4 px-6 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white font-semibold rounded-xl transition-all active:scale-95"
            >
              Install Now
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <h1 className="text-3xl font-bold text-white">Install StakePoint</h1>
            <div className="text-left space-y-4 bg-gray-800 p-6 rounded-xl">
              <p className="text-gray-300 font-semibold">How to install:</p>
              <div className="space-y-2">
                <p className="text-sm text-gray-400">
                  <strong className="text-white">iOS (Safari):</strong>
                  <br />1. Tap the Share button
                  <br />2. Select Add to Home Screen
                  <br />3. Tap Add
                </p>
                <p className="text-sm text-gray-400">
                  <strong className="text-white">Android (Chrome):</strong>
                  <br />1. Tap the Menu (3 dots)
                  <br />2. Select Install app
                  <br />3. Tap Install
                </p>
              </div>
            </div>
          </div>
        )}

        <Link href="/" className="block text-gray-500 hover:text-gray-400 text-sm">
          Back to app
        </Link>
      </div>
    </div>
  );
}