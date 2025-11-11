"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Coins, X, Sparkles, ArrowDownUp, BookOpen, LifeBuoy, Send, Lock, Download } from "lucide-react";

const navItems = [
  { name: "Home", href: "/landing", icon: Sparkles },
  { name: "Staking", href: "/pools", icon: Coins },
  { name: "Locks", href: "/locks", icon: Lock },
  { name: "Swap", href: "/swap", icon: ArrowDownUp },
  { name: "Documentation", href: "/docs", icon: BookOpen },
  { name: "Support", href: "/support", icon: LifeBuoy },
];

interface SidebarProps {
  isMobileMenuOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({ isMobileMenuOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const [isClient, setIsClient] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    setIsClient(true);
    
    // Check initial screen size
    const checkScreenSize = () => {
      setIsDesktop(window.innerWidth >= 1024);
    };
    
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    
    // ✅ Check if app is already installed
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true);
    }
    
    // ✅ Listen for PWA install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
      console.log('PWA install prompt available');
    };
    
    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    
    // ✅ Listen for successful install
    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setIsInstallable(false);
      setDeferredPrompt(null);
      console.log('PWA installed successfully');
    });
    
    return () => {
      window.removeEventListener('resize', checkScreenSize);
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  // Close mobile menu when route changes
  useEffect(() => {
    if (isMobileMenuOpen) {
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // ✅ Handle PWA installation
  const handleInstallApp = async () => {
    if (!deferredPrompt) {
      console.log('No install prompt available');
      return;
    }
    
    // Show the install prompt
    deferredPrompt.prompt();
    
    // Wait for the user's response
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`User response: ${outcome}`);
    
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
      setIsInstallable(false);
      setDeferredPrompt(null);
    } else {
      console.log('User dismissed the install prompt');
    }
  };

  // Don't render anything on server
  if (!isClient) {
    return null;
  }

  return (
    <>
      {/* MOBILE OVERLAY - Only visible when menu is open */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={onClose}
          aria-label="Close menu"
          style={{ display: 'block' }}
        />
      )}

      {/* SIDEBAR - Drawer on mobile, fixed on desktop */}
      <aside
        className="fixed left-0 top-0 h-screen w-[280px] lg:top-16 lg:h-[calc(100vh-4rem)] lg:w-64 flex flex-col justify-between bg-[#060609] border-r border-white/[0.05] transition-transform duration-300 ease-in-out z-50 overflow-y-auto"
        style={{
          transform: isDesktop ? 'translateX(0)' : (isMobileMenuOpen ? 'translateX(0)' : 'translateX(-100%)'),
        }}
      >
        {/* Pink gradient glow on bottom left */}
        <div 
          className="absolute bottom-0 left-0 w-64 h-64 opacity-50 blur-3xl pointer-events-none"
          style={{ background: 'linear-gradient(to top, rgba(251, 87, 255, 0.2), rgba(251, 87, 255, 0.05), transparent)' }}
        ></div>
        <div className="relative z-10">
          {/* Mobile Header with Logo and Close */}
          <div className="lg:hidden flex items-center justify-between px-4 py-4 border-b border-white/[0.05]">
            <div className="flex items-center gap-2">
              {/* Logo */}
              <div className="w-7 h-7 rounded-lg bg-white/[0.03] flex items-center justify-center p-1">
                <svg viewBox="0 0 24 24" className="w-full h-full" fill="none">
                  <defs>
                    <linearGradient id="sidebarLogoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#000000"/>
                      <stop offset="100%" stopColor="#fb57ff"/>
                    </linearGradient>
                  </defs>
                  <path d="M3 4 L21 4 Q22 4 22 5 L22 7 Q22 8 21 8 L3 8 Q2 8 2 7 L2 5 Q2 4 3 4 Z" fill="url(#sidebarLogoGradient)"/>
                  <path d="M3 10 L21 10 Q22 10 22 11 L22 13 Q22 14 21 14 L3 14 Q2 14 2 13 L2 11 Q2 10 3 10 Z" fill="url(#sidebarLogoGradient)"/>
                  <path d="M3 16 L21 16 Q22 16 22 17 L22 19 Q22 21 21 21 L3 21 Q2 21 2 19 L2 17 Q2 16 3 16 Z" fill="url(#sidebarLogoGradient)"/>
                  <circle cx="18" cy="18.5" r="1.2" fill="#000000" opacity="0.3"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-white">StakePoint</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/5 transition-colors active:scale-95"
              aria-label="Close menu"
            >
              <X className="w-6 h-6 text-gray-400 hover:text-white transition-colors" />
            </button>
          </div>

          {/* Navigation */}
          <nav className="mt-4 px-3 lg:mt-6">
            <ul className="space-y-2">
              {navItems.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                const Icon = item.icon;

                return (
                  <li key={item.name}>
                    <Link
                      href={item.href}
                      onClick={onClose}
                      className={`group flex items-center gap-3 px-4 py-3 rounded-lg transition-all active:scale-95 ${
                        isActive
                          ? "text-gray-300 hover:bg-white/5 hover:text-gray-300"
                          : "text-gray-400 hover:bg-white/5 hover:text-gray-300"
                      }`}
                      style={isActive ? { background: 'rgba(251, 87, 255, 0.03)', color: '#fb57ff' } : {}}
                    >
                      <Icon className="flex-shrink-0 h-5 w-5" />
                      <span className="text-base font-medium">
                        {item.name}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>

            {/* ✅ NEW: Install App Button - Only show if installable and not installed */}
            {isInstallable && !isInstalled && (
              <div className="mt-6 px-1">
                <button
                  onClick={handleInstallApp}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-gradient-to-r from-purple-600/10 to-pink-600/10 border border-purple-500/20 hover:border-purple-500/40 text-purple-300 hover:text-purple-200 transition-all active:scale-95"
                >
                  <Download className="flex-shrink-0 h-5 w-5" />
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-semibold">
                      Install App
                    </span>
                    <span className="text-xs text-gray-400">
                      Add to home screen
                    </span>
                  </div>
                </button>
              </div>
            )}

            {/* ✅ Show "Installed" badge if already installed */}
            {isInstalled && (
              <div className="mt-6 px-1">
                <div className="w-full flex items-center gap-3 px-4 py-3 rounded-lg bg-green-600/10 border border-green-500/20 text-green-300">
                  <svg className="flex-shrink-0 h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-semibold">
                      App Installed
                    </span>
                    <span className="text-xs text-gray-400">
                      Launch from home screen
                    </span>
                  </div>
                </div>
              </div>
            )}
          </nav>
        </div>

        {/* Bottom Info */}
        <div className="border-t border-white/[0.05] p-4 relative z-10">
          {/* Social Icons - Only on mobile */}
          <div className="lg:hidden flex items-center justify-center gap-4 mb-4">
            <a
              href="https://twitter.com"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-white/5 transition-colors active:scale-95"
              aria-label="Twitter"
            >
              <svg className="w-5 h-5 text-gray-400 hover:text-white transition-colors" viewBox="0 0 24 24" fill="currentColor">
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
              </svg>
            </a>
            <a
              href="https://t.me"
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 rounded-lg hover:bg-white/5 transition-colors active:scale-95"
              aria-label="Telegram"
            >
              <Send className="w-5 h-5 text-gray-400 hover:text-white transition-colors" />
            </a>
          </div>
          
          <div className="text-center text-xs text-gray-600">
            v1.0.0
          </div>
        </div>
      </aside>
    </>
  );
}