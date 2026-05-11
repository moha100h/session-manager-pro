import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const taskStatusBadge = {
  pending: <span className="badge badge-info">⏳ در صف</span>,
  running: <span className="badge badge-warning">▶️ در حال اجرا</span>,
  paused: <span className="badge badge-gray">⏸ متوقف</span>,
  completed: <span className="badge badge-active">✅ تکمیل</span>,
  failed: <span className="badge badge-error">❌ ناموفق</span>,
  cancelled: <span className="badge badge-gray">🚫 لغو شده</span>,
};

export default function Tasks() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState({ target: "", target_type: "link", session_count: "", join_delay_min: 3, join_delay_max: 8, auto_leave_after: "" });

  const { data, isLoading } = useQuery(
    ["tasks", statusFilter],
    () => api.get(`/tasks/${statusFilter ? `?status=${statusFilter}` : ""}`).then(r => r.data),
    { refetchInterval: 10000 }
  );

  const createMutation = useMutation(
    (d) => api.post("/tasks/join", d),
    { onSuccess: (res) => { qc.invalidateQueries("tasks"); toast.success(`تسک ایجاد شد! شناسه: ${res.data.task_id.slice(0,8)}`); setShowModal(false); setForm({ target: "", target_type: "link", session_count: "", join_delay_min: 3, join_delay_max: 8, auto_leave_after: "" }); } }
  );

  const cancelMutation = useMutation(
    (id) => api.post(`/tasks/${id}/cancel`),
    { onSuccess: () => { qc.invalidateQueries("tasks"); toast.success("تسک لغو شد."); } }
  );

  const pauseMutation = useMutation(
    (id) => api.post(`/tasks/${id}/pause`),
    { onSuccess: () => { qc.invalidateQueries("tasks"); toast.success("تسک متوقف شد."); } }
  );

  const resumeMutation = useMutation(
    (id) => api.post(`/tasks/${id}/resume`),
    { onSuccess: () => { qc.invalidateQueries("tasks"); toast.success("تسک از سر گرفته شد."); } }
  );

  const handleCreate = () => {
    const count = parseInt(form.session_count);
    if (!form.target) return toast.error("لینک یا آیدی هدف را وارد کنید.");
    if (!count || count < 1) return toast.error("تعداد سشن را وارد کنید.");
    createMutation.mutate({ ...form, session_count: count, auto_leave_after: form.auto_leave_after ? parseInt(form.auto_leave_after) : null });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 style={{ fontSize: "1.4rem", fontWeight: 700 }}>📋 مدیریت تسک‌ها</h2>
        <button className="btn btn-primary" onClick={() => setShowModal(true)}>➕ تسک جدید (عضو کردن)</button>
      </div>

      <div className="card mb-4">
        <div className="flex gap-3">
          <select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="">همه وضعیت‌ها</option>
            <option value="pending">⏳ در صف</option>
            <option value="running">▶️ در حال اجرا</option>
            <option value="paused">⏸ متوقف</option>
            <option value="completed">✅ تکمیل</option>
            <option value="failed">❌ ناموفق</option>
            <option value="cancelled">🚫 لغو شده</option>
          </select>
        </div>
      </div>

      <div className="card">
        {isLoading ? <div className="loading">⏳ در حال بارگذاری...</div> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>شناسه</th>
                  <th>هدف</th>
                  <th>وضعیت</th>
                  <th>پیشرفت</th>
                  <th>تأخیر</th>
                  <th>تاریخ</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {(data || []).map(t => {
                  const progress = t.session_count > 0 ? Math.round((t.sessions_done / t.session_count) * 100) : 0;
                  return (
                    <tr key={t.id}>
                      <td><code style={{ fontSize: "0.8rem" }}>{t.id.slice(0, 8)}</code></td>
                      <td style={{ maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.target}>{t.target}</td>
                      <td>{taskStatusBadge[t.status] || t.status}</td>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, background: "#e2e8f0", borderRadius: 4, height: 8, minWidth: 80 }}>
                            <div style={{ width: `${progress}%`, background: "#6366f1", borderRadius: 4, height: "100%", transition: "width 0.3s" }} />
                          </div>
                          <span className="text-sm text-light">{t.sessions_done.toLocaleString("fa-IR")}/{t.session_count.toLocaleString("fa-IR")}</span>
                        </div>
                      </td>
                      <td className="text-sm text-light">{t.join_delay_min}-{t.join_delay_max}s</td>
                      <td className="text-sm text-light">{new Date(t.created_at).toLocaleDateString("fa-IR")}</td>
                      <td>
                        <div className="flex gap-2">
                          {t.status === "running" && <button className="btn btn-sm" style={{ background: "#fef3c7", color: "#92400e" }} onClick={() => pauseMutation.mutate(t.id)}>⏸</button>}
                          {t.status === "paused" && <button className="btn btn-sm btn-primary" onClick={() => resumeMutation.mutate(t.id)}>▶️</button>}
                          {["pending", "running", "paused"].includes(t.status) && <button className="btn btn-danger btn-sm" onClick={() => { if (window.confirm("لغو شود؟")) cancelMutation.mutate(t.id); }}>🚫</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!(data || []).length && <div className="loading">📭 هیچ تسکی یافت نشد.</div>}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3>➕ تسک جدید — عضو کردن</h3>
            <div className="form-group">
              <label>🎯 لینک یا آیدی هدف</label>
              <input className="input" placeholder="https://t.me/channel یا @username یا -1001234567890" value={form.target} onChange={e => setForm({...form, target: e.target.value})} />
            </div>
            <div className="form-group">
              <label>نوع هدف</label>
              <select className="input" value={form.target_type} onChange={e => setForm({...form, target_type: e.target.value})}>
                <option value="link">🔗 لینک (t.me)</option>
                <option value="username">@ نام کاربری</option>
                <option value="id">🔢 آیدی عددی</option>
              </select>
            </div>
            <div className="form-group">
              <label>📱 تعداد سشن</label>
              <input className="input" type="number" placeholder="1000" min="1" max="40000" value={form.session_count} onChange={e => setForm({...form, session_count: e.target.value})} />
            </div>
            <div className="flex gap-2">
              <div className="form-group" style={{ flex: 1 }}>
                <label>⏱ تأخیر حداقل (ثانیه)</label>
                <input className="input" type="number" min="1" max="60" value={form.join_delay_min} onChange={e => setForm({...form, join_delay_min: parseInt(e.target.value)})} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>⏱ تأخیر حداکثر (ثانیه)</label>
                <input className="input" type="number" min="1" max="60" value={form.join_delay_max} onChange={e => setForm({...form, join_delay_max: parseInt(e.target.value)})} />
              </div>
            </div>
            <div className="form-group">
              <label>⏰ خروج خودکار بعد از (دقیقه) — اختیاری</label>
              <input className="input" type="number" placeholder="بدون خروج خودکار" min="1" value={form.auto_leave_after} onChange={e => setForm({...form, auto_leave_after: e.target.value})} />
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn" onClick={() => setShowModal(false)}>انصراف</button>
              <button className="btn btn-primary" onClick={handleCreate} disabled={createMutation.isLoading}>
                {createMutation.isLoading ? "در حال ایجاد..." : "ایجاد تسک"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
