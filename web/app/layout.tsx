// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { SolanaWalletProvider } from "@/components/SolanaWalletProvider";
import { ToastProvider } from "@/components/ToastContainer";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PoolDataProvider } from "@/hooks/usePoolData";
import LayoutContent from "@/components/LayoutContent";

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
      <body className="bg-[#060609] text-gray-100 min-h-screen font-sans">
        <ThemeProvider>
          <SolanaWalletProvider>
            <PoolDataProvider>
              <ToastProvider>
                <LayoutContent>{children}</LayoutContent>
              </ToastProvider>
            </PoolDataProvider>
          </SolanaWalletProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}