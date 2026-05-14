import React from "react";
import { useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import api from "../api";


// ── shared helpers ──────────────────────────────────────────
const C = {
  card: { background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", boxShadow:"0 2px 8px rgba(0,0,0,0.06)", padding:20, marginBottom:16 },
  cardHeader: { display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16, flexWrap:"wrap", gap:8 },
  cardTitle: { fontSize:15, fontWeight:700, color:"#0f172a" },
  btn: (color="#6366f1",text="#fff") => ({ display:"inline-flex", alignItems:"center", gap:6, padding:"8px 16px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600, background:color, color:text, transition:"opacity 0.15s" }),
  btnSm: (color="#6366f1",text="#fff") => ({ display:"inline-flex", alignItems:"center", gap:4, padding:"5px 12px", borderRadius:6, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, background:color, color:text }),
  btnGhost: { display:"inline-flex", alignItems:"center", gap:6, padding:"7px 14px", borderRadius:8, border:"1px solid #e2e8f0", cursor:"pointer", fontFamily:"inherit", fontSize:13, fontWeight:600, background:"#fff", color:"#475569" },
  badge: (bg,color) => ({ display:"inline-flex", alignItems:"center", gap:3, padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700, background:bg, color:color, whiteSpace:"nowrap" }),
  input: { width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontFamily:"inherit", fontSize:13, color:"#0f172a", background:"#fff", outline:"none" },
  label: { display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 },
  modal: { position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 },
  modalBox: { background:"#fff", borderRadius:16, padding:24, width:"100%", maxWidth:460, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.2)", animation:"fadeIn 0.2s ease" },
  loading: { textAlign:"center", padding:"48px 24px", color:"#94a3b8", fontSize:14 },
  empty: { textAlign:"center", padding:"48px 24px", color:"#94a3b8" },
  statCard: (color) => ({ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:"16px 18px", position:"relative", overflow:"hidden", cursor:"default" }),
};
const safe = (v) => Array.isArray(v) ? v : [];
const num = (v) => Number(v) || 0;


function MiniBar({ value, max, color }) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div style={{ background:"#f1f5f9", borderRadius:6, height:8, overflow:"hidden", marginTop:6 }}>
      <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:6, transition:"width 0.6s ease" }} />
    </div>
  );
}

