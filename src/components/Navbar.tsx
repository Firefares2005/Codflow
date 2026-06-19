import React from "react";
import { Asterisk, Play, Loader2, Menu } from "lucide-react";

interface NavbarProps {
  onToggleSidebar: () => void;
  isRunning: boolean;
  onExecute: () => void;
  isMobile: boolean;
}

export default function Navbar({
  onToggleSidebar,
  isRunning,
  onExecute,
  isMobile,
}: NavbarProps) {
  return (
    <header className="h-[52px] bg-white border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between px-4 select-none shrink-0" id="codeflow-navbar">
      {/* Left: Branding & Drawer Button */}
      <div className="flex items-center gap-3">
        {isMobile && (
          <button
            onClick={onToggleSidebar}
            className="p-1.5 hover:bg-[#f5f4f0] rounded-md text-[#1a1a1a] transition-colors"
            id="mobile-menu-btn"
            title="Open Menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-[#d97757] text-white flex items-center justify-center rounded-md" id="cf-logo-box">
            <Asterisk className="w-4 h-4 font-extrabold stroke-[3]" />
          </div>
          <span className="font-semibold text-lg text-[#1a1a1a] tracking-tight leading-none" id="cf-logo-text">
            CodeFlow
          </span>
        </div>
      </div>

      {/* Center: File breadcrumb on desktop */}
      {!isMobile && (
        <div className="text-xs text-[#6b6b6b] ml-12 bg-[#f5f4f0]/50 px-2 py-1 rounded border border-[rgba(0,0,0,0.04)]" id="desktop-breadcrumb">
          workspace / Program.cs
        </div>
      )}

      {/* Right: Actions, Upgrades & Face */}
      <div className="flex items-center gap-3">
        {isMobile && (
          <button
            onClick={onExecute}
            disabled={isRunning}
            className="px-3 h-8 bg-[#d97757] hover:bg-[#c4663f] disabled:bg-[#d97757]/60 text-white rounded-md flex items-center gap-1.5 text-xs font-semibold cursor-pointer select-none transition-colors"
            id="mobile-run-btn"
          >
            {isRunning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current stroke-0" />
            )}
            Run
          </button>
        )}



        <div className="h-0.5 w-[1px] bg-[rgba(0,0,0,0.08)] mx-1" />

        {/* Avatar */}
        <div className="w-7 h-7 bg-[#f0e3db] border border-[#d97757]/30 rounded-full flex items-center justify-center cursor-pointer select-none text-[#d97757] text-xs font-bold" id="user-avatar" title="mouhoubifares12@gmail.com">
          M
        </div>
      </div>
    </header>
  );
}
