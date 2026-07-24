"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { API_BASE } from "@/lib/api";
import { Loader, Plus, Trash2, Shield, Eye, KeyRound, Check, X } from "lucide-react";

type User = { id: string; email: string; name: string; role: string; created_at: string };

export default function UsersPage() {
  const { data: session } = useSession();
  const meEmail = session?.user?.email;

  const [users, setUsers]           = useState<User[]>([]);
  const [loading, setLoading]       = useState(true);
  const [form, setForm]             = useState({ name: "", email: "", password: "", role: "reviewer" });
  const [submitting, setSubmitting] = useState(false);
  const [addError, setAddError]     = useState("");

  // Inline password reset state — keyed by user id
  const [pwRow, setPwRow]         = useState<string | null>(null);
  const [pwValue, setPwValue]     = useState("");
  const [pwSaving, setPwSaving]   = useState(false);
  const [pwError, setPwError]     = useState("");

  // Change-my-password state
  const [myPwCurrent, setMyPwCurrent]   = useState("");
  const [myPwNew, setMyPwNew]           = useState("");
  const [myPwConfirm, setMyPwConfirm]   = useState("");
  const [myPwSaving, setMyPwSaving]     = useState(false);
  const [myPwResult, setMyPwResult]     = useState<{ ok: boolean; msg: string } | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/api/admin/users`)
      .then(r => r.json())
      .then(d => { setUsers(d.users || []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function createUser(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setAddError("");
    const res = await fetch(`${API_BASE}/api/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const d = await res.json();
    setSubmitting(false);
    if (!res.ok) { setAddError(d.error || "Failed to create user"); return; }
    setUsers(prev => [...prev, d.user]);
    setForm({ name: "", email: "", password: "", role: "reviewer" });
  }

  async function deleteUser(id: string, email: string) {
    if (!confirm(`Remove ${email}? They will lose access immediately.`)) return;
    setDeletingId(id);
    await fetch(`${API_BASE}/api/admin/users/${id}`, { method: "DELETE" });
    setUsers(prev => prev.filter(u => u.id !== id));
    setDeletingId(null);
  }

  async function changeRole(id: string, role: string) {
    await fetch(`${API_BASE}/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role }),
    });
    setUsers(prev => prev.map(u => u.id === id ? { ...u, role } : u));
  }

  function openPwRow(id: string) {
    setPwRow(id);
    setPwValue("");
    setPwError("");
  }

  async function savePassword(id: string) {
    if (!pwValue.trim()) { setPwError("Enter a new password"); return; }
    setPwSaving(true);
    setPwError("");
    const res = await fetch(`${API_BASE}/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pwValue }),
    });
    setPwSaving(false);
    if (!res.ok) { setPwError("Failed to update password"); return; }
    setPwRow(null);
    setPwValue("");
  }

  async function changeMyPassword(e: React.FormEvent) {
    e.preventDefault();
    if (myPwNew !== myPwConfirm) { setMyPwResult({ ok: false, msg: "Passwords do not match" }); return; }
    if (myPwNew.length < 8) { setMyPwResult({ ok: false, msg: "Password must be at least 8 characters" }); return; }
    setMyPwSaving(true);
    setMyPwResult(null);
    const res = await fetch(`${API_BASE}/api/auth/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: myPwCurrent, newPassword: myPwNew }),
    });
    const d = await res.json();
    setMyPwSaving(false);
    if (!res.ok) { setMyPwResult({ ok: false, msg: d.error || "Failed to change password" }); return; }
    setMyPwResult({ ok: true, msg: "Password changed successfully" });
    setMyPwCurrent(""); setMyPwNew(""); setMyPwConfirm("");
  }

  return (
    <div className="max-w-2xl mx-auto px-8 py-10 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white mb-0.5">Users</h1>
        <p className="text-sm text-gray-500">Manage who can access Kolet SEO Studio.</p>
      </div>

      {/* ── User list ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-800 flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Team members</span>
          {!loading && <span className="text-xs text-gray-600">({users.length})</span>}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-500 text-sm gap-2">
            <Loader size={14} className="animate-spin" /> Loading…
          </div>
        ) : users.length === 0 ? (
          <div className="px-5 py-8 text-sm text-gray-500 text-center">No users yet.</div>
        ) : (
          <div className="divide-y divide-gray-800">
            {users.map(u => (
              <div key={u.id}>
                {/* Main row */}
                <div className="flex items-center gap-3 px-5 py-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-white">{u.name || u.email}</div>
                    {u.name && <div className="text-xs text-gray-500">{u.email}</div>}
                  </div>

                  {/* Role badge */}
                  <div className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium shrink-0 ${
                    u.role === "admin"
                      ? "bg-kolet-yellow/10 text-kolet-yellow"
                      : "bg-gray-800 text-gray-400"
                  }`}>
                    {u.role === "admin" ? <Shield size={10} /> : <Eye size={10} />}
                    {u.role}
                  </div>

                  {/* Role selector */}
                  <select
                    value={u.role}
                    onChange={e => changeRole(u.id, e.target.value)}
                    className="text-xs border border-gray-700 rounded-lg px-2.5 py-1.5 bg-gray-800 text-gray-300 focus:outline-none focus:border-kolet-yellow transition-colors"
                  >
                    <option value="admin">Admin</option>
                    <option value="reviewer">Reviewer</option>
                  </select>

                  {/* Reset password */}
                  <button
                    onClick={() => pwRow === u.id ? setPwRow(null) : openPwRow(u.id)}
                    title="Reset password"
                    className={`p-1.5 rounded-lg transition-colors ${
                      pwRow === u.id
                        ? "text-kolet-yellow bg-kolet-yellow/10"
                        : "text-gray-600 hover:text-gray-300 hover:bg-gray-800"
                    }`}
                  >
                    <KeyRound size={13} />
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => deleteUser(u.id, u.email)}
                    disabled={deletingId === u.id}
                    title="Remove user"
                    className="p-1.5 text-gray-600 hover:text-red-400 hover:bg-red-900/20 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {deletingId === u.id ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />}
                  </button>
                </div>

                {/* Inline password reset row */}
                {pwRow === u.id && (
                  <div className="px-5 py-3 bg-gray-800/50 border-t border-gray-800 flex items-center gap-3">
                    <span className="text-xs text-gray-400 shrink-0">New password</span>
                    <input
                      type="password"
                      value={pwValue}
                      onChange={e => setPwValue(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") savePassword(u.id); if (e.key === "Escape") setPwRow(null); }}
                      placeholder="Min. 8 characters"
                      autoFocus
                      className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-kolet-yellow transition-colors"
                    />
                    {pwError && <span className="text-xs text-red-400">{pwError}</span>}
                    <button
                      onClick={() => savePassword(u.id)}
                      disabled={pwSaving}
                      className="flex items-center gap-1 px-3 py-1.5 bg-kolet-yellow hover:bg-kolet-yellow/85 text-kolet-black text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                    >
                      {pwSaving ? <Loader size={11} className="animate-spin" /> : <Check size={11} />}
                      Save
                    </button>
                    <button onClick={() => setPwRow(null)} className="p-1.5 text-gray-500 hover:text-gray-300 rounded-lg">
                      <X size={13} />
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Add user ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-800 flex items-center gap-2">
          <Plus size={14} className="text-kolet-yellow" />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Add a user</span>
        </div>
        <form onSubmit={createUser} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Name</label>
              <input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Jane Doe"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-kolet-yellow transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Role</label>
              <select
                value={form.role}
                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-kolet-yellow transition-colors"
              >
                <option value="reviewer">Reviewer — library + comments</option>
                <option value="admin">Admin — full access</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="jane@example.com"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-kolet-yellow transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Password</label>
            <input
              type="password"
              required
              value={form.password}
              onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
              placeholder="Temporary password (min. 8 characters)"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-kolet-yellow transition-colors"
            />
          </div>

          {addError && (
            <p className="text-xs text-red-400 bg-red-900/20 border border-red-800/40 rounded-lg px-3 py-2">{addError}</p>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-kolet-yellow hover:bg-kolet-yellow/85 disabled:opacity-50 text-kolet-black text-sm font-semibold rounded-lg transition-colors"
            >
              {submitting ? <Loader size={13} className="animate-spin" /> : <Plus size={13} />}
              {submitting ? "Adding…" : "Add user"}
            </button>
          </div>
        </form>
      </div>

      {/* ── Change my password ── */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-gray-800 flex items-center gap-2">
          <KeyRound size={14} className="text-gray-400" />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Change my password</span>
          {meEmail && <span className="text-xs text-gray-600">({meEmail})</span>}
        </div>
        <form onSubmit={changeMyPassword} className="p-5 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Current password</label>
            <input
              type="password"
              required
              value={myPwCurrent}
              onChange={e => setMyPwCurrent(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-kolet-yellow transition-colors"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">New password</label>
              <input
                type="password"
                required
                value={myPwNew}
                onChange={e => setMyPwNew(e.target.value)}
                placeholder="Min. 8 characters"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-kolet-yellow transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Confirm password</label>
              <input
                type="password"
                required
                value={myPwConfirm}
                onChange={e => setMyPwConfirm(e.target.value)}
                placeholder="Repeat new password"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-kolet-yellow transition-colors"
              />
            </div>
          </div>

          {myPwResult && (
            <p className={`text-xs px-3 py-2 rounded-lg border ${
              myPwResult.ok
                ? "text-green-400 bg-green-900/20 border-green-800/40"
                : "text-red-400 bg-red-900/20 border-red-800/40"
            }`}>{myPwResult.msg}</p>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={myPwSaving}
              className="flex items-center gap-1.5 px-4 py-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {myPwSaving ? <Loader size={13} className="animate-spin" /> : <KeyRound size={13} />}
              {myPwSaving ? "Saving…" : "Update password"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
