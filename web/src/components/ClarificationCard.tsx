import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import type { ClarificationQuestion } from "../types";

interface ClarificationCardProps {
  capability: string;
  origin: string;
  actor: string;
  input: Record<string, unknown>;
  questions: ClarificationQuestion[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (answers: Record<string, unknown>) => void;
}

/**
 * Clarification resolver — missing security-critical parameters are gathered
 * BEFORE any authorization. No ticket is minted while questions are open.
 */
export function ClarificationCard({ capability, origin, actor, input, questions, busy, onCancel, onSubmit }: ClarificationCardProps) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const setAnswer = (field: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => ({ ...prev, [field]: "" }));
  };

  const submit = () => {
    const errs: Record<string, string> = {};
    for (const q of questions) {
      const v = answers[q.field];
      if (q.type === "confirmation" ? !v : v === undefined || v === null || v === "") {
        errs[q.field] = "required before authorization";
      }
    }
    setErrors(errs);
    if (Object.keys(errs).length === 0) onSubmit(answers);
  };

  const open = questions.length > 0;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            initial={{ scale: 0.92, y: 18, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className="panel w-full max-w-lg overflow-hidden !bg-[#080a16]/95"
          >
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl border border-amber-400/40 bg-amber-400/10 text-lg">?</span>
                <div>
                  <div className="font-display text-sm font-bold tracking-wide text-white">Clarification required</div>
                  <div className="font-mono text-[10px] text-slate-500">before authorization · no ticket minted yet</div>
                </div>
              </div>
            </div>

            <div className="space-y-4 p-5">
              <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                <div className="mb-1 panel-title">pending command</div>
                <div className="font-mono text-[12px] text-cyan-200">{capability}</div>
                <div className="font-mono text-[10px] text-slate-500">
                  {actor} · origin {origin}
                </div>
              </div>

              {questions.map((q) => (
                <div key={q.field} className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-[12px] font-semibold text-amber-200">{q.field}</div>
                    {q.type && (
                      <span className="rounded bg-white/5 px-1.5 py-px font-mono text-[9px] text-slate-500">{q.type}</span>
                    )}
                  </div>
                  <div className="mt-1 text-[11.5px] leading-relaxed text-slate-400">{q.reason}</div>

                  {q.type === "enum" ? (
                    <div className="mt-2.5 flex flex-wrap gap-1.5">
                      {(q.options ?? []).map((opt) => (
                        <button
                          key={opt}
                          onClick={() => setAnswer(q.field, opt)}
                          className={`rounded-full border px-2.5 py-1 font-mono text-[10.5px] transition-colors ${
                            answers[q.field] === opt
                              ? "border-amber-400/60 bg-amber-400/15 text-amber-200"
                              : "border-white/10 bg-white/[0.02] text-slate-400 hover:text-slate-200"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : q.type === "confirmation" ? (
                    <div className="mt-2.5 flex gap-1.5">
                      {[true, false].map((v) => (
                        <button
                          key={String(v)}
                          onClick={() => setAnswer(q.field, v)}
                          className={`rounded-full border px-3 py-1 font-mono text-[10.5px] ${
                            answers[q.field] === v
                              ? v
                                ? "border-lime-400/60 bg-lime-400/15 text-lime-200"
                                : "border-rose-400/60 bg-rose-400/15 text-rose-200"
                              : "border-white/10 bg-white/[0.02] text-slate-400"
                          }`}
                        >
                          {v ? "yes / confirm" : "no"}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input
                      value={String(answers[q.field] ?? "")}
                      onChange={(e) => setAnswer(q.field, e.target.value)}
                      placeholder={q.type === "path" ? "e.g. /workspace/notes/x.md" : `provide ${q.field}…`}
                      spellCheck={false}
                      className="mt-2.5 w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-[11.5px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-amber-400/40"
                    />
                  )}

                  {errors[q.field] && <div className="mt-1.5 font-mono text-[10px] text-rose-400">{errors[q.field]}</div>}
                </div>
              ))}

              <div className="flex gap-2.5">
                <button onClick={onCancel} disabled={busy} className="btn-ghost flex-1">
                  Cancel
                </button>
                <button onClick={submit} disabled={busy} className="btn-primary flex-[2]">
                  {busy ? "re-authorizing…" : "Submit answers · authorize"}
                </button>
              </div>
              <div className="text-center font-mono text-[9.5px] text-slate-600">
                answers are merged into the command input and the pipeline re-runs from stage 1
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}