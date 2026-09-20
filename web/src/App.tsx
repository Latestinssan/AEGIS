import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "./api";
import { ApprovalModal, type ApprovalResolution } from "./components/ApprovalModal";
import { AuditStream } from "./components/AuditStream";
import { Backdrop } from "./components/Backdrop";
import { ClarificationCard } from "./components/ClarificationCard";
import { CommandDeck } from "./components/CommandDeck";
import { GuideOverlay } from "./components/GuideOverlay";
import { Pipeline } from "./components/Pipeline";
import { PolicyLab } from "./components/PolicyLab";
import { ResultPanel } from "./components/ResultPanel";
import { RiskLab } from "./components/RiskLab";
import { TopBar } from "./components/TopBar";
import { AICopilot } from "./components/AICopilot";
import { useSSE } from "./hooks/useSSE";
import { PRESETS, TOUR } from "./presets";
import type {
  ApprovalInfo,
  AuditEvent,
  ClarificationQuestion,
  Meta,
  Origin,
  RiskLevel,
  RunResult,
  Stage,
} from "./types";

type Tab = "audit" | "policy" | "risk";

const DEFAULT_CAP = "files.read";

function safeParse(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
  } catch {
    /* fallthrough */
  }
  return null;
}

const defaultInputFor = (cap: string) => JSON.stringify(PRESETS[cap]?.[0]?.input ?? {}, null, 2);

