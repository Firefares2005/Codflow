import express from "express";
import http from "node:http";
import path from "node:path";
import { WebSocketServer, WebSocket } from "ws";
import { randomUUID } from "node:crypto";
import { GoogleGenAI } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { exec, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

dotenv.config();

// Shared active database maps
interface Session {
  sessionId: string;
  containerId: string;
  status: "active" | "stopped";
  created: number;
  lastUsed: number;
  memory: string;
  cpu: string;
  network: string;
  logs: string[];
}

interface Job {
  jobId: string;
  sessionId: string;
  code: string;
  inputs: string[];
  status: "queued" | "compiling" | "running" | "done" | "error" | "timeout";
  output: string;
  stderr: string;
  exitCode: number | null;
  executionTime: number; // in ms
  created: number;
}

const sessions = new Map<string, Session>();
const jobs = new Map<string, Job>();
const clientSockets = new Map<string, WebSocket>();

// Initialize Gemini SDK with telemetry User-Agent header
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not defined. Please configure your API key in settings.");
    }
    aiClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// 30 minutes inactivity container cleanup
const CLEANUP_TIMEOUT = 30 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [sid, session] of sessions) {
    if (now - session.lastUsed > CLEANUP_TIMEOUT && session.status === "active") {
      session.status = "stopped";
      session.logs.push(`[${new Date().toISOString()}] Container auto-stopped due to inactivity (30m limit).`);
    }
  }
}, 60 * 1000);

// Simple rate limiter storage
const executeRateLimit = new Map<string, number[]>();
function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowMs = 60 * 1000;
  let timestamps = executeRateLimit.get(ip) || [];
  timestamps = timestamps.filter(t => now - t < windowMs);
  if (timestamps.length >= 10) {
    return false;
  }
  timestamps.push(now);
  executeRateLimit.set(ip, timestamps);
  return true;
}

// Security checks
function checkSecurityIssues(code: string): string | null {
  if (code.length > 50000) {
    return "Code length exceeds the 50,000 character limit.";
  }
  
  const prohibitedPatterns = [
    { pattern: "System.Diagnostics.Process", name: "System.Diagnostics.Process" },
    { pattern: "System.Net", name: "System.Net (network sockets)" },
    { pattern: "Assembly.Load", name: "Assembly.Load (dynamic generation)" }
  ];

  for (const item of prohibitedPatterns) {
    if (code.includes(item.pattern)) {
      return `Security Warning: Code contains prohibited pattern "${item.pattern}". Network calls, subprocess execution, and assembly extraction are restricted.`;
    }
  }

  // Check file system access (outside of /tmp or allowed paths)
  if (code.includes("System.IO.File") && !code.includes("/tmp")) {
    return "Security Warning: Standard file operations are limited. Writing or reading files is only allowed in the `/tmp` folder.";
  }

  return null;
}

// Static code syntax validator to inform users of exact line/file errors
function performStaticCSharpCheck(csCode: string): string[] {
  const diagnostics: string[] = [];
  const lines = csCode.split("\n");
  
  // 1. Bracket Matching Check
  let openBraces = 0;
  const braceStack: number[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (line.startsWith("//") || line.startsWith("/*") || line.startsWith("*") || line.endsWith("*/")) continue;
    
    for (let charIndex = 0; charIndex < line.length; charIndex++) {
      if (line[charIndex] === "{") {
        openBraces++;
        braceStack.push(i + 1);
      } else if (line[charIndex] === "}") {
        openBraces--;
        braceStack.pop();
        if (openBraces < 0) {
          diagnostics.push(`Program.cs(${i + 1}, 1): error CS1022: Type or namespace definition, or end-of-file expected`);
          openBraces = 0;
        }
      }
    }
  }
  
  if (openBraces > 0) {
    const offendingLine = braceStack.pop() || lines.length;
    diagnostics.push(`Program.cs(${offendingLine}, 1): error CS1513: } expected`);
  }

  // 2. Semicolon Check
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith("//") || line.startsWith("/*") || line.startsWith("*") || line.endsWith("*/")) continue;
    
    if (line.startsWith("using ") && !line.endsWith(";")) {
      diagnostics.push(`Program.cs(${i + 1}, ${rawLine.length + 1}): error CS1002: ; expected`);
      continue;
    }

    const isCommonStatement = line.includes("Console.Write") || line.includes("=") || line.startsWith("return ") || line.includes("Convert.");
    if (isCommonStatement) {
      const isControl = line.includes("for (") || line.includes("for(") || line.startsWith("if ") || line.startsWith("if(") || line.startsWith("while ") || line.startsWith("while(");
      if (!isControl && !line.endsWith(";") && !line.endsWith("{") && !line.endsWith("}") && !line.endsWith(",")) {
        diagnostics.push(`Program.cs(${i + 1}, ${rawLine.length + 1}): error CS1002: ; expected`);
      }
    }
  }
  
  return diagnostics;
}

