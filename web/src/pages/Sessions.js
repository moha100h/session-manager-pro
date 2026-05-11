import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const statusBadge = {
  active: <span className="badge badge-active">🟢 فعال</span>,
  logged_out: <span className="badge badge-error">🔴 لاگ‌اوت</span>,
  deleted: <span className="badge badge-error">⛔ حذف‌شده</span>,
  banned: <span className="badge badge-error">🚫 بن‌شده</span>,
  flood: <span className="badge badge-warning">🌊 فلود</span>,
  error: <span className="badge badge-error">❌ خطا</span>,
  inactive: <span className="badge badge-gray">⚪ غیرفعال</span>,
};

export default function Sessions() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [newSession, setNewSession] = useState({ phone: "", session_string: "", api_id: "", api_hash: "" });
  const [bulkText, setBulkText] = useState("");

  const { data, isLoading } = useQuery(
    ["sessions", page, search, statusFilter],
    () => api.get(`/sessions/?page=${page}&limit=50${search ? `&search=${search}` : ""}${statusFilter ? `&status=${statusFilter}` : ""}`).then(r => r.data),
    { keepPreviousData: true }
  );

  const { data: stats } = useQuery("session-stats", () => api.get("/sessions/stats").then(r => r.data), { refetchInterval: 30000 });

  const deleteMutation = useMutation(
    (id) => api.delete(`/sessions/${id}`),
    { onSuccess: () => { qc.invalidateQueries("sessions"); qc.invalidateQueries("session-stats"); toast.success("سشن حذف شد."); } }
  );

  const addMutation = useMutation(
    (data) => api.post("/sessions/", data),
    { onSuccess: () => { qc.invalidateQueries("sessions"); qc.invalidateQueries("session-stats"); toast.success("سشن اضافه شد!"); setShowAddModal(false); setNewSession({ phone: "", session_string: "", api_id: "", api_hash: "" }); } }
  );

  const bulkMutation = useMutation(
    (sessions) => api.post("/sessions/bulk", sessions),
    { onSuccess: (res) => { qc.invalidateQueries("sessions"); qc.invalidateQueries("session-stats"); toast.success(`${res.data.added} سشن اضافه شد.`); setShowBulkModal(false); setBulkText(""); } }
  );

  const handleBulkAdd = () => {
    const lines = bulkText.trim().split("\n").filter(l => l.trim());
    const sessions = lines.map(line => {
      const parts = line.split("|");
      return { phone: parts[0]?.trim(), session_string: parts[1]?.trim() || parts[0]?.trim(), api_id: parts[2] ? parseInt(parts[2]) : null, api_hash: parts[3]?.trim() || null };
    }).filter(s => s.phone && s.session_string);
    if (!sessions.length) return toast.error("هیچ سشن معتبری یافت نشد.");
    bulkMutation.mutate(sessions);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 style={{ fontSize: "1.4rem", fontWeight: 700 }}>📱 مدیریت سشن‌ها</h2>
        <div className="flex gap-2">
          <button className="btn btn-primary btn-sm" onClick={() => setShowAddModal(true)}>➕ افزودن سشن</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowBulkModal(true)}>📤 افزودن دسته‌ای</button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="stat-grid mb-6">
          {Object.entries(stats).filter(([k]) => k !== "total").map(([status, count]) => (
            <div key={status} className="stat-card" style={{ padding: "16px" }}>
              <div className="value" style={{ fontSize: "1.5rem" }}>{Number(count).toLocaleString("fa-IR")}</div>
              <div className="label">{statusBadge[status] || status}</div>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="card mb-4">
        <div className="flex gap-3">
          <input className="input" placeholder="🔍 جستجو با شماره..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} style={{ maxWidth: 240 }} />
          <select className="input" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} style={{ maxWidth: 180 }}>
            <option value="">همه وضعیت‌ها</option>
            <option value="active">🟢 فعال</option>
            <option value="logged_out">🔴 لاگ‌اوت</option>
            <option value="deleted">⛔ حذف‌شده</option>
            <option value="banned">🚫 بن‌شده</option>
            <option value="flood">🌊 فلود</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="card">
        {isLoading ? <div className="loading">⏳ در حال بارگذاری...</div> : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>شماره</th>
                    <th>وضعیت</th>
                    <th>آخرین استفاده</th>
                    <th>آخرین بررسی</th>
                    <th>خطاها</th>
                    <th>عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.sessions || []).map(s => (
                    <tr key={s.id}>
                      <td><code style={{ fontSize: "0.85rem" }}>{s.phone}</code></td>
                      <td>{statusBadge[s.status] || s.status}</td>
                      <td className="text-sm text-light">{s.last_used ? new Date(s.last_used).toLocaleString("fa-IR") : "—"}</td>
                      <td className="text-sm text-light">{s.last_checked ? new Date(s.last_checked).toLocaleString("fa-IR") : "—"}</td>
                      <td><span style={{ color: s.error_count > 5 ? "#ef4444" : "#64748b" }}>{s.error_count}</span></td>
                      <td>
                        <button className="btn btn-danger btn-sm" onClick={() => { if (window.confirm("حذف شود؟")) deleteMutation.mutate(s.id); }}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-between items-center" style={{ marginTop: 16 }}>
              <span className="text-sm text-light">کل: {(data?.total || 0).toLocaleString("fa-IR")} سشن</span>
              <div className="flex gap-2">
                <button className="btn btn-primary btn-sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>◀️ قبلی</button>
                <span className="text-sm" style={{ padding: "6px 12px" }}>صفحه {page}</span>
                <button className="btn btn-primary btn-sm" disabled={(data?.sessions || []).length < 50} onClick={() => setPage(p => p + 1)}>بعدی ▶️</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Add Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>➕ افزودن سشن جدید</h3>
            <div className="form-group"><label>شماره تلفن</label><input className="input" placeholder="+989123456789" value={newSession.phone} onChange={e => setNewSession({...newSession, phone: e.target.value})} /></div>
            <div className="form-group"><label>Session String</label><textarea className="input" rows={4} placeholder="1BQANOTEuAm..." value={newSession.session_string} onChange={e => setNewSession({...newSession, session_string: e.target.value})} /></div>
            <div className="flex gap-2">
              <div className="form-group" style={{ flex: 1 }}><label>API ID</label><input className="input" type="number" placeholder="12345" value={newSession.api_id} onChange={e => setNewSession({...newSession, api_id: e.target.value})} /></div>
              <div className="form-group" style={{ flex: 1 }}><label>API Hash</label><input className="input" placeholder="abc123..." value={newSession.api_hash} onChange={e => setNewSession({...newSession, api_hash: e.target.value})} /></div>
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn" onClick={() => setShowAddModal(false)}>انصراف</button>
              <button className="btn btn-primary" onClick={() => addMutation.mutate({ ...newSession, api_id: newSession.api_id ? parseInt(newSession.api_id) : null })} disabled={addMutation.isLoading}>
                {addMutation.isLoading ? "در حال افزودن..." : "افزودن"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Modal */}
      {showBulkModal && (
        <div className="modal-overlay" onClick={() => setShowBulkModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3>📤 افزودن دسته‌ای سشن</h3>
            <p className="text-sm text-light mb-4">هر سشن در یک خط — فرمت: <code>شماره|session_string|api_id|api_hash</code></p>
            <div className="form-group">
              <textarea className="input" rows={10} placeholder="+989123456789|1BQANOTEuAm...|12345|abc123&#10;+989987654321|1BQANOTEuBn...|12345|abc123" value={bulkText} onChange={e => setBulkText(e.target.value)} style={{ fontFamily: "monospace", fontSize: "0.82rem" }} />
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn" onClick={() => setShowBulkModal(false)}>انصراف</button>
              <button className="btn btn-primary" onClick={handleBulkAdd} disabled={bulkMutation.isLoading}>
                {bulkMutation.isLoading ? "در حال افزودن..." : "افزودن همه"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
