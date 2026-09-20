import { motion } from "framer-motion";

interface TopBarProps {
  meta: { rtqVersion: string; policyVersion: string; capabilities: number } | null;
  backendUp: boolean | null;
  liveEvents: boolean;
  onOpenGuide: () => void;
}

export function TopBar({ meta, backendUp, liveEvents, onOpenGuide }: TopBarProps) {
  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-[#04050b]/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-[1700px] items-center gap-4 px-4 py-3 md:px-6">
        <div className="flex items-center gap-3">
          <motion.div
            className="relative grid h-10 w-10 place-items-center"
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
          >
            <svg viewBox="0 0 64 64" className="h-10 w-10">
              <path
                d="M32 8 54 19v26L32 56 10 45V19z"
                fill="none"
                stroke="url(#aegis-grad)"
                strokeWidth="3.5"
                strokeLinejoin="round"
              />
              <path d="M32 20 42 26v12l-10 6-10-6V26z" fill="url(#aegis-grad)" opacity="0.9" />
              <circle cx="32" cy="32" r="3.2" fill="#04050b" />
              <defs>
                <linearGradient id="aegis-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0" stopColor="#22d3ee" />
                  <stop offset="1" stopColor="#a78bfa" />
                </linearGradient>
              </defs>
            </svg>
          </motion.div>
          <div className="leading-tight">
            <div className="font-display text-lg font-bold tracking-[0.18em] text-white">
              AEGIS
              <span className="ml-2 bg-gradient-to-r from-cyan-300 to-violet-300 bg-clip-text text-transparent">
                Command Deck
              </span>
            </div>
            <div className="font-mono text-[10.5px] tracking-wider text-slate-500">
              RTQ · Risk-Adaptive Capability Security Runtime
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <StatusPill
            ok={backendUp}
            trueLabel="RTQ engine online"
            falseLabel="RTQ engine offline"
            color={backendUp ? "#a3e635" : "#fb7185"}
          />
          <StatusPill
            ok={liveEvents}
            trueLabel="live SSE"
            falseLabel="polling"
            color={liveEvents ? "#22d3ee" : "#94a3b8"}
          />
          {meta && (
            <div className="hidden rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-[11px] text-slate-300 md:block">
              <span className="text-slate-500">{meta.rtqVersion}</span>
              <span className="mx-1.5 text-slate-600">·</span>
              {meta.capabilities} capabilities
              <span className="mx-1.5 text-slate-600">·</span>
              policy <span className="text-cyan-300">{meta.policyVersion}</span>
            </div>
          )}
          <button onClick={onOpenGuide} className="btn-ghost hidden !py-1.5 text-[12px] sm:inline-flex">
            ▶ Guided tour
          </button>
          <a
            href="https://github.com/Latestinssan/RTQ"
            target="_blank"
            rel="noreferrer"
            className="btn-ghost !py-1.5 text-[12px]"
            title="RTQ on GitHub"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
              <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.55v-2.17c-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.72.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.74 2.69 1.24 3.35.94.1-.74.4-1.24.72-1.52-2.55-.29-5.23-1.28-5.23-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.38-5.25 5.67.41.35.77 1.05.77 2.12v3.15c0 .3.21.67.8.55A11.01 11.01 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
            </svg>
            RTQ
          </a>
        </div>
      </div>
    </header>
  );
}

function StatusPill({
  ok,
  trueLabel,
  falseLabel,
  color,
}: {
  ok: boolean | null;
  trueLabel: string;
  falseLabel: string;
  color: string;
}) {
  const state = ok === null ? "unknown" : ok ? "ok" : "down";
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 font-mono text-[11px]"
      title={state === "unknown" ? "checking…" : state === "ok" ? trueLabel : falseLabel}
    >
      <span className="relative flex h-2 w-2">
        {state === "ok" && (
          <span
            className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60"
            style={{ background: color }}
          />
        )}
        <span
          className="relative inline-flex h-2 w-2 rounded-full"
          style={{ background: state === "unknown" ? "#64748b" : color }}
        />
      </span>
      <span className="text-slate-300">{state === "unknown" ? "connecting…" : ok ? trueLabel : falseLabel}</span>
    </div>
  );
}