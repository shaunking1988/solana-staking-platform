// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { SolanaWalletProvider } from "@/components/SolanaWalletProvider";
import { ToastProvider } from "@/components/ToastContainer";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PoolDataProvider } from "@/hooks/usePoolData"; // ✅ ADD THIS
import dynamic from "next/dynamic";

// ✅ Import Sidebar dynamically to prevent SSR issues
const Sidebar = dynamic(() => import("@/components/Sidebar"), { ssr: false });

export const metadata: Metadata = {
  title: "Solana Staking Dashboard",
  description: "Stake SOL and earn rewards securely",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="bg-dark-900 text-gray-100 min-h-screen">
        <ThemeProvider>
          <SolanaWalletProvider>
            <PoolDataProvider> {/* ✅ ADD THIS WRAPPER */}
              <ToastProvider>
                <div className="flex">
                  <Sidebar />
                  {/* MOBILE RESPONSIVE: No margin on mobile, sidebar margin on desktop */}
                  <main className="flex-1 w-full lg:ml-64 p-4 sm:p-6 lg:p-8 transition-all duration-300">
                    {children}
                  </main>
                </div>
              </ToastProvider>
            </PoolDataProvider> {/* ✅ CLOSE IT HERE */}
          </SolanaWalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}