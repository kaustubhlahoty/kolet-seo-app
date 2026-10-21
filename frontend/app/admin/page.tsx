"use client";
import { useState, useEffect } from "react";
import { Settings, Key, CheckCircle, AlertCircle, Loader2, Wifi } from "lucide-react";

type ConfigInfo = { set: boolean; updated_at?: string };
type ConfiguredState = Record<string, ConfigInfo>;

export default function AdminSettingsPage() {
  const [configured, setConfigured]     = useState<ConfiguredState>({});
  const [hfApiKeyId,  setHfApiKeyId]    = useState("");
  const [hfSecretKey, setHfSecretKey]   = useState("");
  const [hfAccessToken,  setHfAccessToken]  = useState("");
  const [hfRefreshToken, setHfRefreshToken] = useState("");
  const [saving,      setSaving]        = useState(false);
  const [saveResult,  setSaveResult]    = useState<{ ok: boolean; message: string } | null>(null);

  async function loadStatus() {
    const d = await fetch("/api/admin/settings").then(r => r.json());
    setConfigured(d.configured ?? {});
  }

  useEffect(() => { loadStatus(); }, []);

  // ── API key save ──
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveResult(null);

    const payload: Record<string, string> = {};
    if (hfApiKeyId.trim())     payload.higgsfield_api_key_id = hfApiKeyId.trim();
    if (hfSecretKey.trim())    payload.higgsfield_secret_key = hfSecretKey.trim();
    if (hfAccessToken.trim())  payload.hf_access_token = hfAccessToken.trim();
    if (hfRefreshToken.trim()) payload.hf_refresh_token = hfRefreshToken.trim();

    if (Object.keys(payload).length === 0) {
      setSaveResult({ ok: false, message: "Enter at least one value to save." });
      setSaving(false);
      return;
    }

    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      setSaveResult({ ok: true, message: `Saved: ${data.updated.join(", ")}` });
      setHfApiKeyId(""); setHfSecretKey("");
      setHfAccessToken(""); setHfRefreshToken("");
      await loadStatus();
    } catch (err: any) {
      setSaveResult({ ok: false, message: err.message });
    } finally {
      setSaving(false);
    }
  }

  // ── &nbsp; cleanup ──
  const [nbspScanning, setNbspScanning] = useState(false);
  const [nbspApplying, setNbspApplying] = useState(false);
  const [nbspResult, setNbspResult]     = useState<any>(null);
  const [nbspError, setNbspError]       = useState("");

  async function scanNbsp() {
    setNbspScanning(true); setNbspError(""); setNbspResult(null);
    try {
      const res = await fetch("/api/admin/clean-nbsp");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setNbspResult(data);
    } catch (e: any) {
      setNbspError(e.message);
    } finally {
      setNbspScanning(false);
    }
  }

  async function applyNbsp() {
    setNbspApplying(true); setNbspError("");
    try {
      const res = await fetch("/api/admin/clean-nbsp", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Apply failed");
      setNbspResult(data);
    } catch (e: any) {
      setNbspError(e.message);
    } finally {
      setNbspApplying(false);
    }
  }

  const isConnected = !!configured.hf_access_token?.set;
  const tokenAge    = configured.hf_access_token?.updated_at
    ? Math.round((Date.now() - new Date(configured.hf_access_token.updated_at).getTime()) / 3600000)
    : null;

  return (
    <div className="max-w-2xl mx-auto px-8 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Settings size={22} className="text-kolet-yellow" />
        <h1 className="text-xl font-semibold text-white">Admin Settings</h1>
      </div>

      {/* ── Higgsfield Account (session token) ── */}
      <form onSubmit={save}>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Wifi size={16} className="text-kolet-yellow" />
            <h2 className="text-sm font-semibold text-white">Higgsfield Account</h2>
            <span className="ml-1 text-xs bg-kolet-yellow/10 text-kolet-yellow px-2 py-0.5 rounded-full">Ultra Plan</span>
          </div>
          <p className="text-xs text-gray-500 mb-5">
            Image generation uses your Ultra Plan credits automatically while this is connected. Tokens refresh
            automatically from here — no manual work needed after the first import.
          </p>

          <div className="flex items-center gap-3 mb-5">
            <StatusBadge
              label={isConnected ? `Connected${tokenAge !== null ? ` · refreshed ${tokenAge}h ago` : ""}` : "Not connected"}
              ok={isConnected}
            />
          </div>

          <div className="mb-5 p-4 bg-gray-800/40 border border-gray-700 rounded-lg">
            <p className="text-xs text-gray-400 mb-2">
              Higgsfield retired the in-app device login (the old &quot;Connect&quot; button no longer works — their
              CLI now uses a browser+localhost OAuth flow that can&apos;t run on a hosted server). To connect your
              Ultra Plan account:
            </p>
            <ol className="text-xs text-gray-500 list-decimal list-inside space-y-1 mb-3">
              <li>On your own machine, run <code className="text-gray-400 font-mono">npx @higgsfield/cli auth login</code> and approve in the browser.</li>
              <li>Run <code className="text-gray-400 font-mono">cat ~/.config/higgsfield/credentials.json</code> to view <code className="text-gray-400 font-mono">access_token</code> and <code className="text-gray-400 font-mono">refresh_token</code>.</li>
              <li>Paste both below and save.</li>
            </ol>

            <div className="space-y-3 mb-4">
              <Field label="Access Token" placeholder="paste access_token from credentials.json" value={hfAccessToken} onChange={setHfAccessToken} secret />
              <Field label="Refresh Token" placeholder="paste refresh_token from credentials.json" value={hfRefreshToken} onChange={setHfRefreshToken} secret />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-kolet-yellow text-kolet-black text-sm font-medium hover:bg-kolet-yellow/90 disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save session tokens
            </button>
          </div>
        </div>

        {/* ── API Key fallback ── */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-1">
            <Key size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-white">Higgsfield API Key</h2>
            <span className="ml-1 text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">Fallback</span>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Used automatically if the account above is not connected or its session can&apos;t be refreshed. Requires
            separate API credits on <span className="text-gray-400 font-mono">platform.higgsfield.ai</span>.
          </p>

          <div className="flex gap-3 mb-4">
            <StatusBadge label="API Key ID"  ok={!!configured.higgsfield_api_key_id?.set} />
            <StatusBadge label="Secret Key"  ok={!!configured.higgsfield_secret_key?.set} />
          </div>

          <div className="space-y-3 mb-4">
            <Field label="API Key ID" placeholder="90fdd7c6-xxxx-xxxx-xxxx-xxxxxxxxxxxx" value={hfApiKeyId} onChange={setHfApiKeyId} />
            <Field label="Secret Key" placeholder="3a5789e6…" value={hfSecretKey} onChange={setHfSecretKey} secret />
          </div>

          <div className="flex items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-700 text-white text-sm font-medium hover:bg-gray-600 disabled:opacity-50 transition-colors"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              Save API key
            </button>

            {saveResult && (
              <div className={`flex items-center gap-1.5 text-xs ${saveResult.ok ? "text-green-400" : "text-red-400"}`}>
                {saveResult.ok ? <CheckCircle size={13} /> : <AlertCircle size={13} />}
                {saveResult.message}
              </div>
            )}
          </div>
        </div>
      </form>

      {/* ── Maintenance ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mt-6">
        <div className="flex items-center gap-2 mb-1">
          <Settings size={16} className="text-gray-400" />
          <h2 className="text-sm font-semibold text-white">Maintenance</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Scan existing articles for stray &amp;nbsp; left in plain-text fields (Post Title, Read Time, Intro, SEO Title, SEO Description). Never touches Key Takeaways, Cover Image, or Post Content.
        </p>

        <div className="flex items-center gap-3 mb-3">
          <button
            onClick={scanNbsp}
            disabled={nbspScanning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-700 text-white text-sm font-medium hover:bg-gray-600 disabled:opacity-50 transition-colors"
          >
            {nbspScanning && <Loader2 size={14} className="animate-spin" />}
            Scan for &amp;nbsp;
          </button>
          {nbspResult?.mode === "dry_run" && nbspResult.would_update > 0 && (
            <button
              onClick={applyNbsp}
              disabled={nbspApplying}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-kolet-yellow text-kolet-black text-sm font-medium hover:bg-kolet-yellow/90 disabled:opacity-50 transition-colors"
            >
              {nbspApplying && <Loader2 size={14} className="animate-spin" />}
              Clean {nbspResult.would_update} article{nbspResult.would_update === 1 ? "" : "s"}
            </button>
          )}
        </div>

        {nbspError && (
          <div className="flex items-center gap-1.5 text-xs text-red-400 mb-2">
            <AlertCircle size={13} /> {nbspError}
          </div>
        )}

        {nbspResult && (
          <div className="text-xs text-gray-400 space-y-1.5">
            <p className="flex items-center gap-1.5">
              <CheckCircle size={12} className="text-green-400" />
              {nbspResult.mode === "applied"
                ? `Updated ${nbspResult.updated} of ${nbspResult.total_scanned} scanned.`
                : `${nbspResult.would_update} of ${nbspResult.total_scanned} scanned would be updated.`}
            </p>
            {(nbspResult.changes || []).length > 0 && (
              <div className="bg-gray-800/50 rounded-lg p-3 space-y-1 max-h-48 overflow-y-auto">
                {nbspResult.changes.map((c: any) => (
                  <p key={c.id} className="font-mono text-gray-500 text-xs">
                    {c.id}: &quot;{c.title_before}&quot; → &quot;{c.title_after}&quot;
                  </p>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border ${
      ok ? "border-green-700/40 text-green-400 bg-green-900/20" : "border-gray-700 text-gray-500 bg-gray-800/50"
    }`}>
      {ok ? <CheckCircle size={11} /> : <AlertCircle size={11} />}
      {label}
    </div>
  );
}

function Field({ label, placeholder, value, onChange, secret }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; secret?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-400 mb-1.5">{label}</label>
      <input
        type={secret ? "password" : "text"}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        autoComplete="off"
        className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-gray-600 focus:outline-none focus:border-kolet-yellow/60 transition-colors font-mono"
      />
    </div>
  );
}
