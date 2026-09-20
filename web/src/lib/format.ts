import type { RiskLevel } from "../types";

export const riskColor: Record<RiskLevel, string> = {
  low: "#a3e635",
  medium: "#fbbf24",
  high: "#fb923c",
  critical: "#fb7185",
};

export const riskText: Record<RiskLevel, string> = {
  low: "text-lime-400",
  medium: "text-amber-300",
  high: "text-orange-400",
  critical: "text-rose-400",
};

export const riskBg: Record<RiskLevel, string> = {
  low: "bg-lime-400/10 border-lime-400/30 text-lime-300",
  medium: "bg-amber-400/10 border-amber-400/30 text-amber-200",
  high: "bg-orange-400/10 border-orange-400/30 text-orange-300",
  critical: "bg-rose-400/10 border-rose-400/30 text-rose-300",
};

export const decisionColor: Record<string, string> = {
  allowed: "lime",
  denied: "rose",
  clarification_required: "amber",
  approval_required: "violet",
  error: "rose",
};

export function fmtMs(ms: number): string {
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(2)}s`;
}

export function fmtTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function truncate(value: string, n = 26): string {
  return value.length > n ? `${value.slice(0, n)}…` : value;
}

export function prettyJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Stable hash → hue for arbitrary labels. */
export function hueFor(label: string): number {
  let h = 0;
  for (let i = 0; i < label.length; i++) h = (h * 31 + label.charCodeAt(i)) % 360;
  return h;
}