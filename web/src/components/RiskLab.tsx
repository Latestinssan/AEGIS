import { motion } from "framer-motion";
import { useState } from "react";
import { api } from "../api";
import { ORIGIN_HINTS } from "../presets";
import type { LabRiskResult, Meta, Origin, RiskLevel } from "../types";
import { RiskGauge } from "./RiskGauge";

interface RiskLabProps {
  meta: Meta | null;
}

const BASES: { level: RiskLevel; note: string }[] = [
  { level: "low", note: "read-only / informational" },
  { level: "medium", note: "state-changing" },
  { level: "high", note: "irreversible impact" },
  { level: "critical", note: "system boundary" },
];

const SENSITIVITY = ["none", "low", "medium", "high"] as const;

interface ToggleDef {
  key: "requiresNetwork" | "touchesSystem" | "privilegeImpact" | "financialImpact" | "reversible";
  label: string;
  defaultOn?: boolean;
}

export function RiskLab({ meta }: RiskLabProps) {
  const [base, setBase] = useState<RiskLevel>("low");
  const [origin, setOrigin] = useState<Origin>("local");
  const [sensitivity, setSensitivity] = useState<(typeof SENSITIVITY)[number]>("none");
  const [toggles, setToggles] = useState<ToggleDef[]>([
    { key: "reversible", label: "reversible", defaultOn: true },
    { key: "requiresNetwork", label: "requires network" },
    { key: "touchesSystem", label: "touches system" },
    { key: "privilegeImpact", label: "privilege impact" },
    { key: "financialImpact", label: "financial impact" },
  ]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LabRiskResult | null>(null);

  const flip = (key: ToggleDef["key"]) =>
    setToggles((prev) => prev.map((t) => (t.key === key ? { ...t, defaultOn: !t.defaultOn } : t)));

  const evaluate = async () => {
    setBusy(true);
    try {
      const body: Record<string, unknown> = { base, origin, dataSensitivity: sensitivity };
      for (const t of toggles) body[t.key] = t.defaultOn !== false;
      const res = await api.riskLab(body);
      setResult(res);
    } finally {
      setBusy(false);
    }
  };

  const level = result?.evaluation.level ?? base;

  return (
    <div className="panel overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <span className="panel-title">Risk engine lab</span>
        <span className="font-mono text-[10px] text-slate-500">@rtq/risk</span>
      </div>

      <div className="space-y-4 p-4">
        {/* base level */}
        <div>
          <div className="mb-1.5 panel-title">base level</div>
          <div className="grid grid-cols-2 gap-1.5">
            {BASES.map((b) => (
              <button
                key={b.level}
                onClick={() => setBase(b.level)}
                className={`rounded-xl border px-3 py-2 text-left transition-colors ${
                  base === b.level
                    ? "border-cyan-400/50 bg-cyan-400/10 shadow-glow"
                    : "border-white/10 bg-white/[0.02] hover:border-white/25"
                }`}
              >
                <div className={`font-display text-[12px] font-bold uppercase ${base === b.level ? "text-cyan-200" : "text-slate-300"}`}>
                  {b.level}
                </div>
                <div className="font-mono text-[9px] text-slate-500">{b.note}</div>
              </button>
            ))}
          </div>
        </div>

        {/* origin */}
        <div>
          <div className="mb-1.5 panel-title">origin</div>
          <div className="flex flex-wrap gap-1.5">
            {(meta?.origins ?? ["local"]).map((o) => (
              <button
                key={o}
                onClick={() => setOrigin(o as Origin)}
                title={ORIGIN_HINTS[o as Origin]}
                className={`rounded-full border px-2.5 py-1 font-mono text-[10.5px] transition-colors ${
                  origin === o
                    ? "border-violet-400/60 bg-violet-400/15 text-violet-200"
                    : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/25"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>

        {/* factors */}
        <div>
          <div className="mb-1.5 panel-title">adversarial + impact factors</div>
          <div className="flex flex-wrap gap-1.5">
            {toggles.map((t) => (
              <button
                key={t.key}
                onClick={() => flip(t.key)}
                className={`rounded-full border px-2.5 py-1 font-mono text-[10.5px] transition-colors ${
                  t.defaultOn
                    ? "border-amber-400/50 bg-amber-400/10 text-amber-200"
                    : "border-white/10 bg-white/[0.02] text-slate-500"
                }`}
              >
                {t.defaultOn ? "●" : "○"} {t.label}
              </button>
            ))}
          </div>
          <div className="mt-2">
            <div className="mb-1 font-mono text-[9.5px] uppercase tracking-widest text-slate-600">data sensitivity</div>
            <div className="flex flex-wrap gap-1.5">
              {SENSITIVITY.map((s) => (
                <button
                  key={s}
                  onClick={() => setSensitivity(s)}
                  className={`rounded-full border px-2.5 py-0.5 font-mono text-[10px] ${
                    sensitivity === s
                      ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
                      : "border-white/10 bg-white/[0.02] text-slate-500"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        <button onClick={evaluate} disabled={busy} className="btn-primary w-full !py-2 text-[12.5px]">
          {busy ? "evaluating…" : "Evaluate risk"}
        </button>

        <motion.div
          initial={false}
          animate={result ? { opacity: 1, y: 0 } : { opacity: 0.35, y: 0 }}
          className="rounded-2xl border border-white/10 bg-black/30 p-4"
        >
          <RiskGauge level={level} size={210} />
          {result ? (
            <div className="mt-3 space-y-1 border-t border-white/10 pt-3">
              <div className="flex items-center justify-between font-mono text-[10px] text-slate-500">
                <span>base</span>
                <span className="text-slate-300">{result.evaluation.baseLevel}</span>
              </div>
              {result.evaluation.contributions.map((c) => (
                <div key={c.factor} className="flex items-center justify-between font-mono text-[10px] text-slate-500">
                  <span>{c.factor}</span>
                  <span className="text-amber-200/90">{c.detail ?? "raised"}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-3 text-center font-mono text-[10px] text-slate-600">
              factors are advisory — only origin raises risk in v0.1.0
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}