import { AnimatePresence, motion } from "framer-motion";
import { useMemo, useState, type ReactNode } from "react";
import { fmtTime, hueFor, prettyJson } from "../lib/format";
import type { AuditEvent } from "../types";

interface AuditStreamProps {
  events: AuditEvent[];
  live: boolean;
  onClear: () => void;
}

/** Renders message text with [REDACTED] segments highlighted. */
function withRedaction(value: string) {
  const parts = value.split("[REDACTED]");
  if (parts.length === 1) return value;
  return parts.map((p, i) => (
    <span key={i}>
      {p}
      {i < parts.length - 1 && (
        <span className="mx-0.5 inline-block rounded bg-rose-500/20 px-1 font-bold tracking-wider text-rose-300 ring-1 ring-rose-400/40">
          [REDACTED]
        </span>
      )}
    </span>
  ));
}

function hasRedaction(e: AuditEvent): boolean {
  return e.message.includes("[REDACTED]") || JSON.stringify(e.context).includes("[REDACTED]");
}

export function AuditStream({ events, live, onClear }: AuditStreamProps) {
  const [query, setQuery] = useState("");
  const [eventFilter, setEventFilter] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  const names = useMemo(() => Array.from(new Set(events.map((e) => e.event))).sort(), [events]);
  const redactedCount = useMemo(() => events.filter(hasRedaction).length, [events]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events
      .filter((e) => (eventFilter ? e.event === eventFilter : true))
      .filter((e) => !q || e.event.toLowerCase().includes(q) || e.message.toLowerCase().includes(q))
      .slice(-140)
      .reverse();
  }, [events, query, eventFilter]);

  const filterChips = [...names].slice(0, 9);

  return (
    <div className="panel flex min-h-0 flex-col overflow-hidden">
      {/* header */}
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="panel-title">Audit stream</span>
          <span className="font-mono text-[10px] text-slate-500">@rtq/audit</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 font-mono text-[10px] text-slate-400">
            <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-cyan-400 animate-pulse" : "bg-slate-500"}`} />
            {live ? "live" : "polling"}
          </span>
          {events.length > 0 && (
            <button onClick={onClear} className="rounded-lg border border-white/10 px-2 py-1 font-mono text-[9.5px] text-slate-500 hover:text-rose-300">
              clear
            </button>
          )}
        </div>
      </div>

      {/* toolbar */}
      <div className="space-y-2 border-b border-white/10 px-4 py-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="filter events (message / name)…"
          spellCheck={false}
          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 font-mono text-[11px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-cyan-400/40"
        />
        {filterChips.length > 0 && (
          <div className="flex flex-wrap gap-1">
            <Chip active={eventFilter === null} onClick={() => setEventFilter(null)}>
              all
            </Chip>
            {filterChips.map((n) => (
              <Chip key={n} active={eventFilter === n} onClick={() => setEventFilter(eventFilter === n ? null : n)}>
                {n}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {/* stats */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2 font-mono text-[10px] text-slate-500">
        <span>
          <span className="text-slate-300">{events.length}</span> events
        </span>
        <span>
          <span className="text-rose-300">{redactedCount}</span> redacted
        </span>
        <span className="ml-auto">secrets never reach the sink</span>
      </div>

      {/* list */}
      <div className="min-h-[280px] flex-1 space-y-1.5 overflow-y-auto p-3">
        {filtered.length === 0 && (
          <div className="py-12 text-center font-mono text-[11px] text-slate-600">
            {events.length === 0 ? "No audit events yet — send a command" : "No events match the filter"}
          </div>
        )}
        <AnimatePresence initial={false}>
          {filtered.map((e) => {
            const hue = hueFor(e.event);
            const redacted = hasRedaction(e);
            const open = expanded === e.seq;
            const hasContext = Object.keys(e.context ?? {}).length > 0;
            return (
              <motion.div
                key={`${e.seq}-${e.timestamp}`}
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-white/5 bg-white/[0.02] px-2.5 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[9px] text-slate-600">{String(e.seq).padStart(3, "0")}</span>
                  <span
                    className="truncate rounded-md border px-1.5 py-px font-mono text-[10px] font-semibold"
                    style={{
                      color: `hsl(${hue} 85% 75%)`,
                      borderColor: `hsl(${hue} 85% 40% / 0.4)`,
                      background: `hsl(${hue} 85% 60% / 0.1)`,
                    }}
                  >
                    {e.event}
                  </span>
                  {e.capability && (
                    <span className="rounded bg-white/5 px-1.5 py-px font-mono text-[9px] text-slate-500">{e.capability}</span>
                  )}
                  {redacted && (
                    <span className="rounded bg-rose-500/15 px-1.5 py-px font-mono text-[9px] font-bold text-rose-300 ring-1 ring-rose-400/30">
                      REDACTED
                    </span>
                  )}
                  <span className="ml-auto shrink-0 font-mono text-[9.5px] text-slate-600">{fmtTime(e.timestamp)}</span>
                </div>
                <div className="mt-1 font-mono text-[10.5px] leading-relaxed text-slate-300">{withRedaction(e.message)}</div>
                {hasContext && (
                  <button
                    onClick={() => setExpanded(open ? null : e.seq)}
                    className="mt-1 font-mono text-[9.5px] text-slate-600 hover:text-cyan-300"
                  >
                    {open ? "▾ hide context" : `▸ context (${Object.keys(e.context).length} keys)`}
                  </button>
                )}
                <AnimatePresence>
                  {open && (
                    <motion.pre
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mt-1 overflow-hidden rounded-lg border border-white/10 bg-black/50 px-2.5 py-2 font-mono text-[9.5px] leading-relaxed text-cyan-100/80"
                    >
                      {prettyJson(e.context)}
                    </motion.pre>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-2 py-0.5 font-mono text-[9.5px] transition-colors ${
        active
          ? "border-cyan-400/50 bg-cyan-400/10 text-cyan-200"
          : "border-white/10 bg-white/[0.02] text-slate-500 hover:text-slate-300"
      }`}
    >
      {children}
    </button>
  );
}