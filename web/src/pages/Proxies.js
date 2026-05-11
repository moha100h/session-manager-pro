import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

export default function Proxies() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [form, setForm] = useState({ host: "", port: "", proxy_type: "socks5", username: "", password: "", country: "" });
  const [bulkText, setBulkText] = useState("");

  const { data, isLoading } = useQuery("proxies", () => api.get("/proxies/").then(r => r.data));

  const addMutation = useMutation(
    (d) => api.post("/proxies/", { ...d, port: parseInt(d.port) }),
    { onSuccess: () => { qc.invalidateQueries("proxies"); toast.success("پروکسی اضافه شد."); setShowModal(false); setForm({ host: "", port: "", proxy_type: "socks5", username: "", password: "", country: "" }); } }
  );

  const deleteMutation = useMutation(
    (id) => api.delete(`/proxies/${id}`),
    { onSuccess: () => { qc.invalidateQueries("proxies"); toast.success("پروکسی حذف شد."); } }
  );

  const toggleMutation = useMutation(
    (id) => api.patch(`/proxies/${id}/toggle`),
    { onSuccess: () => qc.invalidateQueries("proxies") }
  );

  const handleBulkAdd = () => {
    const lines = bulkText.trim().split("\n").filter(l => l.trim());
    const proxies = [];
    for (const line of lines) {
      try {
        if (line.includes("://")) {
          const url = new URL(line);
          proxies.push({ proxy_type: url.protocol.replace(":", ""), host: url.hostname, port: parseInt(url.port), username: url.username || null, password: url.password || null });
        } else {
          const parts = line.split(":");
          proxies.push({ proxy_type: "socks5", host: parts[0], port: parseInt(parts[1]), username: parts[2] || null, password: parts[3] || null });
        }
      } catch (e) {}
    }
    if (!proxies.length) return toast.error("هیچ پروکسی معتبری یافت نشد.");
    api.post("/proxies/bulk", proxies).then(res => { qc.invalidateQueries("proxies"); toast.success(`${res.data.added} پروکسی اضافه شد.`); setShowBulkModal(false); setBulkText(""); }).catch(() => toast.error("خطا در افزودن پروکسی‌ها."));
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 style={{ fontSize: "1.4rem", fontWeight: 700 }}>🌐 مدیریت پروکسی‌ها</h2>
        <div className="flex gap-2">
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>➕ افزودن</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowBulkModal(true)}>📤 دسته‌ای</button>
        </div>
      </div>

      <div className="card">
        {isLoading ? <div className="loading">⏳ در حال بارگذاری...</div> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>هاست</th><th>پورت</th><th>نوع</th><th>کشور</th><th>موفق</th><th>ناموفق</th><th>وضعیت</th><th>عملیات</th></tr>
              </thead>
              <tbody>
                {(data || []).map(p => (
                  <tr key={p.id}>
                    <td><code style={{ fontSize: "0.85rem" }}>{p.host}</code></td>
                    <td>{p.port}</td>
                    <td><span className="badge badge-info">{p.proxy_type}</span></td>
                    <td>{p.country || "—"}</td>
                    <td style={{ color: "#22c55e" }}>{p.success_count}</td>
                    <td style={{ color: "#ef4444" }}>{p.fail_count}</td>
                    <td>
                      <button onClick={() => toggleMutation.mutate(p.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.2rem" }}>
                        {p.is_active ? "🟢" : "🔴"}
                      </button>
                    </td>
                    <td>
                      <button className="btn btn-danger btn-sm" onClick={() => { if (window.confirm("حذف شود؟")) deleteMutation.mutate(p.id); }}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!(data || []).length && <div className="loading">📭 پروکسی‌ای یافت نشد.</div>}
          </div>
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>➕ افزودن پروکسی</h3>
            <div className="flex gap-2">
              <div className="form-group" style={{ flex: 2 }}><label>هاست</label><input className="input" placeholder="1.2.3.4" value={form.host} onChange={e => setForm({...form, host: e.target.value})} /></div>
              <div className="form-group" style={{ flex: 1 }}><label>پورت</label><input className="input" type="number" placeholder="1080" value={form.port} onChange={e => setForm({...form, port: e.target.value})} /></div>
            </div>
            <div className="form-group"><label>نوع</label><select className="input" value={form.proxy_type} onChange={e => setForm({...form, proxy_type: e.target.value})}><option value="socks5">SOCKS5</option><option value="socks4">SOCKS4</option><option value="http">HTTP</option></select></div>
            <div className="flex gap-2">
              <div className="form-group" style={{ flex: 1 }}><label>نام کاربری</label><input className="input" placeholder="اختیاری" value={form.username} onChange={e => setForm({...form, username: e.target.value})} /></div>
              <div className="form-group" style={{ flex: 1 }}><label>رمز عبور</label><input className="input" type="password" placeholder="اختیاری" value={form.password} onChange={e => setForm({...form, password: e.target.value})} /></div>
            </div>
            <div className="form-group"><label>کشور (اختیاری)</label><input className="input" placeholder="IR, US, DE..." value={form.country} onChange={e => setForm({...form, country: e.target.value})} /></div>
            <div className="flex gap-2 justify-end">
              <button className="btn" onClick={() => setShowModal(false)}>انصراف</button>
              <button className="btn btn-primary" onClick={() => addMutation.mutate(form)} disabled={addMutation.isLoading}>{addMutation.isLoading ? "در حال افزودن..." : "افزودن"}</button>
            </div>
          </div>
        </div>
      )}

      {showBulkModal && (
        <div className="modal-overlay" onClick={() => setShowBulkModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 520 }}>
            <h3>📤 افزودن دسته‌ای پروکسی</h3>
            <p className="text-sm text-light mb-4">هر پروکسی در یک خط:<br/><code>socks5://user:pass@host:port</code><br/>یا<br/><code>host:port:user:pass</code></p>
            <div className="form-group"><textarea className="input" rows={10} placeholder="1.2.3.4:1080:user:pass&#10;socks5://user:pass@5.6.7.8:1080" value={bulkText} onChange={e => setBulkText(e.target.value)} style={{ fontFamily: "monospace", fontSize: "0.82rem" }} /></div>
            <div className="flex gap-2 justify-end">
              <button className="btn" onClick={() => setShowBulkModal(false)}>انصراف</button>
              <button className="btn btn-primary" onClick={handleBulkAdd}>افزودن همه</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
