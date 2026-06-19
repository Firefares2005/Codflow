import React, { useState, useRef, useEffect } from "react";
import { Terminal, Copy, Trash2, ArrowRight } from "lucide-react";

interface TerminalPanelProps {
  status: "idle" | "queued" | "compiling" | "running" | "done" | "error" | "timeout";
  output: string;
  stdinInputs: string[];
  onSendStdin: (input: string) => void;
  onClearTerminal: () => void;
  terminalLogs: string[];
  onAddTerminalLog: (log: string) => void;
}

export default function TerminalPanel({
  status,
  output,
  stdinInputs,
  onSendStdin,
  onClearTerminal,
  terminalLogs,
  onAddTerminalLog,
}: TerminalPanelProps) {
  const [inputValue, setInputValue] = useState("");
  const terminalScrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto scroll terminal logs to the bottom on new outputs
  useEffect(() => {
    if (terminalScrollRef.current) {
      terminalScrollRef.current.scrollTop = terminalScrollRef.current.scrollHeight;
    }
  }, [terminalLogs, status, output]);

  // Focus terminal input when program requests output
  const isAwaitingInput = status === "running" && output.endsWith("\n") || output.includes("Enter") || output.includes("ReadLine") || terminalLogs.some(log => log.includes("awaiting input"));

  useEffect(() => {
    if (isAwaitingInput && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAwaitingInput]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;

    const userInput = inputValue;
    onSendStdin(userInput);
    setInputValue("");
  };

  const handleCopy = () => {
    if (terminalLogs.length === 0) return;
    const textToCopy = terminalLogs.map(log => log.replace(/<\/?[^>]+(>|$)/g, "")).join("\n");
    navigator.clipboard.writeText(textToCopy);
    alert("Terminal history logs compiled and copied to clipboard!");
  };

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] rounded-xl overflow-hidden border border-[rgba(0,0,0,0.08)] select-none ml-1" id="csharp-terminal-panel">
      {/* Terminal Title Bar */}
      <div className="h-11 bg-[#151515] border-b border-white/[0.04] flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-[#569cd6]" />
          <span className="text-xs font-mono font-medium text-[#d4d4d4] tracking-wide">
            Interactive Terminal
          </span>
        </div>

        {/* Toolbar action buttons for terminal */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleCopy}
            disabled={terminalLogs.length === 0}
            className="p-1 text-[#6b6b6b] hover:text-[#d4d4d4] hover:bg-white/[0.03] disabled:opacity-40 rounded transition-all cursor-pointer"
            id="copy-terminal-btn"
            title="Copy Terminal Scroll Output"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClearTerminal}
            disabled={terminalLogs.length === 0}
            className="p-1 text-[#6b6b6b] hover:text-[#d4d4d4] hover:bg-white/[0.03] disabled:opacity-40 rounded transition-all cursor-pointer"
            id="clear-terminal-logs-btn"
            title="Wipe Terminal Logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Terminal Board body */}
      <div
        ref={terminalScrollRef}
        className="flex-1 overflow-y-auto p-4 font-mono text-xs leading-relaxed select-text space-y-1 bg-[#1e1e1e]"
        id="terminal-scroller"
      >
        {terminalLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center text-white/20 gap-2 p-4 select-none" id="terminal-empty-splash">
            <span className="font-mono text-[11px] uppercase tracking-widest text-[#569cd6]/60 font-semibold">[terminal idle]</span>
            <span className="max-w-xs text-[11px] leading-relaxed text-white/30">
              Interactive standard inputs are fed here! Real-time diagnostic compile streams trigger automatically.
            </span>
          </div>
        ) : (
          <div className="space-y-1 font-mono">
            {terminalLogs.map((log, index) => {
              // Command run lines
              if (log.startsWith("$")) {
                return (
                  <div key={index} className="text-[#569cd6] font-semibold flex gap-1 items-start">
                    <span>{log}</span>
                  </div>
                );
              }
              // Waiting for inputs
              if (log.startsWith("> awaiting input")) {
                return (
                  <div key={index} className="text-[#d97757] animate-pulse">
                    {log}
                  </div>
                );
              }
              // User inputs
              if (log.startsWith(">> ")) {
                return (
                  <div key={index} className="text-emerald-400 font-semibold flex items-center gap-1">
                    <ArrowRight className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span>{log.slice(3)}</span>
                  </div>
                );
              }
              // Failures / Compile warning exits
              if (log.includes("[Exit code: 1]") || log.includes("Error:") || log.includes("Warning:")) {
                return (
                  <div key={index} className="text-[#f48771] leading-relaxed">
                    {log}
                  </div>
                );
              }
              // Success metadata
              if (log.includes("[Exit code: 0]")) {
                return (
                  <div key={index} className="text-[#6a9955] font-semibold">
                    {log}
                  </div>
                );
              }
              // Output lines standard
              return (
                <div key={index} className="text-[#d4d4d4] whitespace-pre-wrap break-all leading-normal">
                  {log}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Terminal Interactive Input Tray */}
      <div className="h-10.5 bg-[#151515] border-t border-white/[0.04] flex items-center px-3 gap-2 shrink-0 select-none">
        <span className="font-mono text-[#569cd6] text-xs font-bold shrink-0">$</span>
        <form onSubmit={handleSubmit} className="flex-1 flex" id="terminal-input-form">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            disabled={status !== "running" && status !== "queued"}
            placeholder={
              status === "running"
                ? "Send standard input feed (Console.ReadLine()...) press Enter..."
                : "Terminal offline. Press ▶ Run to boots up C# execution..."
            }
            className="flex-1 bg-transparent text-[#d4d4d4] font-mono text-xs focus:outline-none border-none placeholder-white/20 disabled:cursor-not-allowed select-text leading-tight outline-none"
            id="terminal-stdin-input"
            autoComplete="off"
          />
          {inputValue && (
            <button
              type="submit"
              className="text-[#d97757] hover:text-[#c4663f] text-xs font-semibold px-2 font-mono shrink-0 transition-colors cursor-pointer"
            >
              Send ⏎
            </button>
          )}
        </form>
      </div>
    </div>
  );
}
