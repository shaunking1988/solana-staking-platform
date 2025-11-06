"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import WalletConnect from "@/components/WalletConnect";
import { ThemeToggle } from "@/components/ThemeProvider";
import { Home, Coins, Clock, Settings, Shield, Menu, X, Sparkles, ArrowDownUp } from "lucide-react";

const navItems = [
  { name: "Home", href: "/landing", icon: Sparkles },
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Staking Pools", href: "/pools", icon: Coins },
  { name: "Swap", href: "/swap", icon: ArrowDownUp },
  { name: "History", href: "/history", icon: Clock },
  { name: "Settings", href: "/settings", icon: Settings },
  { name: "Admin", href: "/admin", icon: Shield },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [isClient, setIsClient] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // Prevent body scroll when mobile menu is open
  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isMobileMenuOpen]);

  // Don't render anything on server
  if (!isClient) {
    return (
      <aside className="fixed left-0 top-0 h-screen w-64 bg-white dark:bg-gray-800 shadow-lg hidden lg:block" />
    );
  }

  return (
    <>
      {/* MOBILE HAMBURGER BUTTON - Only visible on mobile */}
      <button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-white dark:bg-gray-800 p-2.5 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all active:scale-95"
        aria-label="Toggle menu"
      >
        {isMobileMenuOpen ? (
          <X className="w-6 h-6 text-gray-700 dark:text-gray-300" />
        ) : (
          <Menu className="w-6 h-6 text-gray-700 dark:text-gray-300" />
        )}
      </button>

      {/* MOBILE OVERLAY - Only visible when menu is open */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden animate-in fade-in duration-200"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* SIDEBAR - Collapsed on mobile by default, drawer when opened, fixed on desktop */}
      <aside
        className={`
          fixed left-0 top-0 h-screen flex flex-col justify-between
          bg-white dark:bg-gray-800 shadow-lg transition-all duration-300 z-40
          ${isMobileMenuOpen ? 'translate-x-0 w-[280px]' : '-translate-x-full w-16'}
          lg:translate-x-0 lg:w-64
        `}
      >
        <div>
          {/* Logo - Hidden when closed on mobile */}
          {isMobileMenuOpen && (
            <div className="border-b border-gray-200 px-4 py-3 dark:border-gray-700 relative lg:block">
              {/* Close button - Mobile only, inside sidebar */}
              <button
                onClick={() => setIsMobileMenuOpen(false)}
                className="absolute top-3 right-3 lg:hidden bg-gray-200 dark:bg-gray-700 p-1.5 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                aria-label="Close menu"
              >
                <X className="w-5 h-5 text-gray-700 dark:text-gray-300" />
              </button>

              <h1 className="text-lg font-bold bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 bg-clip-text text-transparent pr-10">
                SolTrax Staking
              </h1>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                Stake & Earn Rewards
              </p>
            </div>
          )}

          {/* Desktop Logo - Always visible on desktop */}
          <div className="hidden lg:block border-b border-gray-200 px-6 py-4 dark:border-gray-700">
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 bg-clip-text text-transparent">
              SolTrax Staking
            </h1>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Stake & Earn Rewards
            </p>
          </div>

          {/* Navigation */}
          <nav className="mt-4 lg:mt-6">
            <ul className="space-y-1.5 lg:space-y-2 px-2 lg:px-4">
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;

                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={`group flex items-center rounded-lg transition-all duration-200 ${
                        isMobileMenuOpen 
                          ? 'gap-2.5 px-2.5 py-2 lg:gap-3 lg:px-3 lg:py-2.5' 
                          : 'gap-0 px-2 py-2 justify-center lg:gap-3 lg:px-3 lg:py-2.5 lg:justify-start'
                      } ${
                        isActive
                          ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-500/30"
                          : "hover:bg-indigo-50 dark:hover:bg-gray-700/50 active:scale-95"
                      }`}
                      title={!isMobileMenuOpen ? item.name : undefined}
                    >
                      <Icon
                        className={`flex-shrink-0 transition-all duration-200 ${
                          isMobileMenuOpen ? 'h-4 w-4 lg:h-5 lg:w-5' : 'h-5 w-5'
                        } ${
                          isActive
                            ? "text-white"
                            : "text-gray-500 dark:text-gray-400 group-hover:text-indigo-600 dark:group-hover:text-indigo-400"
                        }`}
                      />
                      <span
                        className={`transition-colors duration-200 font-medium ${
                          isMobileMenuOpen ? 'block text-xs lg:text-sm' : 'hidden lg:block lg:text-sm'
                        } ${
                          isActive
                            ? "text-white font-semibold"
                            : "text-gray-700 dark:text-gray-300 group-hover:text-indigo-700 dark:group-hover:text-indigo-300"
                        }`}
                      >
                        {item.name}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </div>

        {/* Bottom Controls - Conditional rendering based on menu state */}
        {isMobileMenuOpen ? (
          // Full controls when expanded
          <div className="flex flex-col gap-2 border-t border-gray-200 p-3 dark:border-gray-700 lg:gap-3 lg:p-4">
            <div className="flex justify-center mb-1">
              <ThemeToggle />
            </div>
            <div className="text-xs">
              <WalletConnect />
            </div>
            <div className="text-center text-[10px] text-gray-400 dark:text-gray-500 mt-1">
              v1.0.0
            </div>
          </div>
        ) : (
          // Icons only when collapsed on mobile
          <div className="flex flex-col gap-3 border-t border-gray-200 p-2 dark:border-gray-700 items-center lg:gap-3 lg:p-4 lg:items-stretch">
            <div className="flex justify-center">
              <ThemeToggle />
            </div>
            {/* Simplified wallet indicator when collapsed */}
            <div className="hidden lg:block text-sm">
              <WalletConnect />
            </div>
            <div className="hidden lg:block text-center text-xs text-gray-400 dark:text-gray-500">
              v1.0.0
            </div>
          </div>
        )}
      </aside>
    </>
  );
}