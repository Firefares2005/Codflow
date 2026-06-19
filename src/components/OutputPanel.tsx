import React from "react";
import { Terminal, ShieldX, PlayCircle, Star, Sparkles, RefreshCw, Layers } from "lucide-react";

interface OutputPanelProps {
  status: "idle" | "queued" | "compiling" | "running" | "done" | "error" | "timeout";
  output: string;
  stderr: string;
  exitCode: number | null;
  executionTime: number;
  onClear: () => void;
}

export default function OutputPanel({
  status,
  output,
  stderr,
  exitCode,
  executionTime,
  onClear,
}: OutputPanelProps) {
  
  // Decide Dot Indicator accent colors
  const getDotColor = () => {
    switch (status) {
      case "idle":
        return "bg-gray-400";
      case "queued":
      case "compiling":
        return "bg-amber-400 animate-pulse";
      case "running":
        return "bg-orange-500 animate-pulse";
      case "done":
        return exitCode === 0 ? "bg-emerald-500" : "bg-red-500";
      case "error":
      case "timeout":
        return "bg-red-500";
      default:
        return "bg-gray-400";
    }
  };

  const getStatusText = () => {
    switch (status) {
      case "idle":
        return "Idle";
      case "queued":
        return "Container Queueing...";
      case "compiling":
        return "Compiling Core Project...";
      case "running":
        return "Streaming Application Output...";
      case "done":
        return exitCode === 0 ? "Execution Completed" : "Execution Failed";
      case "error":
        return "Crash Warning";
      case "timeout":
        return "Time Limit Exceeded";
      default:
        return "Status Unknown";
    }
  };

  const showPromptPlaceholder = !output && !stderr && status === "idle";

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] rounded-xl overflow-hidden border border-[rgba(0,0,0,0.08)] select-none ml-1" id="csharp-output-panel">
      {/* Panel Header */}
      <div className="h-11 bg-[#151515] border-b border-white/[0.04] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <span className={`w-2.5 h-2.5 rounded-full ${getDotColor()}`} id="output-indicator-dot" />
          <span className="text-xs font-mono font-medium text-[#d4d4d4] tracking-wide" id="output-pnl-title">
            Program Output &middot; {getStatusText()}
          </span>
        </div>
        
        {/* Quick clear stats actions */}
        <button
          onClick={onClear}
          className="px-2.5 py-1 text-[11px] text-[#6b6b6b] hover:text-[#d4d4d4] bg-[#1e1e1e]/60 border border-white/[0.04] hover:border-white/[0.1] rounded transition-colors uppercase tracking-wider font-mono cursor-pointer"
          id="clear-output-btn"
          title="Reset Console Output"
        >
          Clear
        </button>
      </div>

      {/* Main Stream Area */}
      <div className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed select-text" id="output-stream-viewport">
        {showPromptPlaceholder && (
          <div className="h-full flex flex-col items-center justify-center text-center text-white/35 gap-3 p-6" id="output-prompt-hint">
            <PlayCircle className="w-9 h-9 stroke-[1.2] text-[#d97757]/80 animate-wiggle" />
            <div>
              <p className="text-sm font-medium text-white/60 mb-1">C# Command Console</p>
              <p className="text-xs text-white/30 max-w-xs leading-relaxed">
                Configure your program logic and press <span className="text-[#d97757] font-semibold">▶ Run</span> to compile and execute live in the container environment.
              </p>
            </div>
          </div>
        )}

        {/* Compile / Loading Spastic placeholder */}
        {(status === "queued" || status === "compiling") && !output && !stderr && (
          <div className="h-full flex flex-col items-center justify-center text-white/40 gap-3" id="compiling-loader">
            <Layers className="w-7 h-7 text-[#d97757] animate-bounce" />
            <div className="text-center font-mono">
              <p className="text-xs font-semibold text-[#d4d4d4]">Container compiling .csproj...</p>
              <p className="text-[10px] text-white/35 mt-1">Warming NuGet dependencies</p>
            </div>
          </div>
        )}

        {/* Display normal standard output buffer stream if present */}
        {output && (
          <pre className="text-white/85 whitespace-pre-wrap font-mono break-all font-medium leading-relaxed font-mono-editor" id="output-text-area">
            {output}
          </pre>
        )}

        {/* Display stderr exception feedback in standard red */}
        {stderr && (
          <div className="mt-2.5 bg-red-950/25 border-l-2 border-red-500 p-3 rounded font-mono text-xs text-[#f48771] break-words" id="stderr-block">
            <div className="flex items-center gap-1.5 font-bold mb-1">
              <ShieldX className="w-3.5 h-3.5" />
              <span>Compilation / Runtime Warning:</span>
            </div>
            <pre className="whitespace-pre-wrap break-all leading-relaxed font-mono">{stderr}</pre>
          </div>
        )}

        {/* If executing timed out strictly show danger red */}
        {status === "timeout" && (
          <div className="mt-2 text-amber-500 font-bold flex items-center gap-1.5 bg-amber-500/10 p-3 rounded border border-amber-500/20 font-mono text-xs" id="timeout-banner">
            ⏱ C# Compilation Limit Exceeded: Simulation killed cleanly after 10.0 seconds limit.
          </div>
        )}
      </div>

      {/* Output Panel Status Metrics Foot */}
      <div className="h-8 bg-[#151515] border-t border-white/[0.04] px-4 flex items-center justify-between text-[11px] text-[#6b6b6b] font-mono shrink-0">
        <div>
          {executionTime > 0 ? (
            <span>
              Spent <span className="text-[#d97757] font-semibold">{(executionTime / 1000).toFixed(3)}s</span>
            </span>
          ) : (
            <span>Runner State: IDLE</span>
          )}
        </div>
        <div>
          {exitCode !== null ? (
            <span className={exitCode === 0 ? "text-emerald-500 font-bold" : "text-red-400 font-bold"}>
              Exit Code: {exitCode}
            </span>
          ) : (
            <span>PID: simulated-cli</span>
          )}
        </div>
      </div>
    </div>
  );
}
