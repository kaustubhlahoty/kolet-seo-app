"use client";
import { useState, useEffect, useRef } from "react";
import { Settings, Key, CheckCircle, AlertCircle, Loader2, Wifi, ExternalLink } from "lucide-react";

type ConfigInfo = { set: boolean; updated_at?: string };
type ConfiguredState = Record<string, ConfigInfo>;

export default function AdminSettingsPage() {
  const [configured, setConfigured]     = useState<ConfiguredState>({});
  const [hfApiKeyId,  setHfApiKeyId]    = useState("");
  const [hfSecretKey, setHfSecretKey]   = useState("");
  const [saving,      setSaving]        = useState(false);
  const [saveResult,  setSaveResult]    = useState<{ ok: boolean; message: string } | null>(null);

  // Device auth state
  const [connecting,       setConnecting]       = useState(false);
  const [deviceCode,       setDeviceCode]       = useState<string | null>(null);
  const [verificationUri,  setVerificationUri]  = useState<string | null>(null);
  const [connectStatus,    setConnectStatus]    = useState<"idle"|"waiting"|"connected"|"expired"|"error">("idle");
  const [connectMessage,   setConnectMessage]   = useState("");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  async function loadStatus() {
    const d = await fetch("/api/admin/settings").then(r => r.json());
    setConfigured(d.configured ?? {});
  }

  useEffect(() => { loadStatus(); }, []);
  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  // ── Device auth connect flow ──
  async function startConnect() {
    setConnecting(true);
    setConnectStatus("idle");
    setConnectMessage("");
    try {
      const res = await fetch("/api/admin/higgsfield-auth");
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to start auth");

      setDeviceCode(data.device_code);
      setVerificationUri(data.verification_uri);
      setConnectStatus("waiting");

      // Poll every 4 seconds until approved or expired
      pollRef.current = setInterval(async () => {
        try {
          const poll = await fetch("/api/admin/higgsfield-auth", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device_code: data.device_code }),
          });
          const result = await poll.json();

          if (result.status === "connected") {
            clearInterval(pollRef.current!);
            setConnectStatus("connected");
            setConnectMessage("Account connected. Your Ultra Plan credits will be used for image generation.");
            setDeviceCode(null);
            setVerificationUri(null);
            await loadStatus();
          } else if (result.status === "expired") {
            clearInterval(pollRef.current!);
            setConnectStatus("expired");
            setConnectMessage("Authorization expired. Click Connect again.");
          } else if (result.status === "error") {
            clearInterval(pollRef.current!);
            setConnectStatus("error");
            setConnectMessage(result.message || "Unknown error");
          }
          // "pending" → keep polling
        } catch {}
      }, 4000);
    } catch (e: any) {
      setConnectStatus("error");
      setConnectMessage(e.message);
    } finally {
      setConnecting(false);
    }
  }

  // ── API key save ──
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveResult(null);

    const payload: Record<string, string> = {};
    if (hfApiKeyId.trim())  payload.higgsfield_api_key_id = hfApiKeyId.trim();
    if (hfSecretKey.trim()) payload.higgsfield_secret_key = hfSecretKey.trim();

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
      await loadStatus();
    } catch (err: any) {
      setSaveResult({ ok: false, message: err.message });
    } finally {
      setSaving(false);
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

      {/* ── Higgsfield Account (device auth) ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Wifi size={16} className="text-kolet-yellow" />
          <h2 className="text-sm font-semibold text-white">Higgsfield Account</h2>
          <span className="ml-1 text-xs bg-kolet-yellow/10 text-kolet-yellow px-2 py-0.5 rounded-full">Ultra Plan</span>
        </div>
        <p className="text-xs text-gray-500 mb-5">
          Connect your Higgsfield account once and image generation will use your Ultra Plan credits automatically.
          Tokens refresh automatically — no manual work needed.
        </p>

        <div className="flex items-center gap-3 mb-5">
          <StatusBadge
            label={isConnected ? `Connected${tokenAge !== null ? ` · refreshed ${tokenAge}h ago` : ""}` : "Not connected"}
            ok={isConnected}
          />
        </div>

        {connectStatus === "waiting" && verificationUri && (
          <div className="mb-4 p-4 bg-kolet-yellow/5 border border-kolet-yellow/20 rounded-lg">
            <p className="text-xs text-kolet-yellow font-medium mb-2">Step: Authorize in your browser</p>
            <a
              href={verificationUri}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-white bg-kolet-yellow/20 hover:bg-kolet-yellow/30 border border-kolet-yellow/30 px-3 py-1.5 rounded-lg transition-colors"
            >
              <ExternalLink size={12} />
              Open Higgsfield authorization page
            </a>
            <p className="text-xs text-gray-500 mt-2">Waiting for you to approve… checking every 4 seconds.</p>
          </div>
        )}

        {connectStatus === "connected" && (
          <div className="mb-4 flex items-center gap-2 text-xs text-green-400">
            <CheckCircle size={13} />
            {connectMessage}
          </div>
        )}

        {(connectStatus === "expired" || connectStatus === "error") && (
          <div className="mb-4 flex items-center gap-2 text-xs text-red-400">
            <AlertCircle size={13} />
            {connectMessage}
          </div>
        )}

        <button
          onClick={startConnect}
          disabled={connecting || connectStatus === "waiting"}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-kolet-yellow text-kolet-black text-sm font-medium hover:bg-kolet-yellow/90 disabled:opacity-50 transition-colors"
        >
          {connecting && <Loader2 size={14} className="animate-spin" />}
          {isConnected ? "Reconnect account" : "Connect Higgsfield account"}
        </button>
      </div>

      {/* ── API Key fallback ── */}
      <form onSubmit={save}>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
          <div className="flex items-center gap-2 mb-1">
            <Key size={16} className="text-gray-400" />
            <h2 className="text-sm font-semibold text-white">Higgsfield API Key</h2>
            <span className="ml-1 text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full">Fallback</span>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Only used if account is not connected above. Requires separate API credits on{" "}
            <span className="text-gray-400 font-mono">platform.higgsfield.ai</span>.
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
