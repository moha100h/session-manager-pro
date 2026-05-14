import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const STATUS_MAP = {
  active:     { label: "فعال",       cls: "badge-active" },
  logged_out: { label: "لاگ‌اوت",    cls: "badge-error" },
  banned:     { label: "بن‌شده",     cls: "badge-error" },
  flood:      { label: "فلود",       cls: "badge-warning" },
  error:      { label: "خطا",        cls: "badge-error" },
  deleted:    { label: "حذف‌شده",    cls: "badge-gray" },
  inactive:   { label: "غیرفعال",    cls: "badge-gray" },
};

const STATUSES = ["", "active", "logged_out", "banned", "flood", "error"];

export default function Sessions() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [form, setForm] = useState({ phone: "", session_string: "", api_id: "", api_hash: "" });
  const [bulkText, setBulkText] = useState("");

  const { data, isLoading } = useQuery(
    ["sessions", statusFilter, search, page],
    () => api.get(`/sessions/?${statusFilter ? `status=${statusFilter}&` : ""}${search ? `search=${search}&` : ""}page=${page}&limit=20`).then(r => r.data),
    { refetchInterval: 15000, keepPreviousData: true }
  );

  const sessions = data?.sessions || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  const addMutation = useMutation(
    (d) => api.post("/sessions/", d),
    { onSuccess: () => { qc.invalidateQueries("sessions"); toast.success("✅ سشن اضافه شد."); setShowAddModal(false); setForm({ phone: "", session_string: "", api_id: "", api_hash: "" }); }, onError: (e) => toast.error(e.response?.data?.detail || "خطا") }
  );

  const bulkMutation = useMutation(
    (items) => api.post("/sessions/bulk", items),
    { onSuccess: (res) => { qc.invalidateQueries("sessions"); toast.success(`✅ ${res.data.added} سشن اضافه شد.`); setShowBulkModal(false); setBulkText(""); }, onError: (e) => toast.error(e.response?.data?.detail || "خطا در آپلود") }
  );

  const deleteMutation = useMutation(
    (id) => api.delete(`/sessions/${id}`),
    { onSuccess: () => { qc.invalidateQueries("sessions"); toast.success("سشن حذف شد."); }, onError: () => toast.error("خطا در حذف") }
  );

  const handleSearch = (e) => { e.preventDefault(); setSearch(searchInput); setPage(1); };

  const handleBulkSubmit = () => {
    const lines = bulkText.trim().split("\n").filter(l => l.trim());
    const items = lines.map(line => {
      const parts = line.split("|").map(p => p.trim());
      return { phone: parts[0], session_string: parts[1], api_id: parts[2] ? parseInt(parts[2]) : null, api_hash: parts[3] || null };
    }).filter(i => i.phone && i.session_string);
    if (items.length === 0) return toast.error("فرمت نادرست است");
    bulkMutation.mutate(items);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6" style={{ flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>📱 سشن‌ها <span style={{ fontSize: "0.9rem", color: "#64748b", fontWeight: 400 }}>({total.toLocaleString("fa-IR")} عدد)</span></h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowBulkModal(true)}>📤 آپلود گروهی</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>+ افزودن سشن</button>
        </div>
      </div>

      <div className="card mb-4">
        <div className="filters">
          {STATUSES.map(s => (
            <button key={s} className={`filter-btn ${statusFilter === s ? "active" : ""}`} onClick={() => { setStatusFilter(s); setPage(1); }}>
              {s === "" ? "همه" : STATUS_MAP[s]?.label || s}
            </button>
          ))}
          <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, flex: 1, minWidth: 200 }}>
            <div className="search-box" style={{ flex: 1 }}>
              <input placeholder="جستجو با شماره..." value={searchInput} onChange={e => setSearchInput(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary btn-sm">جستجو</button>
            {search && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}>✕</button>}
          </form>
        </div>
      </div>

      <div className="card">
        {isLoading ? (
          <div className="loading">⏳ در حال بارگذاری...</div>
        ) : sessions.length === 0 ? (
          <div className="empty-state"><div className="icon">📱</div><p>هیچ سشنی یافت نشد</p></div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th>شماره</th><th>وضعیت</th><th>خطاها</th><th>فلود تا</th><th>آخرین بررسی</th><th>تاریخ افزودن</th><th>عملیات</th></tr></thead>
                <tbody>
                  {sessions.map(s => {
                    const st = STATUS_MAP[s.status] || { label: s.status, cls: "badge-gray" };
                    return (
                      <tr key={s.id}>
                        <td style={{ fontWeight: 600 }}>{s.phone}</td>
                        <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                        <td style={{ textAlign: "center" }}>{s.error_count > 0 ? <span className="badge badge-error">{s.error_count}</span> : <span style={{ color: "#94a3b8" }}>—</span>}</td>
                        <td style={{ fontSize: "0.82rem", color: "#64748b" }}>{s.flood_until ? new Date(s.flood_until).toLocaleString("fa-IR") : "—"}</td>
                        <td style={{ fontSize: "0.82rem", color: "#64748b" }}>{s.last_checked ? new Date(s.last_checked).toLocaleString("fa-IR") : "—"}</td>
                        <td style={{ fontSize: "0.82rem", color: "#64748b" }}>{new Date(s.created_at).toLocaleDateString("fa-IR")}</td>
                        <td><button className="btn btn-danger btn-sm" onClick={() => { if (window.confirm(`حذف سشن ${s.phone}؟`)) deleteMutation.mutate(s.id); }}>🗑</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="pagination">
                <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>قبلی</button>
                {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                  const p = page <= 3 ? i + 1 : page - 2 + i;
                  if (p < 1 || p > totalPages) return null;
                  return <button key={p} className={`page-btn ${p === page ? "active" : ""}`} onClick={() => setPage(p)}>{p}</button>;
                })}
                <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>بعدی</button>
              </div>
            )}
          </>
        )}
      </div>

      {showAddModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowAddModal(false)}>
          <div className="modal">
            <h3 className="modal-title">📱 افزودن سشن</h3>
            <div className="form-group"><label className="form-label">شماره تلفن</label><input className="form-control" placeholder="+989..." value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Session String</label><textarea className="form-control" rows={4} placeholder="1BVtsOK8Bu..." value={form.session_string} onChange={e => setForm(f => ({ ...f, session_string: e.target.value }))} style={{ resize: "vertical" }} /></div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">API ID — اختیاری</label><input className="form-control" type="number" value={form.api_id} onChange={e => setForm(f => ({ ...f, api_id: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">API Hash — اختیاری</label><input className="form-control" value={form.api_hash} onChange={e => setForm(f => ({ ...f, api_hash: e.target.value }))} /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAddModal(false)}>انصراف</button>
              <button className="btn btn-primary" onClick={() => addMutation.mutate({ ...form, api_id: form.api_id ? parseInt(form.api_id) : null })} disabled={addMutation.isLoading}>✅ افزودن</button>
            </div>
          </div>
        </div>
      )}

      {showBulkModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowBulkModal(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <h3 className="modal-title">📤 آپلود گروهی سشن</h3>
            <p style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: 12 }}>هر خط یک سشن — فرمت:<br /><code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>شماره|session_string|api_id|api_hash</code></p>
            <textarea className="form-control" rows={10} placeholder="+989123456789|1BVtsOK8Bu...|12345678|abc123" value={bulkText} onChange={e => setBulkText(e.target.value)} style={{ resize: "vertical", fontFamily: "monospace", fontSize: "0.82rem" }} />
            <p style={{ fontSize: "0.82rem", color: "#64748b", marginTop: 8 }}>{bulkText.trim().split("\n").filter(l => l.trim()).length} سشن آماده آپلود</p>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowBulkModal(false)}>انصراف</button>
              <button className="btn btn-primary" onClick={handleBulkSubmit} disabled={bulkMutation.isLoading}>{bulkMutation.isLoading ? "در حال آپلود..." : "📤 آپلود"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
