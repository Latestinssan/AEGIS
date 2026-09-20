import { createSandbox, type EnforcementReport } from "@rtq/security";
import { WORKSPACE_DIR } from "./config.js";

export interface SandboxedCommandResult {
  ok: boolean;
  data?: {
    command: string;
    exitCode: number | null;
    stdout: string;
    stderr: string;
    sandboxed: boolean;
    report: EnforcementReport;
    /** Extra prose for the demo UI. */
    notes: string[];
  };
  error?: string;
  code?: string;
}

/**
 * Execute `command` inside a REAL OS-enforced sandbox.
 *
 * - macOS   → Seatbelt (`sandbox-exec`)
 * - Linux   → bubblewrap (`bwrap`)
 * - Windows → AppContainer + Job Objects
 *
 * The sandbox is FAIL-CLOSED: if the boundary cannot be constructed and
 * verified, the command is never run and an error is reported instead.
 */
export async function runSandboxedCommand(command: string): Promise<SandboxedCommandResult> {
  const spec = {
    filesystem: {
      read: ["/usr/bin", "/bin", "/usr/lib", "/System/Library/Frameworks", WORKSPACE_DIR],
      write: [WORKSPACE_DIR],
      execute: ["/usr/bin", "/bin", "/usr/sbin", "/sbin"],
    },
    // No network at all: the OS sandbox denies sockets regardless of what the
    // command tries to do. curl/wget/node fetch all fail → visible proof.
    network: "none",
    // The child shell may fork (needed for `sh -c`), but file execution is
    // confined to the exec allowlist above by the OS sandbox.
    environment: { allow: ["PATH", "HOME"] },
  } as const;

  let handle;
  try {
    handle = createSandbox(spec, { workspace: WORKSPACE_DIR, timeoutMs: 8_000 });
  } catch (err) {
    const code = (err as { code?: string }).code ?? "SANDBOX_UNAVAILABLE";
    return {
      ok: false,
      code,
      error: `Sandbox could not be constructed (${code}). Refusing to run the command outside the boundary (fail-closed).`,
    };
  }

  try {
    const run = await handle.execute("/bin/sh", ["-c", command]);
    const notes = [
      `Backend: ${run.report.backend} (${run.report.platform})`,
      ...run.report.notes,
    ];
    if (run.success) {
      return {
        ok: true,
        data: {
          command,
          exitCode: run.exitCode,
          stdout: run.stdout.trim(),
          stderr: run.stderr.trim(),
          sandboxed: run.sandboxed,
          report: run.report,
          notes,
        },
      };
    }
    return {
      ok: false,
      code: "COMMAND_FAILED",
      error: `Sandboxed command exited with code ${run.exitCode ?? "n/a"}.`,
      data: {
        command,
        exitCode: run.exitCode,
        stdout: run.stdout.trim(),
        stderr: run.stderr.trim(),
        sandboxed: run.sandboxed,
        report: run.report,
        notes,
      } as never,
    };
  } catch (err) {
    return {
      ok: false,
      code: "SANDBOX_EXEC_FAILED",
      error: err instanceof Error ? err.message : "Sandbox execution failed",
    };
  } finally {
    handle.close();
  }
}

/**
 * A lightweight guard for demonstrating sandbox verification even when the
 * seed workspace does not exist (e.g. tests): returns an honest report.
 */
export async function sandboxDiagnostics(): Promise<{
  available: boolean;
  report?: EnforcementReport;
  message?: string;
}> {
  try {
    const handle = createSandbox(
      {
        filesystem: { read: [WORKSPACE_DIR] },
        network: "none",
      },
      { workspace: WORKSPACE_DIR },
    );
    const report = handle.report;
    handle.close();
    return { available: true, report };
  } catch (err) {
    return {
      available: false,
      message: (err as Error).message,
    };
  }
}