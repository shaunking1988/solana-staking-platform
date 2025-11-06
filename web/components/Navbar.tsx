"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import WalletConnect from "@/components/WalletConnect";
import { Menu, X, Home, Coins, Sparkles, ArrowDownUp, BookOpen, LifeBuoy } from "lucide-react";

const navItems = [
  { name: "Home", href: "/landing", icon: Sparkles },
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Staking Pools", href: "/pools", icon: Coins },
  { name: "Swap", href: "/swap", icon: ArrowDownUp },
  { name: "Documentation", href: "#", icon: BookOpen },
  { name: "Support", href: "#", icon: LifeBuoy },
];

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  return (
    <nav className="fixed top-0 left-0 right-0 w-full h-16 bg-[#060609] border-b border-white/[0.05] z-50 px-4 lg:px-6 flex items-center justify-between">
      {/* Mobile Menu Button - Only visible on mobile */}
      <button
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        className="lg:hidden p-2 rounded-md hover:bg-white/5 transition-colors -ml-2"
        aria-label="Toggle menu"
      >
        {mobileMenuOpen ? (
          <X className="w-5 h-5 text-gray-400" />
        ) : (
          <Menu className="w-5 h-5 text-gray-400" />
        )}
      </button>

      {/* Logo */}
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-white/[0.03] flex items-center justify-center p-1">
          <svg viewBox="0 0 24 24" className="w-full h-full" fill="none">
            <defs>
              <linearGradient id="logoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#000000"/>
                <stop offset="100%" stopColor="#fb57ff"/>
              </linearGradient>
            </defs>
            <path d="M3 4 L21 4 Q22 4 22 5 L22 7 Q22 8 21 8 L3 8 Q2 8 2 7 L2 5 Q2 4 3 4 Z" fill="url(#logoGradient)"/>
            <path d="M3 10 L21 10 Q22 10 22 11 L22 13 Q22 14 21 14 L3 14 Q2 14 2 13 L2 11 Q2 10 3 10 Z" fill="url(#logoGradient)"/>
            <path d="M3 16 L21 16 Q22 16 22 17 L22 19 Q22 21 21 21 L3 21 Q2 21 2 19 L2 17 Q2 16 3 16 Z" fill="url(#logoGradient)"/>
            <circle cx="18" cy="18.5" r="1.2" fill="#000000" opacity="0.3"/>
          </svg>
        </div>
        <h1 className="text-base font-bold text-white">StakePoint</h1>
      </div>

      {/* Right Side - Wallet Only */}
      <div className="flex items-center gap-2">
        <WalletConnect />
      </div>

      {/* Mobile Dropdown Menu */}
      {mobileMenuOpen && (
        <>
          {/* Overlay */}
          <div
            className="lg:hidden fixed inset-0 bg-black/70 z-40 top-16"
            onClick={() => setMobileMenuOpen(false)}
          />
          
          {/* Dropdown Menu */}
          <div className="lg:hidden absolute top-16 left-0 right-0 bg-[#060609] border-b border-white/[0.05] z-50 animate-in slide-in-from-top duration-200">
            <nav className="px-4 py-2">
              <ul className="space-y-1">
                {navItems.map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
                  const Icon = item.icon;

                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={`flex items-center gap-3 px-3 py-3 rounded-md transition-colors ${
                          isActive
                            ? "text-[#fb57ff] bg-[#fb57ff]/5"
                            : "text-gray-400 hover:bg-white/5 hover:text-gray-300"
                        }`}
                      >
                        <Icon className="w-5 h-5 flex-shrink-0" />
                        <span className="text-base font-medium">{item.name}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          </div>
        </>
      )}
    </nav>
  );
}