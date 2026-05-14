import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const STATUS_LABELS = {
  pending:   { label: "در صف",         cls: "badge-info" },
  running:   { label: "در حال اجرا",  cls: "badge-warning" },
  paused:    { label: "متوقف",        cls: "badge-gray" },
  completed: { label: "تکمیل",        cls: "badge-active" },
  failed:    { label: "ناموفق",       cls: "badge-error" },
  cancelled: { label: "لغو شده",     cls: "badge-gray" },
};

const STATUSES = ["", "pending", "running", "paused", "completed", "failed", "cancelled"];
const STATUS_NAMES = { "": "همه", pending: "در صف", running: "در حال اجرا", paused: "متوقف", completed: "تکمیل", failed: "ناموفق", cancelled: "لغو" };

export default function Tasks() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({
    target: "", target_type: "link", session_count: "",
    join_delay_min: 3, join_delay_max: 8, auto_leave_after: "", priority: 5
  });

  const { data, isLoading } = useQuery(
    ["tasks", statusFilter, page],
    () => api.get(`/tasks/?${statusFilter ? `status=${statusFilter}&` : ""}page=${page}&limit=20`).then(r => r.data),
    { refetchInterval: 8000, keepPreviousData: true }
  );

  const tasks = data?.tasks || [];
  const total = data?.total || 0;
  const totalPages = Math.ceil(total / 20);

  const createMutation = useMutation(
    (d) => api.post("/tasks/join", d),
    {
      onSuccess: (res) => {
        qc.invalidateQueries("tasks");
        toast.success(`✅ تسک ایجاد شد! شناسه: ${res.data.task_id.slice(0, 8)}...`);
        setShowModal(false);
        setForm({ target: "", target_type: "link", session_count: "", join_delay_min: 3, join_delay_max: 8, auto_leave_after: "", priority: 5 });
      },
      onError: (e) => toast.error(e.response?.data?.detail || "خطا در ایجاد تسک")
    }
  );

  const cancelMutation = useMutation(
    (id) => api.post(`/tasks/${id}/cancel`),
    { onSuccess: () => { qc.invalidateQueries("tasks"); toast.success("تسک لغو شد."); }, onError: () => toast.error("خطا در لغو تسک") }
  );

  const pauseMutation = useMutation(
    (id) => api.post(`/tasks/${id}/pause`),
    { onSuccess: () => { qc.invalidateQueries("tasks"); toast.success("تسک متوقف شد."); }, onError: () => toast.error("خطا") }
  );

  const resumeMutation = useMutation(
    (id) => api.post(`/tasks/${id}/resume`),
    { onSuccess: () => { qc.invalidateQueries("tasks"); toast.success("تسک ادامه یافت."); }, onError: () => toast.error("خطا") }
  );

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.target.trim()) return toast.error("لینک یا یوزرنیم را وارد کنید");
    if (!form.session_count || form.session_count < 1) return toast.error("تعداد سشن را وارد کنید");
    createMutation.mutate({
      ...form,
      session_count: parseInt(form.session_count),
      join_delay_min: parseInt(form.join_delay_min),
      join_delay_max: parseInt(form.join_delay_max),
      auto_leave_after: form.auto_leave_after ? parseInt(form.auto_leave_after) : null,
      priority: parseInt(form.priority),
    });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6" style={{ flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>📋 تسک‌ها</h2>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>+ تسک جدید</button>
      </div>

      <div className="filters mb-4">
        {STATUSES.map(s => (
          <button
            key={s}
            className={`filter-btn ${statusFilter === s ? "active" : ""}`}
            onClick={() => { setStatusFilter(s); setPage(1); }}
          >
            {STATUS_NAMES[s]}
          </button>
        ))}
      </div>

      <div className="card">
        {isLoading ? (
          <div className="loading">⏳ در حال بارگذاری...</div>
        ) : tasks.length === 0 ? (
          <div className="empty-state"><div className="icon">📋</div><p>هیچ تسکی یافت نشد</p></div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>شناسه</th>
                    <th>هدف</th>
                    <th>نوع</th>
                    <th>سشن</th>
                    <th>پیشرفت</th>
                    <th>وضعیت</th>
                    <th>اولویت</th>
                    <th>عملیات</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map(t => {
                    const st = STATUS_LABELS[t.status] || { label: t.status, cls: "badge-gray" };
                    const progress = t.session_count > 0 ? Math.round(((t.sessions_done || 0) / t.session_count) * 100) : 0;
                    return (
                      <tr key={t.id}>
                        <td><span className="truncate" title={t.id}>{t.id.slice(0, 8)}...</span></td>
                        <td><span className="truncate" title={t.target}>{t.target}</span></td>
                        <td><span className="badge badge-purple">{t.target_type}</span></td>
                        <td style={{ textAlign: "center" }}>{t.session_count}</td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <div style={{ flex: 1, background: "#e2e8f0", borderRadius: 4, height: 6, minWidth: 60 }}>
                              <div style={{ width: `${progress}%`, background: progress === 100 ? "#22c55e" : "#6366f1", height: "100%", borderRadius: 4, transition: "width 0.3s" }} />
                            </div>
                            <span style={{ fontSize: "0.78rem", color: "#64748b", whiteSpace: "nowrap" }}>{t.sessions_done || 0}/{t.session_count}</span>
                          </div>
                        </td>
                        <td><span className={`badge ${st.cls}`}>{st.label}</span></td>
                        <td style={{ textAlign: "center" }}>{t.priority}</td>
                        <td>
                          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                            {t.status === "running" && <button className="btn btn-warning btn-sm" onClick={() => pauseMutation.mutate(t.id)}>⏸</button>}
                            {t.status === "paused" && <button className="btn btn-success btn-sm" onClick={() => resumeMutation.mutate(t.id)}>▶️</button>}
                            {["pending", "running", "paused"].includes(t.status) && (
                              <button className="btn btn-danger btn-sm" onClick={() => { if(window.confirm("لغو تسک؟")) cancelMutation.mutate(t.id); }}>🚫</button>
                            )}
                          </div>
                        </td>
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

      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <h3 className="modal-title">📋 تسک جدید</h3>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label className="form-label">هدف (لینک یا یوزرنیم)</label>
                <input className="form-control" placeholder="https://t.me/..." value={form.target} onChange={e => setForm(f => ({ ...f, target: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">نوع هدف</label>
                <select className="form-control" value={form.target_type} onChange={e => setForm(f => ({ ...f, target_type: e.target.value }))}>
                  <option value="link">لینک</option>
                  <option value="username">یوزرنیم</option>
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">تعداد سشن</label>
                  <input className="form-control" type="number" min="1" placeholder="مثلاً ۱۰۰" value={form.session_count} onChange={e => setForm(f => ({ ...f, session_count: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label className="form-label">اولویت (۱-۱۰)</label>
                  <input className="form-control" type="number" min="1" max="10" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">تأخیر حداقل (ثانیه)</label>
                  <input className="form-control" type="number" min="1" value={form.join_delay_min} onChange={e => setForm(f => ({ ...f, join_delay_min: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">تأخیر حداکثر (ثانیه)</label>
                  <input className="form-control" type="number" min="1" value={form.join_delay_max} onChange={e => setForm(f => ({ ...f, join_delay_max: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">خروج خودکار بعد از (دقیقه) — اختیاری</label>
                <input className="form-control" type="number" min="1" placeholder="خالی = بدون خروج" value={form.auto_leave_after} onChange={e => setForm(f => ({ ...f, auto_leave_after: e.target.value }))} />
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-ghost" onClick={() => setShowModal(false)}>انصراف</button>
                <button type="submit" className="btn btn-primary" disabled={createMutation.isLoading}>
                  {createMutation.isLoading ? "در حال ایجاد..." : "✅ ایجاد تسک"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