export function App() {
  /* ------------------------------------------------------------------ */
  /* Meta / bootstrap                                                    */
  /* ------------------------------------------------------------------ */
  const [meta, setMeta] = useState<Meta | null>(null);
  const [backendUp, setBackendUp] = useState<boolean | null>(null);
  const [sandboxReport, setSandboxReport] = useState<Record<string, unknown> | null>(null);

  /* Command deck state */
  const [selected, setSelected] = useState(DEFAULT_CAP);
  const [origin, setOrigin] = useState<Origin>("local");
  const [actor, setActor] = useState("sarah@acme.dev");
  const [inputJson, setInputJson] = useState(() => defaultInputFor(DEFAULT_CAP));

  /* Run pipeline state */
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<RunResult | null>(null);
  const [playing, setPlaying] = useState(false);
  const [approvalInfo, setApprovalInfo] = useState<ApprovalInfo | null>(null);
  const [clarify, setClarify] = useState<{
    capability: string;
    origin: Origin;
    actor: string;
    input: Record<string, unknown>;
    questions: ClarificationQuestion[];
  } | null>(null);

  /* Audit + labs */
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [tab, setTab] = useState<Tab>("audit");
  const [toast, setToast] = useState<string | null>(null);

  /* Guided tour */
  const [guide, setGuide] = useState<{ open: boolean; step: number }>({ open: false, step: 0 });
  const lastAdvanced = useRef<string | null>(null);
  const auditLen = useRef(0);
  auditLen.current = audit.length;

  /* ---------------------------------------------------------------- */
  /* Bootstrap                                                         */
  /* ---------------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [m, , s, a] = await Promise.all([api.meta(), api.health(), api.sandbox(), api.audit(0, 200)]);
        if (cancelled) return;
        setMeta(m);
        setBackendUp(true);
        if (s.available && s.report) setSandboxReport(s.report);
        if (a.events.length) setAudit(a.events);
      } catch {
        if (!cancelled) setBackendUp(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---------------------------------------------------------------- */
  /* Audit refresh + SSE                                                */
  /* ---------------------------------------------------------------- */
  const refreshAudit = useCallback(async () => {
    try {
      const res = await api.audit(0, 200);
      setAudit(res.events);
    } catch {
      /* keep current view */
    }
  }, []);

  const onSSEEvent = useCallback((evt: { type?: string; seq?: number; event?: string; message?: string; timestamp?: number; capability?: string; context?: Record<string, unknown> }) => {
    if (evt.type !== "audit") return;
    setAudit((prev) => {
      const entry: AuditEvent = {
        seq: evt.seq ?? 0,
        event: evt.event ?? "EVENT",
        message: evt.message ?? "",
        timestamp: evt.timestamp ?? Date.now(),
        capability: evt.capability,
        context: evt.context ?? {},
      };
      const next = [...prev, entry];
      const dedup = next.filter(
        (e, i, arr) => arr.findIndex((x) => x.event === e.event && x.timestamp === e.timestamp && x.message === e.message) === i,
      );
      return dedup.slice(-300);
    });
  }, []);
  const { live: liveEvents } = useSSE<{
    type?: string;
    seq?: number;
    event?: string;
    message?: string;
    timestamp?: number;
    capability?: string;
    context?: Record<string, unknown>;
  }>("/api/events", onSSEEvent, true);

  /* Poll as a fallback when SSE is not live. */
  useEffect(() => {
    if (liveEvents) return;
    const id = window.setInterval(() => void refreshAudit(), 4000);
    return () => window.clearInterval(id);
  }, [liveEvents, refreshAudit]);

  /* ---------------------------------------------------------------- */
  /* Command runner                                                     */
  /* ---------------------------------------------------------------- */
  const runCommand = useCallback(
    async (overrides?: { capability?: string; input?: Record<string, unknown>; origin?: Origin; actor?: string }) => {
      if (busy) return;
      const capability = overrides?.capability ?? selected;
      const input = overrides?.input ?? safeParse(inputJson);
      const originAt = overrides?.origin ?? origin;
      const actorAt = overrides?.actor ?? actor;
      if (!input) {
        setToast("Input JSON is invalid — command blocked");
        return;
      }
      setBusy(true);
      setToast(null);
      try {
        const res = await api.runCommand({ capability, input, origin: originAt, actor: actorAt, stageDelayMs: 380 });
        setRun(res);
        setPlaying(true);
        const tick = res.tickerMs ?? 380;
        window.setTimeout(() => setPlaying(false), (res.stages.length + 1) * tick + 250);
        if (res.decision === "approval_required" && res.approvals?.length) {
          setApprovalInfo(res.approvals[0]);
        } else if (res.decision === "clarification_required") {
          const qs = (res.result.questions as ClarificationQuestion[] | undefined) ?? [];
          setClarify({ capability, origin: originAt, actor: actorAt, input, questions: qs });
        }
        void refreshAudit();
      } catch (err) {
        setToast(err instanceof Error ? err.message : "AEGIS request failed");
      } finally {
        setBusy(false);
      }
    },
    [busy, selected, inputJson, origin, actor, refreshAudit],
  );

  /* ---------------------------------------------------------------- */
  /* Approval resolution merge                                          */
  /* ---------------------------------------------------------------- */
  const resolveApproval = useCallback(
    (res: ApprovalResolution) => {
      setApprovalInfo(null);
      setRun((prev) => {
        if (!prev) return prev;
        if (res.decision !== "allowed") {
          const delay = res.decision === "denied" ? 90 : 30;
          return {
            ...prev,
            decision: res.decision,
            result: (res.result ?? prev.result) as never,
            stages: [
              ...prev.stages,
              {
                key: "approve",
                label: "Approve",
                state: res.decision === "error" ? "failed" : ("skipped" as const),
                ms: delay,
                summary: res.decision === "denied" ? "Approval declined — no ticket minted" : "Approval did not verify",
              },
            ],
          };
        }
        const result = (res.result ?? {}) as Record<string, unknown>;
        const exec = (res.execution ?? {}) as Record<string, unknown>;
        const execResult = (exec.result ?? {}) as Record<string, unknown>;
        const base = prev.stages.filter((s) => s.key !== "ticket" && s.key !== "execute" && s.key !== "audit");
        const fresh: Stage[] = [
          {
            key: "ticket",
            label: "Ticket",
            state: "done",
            ms: 56,
            summary: `Ticket ${String(result.ticketId ?? "").slice(0, 12)}… minted · ${String(result.approvalMethod ?? "signed approval")}`,
            data: { ticketId: result.ticketId, signing: "HMAC-SHA256", singleUse: true },
          },
          {
            key: "execute",
            label: "Execute",
            state: "done",
            ms: 52,
            summary: exec.sandboxed ? "Executed in verified OS sandbox" : "Executed in process-local context",
            data: { data: execResult.data, sandboxed: exec.sandboxed, report: exec.report },
          },
          {
            key: "audit",
            label: "Audit",
            state: "done",
            ms: 24,
            summary: "Approval + execution events recorded (secrets redacted)",
            data: { count: auditLen.current },
          },
        ];
        return { ...prev, decision: "allowed", result: res.result as never, stages: [...base, ...fresh] };
      });
      void refreshAudit();
    },
    [refreshAudit],
  );

  /* ---------------------------------------------------------------- */
  /* Clarification re-run                                               */
  /* ---------------------------------------------------------------- */
  const submitClarification = useCallback(
    (answers: Record<string, unknown>) => {
      if (!clarify) return;
      const merged = { ...clarify.input, ...answers };
      setClarify(null);
      void runCommand({ capability: clarify.capability, input: merged, origin: clarify.origin, actor: clarify.actor });
    },
    [clarify, runCommand],
  );

  /* ---------------------------------------------------------------- */
  /* Guided tour                                                        */
  /* ---------------------------------------------------------------- */
  const selectCapability = useCallback((cap: string) => {
    setSelected(cap);
    setInputJson(defaultInputFor(cap));
  }, []);

  const runTourStep = useCallback(() => {
    const step = TOUR[guide.step];
    if (!step) return;
    setSelected(step.capability);
    setOrigin(step.origin ?? "local");
    setActor(step.actor ?? "sarah@acme.dev");
    setInputJson(JSON.stringify(step.input, null, 2));
    void runCommand({ capability: step.capability, input: step.input, origin: step.origin, actor: step.actor });
  }, [guide.step, runCommand]);

  const advanceTour = useCallback(() => {
    setGuide((g) => {
      if (!g.open) return g;
      if (g.step >= TOUR.length - 1) return { open: false, step: g.step };
      return { open: true, step: g.step + 1 };
    });
  }, []);

  const closeTour = useCallback(() => setGuide((g) => ({ ...g, open: false })), []);

  /* Auto-advance the tour when a step resolves. */
  useEffect(() => {
    if (!guide.open || !run) return;
    const terminal = run.decision === "allowed" || run.decision === "denied" || run.decision === "error";
    if (!terminal) return;
    if (lastAdvanced.current === run.runId) return;
    lastAdvanced.current = run.runId;
    const t = window.setTimeout(() => {
      setGuide((g) => {
        if (!g.open) return g;
        if (g.step >= TOUR.length - 1) return { open: false, step: g.step };
        return { open: true, step: g.step + 1 };
      });
    }, 2600);
    return () => window.clearTimeout(t);
  }, [guide.open, run]);

  /* cmd/ctrl+enter to send */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void runCommand();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [runCommand]);

  /* toast auto-dismiss */
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const runRisk = run?.decision === "allowed" ? ((run.result.risk as RiskLevel | undefined) ?? null) : null;

  /* ---------------------------------------------------------------- */
  /* Render                                                             */
  /* ---------------------------------------------------------------- */
  return (
    <div className="relative min-h-screen text-slate-200">
      <Backdrop />
      <TopBar
        meta={
          meta
            ? { rtqVersion: meta.rtqVersion, policyVersion: meta.policyVersion, capabilities: meta.capabilities.length }
            : null
        }
        backendUp={backendUp}
        liveEvents={liveEvents}
        onOpenGuide={() => setGuide({ open: true, step: 0 })}
      />

      <main className="relative z-10 mx-auto grid max-w-[1720px] items-start gap-4 px-4 py-5 lg:grid-cols-[330px_minmax(0,1fr)] xl:grid-cols-[350px_minmax(0,1fr)_380px]">
        {/* Left — command deck */}
        <div className={guide.open ? "rounded-2xl ring-2 ring-violet-400/40" : ""}>
          <AICopilot onLoad={() => {}} onRun={() => {}} />
          <CommandDeck
            capabilities={meta?.capabilities ?? []}
            origins={meta?.origins ?? ["local"]}
            busy={busy}
            selected={selected}
            origin={origin}
            actor={actor}
            inputJson={inputJson}
            onSelect={selectCapability}
            onOrigin={setOrigin}
            onActor={setActor}
            onInputJson={setInputJson}
            onSend={() => void runCommand()}
            onOpenGuide={() => setGuide({ open: true, step: 0 })}
          />
        </div>

        {/* Center — pipeline + outcome */}
        <section className="min-w-0 space-y-4">
          <Pipeline
            runId={run?.runId ?? null}
            stages={run?.stages ?? []}
            decision={run?.decision ?? null}
            playing={playing}
            tickerMs={run?.tickerMs ?? 380}
          />
          <ResultPanel run={run} sandboxReport={sandboxReport} audit={audit} />
        </section>

        {/* Right — audit / labs */}
        <aside className="min-w-0 space-y-3">
          <TabBar tab={tab} onTab={setTab} />
          {tab === "audit" && <AuditStream events={audit} live={liveEvents} onClear={() => setAudit([])} />}
          {tab === "policy" && <PolicyLab meta={meta} />}
          {tab === "risk" && <RiskLab meta={meta} />}
        </aside>
      </main>

      {/* Approval modal */}
      <ApprovalModal info={approvalInfo} devices={meta?.devices ?? []} onResolved={resolveApproval} onDismiss={() => setApprovalInfo(null)} />

      {/* Clarification resolver */}
      <ClarificationCard
        capability={clarify?.capability ?? ""}
        origin={clarify?.origin ?? "local"}
        actor={clarify?.actor ?? ""}
        input={clarify?.input ?? {}}
        questions={clarify?.questions ?? []}
        busy={busy}
        onCancel={() => setClarify(null)}
        onSubmit={submitClarification}
      />

      {/* Guided tour */}
      <GuideOverlay
        open={guide.open}
        step={guide.step}
        total={TOUR.length}
        busy={busy}
        decision={guide.open ? run?.decision ?? null : null}
        risk={guide.open ? runRisk : null}
        onRun={() => void runTourStep()}
        onNext={advanceTour}
        onClose={closeTour}
      />

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-xl border border-rose-400/40 bg-[#160a12]/95 px-4 py-2.5 font-mono text-[12px] text-rose-200 shadow-glow-rose backdrop-blur-xl"
          >
            ⚠ {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------------------------------------------------------- */

function TabBar({ tab, onTab }: { tab: Tab; onTab: (t: Tab) => void }) {
  const items: { id: Tab; label: string; icon: string }[] = [
    { id: "audit", label: "Audit", icon: "◉" },
    { id: "policy", label: "Policy", icon: "⚖" },
    { id: "risk", label: "Risk", icon: "△" },
  ];
  return (
    <div className="panel flex p-1">
      {items.map((it) => (
        <button
          key={it.id}
          onClick={() => onTab(it.id)}
          className={`flex-1 rounded-xl px-2 py-2 font-display text-[11px] font-semibold uppercase tracking-[0.18em] transition-all ${
            tab === it.id
              ? "bg-gradient-to-r from-cyan-400/15 to-violet-400/15 text-cyan-200 shadow-glow"
              : "text-slate-500 hover:text-slate-300"
          }`}
        >
          {it.icon} {it.label}
        </button>
      ))}
    </div>
  );
}