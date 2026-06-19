import React from "react";
import { Home, History, FolderClosed, Star, Code, Settings, X, Server, ShieldCheck, Cpu, HardDrive } from "lucide-react";
import { Session } from "../types";

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  activeSession: Session | null;
  onOpenSettings: () => void;
  isMobile: boolean;
}

export default function Sidebar({
  isOpen,
  onClose,
  activeSession,
  onOpenSettings,
  isMobile,
}: SidebarProps) {
  const menuItems = [
    { icon: Home, label: "Home", active: false },
    { icon: History, label: "History", active: false },
    { icon: FolderClosed, label: "Projects", active: false },
    { icon: Code, label: "C# Sandbox", active: true },
  ];

  // Render Mobile slide-in Drawer
  if (isMobile) {
    if (!isOpen) return null;

    return (
      <div className="fixed inset-0 z-50 flex" id="mobile-sidebar-container">
        {/* Backdrop Overlay */}
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
          onClick={onClose}
          id="sidebar-backdrop"
        />

        {/* Content Drawer */}
        <div className="relative flex flex-col w-[280px] max-w-xs bg-white h-full shadow-2xl border-r border-[rgba(0,0,0,0.08)] p-5 select-none animate-slide-in">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <span className="font-semibold text-[#1a1a1a] tracking-tight">Navigation</span>
            <button
              onClick={onClose}
              className="p-1 hover:bg-[#f5f4f0] rounded-md transition-colors text-[#6b6b6b]"
              id="close-sidebar-btn"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex flex-col gap-1 shrink-0">
            {menuItems.map((item, idx) => {
              const Icon = item.icon;
              return (
                <button
                  key={idx}
                  onClick={() => {
                    if (item.label === "C# Sandbox") onClose();
                    else alert(`${item.label} workspace is currently locked in preview mode.`);
                  }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                    item.active
                      ? "text-[#d97757] bg-[#fdf2ee]"
                      : "text-[#6b6b6b] hover:text-[#1a1a1a] hover:bg-[#f5f4f0]"
                  }`}
                >
                  <Icon className="w-5 h-5 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>



          {/* Container Telemetry Info in Mobile Drawer to match prompt specifications */}
          <div className="mt-auto bg-[#f5f4f0] border border-[rgba(0,0,0,0.06)] rounded-xl p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#1a1a1a] mb-2">
              <Server className="w-3.5 h-3.5 text-[#d97757]" />
              <span>DOCKER STATUS</span>
            </div>
            
            <div className="space-y-1.5 text-[11px] text-[#6b6b6b] font-mono leading-tight">
              <div className="flex justify-between">
                <span>Id:</span>
                <span className="text-[#1a1a1a]">{activeSession ? activeSession.containerId : "offline"}</span>
              </div>
              <div className="flex justify-between">
                <span>State:</span>
                <span className={`font-semibold ${activeSession?.status === "active" ? "text-green-600" : "text-gray-500"}`}>
                  {activeSession ? activeSession.status.toUpperCase() : "STOPPED"}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Memory:</span>
                <span>256 MB Limit</span>
              </div>
              <div className="flex justify-between">
                <span>Network:</span>
                <span>Isolated</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render Desktop fixed 48px icons sidebar
  return (
    <aside className="w-12 bg-white border-r border-[rgba(0,0,0,0.08)] flex flex-col items-center py-4 justify-between h-full shrink-0 select-none" id="desktop-sidebar">
      {/* Top portion icons */}
      <div className="flex flex-col gap-3.5 items-center w-full">
        {menuItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <div key={idx} className="relative group">
              <button
                onClick={() => {
                  if (!item.active) {
                    alert(`${item.label} metadata workspace is currently simulation-locked in free sandbox environment.`);
                  }
                }}
                className={`p-2 rounded-lg transition-all border outline-none ${
                  item.active
                    ? "text-[#d97757] bg-[#fdf2ee] border-transparent"
                    : "text-[#6b6b6b] hover:text-[#1a1a1a] hover:bg-[#f5f4f0] border-transparent hover:border-[rgba(0,0,0,0.05)]"
                }`}
                title={item.label}
              >
                <Icon className="w-5 h-5 shrink-0" />
              </button>
              {/* Tooltip */}
              <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-[#1a1a1a] text-white text-[11px] px-2 py-1 rounded shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none whitespace-nowrap z-50">
                {item.label}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom settings gear & Active Container Dot info */}
      <div className="flex flex-col gap-3 items-center w-full mb-3">
        {activeSession && (
          <div className="relative group flex items-center justify-center">
            <div className={`w-2.5 h-2.5 rounded-full ${activeSession.status === "active" ? "bg-green-500 animate-pulse" : "bg-gray-400"}`} />
            <div className="absolute left-14 top-1/2 -translate-y-1/2 bg-[#1a1a1a] text-white text-[11px] p-2.5 rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-none max-w-xs font-mono leading-relaxed z-50">
              <p className="font-bold text-[#d97757] mb-1">DOCKER CONTAINER</p>
              <p>ID: {activeSession.containerId}</p>
              <p>Type: dotnet/sdk-8.0</p>
              <p>Ram: {activeSession.memory} (max)</p>
              <p>CPU: {activeSession.cpu}</p>
              <p>IP: isolated (localdev)</p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
