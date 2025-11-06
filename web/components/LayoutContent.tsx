"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

// Import Sidebar and Navbar dynamically to prevent SSR issues
const Sidebar = dynamic(() => import("@/components/Sidebar"), { ssr: false });
const Navbar = dynamic(() => import("@/components/Navbar"), { ssr: false });

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen">
      {/* Navbar - Fixed, doesn't scroll, has its own mobile menu */}
      <Navbar />
      
      {/* Main container below navbar */}
      <div className="flex flex-1 pt-16">
        {/* Sidebar - Only visible on desktop (lg:) */}
        <div className="hidden lg:block">
          <Sidebar 
            isMobileMenuOpen={false}
            onClose={() => {}}
          />
        </div>
        
        {/* Main content - Scrollable */}
        <main className="flex-1 w-full lg:ml-64 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
```

---

## 🎯 What This Does:

### Mobile (< 1024px):
- ✅ Click hamburger → Dropdown menu appears below navbar
- ✅ Menu items show in vertical list
- ✅ Click item → Navigate and close menu
- ✅ Click overlay → Close menu
- ❌ No sidebar (hidden)

### Desktop (≥ 1024px):
- ✅ Sidebar always visible on left
- ✅ Hamburger menu hidden
- ✅ Content flows normally

---

## 📱 Mobile Menu Preview:
```
┌─────────────────────────────┐
│ ☰  StakePoint    [Wallet]   │ ← Navbar
├─────────────────────────────┤
│ ✨ Home                      │ ← Dropdown
│ 🏠 Dashboard                 │    Menu
│ 🪙 Staking Pools            │
│ ⇅  Swap                     │
│ 📖 Documentation            │
│ 🆘 Support                  │
├─────────────────────────────┤
│                             │
│   Main Content Here         │
│                             │
└─────────────────────────────┘