import React from "react";
import { useQuery } from "react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import api from "../api";

const COLORS = ["#22c55e", "#ef4444", "#f59e0b", "#6366f1", "#06b6d4", "#8b5cf6"];
const SESSION_LABELS = { active: "فعال", logged_out: "لاگ‌اوت", deleted: "حذف‌شده", banned: "بن‌شده", flood: "فلود", error: "خطا" };
const TASK_LABELS = { pending: "در صف", running: "در حال اجرا", completed: "تکمیل", failed: "ناموفق", cancelled: "لغو" };

const StatCard = ({ icon, value, label, color }) => (
  <div className="stat-card">
    <div className="icon" style={{ background: color + "20" }}>{icon}</div>
    <div className="value">{typeof value === "number" ? value.toLocaleString("fa-IR") : value}</div>
    <div className="label">{label}</div>
  </div>
);

export default function Dashboard() {
  const { data, isLoading, refetch, isFetching } = useQuery(
    "dashboard",
    () => api.get("/stats/dashboard").then(r => r.data),
    { refetchInterval: 30000 }
  );

  if (isLoading) return <div className="loading">⏳ در حال بارگذاری داشبورد...</div>;

  const sessions = data?.sessions || {};
  const tasks = data?.tasks || {};
  const orders = data?.orders || {};
  const users = data?.users || {};

  const sessionChartData = Object.entries(sessions)
    .filter(([k]) => k !== "total")
    .map(([name, value]) => ({ name: SESSION_LABELS[name] || name, value: Number(value) }));

  const taskChartData = Object.entries(tasks)
    .filter(([k]) => k !== "total")
    .map(([name, value]) => ({ name: TASK_LABELS[name] || name, value: Number(value) }));

  return (
    <div>
      <div className="flex justify-between items-center mb-6" style={{ flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>📊 داشبورد</h2>
        <button className="btn btn-ghost btn-sm" onClick={refetch} disabled={isFetching}>
          {isFetching ? "⏳ در حال بروزرسانی..." : "🔄 بروزرسانی"}
        </button>
      </div>

      <p style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: 10, fontWeight: 600 }}>📱 سشن‌ها</p>
      <div className="stat-grid mb-6">
        <StatCard icon="📱" value={sessions.active || 0} label="فعال" color="#22c55e" />
        <StatCard icon="🔴" value={sessions.logged_out || 0} label="لاگ‌اوت" color="#ef4444" />
        <StatCard icon="🌊" value={sessions.flood || 0} label="فلود" color="#f59e0b" />
        <StatCard icon="🚫" value={sessions.banned || 0} label="بن‌شده" color="#8b5cf6" />
        <StatCard icon="❌" value={sessions.error || 0} label="خطا" color="#06b6d4" />
        <StatCard icon="📊" value={sessions.total || 0} label="کل سشن‌ها" color="#6366f1" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px,1fr))", gap: 14, marginBottom: 24 }}>
        <div className="card">
          <p style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: 14, fontWeight: 600 }}>📋 تسک‌ها</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <StatCard icon="⏳" value={tasks.pending || 0} label="در صف" color="#06b6d4" />
            <StatCard icon="▶️" value={tasks.running || 0} label="در حال اجرا" color="#f59e0b" />
            <StatCard icon="✅" value={tasks.completed || 0} label="تکمیل" color="#22c55e" />
            <StatCard icon="❌" value={tasks.failed || 0} label="ناموفق" color="#ef4444" />
          </div>
        </div>
        <div className="card">
          <p style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: 14, fontWeight: 600 }}>💰 سفارشات و کاربران</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <StatCard icon="⏳" value={orders.pending || 0} label="سفارش در انتظار" color="#f59e0b" />
            <StatCard icon="✅" value={orders.confirmed || 0} label="سفارش تأیید شده" color="#22c55e" />
            <StatCard icon="👥" value={users.total || 0} label="کل کاربران" color="#6366f1" />
            <StatCard icon="💵" value={`$${Number(orders.total_revenue || 0).toFixed(2)}`} label="درآمد کل" color="#22c55e" />
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px,1fr))", gap: 16 }}>
        <div className="card">
          <p className="card-title mb-4">📱 وضعیت سشن‌ها</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={sessionChartData} cx="50%" cy="50%" outerRadius={80} dataKey="value" label={({ name, value }) => value > 0 ? `${name}: ${value}` : ""}>
                {sessionChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => v.toLocaleString("fa-IR")} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <p className="card-title mb-4">📋 وضعیت تسک‌ها</p>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={taskChartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v) => v.toLocaleString("fa-IR")} />
              <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                {taskChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
