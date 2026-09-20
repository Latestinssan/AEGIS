import { AnimatePresence, motion } from "framer-motion";
import { fmtMs, prettyJson, truncate } from "../lib/format";
import type { AuditEvent, RunResult } from "../types";

interface ResultPanelProps {
  run: RunResult | null;
  sandboxReport: Record<string, unknown> | null;
  audit: AuditEvent[];
  pending?: boolean;
}

export function ResultPanel({ run, sandboxReport, audit, pending }: ResultPanelProps) {
  return (
    <div className="panel relative overflow-hidden p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="panel-title">Outcome</div>
        {run && (
          <div className="font-mono text-[10.5px] text-slate-500">
            {run.runId} · {run.elapsedMs === undefined ? "" : `${fmtMs(run.elapsedMs)} total`}
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        {!run && !pending && (
          <motion.div key="empty" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-10 text-center font-mono text-[12px] text-slate-600">
            Awaiting an authorized operation
          </motion.div>
        )}

        {pending && (
          <motion.div key="pending" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-3 py-10">
            <Loader />
            <span className="font-mono text-[12px] text-cyan-200">routing through RTQ pipeline…</span>
          </motion.div>
        )}

        {run && <ResultBody key={run.runId} run={run} sandboxReport={sandboxReport} audit={audit} />}
      </AnimatePresence>
    </div>
  );
}

function ResultBody({ run, sandboxReport, audit }: { run: RunResult; sandboxReport: Record<string, unknown> | null; audit: AuditEvent[] }) {
  const decision = run.decision;
  const palette = {
    allowed: { ring: "border-lime-400/40", text: "text-lime-300", bg: "from-lime-400/15", icon: "✓" },
    denied: { ring: "border-rose-400/40", text: "text-rose-300", bg: "from-rose-400/15", icon: "✕" },
    approval_required: { ring: "border-violet-400/40", text: "text-violet-300", bg: "from-violet-400/15", icon: "🛡" },
    clarification_required: { ring: "border-amber-400/40", text: "text-amber-300", bg: "from-amber-400/15", icon: "?" },
    error: { ring: "border-rose-400/40", text: "text-rose-300", bg: "from-rose-400/15", icon: "!" },
  }[decision];

  const res = run.result as Record<string, unknown>;
  const execData = run.stages.find((s) => s.key === "execute")?.data as
    | { data?: unknown; sandboxed?: boolean; report?: Record<string, unknown> }
    | undefined;
  const auditIdx = run.stages.findIndex((s) => s.key === "audit");
  const sandboxed = Boolean(execData?.sandboxed ?? sandboxReport?.available);
  // Look for a real sandbox enforcement report surfaced from the execute stage.
  const report = (execData?.report ?? sandboxReport) as Record<string, unknown> | null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <motion.div
        initial={{ scale: 0.96 }}
        animate={{ scale: 1 }}
        className={`relative overflow-hidden rounded-2xl border ${palette.ring} bg-gradient-to-br ${palette.bg} to-transparent p-4`}
      >
        <div className="flex items-center gap-3">
          <div className={`grid h-11 w-11 place-items-center rounded-xl border ${palette.ring} bg-black/30 font-display text-lg ${palette.text}`}>
            {palette.icon}
          </div>
          <div className="min-w-0">
            <div className={`font-display text-lg font-bold uppercase tracking-widest ${palette.text}`}>{decision.replace("_", " ")}</div>
            <div className="truncate font-mono text-[11px] text-slate-400">
              {run.capability} v{run.version} · {run.origin} · {run.actor}
            </div>
          </div>
        </div>

        {decision === "allowed" && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <KV label="ticket" value={(res.ticketId as string) ?? ""} mono colorful />
            <KV label="risk (authoritative)" value={String(res.risk ?? "")} mono colorful />
            <KV label="approval method" value={String(res.approvalMethod ?? "")} mono />
            <KV label="expires in" value={run.result?.expiresAt ? `${Math.max(0, Math.round((Number(res.expiresAt) - Date.now()) / 1000))}s` : "—"} mono />
          </div>
        )}

        {decision === "denied" && (
          <div className="mt-3 space-y-1.5">
            <KV label="code" value={String(res.code ?? "")} mono colorful />
            <div className="text-[12.5px] leading-relaxed text-slate-300">{String(res.reason ?? "")}</div>
          </div>
        )}

        {decision === "clarification_required" && (
          <div className="mt-3 space-y-1.5">
            <div className="text-[12.5px] leading-relaxed text-amber-200/90">{String(res.reason ?? "")}</div>
            <div className="flex flex-wrap gap-1.5">
              {((res.questions as { field: string }[]) ?? []).map((q) => (
                <span key={q.field} className="chip border-amber-400/30 bg-amber-400/10 text-amber-200">
                  {q.field}
                </span>
              ))}
            </div>
          </div>
        )}

        {decision === "approval_required" && (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="chip border-violet-400/30 bg-violet-400/10 text-violet-200">{String(res.strategy ?? "")}</span>
            <span className="font-mono text-[11px] text-slate-400">challenge {String(res.challengeId ?? "").slice(0, 14)}…</span>
          </div>
        )}
      </motion.div>

      {/* Execution terminal */}
      {decision === "allowed" && (
        <div className="mt-3">
          {typeof execData?.data === "object" && execData.data !== null ? (
            <ExecTerminal data={execData.data as Record<string, unknown>} sandboxed={Boolean(execData.sandboxed)} />
          ) : (
            <div className="terminal text-xs text-slate-400">
              <span className="text-lime-400">✔</span> Capability executed successfully
            </div>
          )}
        </div>
      )}

      {/* Sandbox enforcement report */}
      {decision === "allowed" && report && (
        <div className="mt-3">
          <div className="mb-1.5 flex items-center justify-between">
            <div className="panel-title">OS sandbox enforcement</div>
            {sandboxed && <span className="chip border-lime-400/30 bg-lime-400/10 text-lime-300">sandboxed ✓</span>}
          </div>
          <SandboxReport report={report} />
          {!sandboxed && (
            <div className="mt-1.5 font-mono text-[10.5px] text-slate-500">
              This capability executes in the host process (TCB) — no OS boundary constructed.
            </div>
          )}
        </div>
      )}

      {/* Audit tail for this run */}
      {audit.length > 0 && (
        <div className="mt-3">
          <div className="mb-1.5 panel-title">audit tail (@rtq/audit · redacted)</div>
          <div className="max-h-44 space-y-1 overflow-y-auto pr-1">
            {audit.slice(-10).map((e) => (
              <AuditLine key={e.seq} event={e} />
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function ExecTerminal({ data, sandboxed }: { data: Record<string, unknown>; sandboxed: boolean }) {
  const stdout = data.stdout ?? data.content ?? data.echoed ?? data.value ?? data;
  return (
    <div className="relative overflow-hidden rounded-xl border border-white/10 bg-black/70">
      <div className="flex items-center gap-1.5 border-b border-white/10 px-3 py-1.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-500/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-lime-500/70" />
        <span className="ml-2 font-mono text-[10px] text-slate-500">aegis::exec {sandboxed ? "(sandboxed)" : ""}</span>
      </div>
      <pre className="overflow-x-auto p-3 font-mono text-[11.5px] leading-relaxed text-slate-200">
        {typeof stdout === "string" ? stdout : prettyJson(data)}
      </pre>
    </div>
  );
}

function SandboxReport({ report }: { report: Record<string, unknown> }) {
  const isolation = (report.isolation ?? {}) as Record<string, boolean>;
  const backend = String(report.backend ?? "none");
  const verified = Boolean(report.verified);
  const notes = (report.notes ?? []) as string[];
  const items = [
    ["filesystem", isolation.filesystem],
    ["network", isolation.network],
    ["process", isolation.process],
    ["environment", isolation.environment],
  ] as const;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div className="flex flex-wrap gap-1.5">
        <span className="chip border-cyan-400/30 bg-cyan-400/10 text-cyan-200">{backend}</span>
        <span className={`chip ${verified ? "border-lime-400/30 bg-lime-400/10 text-lime-300" : "border-rose-400/30 bg-rose-400/10 text-rose-300"}`}>
          {verified ? "profile verified" : "unverified"}
        </span>
        {items.map(([k, v]) => (
          <span key={k} className={`chip ${v ? "border-lime-400/25 bg-lime-400/5 text-lime-300/90" : "border-rose-400/25 bg-rose-400/5 text-rose-300/80"}`}>
            {v ? "▣" : "▢"} {k}
          </span>
        ))}
      </div>
      {notes.length > 0 && (
        <ul className="mt-2 space-y-0.5 font-mono text-[10px] text-slate-500">
          {notes.map((n) => (
            <li key={n}>· {n}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function AuditLine({ event }: { event: AuditEvent }) {
  const hasRedaction = JSON.stringify(event).includes("[REDACTED]");
  return (
    <div className="flex items-start gap-2 rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-1.5">
      <span className="mt-0.5 font-mono text-[9.5px] text-slate-600">{String(event.seq).padStart(3, "0")}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-mono text-[10px] font-semibold text-cyan-300/90">{event.event}</span>
          {hasRedaction && (
            <span className="rounded bg-rose-500/15 px-1.5 py-px font-mono text-[9px] font-bold text-rose-300 ring-1 ring-rose-400/30">
              REDACTED
            </span>
          )}
        </div>
        <div className="truncate font-mono text-[10.5px] text-slate-400">{event.message}</div>
      </div>
    </div>
  );
}

function KV({ label, value, mono, colorful }: { label: string; value: string; mono?: boolean; colorful?: boolean }) {
  const pretty = truncate(value, 40);
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5">
      <div className="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className={`text-[12px] ${mono ? "font-mono" : ""} ${colorful ? "text-cyan-300" : "text-slate-300"}`}>{pretty}</div>
    </div>
  );
}

function Loader() {
  return (
    <div className="relative h-6 w-6">
      <div className="absolute inset-0 animate-spin rounded-full border-2 border-cyan-400/20 border-t-cyan-300" />
    </div>
  );
}