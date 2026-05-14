import React from "react";
import { useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from "recharts";
import api from "../api";

const COLORS = ["#22c55e","#ef4444","#f59e0b","#6366f1","#06b6d4","#8b5cf6"];

function StatCard({ icon, value, label, color, onClick }) {
  return (
    <div className="stat-card" onClick={onClick} style={{ cursor: onClick ? "pointer" : "default" }}>
      <div className="icon">{icon}</div>
      <div className="value">{value ?? 0}</div>
      <div className="label">{label}</div>
      <div className="bar" style={{ background: color }} />
    </div>
  );
}

function QuickBtn({ icon, label, sub, color, onClick }) {
  return (
    <button className="quick-action" onClick={onClick}
      style={{ borderColor: color + "30" }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color; e.currentTarget.style.background = color + "08"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = color + "30"; e.currentTarget.style.background = ""; }}
    >
      <div style={{ width: 42, height: 42, borderRadius: 12, background: color + "18",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1.3rem", flexShrink: 0 }}>
        {icon}
      </div>
      <div style={{ flex: 1, textAlign: "right" }}>
        <div style={{ fontWeight: 700, fontSize: "0.88rem", color: "var(--text)" }}>{label}</div>
        <div style={{ fontSize: "0.75rem", color: "var(--text-3)", marginTop: 2 }}>{sub}</div>
      </div>
      <span style={{ color: "var(--text-3)" }}>‹</span>
    </button>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { data, isLoading, refetch, isFetching } = useQuery(
    "dashboard",
    () => api.get("/stats/dashboard").then(r => r.data),
    { refetchInterval: 30000, retry: 1 }
  );

  const s = data?.sessions || {};
  const t = data?.tasks || {};
  const o = data?.orders || {};
  const u = data?.users || {};

  const total = Number(s.total || 0);
  const active = Number(s.active || 0);
  const health = total > 0 ? Math.round((active / total) * 100) : 0;
  const healthColor = health >= 70 ? "#22c55e" : health >= 40 ? "#f59e0b" : "#ef4444";

  const pieData = [
    { name: "فعال",    value: Number(s.active || 0) },
    { name: "لاگ‌اوت", value: Number(s.logged_out || 0) },
    { name: "فلود",    value: Number(s.flood || 0) },
    { name: "بن",      value: Number(s.banned || 0) },
    { name: "خطا",     value: Number(s.error || 0) },
  ].filter(d => d.value > 0);

  const barData = [
    { name: "در صف",    value: Number(t.pending || 0) },
    { name: "در حال اجرا", value: Number(t.running || 0) },
    { name: "تکمیل",   value: Number(t.completed || 0) },
    { name: "ناموفق",  value: Number(t.failed || 0) },
  ];

  if (isLoading) return (
    <div className="loading">
      <div className="loading-spinner" />
      در حال بارگذاری داشبورد...
    </div>
  );

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24, flexWrap: "wrap", gap: 10 }}>
        <div>
          <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>📊 داشبورد</h2>
          <p style={{ fontSize: "0.78rem", color: "var(--text-3)", marginTop: 2 }}>
            آخرین بروزرسانی: {new Date().toLocaleTimeString("fa-IR")}
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={refetch} disabled={isFetching}>
          <span style={{ display: "inline-block", animation: isFetching ? "spin 0.8s linear infinite" : "none" }}>🔄</span>
          {isFetching ? "در حال بروزرسانی..." : "بروزرسانی"}
        </button>
      </div>

      {/* Health Bar */}
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontWeight: 700, fontSize: "0.9rem" }}>🏥 سلامت سشن‌ها</span>
          <span style={{ fontWeight: 800, fontSize: "1.1rem", color: healthColor }}>{health}%</span>
        </div>
        <div className="health-bar-wrap">
          <div className="health-bar-fill" style={{ width: `${health}%`, background: healthColor }} />
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.75rem", color: "#22c55e", fontWeight: 600 }}>✅ فعال: {s.active || 0}</span>
          <span style={{ fontSize: "0.75rem", color: "#ef4444", fontWeight: 600 }}>❌ لاگ‌اوت: {s.logged_out || 0}</span>
          <span style={{ fontSize: "0.75rem", color: "#f59e0b", fontWeight: 600 }}>🌊 فلود: {s.flood || 0}</span>
          <span style={{ fontSize: "0.75rem", color: "#8b5cf6", fontWeight: 600 }}>🚫 بن: {s.banned || 0}</span>
          <span style={{ fontSize: "0.75rem", color: "#ef4444", fontWeight: 600 }}>⚠️ خطا: {s.error || 0}</span>
        </div>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        <StatCard icon="📱" value={total.toLocaleString("fa-IR")} label="کل سشن‌ها" color="#6366f1" onClick={() => navigate("/sessions")} />
        <StatCard icon="✅" value={active.toLocaleString("fa-IR")} label="سشن فعال" color="#22c55e" onClick={() => navigate("/sessions")} />
        <StatCard icon="⚡" value={Number(t.running || 0)} label="تسک فعال" color="#f59e0b" onClick={() => navigate("/tasks")} />
        <StatCard icon="🔍" value={Number(o.confirming || 0)} label="سفارش در بررسی" color="#06b6d4" onClick={() => navigate("/orders")} />
        <StatCard icon="👥" value={Number(u.total || 0)} label="کاربران" color="#8b5cf6" onClick={() => navigate("/users")} />
        <StatCard icon="💵" value={"$" + Number(o.total_revenue || 0).toFixed(0)} label="درآمد کل" color="#22c55e" onClick={() => navigate("/orders")} />
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 16, marginBottom: 20 }}>
        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header"><span className="card-title">📱 وضعیت سشن‌ها</span></div>
          {pieData.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={75} dataKey="value" paddingAngle={3}>
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => v.toLocaleString("fa-IR")} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
                {pieData.map((d, i) => (
                  <span key={i} style={{ fontSize: "0.72rem", display: "flex", alignItems: "center", gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS[i % COLORS.length], display: "inline-block" }} />
                    {d.name}: {d.value}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state" style={{ padding: "24px" }}>
              <div className="icon">📱</div><p>داده‌ای موجود نیست</p>
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: 0 }}>
          <div className="card-header"><span className="card-title">📋 وضعیت تسک‌ها</span></div>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={barData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fontFamily: "Vazirmatn" }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={v => v.toLocaleString("fa-IR")} />
              <Bar dataKey="value" name="تعداد" radius={[6,6,0,0]}>
                {barData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="card">
        <div className="card-header"><span className="card-title">⚡ دسترسی سریع</span></div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 10 }}>
          <QuickBtn icon="📱" label="سشن‌ها" sub={`${total} سشن ثبت‌شده`} color="#6366f1" onClick={() => navigate("/sessions")} />
          <QuickBtn icon="📋" label="تسک‌ها" sub={`${t.pending || 0} در صف انتظار`} color="#f59e0b" onClick={() => navigate("/tasks")} />
          <QuickBtn icon="💰" label="سفارشات" sub={`${o.confirming || 0} نیاز به بررسی`} color="#06b6d4" onClick={() => navigate("/orders")} />
          <QuickBtn icon="👥" label="کاربران" sub={`${u.total || 0} نفر`} color="#8b5cf6" onClick={() => navigate("/users")} />
          <QuickBtn icon="🌐" label="پروکسی‌ها" sub="مدیریت پروکسی‌ها" color="#22c55e" onClick={() => navigate("/proxies")} />
          <QuickBtn icon="⚙️" label="تنظیمات" sub="پیکربندی سیستم" color="#64748b" onClick={() => navigate("/settings")} />
        </div>
      </div>
    </div>
  );
}
