export interface Session {
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

export interface Job {
  jobId: string;
  sessionId: string;
  code: string;
  inputs: string[];
  status: "idle" | "queued" | "compiling" | "running" | "done" | "error" | "timeout";
  output: string;
  stderr: string;
  exitCode: number | null;
  executionTime: number;
  created: number;
}

export type TabType = "editor" | "terminal";
