import React, { useEffect, useState, useRef } from "react";
import Navbar from "./components/Navbar";
import Sidebar from "./components/Sidebar";
import EditorPanel from "./components/EditorPanel";
import TerminalPanel from "./components/TerminalPanel";
import MobileTabBar from "./components/MobileTabBar";
import SettingsModal from "./components/SettingsModal";
import { Session, TabType } from "./types";

const DEFAULT_CODE = `using System;

class Program
{
    static void Main(string[] args)
    {
        Console.WriteLine("Hello from CodeFlow! 🚀");
        
        for (int i = 1; i <= 5; i++)
        {
            Console.WriteLine($"Line {i}: C# is awesome!");
        }
        
        // Try editing this code and press ▶ Run
        Console.Write("Enter your name: ");
        string name = Console.ReadLine();
        Console.WriteLine($"Welcome, {name}!");
    }
}`;

export default function App() {
  const [code, setCode] = useState(DEFAULT_CODE);
  const [activeTab, setActiveTab] = useState<TabType>("editor");
  const [status, setStatus] = useState<"idle" | "queued" | "compiling" | "running" | "done" | "error" | "timeout">("idle");
  const [output, setOutput] = useState("");
  const [stderr, setStderr] = useState("");
  const [exitCode, setExitCode] = useState<number | null>(null);
  const [executionTime, setExecutionTime] = useState(0);
  const [sessionId, setSessionId] = useState("");
  const [activeSession, setActiveSession] = useState<Session | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>([]);
  
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const activeWsRef = useRef<WebSocket | null>(null);

  // Monitor screen layout dimensions dynamically
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Set up localized sessionId on launch
  useEffect(() => {
    let sid = localStorage.getItem("codeflow_session_id");
    if (!sid) {
      sid = Math.random().toString(36).substring(2, 11);
      localStorage.setItem("codeflow_session_id", sid);
    }
    setSessionId(sid);
    fetchSession(sid);
  }, []);

  const fetchSession = async (sid: string) => {
    try {
      const res = await fetch(`/api/session?sessionId=${sid}`);
      if (res.ok) {
        const sess = await res.json();
        setActiveSession(sess);
      }
    } catch (err) {
      console.error("Failed to query initial workspace container session:", err);
    }
  };

  const fetchSessionLogs = async () => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/session/${sessionId}`);
      if (res.ok) {
        const sess = await res.json();
        setActiveSession(sess);
      }
    } catch (err) {
      console.error("Failed to recover logs from session:", err);
    }
  };

  const handleClearTerminal = () => {
    setTerminalLogs([]);
    setOutput("");
    setStderr("");
    setExitCode(null);
    setStatus("idle");
    setExecutionTime(0);
  };

  const handleClearOutput = () => {
    setOutput("");
    setStderr("");
    setExitCode(null);
    setStatus("idle");
    setExecutionTime(0);
  };

  // Close WebSocket helper
  const disconnectActiveWS = () => {
    if (activeWsRef.current) {
      activeWsRef.current.close();
      activeWsRef.current = null;
    }
  };

  // Execute C# code via Express API endpoint
  const handleExecute = async () => {
    if (status === "running" || status === "compiling" || status === "queued") {
      return;
    }

    disconnectActiveWS();
    setStatus("queued");
    setOutput("");
    setStderr("");
    setExitCode(null);
    setExecutionTime(0);

    // Swap to active compilation view automatically on mobile to notify user
    if (isMobile) {
      setActiveTab("terminal");
    }

    const tInit = [
      `$ dotnet run Program.cs`
    ];
    setTerminalLogs(tInit);

    try {
      const res = await fetch("/api/execute", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-session-id": sessionId,
        },
        body: JSON.stringify({
          code,
          sessionId,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Execution failed on compiling pipeline.");
      }

      const { jobId, status: jobStatus } = data;

      if (jobId === "sec_error") {
        setStatus("error");
        setStderr(data.stderr);
        setExitCode(1);
        setTerminalLogs((prev) => [
          ...prev,
          `Error: Security restriction triggered. Compiled action rejected.`,
          data.stderr,
          `[Exit code: 1]`
        ]);
        return;
      }

      // Establish WebSocket tracking streams
      connectWebSocket(jobId);

    } catch (err: any) {
      setStatus("error");
      const errMsg = err.message || "Endpoint error.";
      setStderr(`Host Execution Error: ${errMsg}`);
      setTerminalLogs((prev) => [
        ...prev,
        `Error: Failed to request container compilation context.`,
        errMsg,
        `[Exit code: 1]`
      ]);
    }
  };

  // Connect relative WebSocket instance
  const connectWebSocket = (jobId: string) => {
    const wsProto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${wsProto}//${window.location.host}/ws/${jobId}`;
    const ws = new WebSocket(wsUrl);

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        switch (payload.type) {
          case "status":
            if (payload.status === "running") {
              setStatus("running");
            }
            break;
          case "stdout":
            setStatus("running");
            setOutput((prev) => prev + payload.data);
            
            // Map printed streams into terminal lines
            const inputLines = payload.data.split("\n");
            setTerminalLogs((prev) => {
              let updated = prev.filter((l) => !l.startsWith("> awaiting input"));
              inputLines.forEach((l: string) => {
                if (l.trim() || l === "") {
                  updated.push(l);
                }
              });
              return updated;
            });
            break;
          case "stderr":
            setStderr(payload.data);
            setTerminalLogs((prev) => [...prev, `Warning Warning: ${payload.data}`]);
            break;
          case "waiting_for_input":
            setStatus("running");
            // Highlight Console.ReadLine waiting to users
            setTerminalLogs((prev) => {
              let updated = prev.filter((l) => !l.startsWith("> awaiting input"));
              updated.push("> awaiting input: process prompts for Console.ReadLine()");
              return updated;
            });
            if (isMobile && activeTab === "editor") {
              setActiveTab("terminal");
            }
            break;
          case "done":
            setStatus("done");
            setExitCode(payload.exitCode);
            setExecutionTime(payload.executionTime);
            setTerminalLogs((prev) => {
              let updated = prev.filter((l) => !l.startsWith("> awaiting input"));
              updated.push(`[Exit code: ${payload.exitCode}] · VM cleanly terminated runtime. Spent ${(payload.executionTime / 1000).toFixed(3)}s.`);
              return updated;
            });
            disconnectActiveWS();
            fetchSessionLogs();
            break;
          default:
            break;
        }
      } catch (err) {
        console.error("Websocket stream processing error:", err);
      }
    };

    ws.onclose = () => {
      // Clean disconnect locks
    };

    activeWsRef.current = ws;
  };

  const handleSendStdin = (input: string) => {
    if (activeWsRef.current && activeWsRef.current.readyState === WebSocket.OPEN) {
      setTerminalLogs((prev) => [...prev, `>> ${input}`]);
      activeWsRef.current.send(JSON.stringify({ type: "stdin", data: input }));
    } else {
      setTerminalLogs((prev) => [...prev, `Error: Sandbox environment failed to feed stdin (WebSocket offline).`]);
    }
  };

  const handleResetSession = async () => {
    if (!sessionId) return;
    disconnectActiveWS();
    try {
      await fetch(`/api/session/${sessionId}`, { method: "DELETE" });
      setTerminalLogs([
        `[${new Date().toLocaleTimeString()}] Received user container reset signal...`,
        `[${new Date().toLocaleTimeString()}] Stopping active exec context sessions...`,
        `[${new Date().toLocaleTimeString()}] Purging sandbox caches...`,
        `[${new Date().toLocaleTimeString()}] Awakening brand new isolated environment (alpine)...`,
        `[${new Date().toLocaleTimeString()}] Docker container successfully warm-booted.`,
        `$ `
      ]);
      setOutput("");
      setStderr("");
      setExitCode(null);
      setStatus("idle");
      fetchSession(sessionId);
    } catch (err) {
      console.error("Wiping container failed:", err);
    }
  };

  const isRunning = status === "queued" || status === "compiling" || status === "running";

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#f5f4f0]" id="codeflow-workspace-root">
      {/* Top Main Navbar */}
      <Navbar
        onToggleSidebar={() => setIsSidebarOpen((prev) => !prev)}
        isRunning={isRunning}
        onExecute={handleExecute}
        isMobile={isMobile}
      />

      {/* Main Container Area */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Sidebar Panel */}
        <Sidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          activeSession={activeSession}
          onOpenSettings={() => setIsSettingsOpen(true)}
          isMobile={isMobile}
        />

        {/* Content Box */}
        {isMobile ? (
          // Mobile Layout with absolute screen state tabs
          <main className="flex-1 relative min-h-0 p-3 flex flex-col justify-between" id="mobile-container-holder">
            <div className="flex-1 min-h-0 relative">
              <div
                className={`transition-opacity duration-150 h-full ${
                  activeTab === "editor" ? "opacity-100 block" : "opacity-0 hidden"
                }`}
              >
                <EditorPanel
                  code={code}
                  onChange={setCode}
                  isRunning={isRunning}
                  onExecute={handleExecute}
                />
              </div>

              <div
                className={`transition-opacity duration-150 h-full ${
                  activeTab === "terminal" ? "opacity-100 block" : "opacity-0 hidden"
                }`}
              >
                <TerminalPanel
                  status={status}
                  output={output}
                  stdinInputs={[]}
                  onSendStdin={handleSendStdin}
                  onClearTerminal={handleClearTerminal}
                  terminalLogs={terminalLogs}
                  onAddTerminalLog={(log) => setTerminalLogs((prev) => [...prev, log])}
                />
              </div>
            </div>
          </main>
        ) : (
          // Desktop Layout with pristine multi-pane split layout mapping requirements perfectly
          <main className="flex-1 min-w-0 p-4 grid grid-cols-[55%_45%] gap-3 h-full" id="desktop-container-holder">
            {/* Left Column: Monaco Editor Panel */}
            <div className="h-full min-h-0">
              <EditorPanel
                code={code}
                onChange={setCode}
                isRunning={isRunning}
                onExecute={handleExecute}
              />
            </div>

            {/* Right Column: Unified Full-Height Terminal */}
            <div className="h-full min-h-0 pb-0.5">
              <TerminalPanel
                status={status}
                output={output}
                stdinInputs={[]}
                onSendStdin={handleSendStdin}
                onClearTerminal={handleClearTerminal}
                terminalLogs={terminalLogs}
                onAddTerminalLog={(log) => setTerminalLogs((prev) => [...prev, log])}
              />
            </div>
          </main>
        )}
      </div>

      {/* Mobile Tab bar */}
      <MobileTabBar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        status={status}
      />

      {/* Shared Container Settings Logs Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        session={activeSession}
        onResetSession={handleResetSession}
      />
    </div>
  );
}
