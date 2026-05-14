import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const TYPE_COLORS = { socks5: "#6366f1", socks4: "#8b5cf6", http: "#06b6d4", https: "#22c55e" };

function ProxyCard({ proxy, onDelete, onToggle }) {
  const typeColor = TYPE_COLORS[proxy.proxy_type] || "#64748b";
  return (
    <div style={{
      background: proxy.is_active ? "white" : "#f8fafc",
      border: "1.5px solid #e2e8f0", borderRadius: 14, padding: "16px 18px",
      display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
      opacity: proxy.is_active ? 1 : 0.6, transition: "all 0.2s",
      boxShadow: proxy.is_active ? "0 2px 8px rgba(0,0,0,0.05)" : "none"
    }}>
      <div style={{
        background: typeColor + "18", color: typeColor, border: `1.5px solid ${typeColor}40`,
        borderRadius: 10, padding: "6px 12px", fontWeight: 700, fontSize: "0.8rem", flexShrink: 0
      }}>
        {(proxy.proxy_type || "").toUpperCase()}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1e293b" }}>
          <code style={{ background: "#f1f5f9", padding: "2px 8px", borderRadius: 6, fontSize: "0.88rem" }}>
            {proxy.host}:{proxy.port}
          </code>
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 6, flexWrap: "wrap" }}>
          {proxy.username && <span style={{ fontSize: "0.78rem", color: "#64748b" }}>👤 {proxy.username}</span>}
          {proxy.country && <span style={{ fontSize: "0.78rem", color: "#64748b" }}>🌍 {proxy.country}</span>}
          {proxy.latency_ms && (
            <span style={{ fontSize: "0.78rem", fontWeight: 600, color: proxy.latency_ms < 200 ? "#22c55e" : proxy.latency_ms < 500 ? "#f59e0b" : "#ef4444" }}>
              ⚡ {proxy.latency_ms}ms
            </span>
          )}
          <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
            📅 {new Date(proxy.created_at).toLocaleDateString("fa-IR")}
          </span>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button className={`btn btn-sm ${proxy.is_active ? "btn-warning" : "btn-success"}`} onClick={() => onToggle(proxy.id)}>
          {proxy.is_active ? "⏸ غیرفعال" : "▶️ فعال"}
        </button>
        <button className="btn btn-danger btn-sm" onClick={() => { if (window.confirm("حذف پروکسی؟")) onDelete(proxy.id); }}>🗑</button>
      </div>
    </div>
  );
}

