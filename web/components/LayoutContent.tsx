"use client";

import { useState } from "react";
import dynamic from "next/dynamic";

// Import Sidebar and Navbar dynamically to prevent SSR issues
const Sidebar = dynamic(() => import("@/components/Sidebar"), { ssr: false });
const Navbar = dynamic(() => import("@/components/Navbar"), { ssr: false });

export default function LayoutContent({ children }: { children: React.ReactNode }) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-screen">
      {/* Navbar - Fixed, doesn't scroll */}
      <Navbar onMenuClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} />
      
      {/* Main container below navbar */}
      <div className="flex flex-1 pt-16">
        {/* Sidebar - Fixed, doesn't scroll */}
        <Sidebar 
          isMobileMenuOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
        />
        
        {/* Main content - Scrollable */}
        <main className="flex-1 w-full lg:ml-64 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

