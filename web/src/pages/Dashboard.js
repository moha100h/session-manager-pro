import React, { useState } from "react";
import { useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";
import api from "../api";

const COLORS = ["#22c55e","#ef4444","#f59e0b","#6366f1","#06b6d4","#8b5cf6"];

const SESSION_LABELS = {
  active: "فعال", logged_out: "لاگ‌اوت",
  flood: "فلود", banned: "بن", error: "خطا", deleted: "حذف"
};

function MiniStat({ icon, value, label, color, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "white", borderRadius: 16, padding: "20px 22px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        border: `1.5px solid ${color}20`,
        cursor: onClick ? "pointer" : "default",
        transition: "all 0.2s", position: "relative", overflow: "hidden"
      }}
      onMouseEnter={e => { if(onClick) e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = `0 8px 24px ${color}25`; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)"; }}
    >
      <div style={{
        position: "absolute", top: -10, left: -10,
        width: 70, height: 70, borderRadius: "50%",
        background: color + "12"
      }} />
      <div style={{ fontSize: "1.6rem", marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: "2rem", fontWeight: 800, color: "#0f172a", lineHeight: 1 }}>
        {typeof value === "number" ? value.toLocaleString("fa-IR") : value}
      </div>
      <div style={{ fontSize: "0.82rem", color: "#64748b", marginTop: 6, fontWeight: 500 }}>{label}</div>
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 3, background: color, borderRadius: "0 0 16px 16px" }} />
    </div>
  );
}

