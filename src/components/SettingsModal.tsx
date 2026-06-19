import React from "react";
import { Server, Settings, Cpu, HardDrive, Network, X, Trash2, ShieldCheck, RefreshCw } from "lucide-react";
import { Session } from "../types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  session: Session | null;
  onResetSession: () => void;
}

export default function SettingsModal({
  isOpen,
  onClose,
  session,
  onResetSession,
}: SettingsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center z-[100] p-4 select-none animate-fade-in" id="settings-overlay">
      <div className="bg-white rounded-xl border border-[rgba(0,0,0,0.1)] w-full max-w-lg overflow-hidden flex flex-col shadow-2xl relative" id="settings-pnl">
        {/* Header */}
        <div className="h-12 border-b border-[rgba(0,0,0,0.08)] flex items-center justify-between px-4 bg-[#f5f4f0]/50 shrink-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-[#1a1a1a]">
            <Settings className="w-4 h-4 text-[#d97757]" />
            <span>Container Workspace Settings</span>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[rgba(0,0,0,0.04)] rounded-md text-[#6b6b6b] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-5">
          {/* Section: Virtual Specs */}
          <div>
            <span className="text-[11px] font-bold text-[#6b6b6b] tracking-wider uppercase inline-block mb-3">
              1. Isolated Container Sandbox Metadata
            </span>
            <div className="grid grid-cols-2 gap-3" id="specs-grid">
              {/* Box 1 */}
              <div className="p-3 bg-[#f5f4f0]/60 border border-[rgba(0,0,0,0.06)] rounded-lg font-mono text-[11px] space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1a1a1a] mb-1 font-sans">
                  <Cpu className="w-3.5 h-3.5 text-[#d97757]" />
                  <span>CPU Allocation</span>
                </div>
                <div className="flex justify-between">
                  <span>Usage Limit:</span>
                  <span className="text-[#1a1a1a] font-semibold">{session?.cpu || "0.5 Cores"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Scheduler:</span>
                  <span>Docker CFS</span>
                </div>
              </div>

              {/* Box 2 */}
              <div className="p-3 bg-[#f5f4f0]/60 border border-[rgba(0,0,0,0.06)] rounded-lg font-mono text-[11px] space-y-1">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1a1a1a] mb-1 font-sans">
                  <HardDrive className="w-3.5 h-3.5 text-[#d97757]" />
                  <span>RAM Configuration</span>
                </div>
                <div className="flex justify-between">
                  <span>Memory Max:</span>
                  <span className="text-[#1a1a1a] font-semibold">{session?.memory || "256MB"}</span>
                </div>
                <div className="flex justify-between">
                  <span>Swap Memory:</span>
                  <span>Disabled</span>
                </div>
              </div>

              {/* Box 3 */}
              <div className="p-3 bg-[#f5f4f0]/60 border border-[rgba(0,0,0,0.06)] rounded-lg font-mono text-[11px] space-y-1 col-span-2">
                <div className="flex items-center justify-between font-sans">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1a1a1a]">
                    <Network className="w-3.5 h-3.5 text-[#d97757]" />
                    <span>Socket Layer Isolation</span>
                  </div>
                  <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.2 rounded font-semibold font-sans">
                    Isolated Network
                  </span>
                </div>
                <p className="text-[10px] text-[#6b6b6b] mt-1 line-clamp-2">
                  Sandbox lacks outbound internet routes to safeguard cluster ingress. Accessing external endpoints (System.Net.Http, SQL servers) is restricted by cluster policies.
                </p>
              </div>
            </div>
          </div>

          {/* Section: Live Process logs */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[11px] font-bold text-[#6b6b6b] tracking-wider uppercase inline-block">
                2. Docker daemon logs (Stdout / Stderr)
              </span>
              <span className="text-[10px] text-green-600 font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                <span>active connection</span>
              </span>
            </div>

            <div className="bg-[#1e1e1e] border border-white/[0.04] p-3.5 rounded-lg h-36 overflow-y-auto font-mono text-[11px] text-[#d4d4d4] select-text space-y-1.5" id="daemon-log-container">
              {session?.logs && session.logs.length > 0 ? (
                session.logs.map((log, idx) => (
                  <div key={idx} className="whitespace-pre-wrap leading-relaxed break-all border-b border-white/[0.01] last:border-b-0 pb-1 font-mono">
                    {log}
                  </div>
                ))
              ) : (
                <div className="text-white/20 text-center py-4">No logged background transactions.</div>
              )}
            </div>
          </div>

          {/* Action Box */}
          <div className="bg-red-50 border border-red-200/50 p-4 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-red-800">
              <Trash2 className="w-4 h-4 shrink-0" />
              <span>Hard Session Container Reset</span>
            </div>
            <p className="text-[11px] text-red-900/75 leading-relaxed">
              Encountering infinite lock loops or stale compiler streams? Purging your workspace active container discards the old VM, spawns a fresh `dotnet/sdk-8.0` container instance, and resets the standard inputs line stack.
            </p>
            <button
              onClick={() => {
                if (confirm("Are you sure you want to stop, scrub, and reprovision your isolated container environment? This won't erase your file content, but will wipe active standard session inputs and active logs.")) {
                  onResetSession();
                  onClose();
                }
              }}
              className="px-3 py-1.5 h-8 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors outline-none shrink-0"
              id="reset-container-btn"
            >
              Reset Session Container
            </button>
          </div>
        </div>

        {/* Footer */}
        <div className="h-11 border-t border-[rgba(0,0,0,0.08)] bg-[#f5f4f0]/50 flex items-center gap-2 justify-end px-4 shrink-0 font-sans text-xs">
          <div className="flex items-center gap-1 text-[#6b6b6b] mr-auto">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Secure sandboxing enabled</span>
          </div>
          <button
            onClick={onClose}
            className="px-3 h-8 border border-[rgba(0,0,0,0.12)] hover:bg-[#f5f4f0] text-[#1a1a1a] rounded-lg cursor-pointer transition-colors"
          >
            Close Settings
          </button>
        </div>
      </div>
    </div>
  );
}
