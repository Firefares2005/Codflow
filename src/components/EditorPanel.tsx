import React, { useEffect, useRef, useState } from "react";
import { FileCode, Plus, Play, Loader2, Info } from "lucide-react";

interface EditorPanelProps {
  code: string;
  onChange: (value: string) => void;
  isRunning: boolean;
  onExecute: () => void;
}

declare global {
  interface Window {
    require: any;
    monaco: any;
  }
}

export default function EditorPanel({
  code,
  onChange,
  isRunning,
  onExecute,
}: EditorPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  const [isEditorLoaded, setIsEditorLoaded] = useState(false);
  const valueRef = useRef(code);

  valueRef.current = code;

  // Dynamically load Monaco from CDN
  useEffect(() => {
    let checkAndInit: any = null;
    let isMounted = true;

    const initializeEditor = () => {
      if (!containerRef.current || !isMounted) return;

      // Clean existing container children if any to prevent duplicate rendering
      containerRef.current.innerHTML = "";

      // Create a fresh child div element to host the editor
      // This prevents "Element already has context attribute" or dynamic re-initialization errors
      const editorDiv = document.createElement("div");
      editorDiv.style.width = "100%";
      editorDiv.style.height = "100%";
      containerRef.current.appendChild(editorDiv);

      const editorOptions = {
        value: valueRef.current,
        language: "csharp",
        theme: "vs-dark",
        fontSize: window.innerWidth < 768 ? 13 : 14,
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        minimap: { enabled: window.innerWidth >= 768 },
        lineNumbers: "on",
        roundedSelection: true,
        scrollBeyondLastLine: false,
        automaticLayout: true,
        bracketPairColorization: { enabled: true },
        folding: true,
        wordWrap: "on",
        padding: { top: 16 },
        suggest: { enabled: true },
        quickSuggestions: true,
        formatOnPaste: true,
        formatOnType: true,
      };

      const editor = window.monaco.editor.create(editorDiv, editorOptions);
      editorRef.current = editor;
      setIsEditorLoaded(true);

      // Listen for text edits
      editor.onDidChangeModelContent(() => {
        onChange(editor.getValue());
      });

      // Keyboard Shortcut Action: Ctrl + Enter or Cmd + Enter to run C# code
      editor.addCommand(window.monaco.KeyMod.CtrlCmd | window.monaco.KeyCode.Enter, () => {
        onExecute();
      });
    };

    const loadMonaco = () => {
      if (window.monaco) {
        initializeEditor();
        return;
      }

      // Check if loader.js script already exists
      const loaderId = "monaco-loader-script";
      let script = document.getElementById(loaderId) as HTMLScriptElement;

      if (!script) {
        script = document.createElement("script");
        script.id = loaderId;
        script.src = "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs/loader.js";
        script.async = true;
        document.body.appendChild(script);
      }

      checkAndInit = setInterval(() => {
        if (!isMounted) {
          if (checkAndInit) clearInterval(checkAndInit);
          return;
        }
        if (window.require) {
          if (checkAndInit) {
            clearInterval(checkAndInit);
            checkAndInit = null;
          }
          window.require.config({
            paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs" },
          });
          window.require(["vs/editor/editor.main"], () => {
            initializeEditor();
          });
        }
      }, 100);
    };

    loadMonaco();

    return () => {
      isMounted = false;
      if (checkAndInit) {
        clearInterval(checkAndInit);
      }
      if (editorRef.current) {
        editorRef.current.dispose();
        editorRef.current = null;
      }
    };
  }, []);

  // Sync parent state changes back to Editor if it drifts
  useEffect(() => {
    if (editorRef.current && editorRef.current.getValue() !== code) {
      editorRef.current.setValue(code);
    }
  }, [code]);

  // Adjust editor size when structural panel dimensions alter
  useEffect(() => {
    const handleResize = () => {
      if (editorRef.current) {
        editorRef.current.layout();
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="flex flex-col h-full bg-[#1e1e1e] rounded-xl overflow-hidden border border-[rgba(0,0,0,0.08)] select-none mr-1" id="csharp-editor-panel">
      {/* Tab bar above Monaco */}
      <div className="h-11 bg-[#151515] border-b border-white/[0.04] flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center h-full">
          {/* Program.cs tab */}
          <div className="flex items-center gap-2 px-4 h-full bg-[#1e1e1e] border-t-2 border-t-[#d97757] text-[#d4d4d4] text-xs font-mono font-medium border-r border-white/[0.04] cursor-pointer" id="active-tab">
            <FileCode className="w-3.5 h-3.5 text-[#d97757]" />
            Program.cs
          </div>
          {/* Inactive tab simulator link */}
          <button
            onClick={() => alert("Creating multi-source files requires CodeFlow Pro subscription. Try out editing your standard Program.cs sandbox!")}
            className="flex items-center gap-1.5 px-3 h-full text-white/40 hover:text-white/70 text-xs font-mono transition-colors outline-none cursor-pointer"
            id="new-file-btn"
          >
            <Plus className="w-3.5 h-3.5" />
            New File
          </button>
        </div>

        {/* Action button inside head toolbar */}
        <button
          onClick={onExecute}
          disabled={isRunning}
          className="px-4 py-1 h-7.5 bg-[#d97757] hover:bg-[#c4663f] disabled:bg-[#d97757]/60 text-white rounded-lg flex items-center gap-1.5 text-xs font-semibold cursor-pointer transition-colors outline-none select-none"
          id="editor-desktop-run-btn"
        >
          {isRunning ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3.5 h-3.5 fill-current stroke-0" />
          )}
          <span>Run</span>
          <span className="text-[10px] text-white/50 bg-black/25 px-1 rounded-sm leading-none font-mono tracking-tight hidden sm:inline">
            ⌘⏎
          </span>
        </button>
      </div>

      {/* Editor Main Container */}
      <div className="relative flex-1 min-h-0 bg-[#1e1e1e]">
        {!isEditorLoaded && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1e1e1e] text-white/45 gap-3" id="editor-loading-screen">
            <Loader2 className="w-8 h-8 animate-spin text-[#d97757]" />
            <span className="text-xs font-mono tracking-wider text-[#d4d4d4]/60">
              Initializing Secure C# Workspace...
            </span>
          </div>
        )}
        <div ref={containerRef} style={{ width: "100%", height: "100%" }} id="monaco-editor-holder" />
      </div>

      {/* Mini status indicator footer bar */}
      <div className="h-6.5 bg-[#1a1a1a] border-t border-white/[0.02] flex items-center justify-between px-3 text-[11px] text-white/45 font-mono shrink-0 select-none">
        <div className="flex items-center gap-1">
          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
          <span>runtime: lambda-8.0-alpine</span>
        </div>
        <div className="flex items-center gap-3">
          <span>col: 1, ln: 1</span>
          <span>UTF-8</span>
          <span>C#</span>
        </div>
      </div>
    </div>
  );
}
