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