export default function Proxies() {
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [filterActive, setFilterActive] = useState("");
  const [form, setForm] = useState({ host: "", port: "", proxy_type: "socks5", username: "", password: "", country: "" });
  const [bulkText, setBulkText] = useState("");

  const { data, isLoading } = useQuery("proxies", () => api.get("/proxies/").then(r => r.data), { refetchInterval: 30000 });
  const proxies = data || [];
  const filtered = proxies.filter(p => {
    if (filterType && p.proxy_type !== filterType) return false;
    if (filterActive === "active" && !p.is_active) return false;
    if (filterActive === "inactive" && p.is_active) return false;
    return true;
  });

  const addMutation = useMutation(
    (d) => api.post("/proxies/", { ...d, port: parseInt(d.port) }),
    { onSuccess: () => { qc.invalidateQueries("proxies"); toast.success("✅ پروکسی اضافه شد."); setShowModal(false); setForm({ host: "", port: "", proxy_type: "socks5", username: "", password: "", country: "" }); }, onError: (e) => toast.error(e.response?.data?.detail || "خطا") }
  );
  const deleteMutation = useMutation((id) => api.delete(`/proxies/${id}`), { onSuccess: () => { qc.invalidateQueries("proxies"); toast.success("پروکسی حذف شد."); } });
  const toggleMutation = useMutation((id) => api.patch(`/proxies/${id}/toggle`), { onSuccess: () => qc.invalidateQueries("proxies") });

  const handleBulkAdd = () => {
    const lines = bulkText.trim().split("\n").filter(l => l.trim());
    const items = [];
    for (const line of lines) {
      try {
        if (line.includes("://")) {
          const url = new URL(line);
          items.push({ proxy_type: url.protocol.replace(":", ""), host: url.hostname, port: parseInt(url.port), username: url.username || null, password: url.password || null });
        } else {
          const parts = line.split(":");
          items.push({ proxy_type: "socks5", host: parts[0], port: parseInt(parts[1]), username: parts[2] || null, password: parts[3] || null });
        }
      } catch (e) {}
    }
    if (!items.length) return toast.error("هیچ پروکسی معتبری یافت نشد");
    api.post("/proxies/bulk", items)
      .then(res => { qc.invalidateQueries("proxies"); toast.success(`✅ ${res.data.added} پروکسی اضافه شد.`); setShowBulkModal(false); setBulkText(""); })
      .catch(() => toast.error("خطا در آپلود"));
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6" style={{ flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>🌐 پروکسی‌ها</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowBulkModal(true)}>📤 آپلود گروهی</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowModal(true)}>+ افزودن</button>
        </div>
      </div>

      <div className="stat-grid mb-6">
        <div className="stat-card"><div className="icon" style={{ background: "#ede9fe20" }}>🌐</div><div className="value">{proxies.length}</div><div className="label">کل</div></div>
        <div className="stat-card"><div className="icon" style={{ background: "#f0fdf420" }}>✅</div><div className="value">{proxies.filter(p => p.is_active).length}</div><div className="label">فعال</div></div>
        <div className="stat-card"><div className="icon" style={{ background: "#fff1f220" }}>⏸</div><div className="value">{proxies.filter(p => !p.is_active).length}</div><div className="label">غیرفعال</div></div>
        <div className="stat-card"><div className="icon" style={{ background: "#ede9fe20" }}>🔄</div><div className="value">{proxies.filter(p => p.proxy_type === "socks5").length}</div><div className="label">SOCKS5</div></div>
      </div>

      <div className="card mb-4">
        <div className="filters">
          {["","socks5","socks4","http","https"].map(t => (
            <button key={t} className={`filter-btn ${filterType === t ? "active" : ""}`} onClick={() => setFilterType(t)}>
              {t === "" ? "همه نوع" : t.toUpperCase()}
            </button>
          ))}
          <div style={{ width: 1, background: "#e2e8f0", margin: "0 4px", alignSelf: "stretch" }} />
          <button className={`filter-btn ${filterActive === "" ? "active" : ""}`} onClick={() => setFilterActive("")}>همه</button>
          <button className={`filter-btn ${filterActive === "active" ? "active" : ""}`} onClick={() => setFilterActive("active")}>✅ فعال</button>
          <button className={`filter-btn ${filterActive === "inactive" ? "active" : ""}`} onClick={() => setFilterActive("inactive")}>⏸ غیرفعال</button>
        </div>
      </div>

      {isLoading ? <div className="loading">⏳ در حال بارگذاری...</div>
        : filtered.length === 0 ? <div className="card"><div className="empty-state"><div className="icon">🌐</div><p>پروکسی‌ای یافت نشد</p></div></div>
        : <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {filtered.map(p => <ProxyCard key={p.id} proxy={p} onDelete={id => deleteMutation.mutate(id)} onToggle={id => toggleMutation.mutate(id)} />)}
          </div>
      }

      {showModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div className="modal">
            <h3 className="modal-title">🌐 افزودن پروکسی</h3>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Host</label><input className="form-control" placeholder="1.2.3.4" value={form.host} onChange={e => setForm(f => ({...f, host: e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">Port</label><input className="form-control" type="number" placeholder="1080" value={form.port} onChange={e => setForm(f => ({...f, port: e.target.value}))} /></div>
            </div>
            <div className="form-group">
              <label className="form-label">نوع</label>
              <select className="form-control" value={form.proxy_type} onChange={e => setForm(f => ({...f, proxy_type: e.target.value}))}>
                <option value="socks5">SOCKS5</option><option value="socks4">SOCKS4</option><option value="http">HTTP</option><option value="https">HTTPS</option>
              </select>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">یوزرنیم — اختیاری</label><input className="form-control" value={form.username} onChange={e => setForm(f => ({...f, username: e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">رمز — اختیاری</label><input className="form-control" type="password" value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} /></div>
            </div>
            <div className="form-group"><label className="form-label">کشور — اختیاری</label><input className="form-control" placeholder="IR, DE, US" value={form.country} onChange={e => setForm(f => ({...f, country: e.target.value.toUpperCase()}))} /></div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>انصراف</button>
              <button className="btn btn-primary" onClick={() => addMutation.mutate(form)} disabled={!form.host || !form.port || addMutation.isLoading}>{addMutation.isLoading ? "در حال..." : "✅ افزودن"}</button>
            </div>
          </div>
        </div>
      )}

      {showBulkModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowBulkModal(false)}>
          <div className="modal" style={{ maxWidth: 540 }}>
            <h3 className="modal-title">📤 آپلود گروهی</h3>
            <p style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: 12 }}>
              فرمت: <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>host:port:user:pass</code> یا <code style={{ background: "#f1f5f9", padding: "2px 6px", borderRadius: 4 }}>socks5://user:pass@host:port</code>
            </p>
            <textarea className="form-control" rows={10} placeholder="1.2.3.4:1080:user:pass" value={bulkText} onChange={e => setBulkText(e.target.value)} style={{ fontFamily: "monospace", fontSize: "0.82rem", resize: "vertical" }} />
            <p style={{ fontSize: "0.82rem", color: "#64748b", marginTop: 8 }}>{bulkText.trim().split("\n").filter(l => l.trim()).length} پروکسی آماده</p>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowBulkModal(false)}>انصراف</button>
              <button className="btn btn-primary" onClick={handleBulkAdd}>📤 آپلود</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
