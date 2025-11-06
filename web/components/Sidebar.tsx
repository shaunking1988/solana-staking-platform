"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Coins, X, Sparkles, ArrowDownUp, BookOpen, LifeBuoy } from "lucide-react";

const navItems = [
  { name: "Home", href: "/landing", icon: Sparkles },
  { name: "Dashboard", href: "/dashboard", icon: Home },
  { name: "Staking Pools", href: "/pools", icon: Coins },
  { name: "Swap", href: "/swap", icon: ArrowDownUp },
  { name: "Documentation", href: "#", icon: BookOpen },
  { name: "Support", href: "#", icon: LifeBuoy },
];

interface SidebarProps {
  isMobileMenuOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isMobileMenuOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    onClose();
  }, [pathname, onClose]);

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
      <aside className="fixed left-0 top-16 h-[calc(100vh-4rem)] w-64 bg-[#060609] border-r border-white/[0.05] hidden lg:block" />
    );
  }

  return (
    <>

      {/* MOBILE OVERLAY - Only visible when menu is open */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/70 z-30 lg:hidden animate-in fade-in duration-200"
          onClick={onClose}
        />
      )}

      {/* SIDEBAR - Collapsed on mobile by default, drawer when opened, fixed on desktop */}
      <aside
        className={`
          fixed left-0 top-16 h-[calc(100vh-4rem)] flex flex-col justify-between
          bg-[#060609] border-r border-white/[0.05] transition-all duration-300 z-40
          ${isMobileMenuOpen ? 'translate-x-0 w-[280px]' : '-translate-x-full w-0'}
          lg:translate-x-0 lg:w-64
        `}
      >
        {/* Pink gradient glow on bottom left */}
        <div 
          className="absolute bottom-0 left-0 w-64 h-64 opacity-50 blur-3xl pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(251, 87, 255, 0.2), rgba(251, 87, 255, 0.05), transparent)' }}
        ></div>
        <div className="relative z-10">
          {/* Close button for mobile */}
          {isMobileMenuOpen && (
            <button
              onClick={onClose}
              className="absolute top-4 right-4 lg:hidden p-1 rounded hover:bg-white/5 transition-colors z-50"
              aria-label="Close menu"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          )}

          {/* Navigation */}
          <nav className="mt-6 px-3">
            <ul className="space-y-1">
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;

                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={`group flex items-center rounded-md transition-colors ${
                        isMobileMenuOpen 
                          ? 'gap-3 px-3 py-2.5' 
                          : 'gap-0 px-2 py-2.5 justify-center lg:gap-3 lg:px-3 lg:justify-start'
                      } ${
                        isActive
                          ? "text-gray-300 hover:bg-white/5 hover:text-gray-300"
                          : "text-gray-400 hover:bg-white/5 hover:text-gray-300"
                      }`}
                      style={isActive ? { background: 'rgba(251, 87, 255, 0.03)', color: '#fb57ff' } : {}}
                      title={!isMobileMenuOpen ? item.name : undefined}
                    >
                      <Icon
                        className={`flex-shrink-0 ${
                          isMobileMenuOpen ? 'h-5 w-5' : 'h-5 w-5'
                        }`}
                      />
                      <span
                        className={`text-base font-semibold ${
                          isMobileMenuOpen ? 'block' : 'hidden lg:block'
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

        {/* Bottom Info */}
        <div className="border-t border-white/[0.05] p-3 relative z-10">
          <div className="text-center text-[10px] text-gray-600">
            v1.0.0
          </div>
        </div>
      </aside>
    </>
  );
}