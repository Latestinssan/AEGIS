import { useState, useCallback } from "react";
import { api } from "../api";
import type { AiSuggestionItem } from "../types";

interface AICopilotProps {
  onLoad: (suggestion: AiSuggestionItem) => void;
  onRun: (suggestion: AiSuggestionItem) => void;
}

export function AICopilot({ onLoad, onRun }: AICopilotProps) {
  const [intent, setIntent] = useState<string>("");
  const [suggestion, setSuggestion] = useState<AiSuggestionItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestion = useCallback(async () => {
    if (!intent.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api.aiSuggest(intent);
      setSuggestion(data as AiSuggestionItem);
    } catch (e) {
      setError(e instanceof Error ? e.message : "AI suggestion failed");
    } finally {
      setBusy(false);
    }
  }, [intent]);

  return (
    <div className="panel w-full max-w-md overflow-hidden bg-[#080a16]/95 p-4">
      <div className="font-display text-sm font-bold mb-2">AI Copilot</div>
      <input
        type="text"
        placeholder="Enter intent…"
        value={intent}
        onChange={(e) => setIntent(e.target.value)}
        className="w-full rounded border border-white/15 bg-black/30 p-2 text-white mb-2"
      />
      <button
        onClick={fetchSuggestion}
        disabled={busy}
        className="btn-primary w-full mb-2"
      >
        {busy ? "Generating…" : "Suggest"}
      </button>
      {error && <div className="text-rose-300 mb-2">{error}</div>}
      {suggestion && (
        <div className="border-t border-white/10 pt-2">
          <div className="font-mono text-xs mb-1">{suggestion.intent}</div>
          <pre className="text-xs mb-2 bg-black/20 p-2 rounded">{JSON.stringify(suggestion.proposal, null, 2)}</pre>
          <div className="flex gap-2">
            <button
              onClick={() => onLoad(suggestion)}
              className="btn-ghost flex-1"
            >
              Load into Deck
            </button>
            <button
              onClick={() => onRun(suggestion)}
              className="btn-primary flex-1"
            >
              Run
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
