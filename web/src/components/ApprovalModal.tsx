import { AnimatePresence, motion } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import { api } from "../api";
import { useCountdown } from "../hooks/useSSE";
import { fmtMs, prettyJson } from "../lib/format";
import type { ApprovalInfo } from "../types";

type Phase = "idle" | "scanning" | "signing" | "verifying" | "done" | "denied";

export interface ApprovalResolution {
  decision: "allowed" | "denied" | "error";
  result: Record<string, unknown>;
  execution?: Record<string, unknown>;
  signedApproval?: Record<string, unknown>;
  protocol?: { step: string; detail: string }[];
}

interface ApprovalModalProps {
  info: ApprovalInfo | null;
  devices: { name: string; platform?: string }[];
  onResolved: (resolution: ApprovalResolution) => void;
  onDismiss: () => void;
}

export function ApprovalModal({ info, devices, onResolved, onDismiss }: ApprovalModalProps) {
  const open = Boolean(info);
  const strategy = info?.strategy ?? "";
  const isDevice = strategy === "qr" || strategy === "device_verification";
const isPin = strategy === "device_verification";
  const [phase, setPhase] = useState<Phase>("idle");
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState<string>("");
  const [signed, setSigned] = useState<Record<string, unknown> | null>(null);
  const [protocol, setProtocol] = useState<{ step: string; detail: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const expiresAt = info ? Number((info as ApprovalInfo & { expiresAt?: number }).expiresAt ?? 0) || null : null;
  const secondsLeft = useCountdown(expiresAt);

  useEffect(() => {
    if (open) {
      setPhase("idle");
      setBusy(false);
      setSigned(null);
      setProtocol([]);
      setError(null);
    }
  }, [open, info?.challengeId]);

  const pushProtocol = (step: string, detail: string) =>
    setProtocol((prev) => [...prev, { step, detail }]);

  const handleDeny = useCallback(async () => {
    if (!info || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (isDevice && isPin) {
        pushProtocol("device", "operator declined via PIN");
        const res = (await api.pinApprove(info.challengeId, pin, "denied")) as Record<string, unknown>;
        setPhase("denied");
        onResolved({
          decision: "denied",
          result: res,
          signedApproval: res.signedApproval as Record<string, unknown>,
          protocol: [{ step: "device", detail: "approval denied via PIN" }],
        });
        return;
      }
      if (isDevice) {
          if (isPin) {
            pushProtocol("device", "operator declined via PIN");
          } else {
            pushProtocol("device", "operator declined on-device");
          }
        const res = (await api.deviceScan(info.challengeId, "denied")) as Record<string, unknown>;
        const outcome = res.outcome as { decision?: string; result?: Record<string, unknown> } | undefined;
        setPhase("denied");
        onResolved({
          decision: (outcome?.decision ?? "denied") as ApprovalResolution["decision"],
          result: outcome?.result ?? (res as Record<string, unknown>),
          signedApproval: res.signedApproval as Record<string, unknown>,
          protocol: [{ step: "device", detail: "approval denied" }],
        });
      } else {
        const res = (await api.submitApproval(info.challengeId, {
          type: "custom",
          verified: false,
          detail: "Operator declined biometric prompt",
        })) as Record<string, unknown>;
        setPhase("denied");
        onResolved({ decision: "denied", result: res });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval request failed");
    } finally {
      setBusy(false);
    }
  }, [info, busy, isDevice, isPin, pin, onResolved]);

  const handleApprove = useCallback(async () => {
    if (!info || busy) return;
    setBusy(true);
    setError(null);
    try {
      if (isDevice) {
        if (isPin) {
          // PIN approval flow – no QR scanning
          pushProtocol("device", "operator approved via PIN");
          const res = (await api.pinApprove(info.challengeId, pin, "granted")) as Record<string, unknown>;
          setSigned(res.signedApproval as Record<string, unknown>);
          setPhase("done");
          onResolved({
            decision: "allowed",
            result: res,
            execution: res.execution as Record<string, unknown>,
            signedApproval: res.signedApproval as Record<string, unknown>,
            protocol: [{ step: "device", detail: "approved via PIN" }],
          });
          return;
        }
        // Protocol: challenge rendered → device scans & locally parses → signs → host verifies & redeems.

        setPhase("scanning");
        pushProtocol("host", "single-use challenge minted & rendered as QR");
        pushProtocol("device", "scans payload — parseChallenge ✓");
        await new Promise((r) => setTimeout(r, 650));
        setPhase("signing");
        pushProtocol("device", "user confirms on-device (platform secure storage)");
        pushProtocol("device", "signing approval with device key (HMAC-SHA256)");
        await new Promise((r) => setTimeout(r, 650));
        setPhase("verifying");
        pushProtocol("host", "verifying signature + challenge bindings (single-use)");
        const res = (await api.deviceScan(info.challengeId, "granted")) as Record<string, unknown>;
        const outcome = res.outcome as { decision?: string; result?: Record<string, unknown> } | undefined;
        pushProtocol("host", `ticket minted · redeeming · executing`);
        setSigned(res.signedApproval as Record<string, unknown>);
        setPhase((outcome?.decision ?? "denied") === "allowed" ? "done" : "denied");
        onResolved({
          decision: (outcome?.decision ?? "error") as ApprovalResolution["decision"],
          result: outcome?.result ?? (res as Record<string, unknown>),
          execution: res.execution as Record<string, unknown>,
          signedApproval: res.signedApproval as Record<string, unknown>,
          protocol: [{ step: "device", detail: "signed approval returned" }],
        });
      } else {
        pushProtocol("host", "platform biometric attestation");
        await new Promise((r) => setTimeout(r, 700));
        pushProtocol("host", "verifying biometric proof → ticket");
        const res = (await api.biometricApprove(info.challengeId, "demo-faceid·aegis")) as Record<string, unknown>;
        setPhase((res.decision ?? "denied") === "allowed" ? "done" : "denied");
        onResolved({
          decision: (res.decision ?? "error") as ApprovalResolution["decision"],
          result: (res.result as Record<string, unknown>) ?? (res as Record<string, unknown>),
          execution: res.execution as Record<string, unknown>,
          protocol: [{ step: "host", detail: "biometric proof submitted" }],
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Approval failed");
      setPhase("idle");
    } finally {
      setBusy(false);
    }
  }, [info, busy, isDevice, isPin, pin, onResolved]);

  return (
    <AnimatePresence>
      {open && info && (
        <motion.div
          className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={busy ? undefined : onDismiss}
        >
          <motion.div
            initial={{ scale: 0.92, y: 18, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            exit={{ scale: 0.95, y: 8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 26 }}
            className="panel w-full max-w-md overflow-hidden !bg-[#080a16]/95"
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5">
              <div className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 place-items-center rounded-xl border border-violet-400/40 bg-violet-400/10 text-lg">
                  {isDevice ? "▦" : "👁"}
                </span>
                <div>
                  <div className="font-display text-sm font-bold tracking-wide text-white">
                    {isDevice ? "Device verification" : "Biometric approval"}
                  </div>
                  <div className="font-mono text-[10px] text-slate-500">
                    strategy:{strategy} · single-use challenge
                  </div>
                </div>
              </div>
              {secondsLeft !== null && secondsLeft <= 30 && (
                <div
                  className={`rounded-lg px-2 py-1 font-mono text-[11px] font-bold ${
                    secondsLeft <= 10 ? "animate-flicker bg-rose-400/15 text-rose-300" : "bg-amber-400/10 text-amber-300"
                  }`}
                >
                  {secondsLeft}s
                </div>
              )}
            </div>

            <div className="space-y-4 p-5">
              {/* summary */}
              <div className="rounded-xl border border-white/10 bg-black/40 p-3">
                <div className="mb-1 panel-title">operation summary</div>
                <div className="font-mono text-[12px] text-cyan-200">{info.capability}</div>
                <pre className="mt-1 max-h-28 overflow-y-auto font-mono text-[10.5px] leading-relaxed text-slate-400">
                  {prettyJson(info.summary)}
                </pre>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <span className="chip border-violet-400/30 bg-violet-400/10 text-violet-200">risk {info.risk}</span>
                  <span className="chip border-white/10 bg-white/5 text-slate-400">origin {info.origin}</span>
                  <span className="chip border-white/10 bg-white/5 text-slate-400 font-mono">{info.challengeId.slice(0, 14)}…</span>
                </div>
              </div>

              {/* strategy body */}
              {isDevice ? (
                isPin ? (
                  <div className="space-y-3 py-4">
                    <div className="panel-title text-center">Enter Device PIN</div>
                    <div className="text-center font-mono text-[11px] text-slate-400">Default verification PIN is <span className="text-cyan-300">2468</span></div>
                    <input
                      type="password"
                      maxLength={6}
                      placeholder="PIN code (e.g. 2468)"
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      className="w-full rounded-xl border border-white/15 bg-black/50 p-3 text-center font-mono text-lg text-white placeholder-slate-600 focus:border-cyan-400 focus:outline-none"
                    />
                  </div>
                ) : (
                  <DeviceBody
                    payload={info.qrPayload}
                    phase={phase}
                    signed={signed}
                    protocol={protocol}
                    devices={devices}
                  />
                )
              ) : (
                <BiometricBody phase={phase} />
              )}

              {/* protocol readout */}
              {(protocol.length > 0 || (isDevice && phase !== "idle")) && (
                <div className="space-y-1 rounded-xl border border-white/10 bg-black/50 p-3">
                  <div className="panel-title">rtq-approval-v1 protocol</div>
                  {protocol.map((p, i) => (
                    <motion.div key={i} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} className="flex items-center gap-2 font-mono text-[10.5px]">
                      <span className="text-lime-400">✓</span>
                      <span className="w-12 text-slate-500">{p.step}</span>
                      <span className="text-slate-300">{p.detail}</span>
                    </motion.div>
                  ))}
                  {busy && (
                    <div className="flex items-center gap-2 font-mono text-[10.5px] text-cyan-300">
                      <span className="h-2 w-2 animate-ping rounded-full bg-cyan-400" />
                      {phase === "scanning" ? "device scanning challenge…" : phase === "signing" ? "signing with device key…" : "host verifying + redeeming…"}
                    </div>
                  )}
                </div>
              )}

              {error && <div className="rounded-lg border border-rose-400/30 bg-rose-400/10 px-3 py-2 font-mono text-[11px] text-rose-300">{error}</div>}

              {/* actions */}
              <div className="flex gap-2.5">
                <button onClick={handleDeny} disabled={busy} className="btn-ghost flex-1 border-rose-400/30 text-rose-200 hover:bg-rose-400/10 hover:text-rose-100">
                  Deny
                </button>
                <button onClick={handleApprove} disabled={busy || phase === "done"} className="btn-primary flex-[2]">
                  {isDevice ? (busy ? "Approving…" : "Scan & approve on device") : busy ? "Verifying…" : "Approve with biometric"}
                </button>
              </div>
              <div className="text-center font-mono text-[9.5px] text-slate-600">
                A denial or expiry kills the challenge — no ticket is ever minted.
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DeviceBody({ payload, phase, signed, protocol, devices }: { payload: string | null | undefined; phase: Phase; signed: Record<string, unknown> | null; protocol: { step: string; detail: string }[]; devices: { name: string; platform?: string }[] }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-white p-3">
          {payload ? (
            <QRCodeSVG value={payload} size={128} level="M" marginSize={0} />
          ) : (
            <div className="grid h-32 w-32 place-items-center font-mono text-[10px] text-slate-500">no payload</div>
          )}
          <div className="qr-scanline animate-scan" style={{ animationDuration: phase === "scanning" ? "1.1s" : "3s" }} />
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="panel-title">enrolled devices</div>
          {devices.map((d) => (
            <div key={d.name} className={`rounded-lg border px-2.5 py-1.5 ${phase === "scanning" ? "border-cyan-400/50 bg-cyan-400/10" : "border-white/10 bg-white/[0.03]"}`}>
              <div className="flex items-center gap-1.5 font-mono text-[11px] text-slate-200">
                <span className={phase === "scanning" ? "animate-ping text-cyan-300" : "text-lime-400"}>●</span>
                {d.name}
              </div>
              <div className="font-mono text-[9.5px] text-slate-500">{d.platform} · platform secure storage</div>
            </div>
          ))}
        </div>
      </div>

      {signed && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-xl border border-lime-400/25 bg-black/50 p-3">
          <div className="flex items-center justify-between">
            <div className="panel-title">device response (signed)</div>
            <span className="chip border-lime-400/30 bg-lime-400/10 text-lime-300">verified ✓</span>
          </div>
          <pre className="mt-1.5 overflow-x-auto font-mono text-[9.5px] leading-relaxed text-lime-100/70">{prettyJson(signed)}</pre>
        </motion.div>
      )}
    </div>
  );
}

function BiometricBody({ phase }: { phase: Phase }) {
  return (
    <div className="flex items-center justify-center py-2">
      <div className="relative">
        <motion.div
          className="absolute inset-0 rounded-full bg-violet-500/20 blur-2xl"
          animate={phase === "verifying" ? { scale: [1, 1.25, 1], opacity: [0.5, 1, 0.5] } : {}}
          transition={{ duration: 1.4, repeat: Infinity }}
        />
        <motion.div
          className="relative grid h-28 w-28 place-items-center rounded-full border-2 border-violet-400/50 bg-violet-500/10"
          animate={
            phase === "verifying"
              ? { boxShadow: ["0 0 0 0 rgba(167,139,250,0.5)", "0 0 0 14px rgba(167,139,250,0)", "0 0 0 0 rgba(167,139,250,0.5)"] }
              : {}
          }
          transition={{ duration: 1.1, repeat: Infinity }}
        >
          <svg viewBox="0 0 48 52" className="h-14 w-14">
            <g fill="none" stroke="#c4b5fd" strokeWidth="3" strokeLinecap="round">
              <path d="M10 40 Q8 30 10 22" />
              <path d="M6 44 Q3 32 6 20 Q8 14 12 11" />
              <path d="M20 44 Q18 34 20 26 Q20.5 22 22 19" strokeWidth="2.4" />
              <path d="M28 42 Q28 34 27 28" strokeWidth="2" />
              <path d="M2 48 Q-2 34 4 18 Q10 8 18 6" />
              <path d="M42 44 Q46 30 40 18 Q36 12 30 9" />
            </g>
          </svg>
        </motion.div>
        {phase === "scanning" && (
          <motion.div
            className="absolute inset-x-2 h-0.5 rounded-full bg-violet-300 shadow-glow"
            animate={{ top: ["12%", "88%"] }}
            transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </div>
    </div>
  );
}