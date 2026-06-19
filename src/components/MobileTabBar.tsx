import React from "react";
import { Edit3, Terminal, PlaySquare } from "lucide-react";
import { TabType } from "../types";

interface MobileTabBarProps {
  activeTab: TabType;
  onChangeTab: (tab: TabType) => void;
  status: "idle" | "queued" | "compiling" | "running" | "done" | "error" | "timeout";
}

export default function MobileTabBar({
  activeTab,
  onChangeTab,
  status,
}: MobileTabBarProps) {
  
  const tabs = [
    { id: "editor" as TabType, label: "Editor", icon: Edit3 },
    { id: "terminal" as TabType, label: "Terminal", icon: Terminal, alert: status === "running" || status === "compiling" },
  ];

  return (
    <nav className="h-[56px] bg-white border-t border-[rgba(0,0,0,0.08)] flex items-center justify-around shrink-0 md:hidden select-none" id="mobile-bottom-tabs">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        
        return (
          <button
            key={tab.id}
            onClick={() => onChangeTab(tab.id)}
            className={`flex flex-col items-center justify-center flex-1 h-full relative transition-all border-t-2 outline-none cursor-pointer ${
              isActive
                ? "text-[#d97757] border-[#d97757] bg-[#fbfbf9]/40"
                : "text-[#6b6b6b] border-transparent hover:text-[#1a1a1a]"
            }`}
            id={`tab-btn-${tab.id}`}
          >
            {/* Alert Pulse Badge */}
            {tab.alert && (
              <span className="absolute top-2 right-1/4 flex h-1.5 w-1.5" id="tab-pulse-dot">
                <span className="animate-ping absolute inline-flex rounded-full bg-orange-400 opacity-75" style={{ width: "100%", height: "100%" }}></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#d97757]"></span>
              </span>
            )}
            
            <Icon className="w-5 h-5 mb-0.5 shrink-0" />
            <span className="text-[10px] font-medium tracking-tight font-sans">
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
