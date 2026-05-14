import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const TYPE_COLORS = { socks5:"#6366f1", socks4:"#8b5cf6", http:"#06b6d4", https:"#22c55e" };

export default function Proxies() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [form, setForm] = useState({ host:"", port:"", proxy_type:"socks5", username:"", password:"", country:"" });
  const [bulk, setBulk] = useState("");

  const { data, isLoading } = useQuery("proxies",
    () => api.get("/proxies/").then(r => r.data),
    { refetchInterval: 30000 }
  );

  const proxies = Array.isArray(data) ? data : [];
  const filtered = proxies.filter(p => {
    if (filterType && p.proxy_type !== filterType) return false;
    if (filterStatus === "active" && !p.is_active) return false;
    if (filterStatus === "inactive" && p.is_active) return false;
    return true;
  });

  const addM = useMutation(
    d => api.post("/proxies/", { ...d, port: parseInt(d.port) }),
    { onSuccess: () => { qc.invalidateQueries("proxies"); toast.success("✅ پروکسی اضافه شد."); setShowAdd(false); setForm({ host:"",port:"",proxy_type:"socks5",username:"",password:"",country:"" }); }, onError: e => toast.error(e.response?.data?.detail||"خطا") }
  );
  const delM = useMutation(id => api.delete(`/proxies/${id}`),
    { onSuccess: () => { qc.invalidateQueries("proxies"); toast.success("پروکسی حذف شد."); } });
  const toggleM = useMutation(id => api.patch(`/proxies/${id}/toggle`),
    { onSuccess: () => qc.invalidateQueries("proxies") });

  const handleBulk = () => {
    const lines = bulk.trim().split("\n").filter(l => l.trim());
    const items = [];
    for (const line of lines) {
      try {
        if (line.includes("://")) {
          const u = new URL(line);
          items.push({ proxy_type: u.protocol.replace(":",""), host: u.hostname, port: parseInt(u.port), username: u.username||null, password: u.password||null });
        } else {
          const p = line.split(":");
          items.push({ proxy_type:"socks5", host:p[0], port:parseInt(p[1]), username:p[2]||null, password:p[3]||null });
        }
      } catch(e) {}
    }
    if (!items.length) return toast.error("هیچ پروکسی معتبری یافت نشد");
    api.post("/proxies/bulk", items)
      .then(res => { qc.invalidateQueries("proxies"); toast.success(`✅ ${res.data.added||items.length} پروکسی اضافه شد.`); setShowBulk(false); setBulk(""); })
      .catch(() => toast.error("خطا در آپلود"));
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <h2 style={{ fontSize:"1.3rem", fontWeight:800 }}>🌐 پروکسی‌ها</h2>
        <div style={{ display:"flex", gap:8 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => setShowBulk(true)}>📤 آپلود گروهی</button>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdd(true)}>+ افزودن</button>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card"><div className="icon">🌐</div><div className="value">{proxies.length}</div><div className="label">کل</div><div className="bar" style={{background:"#6366f1"}} /></div>
        <div className="stat-card"><div className="icon">✅</div><div className="value">{proxies.filter(p=>p.is_active).length}</div><div className="label">فعال</div><div className="bar" style={{background:"#22c55e"}} /></div>
        <div className="stat-card"><div className="icon">⏸</div><div className="value">{proxies.filter(p=>!p.is_active).length}</div><div className="label">غیرفعال</div><div className="bar" style={{background:"#94a3b8"}} /></div>
        <div className="stat-card"><div className="icon">🔄</div><div className="value">{proxies.filter(p=>p.proxy_type==="socks5").length}</div><div className="label">SOCKS5</div><div className="bar" style={{background:"#8b5cf6"}} /></div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="filters">
          {["","socks5","socks4","http","https"].map(t => (
            <button key={t} className={`filter-btn ${filterType===t?"active":""}`} onClick={() => setFilterType(t)}>
              {t===""?"همه نوع":t.toUpperCase()}
            </button>
          ))}
          <div style={{ width:1, background:"var(--border)", margin:"0 4px", alignSelf:"stretch" }} />
          <button className={`filter-btn ${filterStatus===""?"active":""}`} onClick={() => setFilterStatus("")}>همه</button>
          <button className={`filter-btn ${filterStatus==="active"?"active":""}`} onClick={() => setFilterStatus("active")}>✅ فعال</button>
          <button className={`filter-btn ${filterStatus==="inactive"?"active":""}`} onClick={() => setFilterStatus("inactive")}>⏸ غیرفعال</button>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="loading"><div className="loading-spinner" />در حال بارگذاری...</div>
      ) : filtered.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="icon">🌐</div><p>پروکسی‌ای یافت نشد</p></div></div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {filtered.map(p => {
            const tc = TYPE_COLORS[p.proxy_type] || "#64748b";
            return (
              <div key={p.id} className="card" style={{ marginBottom:0, display:"flex", alignItems:"center", gap:14, flexWrap:"wrap", opacity:p.is_active?1:0.6 }}>
                <div style={{ background:tc+"18", color:tc, border:`1.5px solid ${tc}40`, borderRadius:8, padding:"5px 10px", fontWeight:700, fontSize:"0.75rem", flexShrink:0 }}>
                  {(p.proxy_type||"").toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <code style={{ background:"var(--bg)", padding:"3px 8px", borderRadius:6, fontSize:"0.85rem", fontWeight:700 }}>
                    {p.host}:{p.port}
                  </code>
                  <div style={{ display:"flex", gap:10, marginTop:5, flexWrap:"wrap" }}>
                    {p.username && <span style={{ fontSize:"0.75rem", color:"var(--text-3)" }}>👤 {p.username}</span>}
                    {p.country && <span style={{ fontSize:"0.75rem", color:"var(--text-3)" }}>🌍 {p.country}</span>}
                    {p.latency_ms != null && (
                      <span style={{ fontSize:"0.75rem", fontWeight:600, color:p.latency_ms<200?"#22c55e":p.latency_ms<500?"#f59e0b":"#ef4444" }}>
                        ⚡ {p.latency_ms}ms
                      </span>
                    )}
                  </div>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <button className={`btn btn-sm ${p.is_active?"btn-warning":"btn-success"}`} onClick={() => toggleM.mutate(p.id)}>
                    {p.is_active?"⏸ غیرفعال":"▶ فعال"}
                  </button>
                  <button className="btn btn-danger btn-sm" onClick={() => { if(window.confirm("حذف پروکسی؟")) delM.mutate(p.id); }}>🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Modal */}
      {showAdd && (
        <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && setShowAdd(false)}>
          <div className="modal">
            <h3 className="modal-title">🌐 افزودن پروکسی</h3>
            <div className="form-row">
              <div className="form-group"><label className="form-label">Host</label><input className="form-control" placeholder="1.2.3.4" value={form.host} onChange={e => setForm(f=>({...f,host:e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">Port</label><input className="form-control" type="number" placeholder="1080" value={form.port} onChange={e => setForm(f=>({...f,port:e.target.value}))} /></div>
            </div>
            <div className="form-group">
              <label className="form-label">نوع</label>
              <select className="form-control" value={form.proxy_type} onChange={e => setForm(f=>({...f,proxy_type:e.target.value}))}>
                <option value="socks5">SOCKS5</option><option value="socks4">SOCKS4</option><option value="http">HTTP</option><option value="https">HTTPS</option>
              </select>
            </div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">یوزرنیم (اختیاری)</label><input className="form-control" value={form.username} onChange={e => setForm(f=>({...f,username:e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">رمز (اختیاری)</label><input className="form-control" type="password" value={form.password} onChange={e => setForm(f=>({...f,password:e.target.value}))} /></div>
            </div>
            <div className="form-group"><label className="form-label">کشور (اختیاری)</label><input className="form-control" placeholder="IR, DE, US" value={form.country} onChange={e => setForm(f=>({...f,country:e.target.value.toUpperCase()}))} /></div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowAdd(false)}>انصراف</button>
              <button className="btn btn-primary" onClick={() => addM.mutate(form)} disabled={!form.host||!form.port||addM.isLoading}>
                {addM.isLoading?"در حال...":"✅ افزودن"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Modal */}
      {showBulk && (
        <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && setShowBulk(false)}>
          <div className="modal" style={{ maxWidth:520 }}>
            <h3 className="modal-title">📤 آپلود گروهی</h3>
            <p style={{ fontSize:"0.82rem", color:"var(--text-3)", marginBottom:12 }}>
              فرمت: <code style={{background:"var(--bg)",padding:"2px 6px",borderRadius:4}}>host:port:user:pass</code> یا <code style={{background:"var(--bg)",padding:"2px 6px",borderRadius:4}}>socks5://user:pass@host:port</code>
            </p>
            <textarea className="form-control" rows={10} placeholder="1.2.3.4:1080:user:pass" value={bulk} onChange={e => setBulk(e.target.value)} style={{ fontFamily:"monospace", fontSize:"0.8rem" }} />
            <p style={{ fontSize:"0.78rem", color:"var(--text-3)", marginTop:6 }}>{bulk.trim().split("\n").filter(l=>l.trim()).length} پروکسی آماده</p>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowBulk(false)}>انصراف</button>
              <button className="btn btn-primary" onClick={handleBulk}>📤 آپلود</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
