import { AnimatePresence, motion } from "framer-motion";
import { TOUR } from "../presets";
import { prettyJson, riskText } from "../lib/format";
import type { RiskLevel } from "../types";

interface GuideOverlayProps {
  open: boolean;
  step: number;
  total: number;
  busy: boolean;
  decision: string | null;
  risk: RiskLevel | null;
  onRun: () => void;
  onNext: () => void;
  onClose: () => void;
}

const DECISION_COLOR: Record<string, string> = {
  allowed: "text-lime-400",
  denied: "text-rose-400",
  clarification_required: "text-amber-300",
  approval_required: "text-violet-300",
  error: "text-rose-400",
};

/** Floating guided-tour card — walks the seven RTQ behaviors end to end. */
export function GuideOverlay({ open, step, total, busy, decision, risk, onRun, onNext, onClose }: GuideOverlayProps) {
  const current = TOUR[Math.min(step, TOUR.length - 1)];
  const isLast = step >= total - 1 && decision !== null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 30, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 220, damping: 24 }}
          className="fixed bottom-5 right-5 z-40 w-[400px] max-w-[calc(100vw-2.5rem)]"
        >
          <div className="panel relative overflow-hidden !bg-[#080a16]/95 shadow-glow-lg">
            {/* progress */}
            <div className="absolute inset-x-0 top-0 h-0.5 bg-white/5">
              <motion.div
                className="h-full bg-gradient-to-r from-cyan-400 to-violet-400"
                animate={{ width: `${((step + (decision ? 1 : 0)) / total) * 100}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>

            <div className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-violet-400/15 px-2 py-0.5 font-mono text-[10px] font-bold text-violet-200">
                    TOUR {step + 1}/{total}
                  </span>
                  <span className="panel-title">{current.label}</span>
                </div>
                <button onClick={onClose} className="rounded-lg px-1.5 font-mono text-slate-500 hover:text-slate-200" title="close tour">
                  ✕
                </button>
              </div>

              <p className="mt-2 text-[12.5px] leading-relaxed text-slate-300">{current.pitch}</p>

              <div className="mt-3 flex items-center gap-2">
                <span className="chip border-white/10 bg-white/5 text-slate-400">
                  <span className="text-cyan-300">{current.capability}</span>
                </span>
                {current.origin && <span className="chip border-white/10 bg-white/5 text-slate-500">{current.origin}</span>}
                {current.actor && <span className="chip border-white/10 bg-white/5 text-slate-500">{current.actor.split("@")[0]}</span>}
              </div>

              <pre className="mt-2.5 max-h-24 overflow-y-auto rounded-lg border border-white/10 bg-black/50 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-cyan-100/70">
                {prettyJson(current.input)}
              </pre>

              {decision && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2.5">
                  <div className="flex items-center justify-between rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 font-mono text-[11px]">
                    <span className="text-slate-500">outcome</span>
                    <span className={`font-semibold uppercase tracking-widest ${DECISION_COLOR[decision] ?? "text-slate-300"}`}>
                      {decision.replace("_", " ")}
                    </span>
                  </div>
                  {risk && (
                    <div className={`mt-1 text-right font-mono text-[10px] ${riskText[risk]}`}>risk {risk}</div>
                  )}
                </motion.div>
              )}

              <div className="mt-3.5 flex gap-2">
                {!decision && (
                  <button onClick={onRun} disabled={busy} className="btn-primary flex-1 !py-2 text-[12.5px]">
                    {busy ? "running…" : "▶ Run this step"}
                  </button>
                )}
                {decision && isLast && (
                  <button onClick={onClose} className="btn-primary flex-1 !py-2 text-[12.5px]">
                    Finish tour ✓
                  </button>
                )}
                {decision && !isLast && (
                  <button onClick={onNext} className="btn-primary flex-1 !py-2 text-[12.5px]">
                    Next step →
                  </button>
                )}
                {!decision && (
                  <button onClick={onNext} className="btn-ghost !py-2 text-[12.5px]">
                    skip
                  </button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}