function QuickAction({ icon, label, desc, color, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: "white", border: `1.5px solid ${color}30`,
        borderRadius: 14, padding: "16px 18px", cursor: "pointer",
        textAlign: "right", width: "100%", fontFamily: "inherit",
        transition: "all 0.2s", display: "flex", alignItems: "center", gap: 14
      }}
      onMouseEnter={e => { e.currentTarget.style.background = color + "08"; e.currentTarget.style.borderColor = color + "60"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "white"; e.currentTarget.style.borderColor = color + "30"; }}
    >
      <div style={{
        width: 44, height: 44, borderRadius: 12,
        background: color + "15", display: "flex",
        alignItems: "center", justifyContent: "center",
        fontSize: "1.3rem", flexShrink: 0
      }}>{icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: "0.92rem", color: "#1e293b" }}>{label}</div>
        <div style={{ fontSize: "0.78rem", color: "#94a3b8", marginTop: 2 }}>{desc}</div>
      </div>
      <span style={{ color: "#cbd5e1", fontSize: "1.1rem" }}>‹</span>
    </button>
  );
}

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: 10, padding: "10px 14px", boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
      <p style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: 4 }}>{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ fontSize: "0.88rem", fontWeight: 700, color: p.color }}>{p.name}: {p.value}</p>
      ))}
    </div>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("sessions");

  const { data, isLoading, refetch, isFetching } = useQuery(
    "dashboard",
    () => api.get("/stats/dashboard").then(r => r.data),
    { refetchInterval: 30000 }
  );

  if (isLoading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontSize: "3rem", marginBottom: 16, animation: "spin 1s linear infinite" }}>⚙️</div>
        <p style={{ color: "#64748b", fontSize: "0.95rem" }}>در حال بارگذاری داشبورد...</p>
      </div>
    </div>
  );

  const s = data?.sessions || {};
  const t = data?.tasks || {};
  const o = data?.orders || {};
  const u = data?.users || {};

  const sessionPieData = [
    { name: "فعال", value: Number(s.active || 0) },
    { name: "لاگ‌اوت", value: Number(s.logged_out || 0) },
    { name: "فلود", value: Number(s.flood || 0) },
    { name: "بن", value: Number(s.banned || 0) },
    { name: "خطا", value: Number(s.error || 0) },
  ].filter(d => d.value > 0);

  const taskAreaData = [
    { name: "در صف", value: Number(t.pending || 0) },
    { name: "در حال اجرا", value: Number(t.running || 0) },
    { name: "تکمیل", value: Number(t.completed || 0) },
    { name: "ناموفق", value: Number(t.failed || 0) },
  ];

  const healthPercent = s.total > 0 ? Math.round((s.active / s.total) * 100) : 0;

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, color: "#0f172a", marginBottom: 4 }}>
            داشبورد 📊
          </h1>
          <p style={{ fontSize: "0.85rem", color: "#94a3b8" }}>
            آخرین بروزرسانی: {new Date().toLocaleTimeString("fa-IR")}
          </p>
        </div>
        <button
          className="btn btn-ghost btn-sm"
          onClick={refetch}
          disabled={isFetching}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <span style={{ display: "inline-block", animation: isFetching ? "spin 1s linear infinite" : "none" }}>🔄</span>
          {isFetching ? "در حال بروزرسانی..." : "بروزرسانی"}
        </button>
      </div>

      {/* Health Bar */}
      <div style={{
        background: "white", borderRadius: 16, padding: "20px 24px",
        marginBottom: 24, boxShadow: "0 2px 12px rgba(0,0,0,0.06)",
        border: "1.5px solid #e2e8f0"
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <span style={{ fontWeight: 700, fontSize: "0.92rem", color: "#1e293b" }}>
            🏥 سلامت سشن‌ها
          </span>
          <span style={{
            fontWeight: 800, fontSize: "1.1rem",
            color: healthPercent >= 70 ? "#22c55e" : healthPercent >= 40 ? "#f59e0b" : "#ef4444"
          }}>
            {healthPercent}%
          </span>
        </div>
        <div style={{ background: "#f1f5f9", borderRadius: 8, height: 10, overflow: "hidden" }}>
          <div style={{
            width: `${healthPercent}%`, height: "100%", borderRadius: 8,
            background: healthPercent >= 70 ? "linear-gradient(90deg,#22c55e,#16a34a)"
              : healthPercent >= 40 ? "linear-gradient(90deg,#f59e0b,#d97706)"
              : "linear-gradient(90deg,#ef4444,#dc2626)",
            transition: "width 0.8s ease"
          }} />
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 10, flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.78rem", color: "#22c55e", fontWeight: 600 }}>✅ فعال: {s.active || 0}</span>
          <span style={{ fontSize: "0.78rem", color: "#ef4444", fontWeight: 600 }}>❌ لاگ‌اوت: {s.logged_out || 0}</span>
          <span style={{ fontSize: "0.78rem", color: "#f59e0b", fontWeight: 600 }}>🌊 فلود: {s.flood || 0}</span>
          <span style={{ fontSize: "0.78rem", color: "#8b5cf6", fontWeight: 600 }}>🚫 بن: {s.banned || 0}</span>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px,1fr))", gap: 14, marginBottom: 24 }}>
        <MiniStat icon="📱" value={Number(s.total || 0)} label="کل سشن‌ها" color="#6366f1" onClick={() => navigate("/sessions")} />
        <MiniStat icon="✅" value={Number(s.active || 0)} label="سشن فعال" color="#22c55e" onClick={() => navigate("/sessions")} />
        <MiniStat icon="📋" value={Number(t.running || 0)} label="تسک در حال اجرا" color="#f59e0b" onClick={() => navigate("/tasks")} />
        <MiniStat icon="🔍" value={Number(o.confirming || 0)} label="سفارش در بررسی" color="#06b6d4" onClick={() => navigate("/orders")} />
        <MiniStat icon="👥" value={Number(u.total || 0)} label="کاربران" color="#8b5cf6" onClick={() => navigate("/users")} />
        <MiniStat icon="💵" value={`$${Number(o.total_revenue || 0).toFixed(0)}`} label="درآمد کل" color="#22c55e" onClick={() => navigate("/orders")} />
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px,1fr))", gap: 16, marginBottom: 24 }}>
        {/* Pie Chart */}
        <div style={{ background: "white", borderRadius: 16, padding: "20px 24px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1.5px solid #e2e8f0" }}>
          <p style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1e293b", marginBottom: 16 }}>📱 توزیع وضعیت سشن‌ها</p>
          {sessionPieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={sessionPieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} dataKey="value" paddingAngle={3}>
                  {sessionPieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => v.toLocaleString("fa-IR")} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8" }}>داده‌ای موجود نیست</div>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {sessionPieData.map((d, i) => (
              <span key={i} style={{ fontSize: "0.75rem", display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: COLORS[i % COLORS.length], display: "inline-block" }} />
                {d.name}: {d.value}
              </span>
            ))}
          </div>
        </div>

        {/* Area Chart */}
        <div style={{ background: "white", borderRadius: 16, padding: "20px 24px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1.5px solid #e2e8f0" }}>
          <p style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1e293b", marginBottom: 16 }}>📋 وضعیت تسک‌ها</p>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={taskAreaData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <defs>
                <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "Vazirmatn" }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="value" name="تعداد" stroke="#6366f1" strokeWidth={2.5} fill="url(#colorVal)" dot={{ fill: "#6366f1", r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ background: "white", borderRadius: 16, padding: "20px 24px", boxShadow: "0 2px 12px rgba(0,0,0,0.06)", border: "1.5px solid #e2e8f0" }}>
        <p style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1e293b", marginBottom: 16 }}>⚡ دسترسی سریع</p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 10 }}>
          <QuickAction icon="📱" label="مدیریت سشن‌ها" desc={`${s.total || 0} سشن ثبت‌شده`} color="#6366f1" onClick={() => navigate("/sessions")} />
          <QuickAction icon="📋" label="تسک‌های جدید" desc={`${t.pending || 0} در صف انتظار`} color="#f59e0b" onClick={() => navigate("/tasks")} />
          <QuickAction icon="💰" label="سفارشات در انتظار" desc={`${o.confirming || 0} نیاز به بررسی`} color="#06b6d4" onClick={() => navigate("/orders")} />
          <QuickAction icon="👥" label="کاربران" desc={`${u.total || 0} کاربر ثبت‌نام‌شده`} color="#8b5cf6" onClick={() => navigate("/users")} />
          <QuickAction icon="🌐" label="پروکسی‌ها" desc="مدیریت پروکسی‌های سیستم" color="#22c55e" onClick={() => navigate("/proxies")} />
          <QuickAction icon="⚙️" label="تنظیمات" desc="پیکربندی سیستم" color="#64748b" onClick={() => navigate("/settings")} />
        </div>
      </div>

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