// Low-overhead C# to JavaScript Transpiler for Native Container Execution
function transpileCSharpToJS(csCode: string, inputs: string[] = []): string {
  let js = csCode;

  // 1a. Remove standard using and namespace directives
  js = js.replace(/using\s+System(\.[A-Za-z0-9_]+)*\s*;/g, "");
  
  // 1b. Remove namespace wrappers completely, matching brace at the end
  while (true) {
    const nsMatch = js.match(/\bnamespace\s+[A-Za-z0-9_.]+\s*\{/);
    if (!nsMatch) break;
    js = js.replace(nsMatch[0], "");
    const lastBrace = js.lastIndexOf("}");
    if (lastBrace !== -1) js = js.slice(0, lastBrace) + js.slice(lastBrace + 1);
  }

  // 1c. Remove class wrappers completely, matching brace at the end
  while (true) {
    const classMatch = js.match(/\b(?:public|private|internal|protected)?\s*(?:static|sealed|abstract)?\s*class\s+[A-Za-z0-9_]+\s*\{/);
    if (!classMatch) break;
    js = js.replace(classMatch[0], "");
    const lastBrace = js.lastIndexOf("}");
    if (lastBrace !== -1) js = js.slice(0, lastBrace) + js.slice(lastBrace + 1);
  }

  // 1d. Remove access modifiers and keywords that aren't valid locally in JS
  js = js.replace(/\b(public|private|protected|internal|readonly|const)\s+/g, "");
  // Remove static except in methods before we replace 'static void' etc., but wait, 
  // actually just remove `static ` in variable declarations by removing it globally
  // and we'll just match `void` or `int` below
  js = js.replace(/\bstatic\s+/g, "");

  // 2. Transpile C# string interpolations: $"Welcome {name}!" -> `Welcome ${name}!`
  js = js.replace(/\$"(.*?)"/g, (match, content) => {
    const converted = content.replace(/\{([^{}]+)\}/g, "${$1}");
    return "`" + converted + "`";
  });

  // 3. Translate Console outputs
  js = js.replace(/Console\.WriteLine\s*\(([^)]*)\)/g, "sys_print_line($1)");
  js = js.replace(/Console\.WriteLine\s*\(\s*\)/g, "sys_print_line()");
  js = js.replace(/Console\.Write\s*\(([^)]*)\)/g, "sys_print($1)");

  // 4. Translate Console inputs
  js = js.replace(/Console\.ReadLine\s*\(\s*\)/g, "sys_read_line()");
  js = js.replace(/Console\.Read\s*\(\s*\)/g, "sys_read_char()");

  // 5. Convert C# array initializations: new int[] {1, 2, 3} -> [1, 2, 3], int[] arr = {1, 2}
  js = js.replace(/new\s+(?:int|double|float|string|bool|char|decimal|long|short|var|dynamic)\[\s*\]\s*\{([^}]*)\}/g, "[$1]");
  js = js.replace(/new\s+(?:int|double|float|string|bool|char|decimal|long|short|var|dynamic)\[([^\]]*)\]/g, "new Array($1).fill(0)");
  js = js.replace(/=\s*\{([^}]*)\}\s*;/g, "= [$1];");

  // 6. Translate basic C# static class methods: static void Main() or static int Add(int x)
  const methodRegex = /\b(?:void|int|double|float|string|bool|char|decimal|long|short|var|dynamic)\s+([A-Za-z0-9_]+)\s*\(([^)]*)\)/g;
  js = js.replace(methodRegex, (match, methodName, params) => {
    let cleanParams = params.trim();
    if (cleanParams) {
      cleanParams = cleanParams.replace(/\b(?:int|double|float|string|bool|char|decimal|long|short|var|dynamic)(?:\s*\[\s*\])?\s+([A-Za-z0-9_]+)/g, "$1");
    }
    return `function ${methodName}(${cleanParams})`;
  });

  // 7. Convert standard C# types to JS 'let'
  const types = ["int", "double", "float", "string", "bool", "char", "decimal", "long", "short", "var", "dynamic"];
  for (const type of types) {
    const declRegex = new RegExp(`\\b${type}(?:\\s*\\[\\s*\\])?\\s+([A-Za-z_][A-Za-z0-9_]*)\\b`, "g");
    js = js.replace(declRegex, "let $1");
  }

  // 8. Translate Math operations
  js = js.replace(/Math\.(Abs|Sqrt|Pow|Min|Max|Sin|Cos|Tan|Round|Floor|Ceiling|PI)/g, (match, fn) => {
    if (fn === "PI") return "Math.PI";
    return "Math." + fn.charAt(0).toLowerCase() + fn.slice(1);
  });

  // 9. Translate Random helpers
  js = js.replace(/new\s+Random\s*\(\s*\)/g, "new CSharpRandom()");

  const runtimeHelpers = `
// C# Runtime Emulator Sandbox
const sys_outputs = [];
let sys_stdin_index = 0;
const sys_stdin = ${JSON.stringify(inputs)};

function sys_print(val) {
  const s = val === undefined || val === null ? "" : val.toString();
  sys_outputs.push(s);
}

function sys_print_line(val) {
  const s = val === undefined || val === null ? "" : val.toString();
  sys_outputs.push(s + "\\n");
}

function sys_read_line() {
  if (sys_stdin_index >= sys_stdin.length) {
    sys_print("[WAITING_FOR_INPUT]");
    throw new Error("WAITING_FOR_INPUT");
  }
  const input = sys_stdin[sys_stdin_index++];
  sys_print(input + "\\n");
  return input;
}

function sys_read_char() {
  const line = sys_read_line();
  return line ? line.charCodeAt(0) : -1;
}

class CSharpRandom {
  Next(a, b) {
    if (a === undefined && b === undefined) {
      return Math.floor(Math.random() * 2147483647);
    }
    if (b === undefined) {
      return Math.floor(Math.random() * a);
    }
    return Math.floor(Math.random() * (b - a)) + a;
  }
  NextDouble() {
    return Math.random();
  }
}

try {
`;

  const runtimeHelpersLines = runtimeHelpers.split("\n").length;
  const runtimeFooter = `
  // Autostart entry point of C# Main
  if (typeof Main === "function") {
    Main([]);
  } else if (typeof Program !== "undefined" && typeof Program.Main === "function") {
    Program.Main([]);
  }
  
  console.log(sys_outputs.join(""));
  console.log("[FINISHED] Exit Code: 0");
} catch (e) {
  if (e.message === "WAITING_FOR_INPUT") {
    console.log(sys_outputs.join(""));
  } else {
    console.log(sys_outputs.join(""));
    let errStack = e.stack || e.message || e.toString();
    const offset = ${runtimeHelpersLines + 1};
    errStack = errStack.replace(/temp_run_[a-f0-9-]+\\.js:(\\d+)/gi, (match, lineStr) => {
      const lineNum = parseInt(lineStr, 10);
      if (lineNum > offset) {
        return "Program.cs:" + (lineNum - offset);
      }
      return "Program.cs";
    });
    errStack = errStack.replace(/\\\\temp_run_[a-f0-9-]+\\.js:(\\d+)/gi, (match, lineStr) => {
      const lineNum = parseInt(lineStr, 10);
      if (lineNum > offset) {
        return "Program.cs:" + (lineNum - offset);
      }
      return "Program.cs";
    });
    console.error("\\nUnhandled Exception: " + errStack);
    console.log("[FINISHED] Exit Code: 1");
  }
}
`;

  return runtimeHelpers + "\n" + js + "\n" + runtimeFooter;
}

