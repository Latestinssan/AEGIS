import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { fmtMs } from "../lib/format";
import type { RunDecision, Stage } from "../types";

const STAGE_ICONS: Record<string, string> = {
  command: "⌁",
  capability: "◇",
  validate: "✓",
  risk: "△",
  clarify: "?",
  policy: "⚖",
  approve: "🛡",
  ticket: "🔑",
  execute: "⚙",
  audit: "◉",
};

const stateStyles: Record<string, string> = {
  pending: "border-white/10 bg-white/[0.02] text-slate-600",
  active: "border-cyan-300/70 text-cyan-200 shadow-glow",
  done: "border-lime-400/40 text-lime-300",
  failed: "border-rose-400/50 text-rose-300",
  skipped: "border-white/5 bg-white/[0.01] text-slate-600",
};

interface PipelineProps {
  runId: string | null;
  stages: Stage[];
  decision: RunDecision | null;
  playing: boolean;
  tickerMs?: number;
}

export function Pipeline({ runId, stages, decision, playing, tickerMs = 300 }: PipelineProps) {
  // Which stages have been revealed (played) so far.
  const [revealed, setRevealed] = useState(-1);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setRevealed(-1);
    setExpanded(null);
    if (!runId || !playing) return;
    let i = 0;
    const id = window.setInterval(() => {
      i += 1;
      setRevealed(i - 1);
      if (i >= stages.length) window.clearInterval(id);
    }, tickerMs);
    return () => window.clearInterval(id);
  }, [runId, playing, stages.length, tickerMs]);

  const displayedStages = useMemo(
    () => stages.map((s, idx) => (playing ? (idx <= revealed ? s : { ...s, state: "pending" as const }) : s)),
    [stages, revealed, playing],
  );

  const doneCount = stages.filter((s) => s.state === "done").length;
  const failedCount = stages.filter((s) => s.state === "failed").length;

  return (
    <div className="panel relative overflow-hidden p-5">
      <div className="mb-4 flex items-center justify-between">
        <div className="panel-title">Pipeline trace</div>
        <div className="flex items-center gap-3 font-mono text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-lime-400" />
            {doneCount} ok
          </span>
          {failedCount > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" />
              {failedCount} fail
            </span>
          )}
        </div>
      </div>

      <div className="relative">
        {/* vertical beam */}
        <div className="absolute bottom-2 left-[15px] top-2 w-px bg-gradient-to-b from-cyan-400/60 via-white/10 to-transparent" />
        <div className="space-y-1.5">
          {displayedStages.map((stage, idx) => {
            const isActive = stage.state === "active";
            const done = stage.state === "done";
            const failed = stage.state === "failed";
            const skipped = stage.state === "skipped";
            const expandable = Boolean(stage.data);
            return (
              <motion.div
                key={`${runId}-${stage.key}`}
                initial={{ opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.02, duration: 0.25 }}
                className="relative flex gap-3"
              >
                {/* node */}
                <div className="relative z-10 pt-1">
                  <motion.div
                    animate={
                      isActive
                        ? { scale: [1, 1.22, 1], boxShadow: ["0 0 0 0 rgba(34,211,238,0.5)", "0 0 0 10px rgba(34,211,238,0)", "0 0 0 0 rgba(34,211,238,0)"] }
                        : { scale: 1 }
                    }
                    transition={isActive ? { duration: 1, repeat: Infinity } : {}}
                    className={`grid h-8 w-8 place-items-center rounded-full border font-mono text-[13px] ${stateStyles[stage.state]}`}
                  >
                    <span>{STAGE_ICONS[stage.key] ?? "·"}</span>
                  </motion.div>
                </div>

                {/* body */}
                <div className="min-w-0 flex-1 pb-1">
                  <button
                    type="button"
                    onClick={() => (expandable ? setExpanded(expanded === stage.key ? null : stage.key) : undefined)}
                    className={`w-full rounded-xl border px-3 py-2 text-left transition-colors ${
                      expandable ? "hover:bg-white/[0.04]" : "cursor-default"
                    } ${stateStyles[stage.state]}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="font-display text-[12.5px] font-semibold tracking-wide">{stage.label}</span>
                        {done && (
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-lime-400">
                            <path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        )}
                        {failed && (
                          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-rose-400">
                            <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                          </svg>
                        )}
                        {skipped && <span className="font-mono text-[10px] text-slate-500">— skipped</span>}
                      </div>
                      <div
                        className={`font-mono text-[10.5px] ${
                          done ? "text-lime-400/80" : failed ? "text-rose-400/80" : "text-slate-600"
                        }`}
                      >
                        {stage.ms > 0 ? fmtMs(stage.ms) : ""}
                      </div>
                    </div>
                    <div className={`mt-0.5 font-mono text-[11px] leading-snug ${done ? "text-slate-400" : failed ? "text-rose-300/80" : "text-slate-500"}`}>
                      {stage.summary}
                    </div>
                  </button>

                  <AnimatePresence>
                    {expanded === stage.key && stage.data && (
                      <motion.pre
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="mt-1 overflow-hidden rounded-lg border border-white/10 bg-black/50 px-3 py-2 font-mono text-[10.5px] leading-relaxed text-cyan-100/90"
                      >
                        {JSON.stringify(stage.data, null, 2)}
                      </motion.pre>
                    )}
                  </AnimatePresence>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      {!runId && (
        <div className="py-10 text-center font-mono text-[12px] text-slate-600">
          Send a command to trace the RTQ pipeline stage-by-stage
        </div>
      )}

      {decision && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-3 flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2 font-mono text-[11px]"
        >
          <span className="text-slate-500">final decision</span>
          <span
            className={`font-semibold uppercase tracking-widest ${
              decision === "allowed"
                ? "text-lime-400"
                : decision === "denied"
                  ? "text-rose-400"
                  : decision === "approval_required"
                    ? "text-violet-300"
                    : decision === "clarification_required"
                      ? "text-amber-300"
                      : "text-rose-400"
            }`}
          >
            {decision}
          </span>
        </motion.div>
      )}
    </div>
  );
}