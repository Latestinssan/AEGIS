import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { ORIGIN_HINTS, PRESETS } from "../presets";
import { riskBg, riskText } from "../lib/format";
import type { CapabilityInfo, Origin, RiskLevel } from "../types";

export type ApprovalStrategyLabel =
  | "automatic"
  | "user_confirmation"
  | "device_verification"
  | "biometric"
  | "qr"
  | "custom";

const APPROVAL_ICON: Record<string, string> = {
  automatic: "⚡",
  user_confirmation: "👤",
  device_verification: "📱",
  biometric: "👁",
  qr: "▦",
  custom: "◆",
};

interface CommandDeckProps {
  capabilities: CapabilityInfo[];
  origins: Origin[];
  busy: boolean;
  selected: string;
  origin: Origin;
  actor: string;
  inputJson: string;
  onSelect: (name: string) => void;
  onOrigin: (o: Origin) => void;
  onActor: (a: string) => void;
  onInputJson: (json: string) => void;
  onSend: () => void;
  onOpenGuide: () => void;
}

export function CommandDeck(props: CommandDeckProps) {
  const { capabilities, origins, busy, selected, origin, actor, inputJson } = props;
  const [jsonError, setJsonError] = useState<string | null>(null);

  const selectedCap = capabilities.find((c) => c.name === selected);
  const presets = PRESETS[selected] ?? [];

  useEffect(() => {
    const parsed = safeParse(inputJson);
    if (parsed === null) {
      setJsonError("Invalid JSON — command will not send");
    } else {
      setJsonError(null);
    }
  }, [inputJson]);

  const trySend = () => {
    if (safeParse(inputJson) === null) return;
    props.onSend();
  };

  const applyPreset = (p: (typeof presets)[number]) => {
    props.onInputJson(JSON.stringify(p.input, null, 2));
    if (p.origin) props.onOrigin(p.origin);
  };

  return (
    <div className="panel overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="panel-title">Command composer</div>
        <button onClick={props.onOpenGuide} className="rounded-lg border border-violet-400/30 bg-violet-400/10 px-2.5 py-1 font-mono text-[10.5px] text-violet-200 hover:bg-violet-400/20">
          ▶ guided tour
        </button>
      </div>

      <div className="space-y-4 p-4">
        {/* Capability grid */}
        <div>
          <div className="mb-2 panel-title">1 · capability (explicit registry)</div>
          <div className="grid grid-cols-1 gap-1.5">
            {capabilities.map((cap) => {
              const active = cap.name === selected;
              return (
                <button
                  key={cap.name}
                  onClick={() => props.onSelect(cap.name)}
                  className={`group relative w-full rounded-xl border px-3 py-2 text-left transition-all ${
                    active
                      ? "border-cyan-400/60 bg-cyan-400/10 shadow-glow"
                      : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.05]"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className={`font-display text-[12.5px] font-semibold ${active ? "text-cyan-200" : "text-slate-200"}`}>
                      {cap.name}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className={`chip !px-1.5 !py-0.5 text-[9.5px] ${riskBg[cap.baseRisk as RiskLevel] ?? "bg-slate-400/10 border-slate-400/20 text-slate-300"}`}>
                        {cap.baseRisk}
                      </span>
                      <span className="chip !px-1.5 !py-0.5 text-[9.5px] border-white/10 bg-white/5 text-slate-400" title={`approval: ${cap.approvalStrategy}`}>
                        {APPROVAL_ICON[cap.approvalStrategy] ?? "·"} {cap.approvalStrategy}
                      </span>
                    </span>
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-slate-500">{cap.description}</div>
                  {active && (
                    <motion.div
                      layoutId="cap-glow"
                      className="absolute inset-0 -z-10 rounded-xl bg-gradient-to-br from-cyan-400/10 to-violet-400/10"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Input builder */}
        {selectedCap && (
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="panel-title">2 · input (schema-validated)</div>
              {presets.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {presets.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => applyPreset(p)}
                      className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-0.5 font-mono text-[9.5px] text-slate-400 hover:border-cyan-400/40 hover:text-cyan-300"
                      title={p.note}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <textarea
              value={inputJson}
              onChange={(e) => props.onInputJson(e.target.value)}
              spellCheck={false}
              rows={7}
              className={`w-full resize-y rounded-xl border bg-black/50 p-3 font-mono text-[11.5px] leading-relaxed text-cyan-100 outline-none transition-colors focus:border-cyan-400/50 ${
                jsonError ? "border-rose-400/60" : "border-white/10"
              }`}
            />
            {jsonError && <div className="mt-1 font-mono text-[10.5px] text-rose-400">{jsonError}</div>}
          </div>
        )}

        {/* Origin + actor */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <div className="mb-2 panel-title">3 · origin</div>
            <div className="flex flex-wrap gap-1.5">
              {origins.map((o) => (
                <button
                  key={o}
                  onClick={() => props.onOrigin(o)}
                  title={ORIGIN_HINTS[o]}
                  className={`rounded-full border px-2.5 py-1 font-mono text-[10.5px] transition-colors ${
                    origin === o
                      ? "border-violet-400/60 bg-violet-400/15 text-violet-200 shadow-glow"
                      : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/30"
                  }`}
                >
                  {o}
                </button>
              ))}
            </div>
            <div className="mt-1.5 font-mono text-[9.5px] text-slate-600">hint: {ORIGIN_HINTS[origin]}</div>
          </div>
          <div>
            <div className="mb-2 panel-title">4 · actor</div>
            <div className="flex flex-wrap gap-1.5">
              {["sarah@acme.dev", "ci-bot@acme.dev", "orchestrator@acme.dev", "analyst@acme.dev"].map((a) => (
                <button
                  key={a}
                  onClick={() => props.onActor(a)}
                  className={`rounded-full border px-2.5 py-1 font-mono text-[10.5px] transition-colors ${
                    actor === a
                      ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
                      : "border-white/10 bg-white/[0.02] text-slate-400 hover:border-white/30"
                  }`}
                >
                  {a.split("@")[0]}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Send */}
        <div className="flex items-center gap-3">
          <button onClick={trySend} disabled={busy} className="btn-primary flex-1">
            {busy ? (
              <>
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-900/30 border-t-slate-900" />
                authorizing…
              </>
            ) : (
              <>
                <span>Send command</span>
                <span className="rounded bg-black/20 px-1.5 py-px font-mono text-[10px]">↩</span>
              </>
            )}
          </button>
          <RiskPreview selectedCap={selectedCap} origin={origin} />
        </div>
      </div>
    </div>
  );
}

function RiskPreview({ selectedCap, origin }: { selectedCap?: CapabilityInfo; origin: Origin }) {
  const base = (selectedCap?.baseRisk ?? "low") as RiskLevel;
  const escalated = origin !== "local";
  const level = useMemo((): RiskLevel => {
    return escalated ? (base === "medium" ? "high" : base === "high" ? "critical" : base) : base;
  }, [base, escalated]);
  return (
    <div className="text-right">
      <div className={`font-display text-[10px] font-semibold uppercase tracking-[0.2em] ${riskText[level]}`}>risk {level}</div>
      <div className="font-mono text-[9px] text-slate-600">base {base}{escalated ? " → +1 origin" : ""}</div>
    </div>
  );
}

function safeParse(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    /* fallthrough */
  }
  return null;
}