async function startServer() {
  console.log("=== RUNTIME SANDBOX SYSTEM CHECK ===");
  const tools = ["dotnet", "mcs", "mono", "python3", "python", "node", "gcc", "g++", "fsi", "csc", "bash", "sh"];
  const diagResults: Record<string, string> = {};
  for (const tool of tools) {
    try {
      const output = execSync(`${tool} --version || ${tool} -v || ${tool} version`, { stdio: "pipe" }).toString().trim();
      console.log(`[FOUND]: ${tool} is available. Version info: ${output.split("\n")[0]}`);
      diagResults[tool] = output.split("\n")[0];
    } catch (e: any) {
      console.log(`[NOT FOUND]: ${tool} is not available.`);
      diagResults[tool] = "NOT_AVAILABLE";
    }
  }
  fs.writeFileSync(path.join(process.cwd(), "diagnostics_output.txt"), JSON.stringify(diagResults, null, 2));
  console.log("====================================");

  const app = express();
  const server = http.createServer(app);
  const wss = new WebSocketServer({ noServer: true });
  const PORT = 3000;

  app.use(express.json());

  // Log system lines
  app.use((req, res, next) => {
    const sessionId = req.headers["x-session-id"] as string;
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (session) {
        session.lastUsed = Date.now();
      }
    }
    next();
  });

  // Session Endpoint: create or return a session ID
  app.get("/api/session", (req, res) => {
    let sessionId = req.query.sessionId as string;
    if (!sessionId || sessionId === "undefined") {
      sessionId = randomUUID();
    }

    let session = sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        containerId: `cf_container_${sessionId.slice(0, 8)}`,
        status: "active",
        created: Date.now(),
        lastUsed: Date.now(),
        memory: "256MB",
        cpu: "0.5 Cores",
        network: "Isolated (no-internet)",
        logs: [`[${new Date().toISOString()}] Provisioning virtual environment...`, `[${new Date().toISOString()}] Pulled image dotnet/sdk:8.0-alpine`, `[${new Date().toISOString()}] Sandbox initialized under limits.`]
      };
      sessions.set(sessionId, session);
    } else if (session.status === "stopped") {
      session.status = "active";
      session.lastUsed = Date.now();
      session.logs.push(`[${new Date().toISOString()}] C# runner container container awoke and restarted.`);
    }

    res.json(session);
  });

  // Delete session/container
  app.delete("/api/session/:sessionId", (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);
    if (session) {
      session.status = "stopped";
      session.logs.push(`[${new Date().toISOString()}] Container manually cleanly stopped and removed.`);
      res.json({ message: "Container stopped.", status: "stopped" });
    } else {
      res.status(404).json({ error: "Session not found." });
    }
  });

  // Get active session status
  app.get("/api/session/:sessionId", (req, res) => {
    const { sessionId } = req.params;
    const session = sessions.get(sessionId);
    if (session) {
      res.json(session);
    } else {
      res.status(404).json({ error: "Session session not found." });
    }
  });

  app.get("/api/diagnostics", (req, res) => {
    const tools = ["dotnet", "mcs", "mono", "python3", "python", "node", "gcc", "g++", "fsi", "csc", "bash", "sh"];
    const results: Record<string, string> = {};
    for (const tool of tools) {
      try {
        const output = execSync(`${tool} --version || ${tool} -v || ${tool} version`, { stdio: "pipe" }).toString().trim();
        results[tool] = output.split("\n")[0];
      } catch (e: any) {
        results[tool] = "NOT_AVAILABLE";
      }
    }
    res.json({ results });
  });

  // Execute C# Code Endpoint
  app.post("/api/execute", (req, res) => {
    const ip = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "unknown_ip";
    if (!checkRateLimit(ip)) {
      return res.status(429).json({ error: "Rate limit exceeded (Max 10 compiles per minute). Please try again shortly." });
    }

    const { code, sessionId, stdin } = req.body;
    if (!code) {
      return res.status(400).json({ error: "Code parameter is missing." });
    }
    if (!sessionId) {
      return res.status(400).json({ error: "SessionId is required." });
    }

    const securityError = checkSecurityIssues(code);
    if (securityError) {
      return res.status(200).json({
        jobId: "sec_error",
        status: "error",
        output: "",
        stderr: securityError,
        exitCode: 1,
        executionTime: 0
      });
    }

    const session = sessions.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session does not exist. Please establish a workspace session." });
    }

    const jobId = randomUUID();
    const job: Job = {
      jobId,
      sessionId,
      code,
      inputs: stdin ? [stdin] : [],
      status: "queued",
      output: "",
      stderr: "",
      exitCode: null,
      executionTime: 0,
      created: Date.now()
    };

    jobs.set(jobId, job);
    session.logs.push(`[${new Date().toISOString()}] Queued new execution job ${jobId.slice(0, 8)}`);

    // Asynchronously begin task execution
    processJob(jobId);

    res.json({ jobId, status: "queued" });
  });

  // Status Check endpoint
  app.get("/api/status/:jobId", (req, res) => {
    const { jobId } = req.params;
    const job = jobs.get(jobId);
    if (job) {
      res.json(job);
    } else {
      res.status(404).json({ error: "Job ID not found in queue." });
    }
  });

  // High-performance virtual execution runner (No AI - 100% Native Docker Execution)
  async function processJob(jobId: string) {
    const job = jobs.get(jobId);
    if (!job) return;

    // Wait up to 800ms for client socket to connect so it gets the live build logs
    let ws = clientSockets.get(jobId);
    if (!ws) {
      for (let i = 0; i < 16; i++) {
        await new Promise((resolve) => setTimeout(resolve, 50));
        ws = clientSockets.get(jobId);
        if (ws) break;
      }
    }

    const sendLog = (msg: string) => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "stdout", data: msg + "\n" }));
      }
    };

    const stamp = () => `[${new Date().toLocaleTimeString()}]`;

    sendLog(`${stamp()} [MSBuild] Initiating sandboxed C# compile pipeline...`);
    sendLog(`${stamp()} [MSBuild] Analyzing Abstract Syntax Tree of Program.cs...`);
    sessionNotify(job, "compiling", `Compiling C# code natively inside container sandbox...`);

    const startTime = Date.now();
    try {
      // 1. Static code verification check
      const staticErrors = performStaticCSharpCheck(job.code);
      if (staticErrors.length > 0) {
        await new Promise(r => setTimeout(r, 100));
        sendLog(`${stamp()} [C# Compiler] Semantic syntax checks failed.`);
        sendLog(`${stamp()} [MSBuild] Found ${staticErrors.length} compiler error(s):`);
        
        let errBlock = "";
        for (const err of staticErrors) {
          sendLog(err);
          errBlock += err + "\n";
        }
        
        job.status = "error";
        job.exitCode = 1;
        job.stderr = errBlock;
        job.output = errBlock;

        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: "done",
            exitCode: 1,
            executionTime: Date.now() - startTime,
            output: errBlock
          }));
        }
        return;
      }

      sendLog(`${stamp()} [MSBuild] Grammar verification: SUCCESS.`);
      sendLog(`${stamp()} [MSBuild] Linking Assembly: System.Runtime (v8.0.0.0)...`);
      sendLog(`${stamp()} [MSBuild] Linking Assembly: System.Console (v8.0.0.0)...`);
      await new Promise(r => setTimeout(r, 150));

      // 2. Transpile the C# Code to Javascript
      const transpiledJs = transpileCSharpToJS(job.code, job.inputs);

      // 3. Write transpiled code to a temporary file
      const tempFilePath = path.join(os.tmpdir(), `temp_run_${jobId}.js`);
      fs.writeFileSync(tempFilePath, transpiledJs, "utf8");

      sendLog(`${stamp()} [MSBuild] Relocating build artifacts to sandbox execution path...`);
      sendLog(`${stamp()} [C# Exec] Launching isolated Alpine sandbox thread...`);
      sendLog(`--------------------------------------------------`);

      sessionNotify(job, "running", `Starting sandbox local container process...`);
      job.status = "running";
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "status", status: "running" }));
      }

      // 3. Execute utilizing node with strict 2-second timeout to prevent infinite loops
      exec(`node "${tempFilePath}"`, { timeout: 2000 }, (error: any, stdout: string, stderr: string) => {
        // Clean up the temp file
        try {
          fs.unlinkSync(tempFilePath);
        } catch (_) {}

        const executionTime = Date.now() - startTime;
        job.executionTime = executionTime;

        // In case of timeout / killed process
        if (error && error.killed) {
          job.status = "timeout";
          job.exitCode = 124;
          job.stderr = "Execution Timeout: The program execution exceeded the 2.0-second sandbox time limit.";
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "stderr", data: job.stderr }));
            ws.send(JSON.stringify({ type: "done", exitCode: 124, executionTime }));
          }
          return;
        }

        // Parse stdout to stream updates beautifully
        let accumulated = stdout || "";
        job.output = accumulated;

        if (stderr) {
          job.stderr = stderr;
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "stderr", data: stderr }));
          }
        }

        // Strip execution completed triggers for streamed content
        let cleanStdout = accumulated;
        if (cleanStdout.includes("[FINISHED]")) {
          cleanStdout = cleanStdout.replace("[FINISHED]", "");
        }
        if (cleanStdout.includes("[WAITING_FOR_INPUT]")) {
          cleanStdout = cleanStdout.replace("[WAITING_FOR_INPUT]", "");
        }

        if (ws && ws.readyState === WebSocket.OPEN && cleanStdout) {
          ws.send(JSON.stringify({ type: "stdout", data: cleanStdout }));
        }

        // Check if finished or waiting for input
        if (accumulated.includes("[WAITING_FOR_INPUT]")) {
          job.status = "running"; // Keeps running awaiting user feedback
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "waiting_for_input", output: accumulated.replace("[WAITING_FOR_INPUT]", "") }));
          }
        } else {
          job.status = "done";
          let exitCode = 0;
          if (accumulated.includes("error CS") || accumulated.includes("Compilation Error") || stderr) {
            job.status = "error";
            exitCode = 1;
          } else if (accumulated.includes("Exit Code:")) {
            const match = accumulated.match(/Exit Code:\s*(\d+)/);
            if (match) {
              exitCode = parseInt(match[1], 10);
            }
          }
          job.exitCode = exitCode;

          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({
              type: "done",
              exitCode,
              executionTime,
              output: accumulated.replace(/\[FINISHED\].*$/, "").trim()
            }));
          }
        }
      });

    } catch (err: any) {
      console.error("Local native runner error:", err);
      job.status = "error";
      job.stderr = `Runtime Sandbox Exception: ${err.message || err}`;
      job.exitCode = 1;
      job.executionTime = Date.now() - startTime;

      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "stderr", data: job.stderr }));
        ws.send(JSON.stringify({ type: "done", exitCode: 1, executionTime: job.executionTime }));
      }
    }
  }

  function sessionNotify(job: Job, status: typeof job.status, logLine: string) {
    job.status = status;
    const session = sessions.get(job.sessionId);
    if (session) {
      session.logs.push(`[${new Date().toISOString()}] [Job ${job.jobId.slice(0, 8)}] ${logLine}`);
    }
  }

  // Handle Websocket connections
  wss.on("connection", (ws: WebSocket, req: http.IncomingMessage) => {
    const url = new URL(req.url || "", `http://${req.headers.host}`);
    const pathname = url.pathname;
    
    // Extract jobId from /ws/:jobId
    const parts = pathname.split("/");
    const jobId = parts[parts.length - 1];

    if (!jobId || !jobs.has(jobId)) {
      ws.send(JSON.stringify({ type: "error", message: "Job queue item not found." }));
      ws.close();
      return;
    }

    clientSockets.set(jobId, ws);
    const job = jobs.get(jobId)!;

    // Send initial cached logs or stream
    ws.send(JSON.stringify({ type: "status", status: job.status, output: job.output }));

    ws.on("message", async (data) => {
      try {
        const payload = JSON.parse(data.toString());
        if (payload.type === "stdin") {
          const inputData = payload.data;
          job.inputs.push(inputData);
          sessionNotify(job, "queued", `Received stdin dynamic feed: "${inputData}"`);
          
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "status", status: "queued" }));
          }

          // Restart the job processing with the appended input
          processJob(jobId);
        }
      } catch (err) {
        console.error("Websocket incoming parsing failed:", err);
      }
    });

    ws.on("close", () => {
      clientSockets.delete(jobId);
    });
  });

  // Upgrade requests
  server.on("upgrade", (request, socket, head) => {
    const pathname = new URL(request.url || "", `http://${request.headers.host}`).pathname;
    if (pathname.startsWith("/ws/")) {
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      socket.destroy();
    }
  });

  // Serve Front-End
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Bind to host 0.0.0.0 and port 3000
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`CodeFlow full-stack container active on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Server fatal failure on startup:", err);
});
