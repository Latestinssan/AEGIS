import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import { api } from "../api";
import { prettyJson, riskBg, riskText } from "../lib/format";
import { ORIGIN_HINTS, PRESETS } from "../presets";
import type { LabPolicyResult, Meta, Origin, RiskLevel } from "../types";

const DECISION_PALETTE: Record<string, { text: string; chip: string }> = {
  allow: { text: "text-lime-400", chip: "border-lime-400/30 bg-lime-400/10 text-lime-300" },
  deny: { text: "text-rose-400", chip: "border-rose-400/30 bg-rose-400/10 text-rose-300" },
  requireApproval: { text: "text-violet-300", chip: "border-violet-400/30 bg-violet-400/10 text-violet-200" },
  requireVerification: { text: "text-cyan-300", chip: "border-cyan-400/30 bg-cyan-400/10 text-cyan-200" },
  requireClarification: { text: "text-amber-300", chip: "border-amber-400/30 bg-amber-400/10 text-amber-200" },
};

interface PolicyLabProps {
  meta: Meta | null;
}

export function PolicyLab({ meta }: PolicyLabProps) {
  const capabilities = meta?.capabilities ?? [];
  const initial = capabilities[3]?.name ?? "network.request";
  const [cap, setCap] = useState(initial);
  const [origin, setOrigin] = useState<Origin>("local");
  const [input, setInput] = useState(() => JSON.stringify(PRESETS[initial]?.[0]?.input ?? {}, null, 2));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<LabPolicyResult | null>(null);

  const selectCap = (name: string) => {
    setCap(name);
    setInput(JSON.stringify(PRESETS[name]?.[0]?.input ?? {}, null, 2));
    setResult(null);
  };

  const evaluate = async () => {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(input) as Record<string, unknown>;
    } catch {
      setError("Invalid input JSON");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await api.policyCheck({ capability: cap, input: parsed, origin });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Policy check failed");
    } finally {
      setBusy(false);
    }
  };

  const d = result?.policy.decision;
  const palette = DECISION_PALETTE[d?.decision ?? ""] ?? DECISION_PALETTE.requireClarification;
  const riskLevel = (result?.risk.level ?? "low") as RiskLevel;

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="panel-title">Policy check lab</span>
        <span className="font-mono text-[10px] text-slate-500">/api/lab/policy-check</span>
      </div>

      <div className="space-y-3 p-4">
        {/* capability + origin */}
        <div className="grid gap-1.5">
          {capabilities.map((c) => (
            <button
              key={c.name}
              onClick={() => selectCap(c.name)}
              className={`rounded-lg border px-2.5 py-1.5 text-left font-mono text-[10.5px] transition-colors ${
                cap === c.name
                  ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
                  : "border-white/10 bg-white/[0.02] text-slate-400 hover:text-slate-200"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(meta?.origins ?? ["local"]).map((o) => (
            <button
              key={o}
              onClick={() => setOrigin(o as Origin)}
              title={ORIGIN_HINTS[o as Origin]}
              className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${
                origin === o
                  ? "border-violet-400/60 bg-violet-400/15 text-violet-200"
                  : "border-white/10 bg-white/[0.02] text-slate-400"
              }`}
            >
              {o}
            </button>
          ))}
        </div>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          spellCheck={false}
          rows={5}
          className="w-full resize-y rounded-xl border border-white/10 bg-black/50 p-3 font-mono text-[11px] leading-relaxed text-cyan-100 outline-none focus:border-cyan-400/40"
        />

        <div className="flex items-center gap-2.5">
          <button onClick={evaluate} disabled={busy} className="btn-primary flex-1 !py-2 text-[12.5px]">
            {busy ? "evaluating…" : "Evaluate policy"}
          </button>
        </div>

        {error && <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 font-mono text-[11px] text-rose-300">{error}</div>}

        <AnimatePresence mode="wait">
          {result && (
            <motion.div key="res" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3">
              {/* Risk */}
              <div className="rounded-xl border border-white/10 bg-black/30 p-3">
                <div className="mb-1.5 panel-title">
                  risk · base {result.risk.baseLevel} → <span className={riskText[riskLevel]}>{result.risk.level}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {result.risk.contributions.map((c) => (
                    <span key={c.factor} className="chip !px-1.5 !py-0.5 text-[9.5px] border-white/10 bg-white/5 text-slate-400">
                      {c.factor}
                      {c.detail ? `: ${c.detail}` : ""}
                    </span>
                  ))}
                </div>
              </div>

              {/* Validation */}
              <div
                className={`rounded-xl border p-3 ${
                  result.validation.valid ? "border-lime-400/25 bg-lime-400/5" : "border-rose-400/25 bg-rose-400/5"
                }`}
              >
                <div className={`mb-1 font-mono text-[11px] ${result.validation.valid ? "text-lime-300" : "text-rose-300"}`}>
                  {result.validation.valid ? "✓ schema valid" : "✕ schema invalid"}
                </div>
                {!result.validation.valid &&
                  (result.validation.errors ?? []).map((er) => (
                    <div key={er.path} className="font-mono text-[10px] text-rose-200/80">
                      {er.path}: {er.message}
                    </div>
                  ))}
              </div>

              {/* Clarification */}
              {result.questions.length > 0 && (
                <div className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-3">
                  <div className="mb-1 font-mono text-[11px] text-amber-300">? security-critical parameters missing</div>
                  {result.questions.map((q) => (
                    <div key={q.field} className="font-mono text-[10px] text-amber-200/80">
                      · {q.field}
                    </div>
                  ))}
                </div>
              )}

              {/* Policy decision */}
              <div className={`rounded-xl border p-3 ${palette.chip.split(" ")[0]}`}>
                <div className="flex items-center justify-between">
                  <div className={`font-display text-base font-bold uppercase tracking-widest ${palette.text}`}>
                    {d?.decision ?? "—"}
                  </div>
                  {d?.strategy && <span className="chip border-white/10 bg-white/5 text-slate-400">{d.strategy}</span>}
                </div>
                {d?.code && <div className="mt-1 font-mono text-[10.5px] text-slate-500">code: {d.code}</div>}
                <div className="mt-1 text-[12px] leading-relaxed text-slate-300">{d?.reason}</div>
                {result.policy.matchedRules.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {result.policy.matchedRules.map((id) => {
                      const idx = Number(id.replace(/[^0-9]/g, ""));
                      const rule = Number.isFinite(idx) ? meta?.policies?.[idx] : undefined;
                      return (
                        <span
                          key={id}
                          className="rounded border border-white/10 bg-white/[0.03] px-1.5 py-0.5 font-mono text-[9.5px] text-slate-400"
                          title={rule?.reason}
                        >
                          [{id}] {rule?.kind ?? "rule"}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Strategy hint */}
              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                <span className="panel-title">approval hint</span>
                <span className="font-mono text-[11px] text-violet-200">{result.strategyHint}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="text-center font-mono text-[9px] text-slate-600">same engines · same evaluation order — no ticket, no execution</div>
      </div>
    </div>
  );
}