function StatCard({ icon, value, label, color, sub, onClick }) {
  return (
    <div onClick={onClick} style={{ ...C.statCard(color), cursor: onClick?"pointer":"default" }}
      onMouseEnter={e => { if(onClick) e.currentTarget.style.transform="translateY(-2px)"; e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,0.1)"; }}
      onMouseLeave={e => { e.currentTarget.style.transform=""; e.currentTarget.style.boxShadow=""; }}>
      <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:color }} />
      <div style={{ fontSize:22, marginBottom:8, marginTop:4 }}>{icon}</div>
      <div style={{ fontSize:26, fontWeight:800, color:"#0f172a", lineHeight:1 }}>{value}</div>
      <div style={{ fontSize:11, color:"#94a3b8", marginTop:5, fontWeight:500 }}>{label}</div>
      {sub !== undefined && <MiniBar value={num(sub)} max={num(value)} color={color} />}
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading, refetch, isFetching } = useQuery(
    "dashboard",
    () => api.get("/stats/dashboard").then(r => r.data),
    { refetchInterval: 30000, retry: 1, onError: () => {} }
  );

  const s = (data && typeof data === "object") ? (data.sessions || {}) : {};
  const t = (data && typeof data === "object") ? (data.tasks || {}) : {};
  const o = (data && typeof data === "object") ? (data.orders || {}) : {};
  const u = (data && typeof data === "object") ? (data.users || {}) : {};

  const total = num(s.total);
  const active = num(s.active);
  const health = total > 0 ? Math.round((active / total) * 100) : 0;
  const hColor = health >= 70 ? "#22c55e" : health >= 40 ? "#f59e0b" : "#ef4444";

  if (isLoading) return (
    <div style={C.loading}>
      <div style={{ width:36, height:36, border:"3px solid #e2e8f0", borderTopColor:"#6366f1", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 12px" }} />
      در حال بارگذاری...
    </div>
  );

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>
      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:800, color:"#0f172a" }}>📊 داشبورد</h2>
          <p style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>آخرین بروزرسانی: {new Date().toLocaleTimeString("fa-IR")}</p>
        </div>
        <button onClick={refetch} disabled={isFetching} style={{ ...C.btnGhost, opacity: isFetching ? 0.6 : 1 }}>
          <span style={{ display:"inline-block", animation: isFetching ? "spin 0.8s linear infinite" : "none" }}>🔄</span>
          {isFetching ? "..." : "بروزرسانی"}
        </button>
      </div>

      {/* Health */}
      <div style={C.card}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
          <span style={{ fontWeight:700, fontSize:14 }}>🏥 سلامت سشن‌ها</span>
          <span style={{ fontWeight:800, fontSize:18, color:hColor }}>{health}%</span>
        </div>
        <div style={{ background:"#f1f5f9", borderRadius:8, height:12, overflow:"hidden" }}>
          <div style={{ width:`${health}%`, height:"100%", background:hColor, borderRadius:8, transition:"width 0.8s ease" }} />
        </div>
        <div style={{ display:"flex", gap:16, marginTop:10, flexWrap:"wrap" }}>
          {[
            ["✅ فعال", s.active, "#22c55e"],
            ["🔴 لاگ‌اوت", s.logged_out, "#ef4444"],
            ["🌊 فلود", s.flood, "#f59e0b"],
            ["🚫 بن", s.banned, "#8b5cf6"],
            ["⚠️ خطا", s.error, "#ef4444"],
          ].map(([label, val, color]) => (
            <span key={label} style={{ fontSize:12, color, fontWeight:600 }}>{label}: {num(val)}</span>
          ))}
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:12, marginBottom:16 }}>
        <StatCard icon="📱" value={total.toLocaleString("fa-IR")} label="کل سشن‌ها" color="#6366f1" onClick={() => navigate("/sessions")} />
        <StatCard icon="✅" value={num(s.active).toLocaleString("fa-IR")} label="سشن فعال" color="#22c55e" onClick={() => navigate("/sessions")} />
        <StatCard icon="⚡" value={num(t.running)} label="تسک فعال" color="#f59e0b" onClick={() => navigate("/tasks")} />
        <StatCard icon="🔍" value={num(o.confirming)} label="سفارش در بررسی" color="#06b6d4" onClick={() => navigate("/orders")} />
        <StatCard icon="👥" value={num(u.total)} label="کاربران" color="#8b5cf6" onClick={() => navigate("/users")} />
        <StatCard icon="💵" value={"$"+num(o.total_revenue).toFixed(0)} label="درآمد کل" color="#22c55e" onClick={() => navigate("/orders")} />
      </div>

      {/* Task & Session status */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:16, marginBottom:16 }}>
        {/* Sessions */}
        <div style={C.card}>
          <div style={{ ...C.cardHeader, marginBottom:12 }}><span style={C.cardTitle}>📱 وضعیت سشن‌ها</span></div>
          {[
            ["✅ فعال", s.active, "#22c55e"],
            ["🔴 لاگ‌اوت", s.logged_out, "#ef4444"],
            ["🌊 فلود", s.flood, "#f59e0b"],
            ["🚫 بن", s.banned, "#8b5cf6"],
            ["⚠️ خطا", s.error, "#94a3b8"],
          ].map(([label, val, color]) => {
            const v = num(val);
            const pct = total > 0 ? Math.round((v/total)*100) : 0;
            return (
              <div key={label} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
                  <span style={{ fontWeight:600 }}>{label}</span>
                  <span style={{ color:"#94a3b8" }}>{v} ({pct}%)</span>
                </div>
                <div style={{ background:"#f1f5f9", borderRadius:6, height:7, overflow:"hidden" }}>
                  <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:6, transition:"width 0.6s" }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Tasks */}
        <div style={C.card}>
          <div style={{ ...C.cardHeader, marginBottom:12 }}><span style={C.cardTitle}>📋 وضعیت تسک‌ها</span></div>
          {[
            ["⏳ در صف", t.pending, "#94a3b8"],
            ["⚡ در حال اجرا", t.running, "#06b6d4"],
            ["✅ تکمیل", t.completed, "#22c55e"],
            ["❌ ناموفق", t.failed, "#ef4444"],
          ].map(([label, val, color]) => {
            const v = num(val);
            const tTotal = num(t.pending)+num(t.running)+num(t.completed)+num(t.failed);
            const pct = tTotal > 0 ? Math.round((v/tTotal)*100) : 0;
            return (
              <div key={label} style={{ marginBottom:10 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, marginBottom:4 }}>
                  <span style={{ fontWeight:600 }}>{label}</span>
                  <span style={{ color:"#94a3b8" }}>{v}</span>
                </div>
                <div style={{ background:"#f1f5f9", borderRadius:6, height:7, overflow:"hidden" }}>
                  <div style={{ width:`${pct}%`, height:"100%", background:color, borderRadius:6, transition:"width 0.6s" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Quick Actions */}
      <div style={C.card}>
        <div style={C.cardHeader}><span style={C.cardTitle}>⚡ دسترسی سریع</span></div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:10 }}>
          {[
            ["📱","سشن‌ها",`${total} سشن`,"/sessions","#6366f1"],
            ["📋","تسک‌ها",`${num(t.pending)} در صف`,"/tasks","#f59e0b"],
            ["💰","سفارشات",`${num(o.confirming)} بررسی`,"/orders","#06b6d4"],
            ["👥","کاربران",`${num(u.total)} نفر`,"/users","#8b5cf6"],
            ["🌐","پروکسی‌ها","مدیریت","/proxies","#22c55e"],
            ["⚙️","تنظیمات","پیکربندی","/settings","#64748b"],
          ].map(([icon,label,sub,to,color]) => (
            <button key={to} onClick={() => navigate(to)} style={{
              display:"flex", alignItems:"center", gap:12, padding:"12px 14px",
              borderRadius:10, border:`1.5px solid ${color}25`, background:"#fff",
              cursor:"pointer", textAlign:"right", fontFamily:"inherit", transition:"all 0.15s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor=color; e.currentTarget.style.background=color+"08"; e.currentTarget.style.transform="translateY(-1px)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor=color+"25"; e.currentTarget.style.background="#fff"; e.currentTarget.style.transform=""; }}>
              <div style={{ width:38, height:38, borderRadius:10, background:color+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, flexShrink:0 }}>{icon}</div>
              <div>
                <div style={{ fontWeight:700, fontSize:13, color:"#0f172a" }}>{label}</div>
                <div style={{ fontSize:11, color:"#94a3b8", marginTop:1 }}>{sub}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
