import { motion } from "framer-motion";
import { riskColor, riskText } from "../lib/format";
import type { RiskLevel } from "../types";

const ORDER: RiskLevel[] = ["low", "medium", "high", "critical"];

/** Fraction of the sweep reached for each level (low → sliver, critical → max). */
const FRAC: Record<RiskLevel, number> = { low: 0.08, medium: 0.34, high: 0.56, critical: 0.76 };

const CX = 120;
const CY = 120;
const R = 90;
const START = 150;
const SWEEP = 240;

const polar = (deg: number) => {
  const rad = (deg * Math.PI) / 180;
  return { x: CX + R * Math.cos(rad), y: CY + R * Math.sin(rad) };
};

const a0 = polar(START);
const a1 = polar(START + SWEEP);
const ARC_PATH = `M ${a0.x.toFixed(2)} ${a0.y.toFixed(2)} A ${R} ${R} 0 1 1 ${a1.x.toFixed(2)} ${a1.y.toFixed(2)}`;
const ARC_LEN = 2 * Math.PI * R * (SWEEP / 360);

/**
 * Animated risk gauge — level-fraction needle + sweeping progress arc.
 * Played "live" on every evaluation change.
 */
export function RiskGauge({ level, size = 240 }: { level: RiskLevel; size?: number }) {
  const frac = FRAC[level];
  const dash = `${(frac * ARC_LEN).toFixed(1)} ${ARC_LEN.toFixed(1)}`;
  const needleDeg = START + SWEEP * frac;

  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox="0 0 240 240" className="h-full w-full">
          {/* track */}
          <path d={ARC_PATH} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="14" strokeLinecap="round" />
          {/* progress arc (animated) */}
          <motion.path
            d={ARC_PATH}
            fill="none"
            stroke={riskColor[level]}
            strokeWidth="14"
            strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 10px ${riskColor[level]}66)` }}
            initial={{ strokeDasharray: `0.01 ${ARC_LEN.toFixed(1)}` }}
            animate={{ strokeDasharray: dash }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
          {/* level dots */}
          {ORDER.map((l, i) => {
            const p = polar(START + (SWEEP * i) / 3);
            const on = ORDER.indexOf(level) >= i;
            return (
              <circle
                key={l}
                cx={p.x}
                cy={p.y}
                r={4.5}
                fill={on ? riskColor[level] : "rgba(148,163,184,0.25)"}
                style={{ transition: "fill 0.4s" }}
              />
            );
          })}
          {/* hub */}
          <circle cx={CX} cy={CY} r={17} fill="rgba(4,5,11,0.9)" stroke="rgba(255,255,255,0.14)" strokeWidth="1.5" />
          <circle cx={CX} cy={CY} r={5} fill="#e2e8f0" />
        </svg>

        {/* needle — wrapper corner sits at gauge center; rotates clockwise */}
        <motion.div
          className="pointer-events-none absolute left-1/2 top-1/2"
          initial={false}
          animate={{ rotate: needleDeg - 270 }}
          transition={{ type: "spring", stiffness: 55, damping: 12 }}
          style={{ transformOrigin: "0px 0px" }}
        >
          <div
            className="h-[88px] w-[3px] rounded-full bg-gradient-to-b from-white/90 via-white/40 to-transparent"
            style={{ transform: "translateX(-50%) translateY(-100%)" }}
          />
        </motion.div>
      </div>

      {/* labels */}
      <div className="mt-1 flex w-full max-w-[230px] justify-between px-2 font-mono text-[9px] uppercase tracking-widest text-slate-500">
        {ORDER.map((l) => (
          <span key={l} className={level === l ? riskText[l] : ""}>
            {l}
          </span>
        ))}
      </div>
      <div className={`mt-1 font-display text-lg font-bold uppercase tracking-[0.3em] ${riskText[level]}`}>
        {level}
      </div>
    </div>
  );
}