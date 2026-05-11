import React from "react";
import { useQuery } from "react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import api from "../api";

const COLORS = ["#22c55e", "#ef4444", "#f59e0b", "#6366f1", "#06b6d4", "#8b5cf6"];

export default function Dashboard() {
  const { data, isLoading, refetch } = useQuery("dashboard", () => api.get("/stats/dashboard").then(r => r.data), { refetchInterval: 30000 });

  if (isLoading) return <div className="loading">⏳ در حال بارگذاری...</div>;

  const sessions = data?.sessions || {};
  const tasks = data?.tasks || {};
  const sessionChartData = Object.entries(sessions).map(([name, value]) => ({ name, value }));
  const taskChartData = Object.entries(tasks).map(([name, value]) => ({ name, value }));

  const statusLabel = { active: "فعال", logged_out: "لاگ‌اوت", deleted: "حذف‌شده", banned: "بن‌شده", flood: "فلود", error: "خطا" };
  const taskLabel = { pending: "در صف", running: "در حال اجرا", completed: "تکمیل", failed: "ناموفق", cancelled: "لغو" };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 style={{ fontSize: "1.4rem", fontWeight: 700 }}>📊 داشبورد</h2>
        <button className="btn btn-primary btn-sm" onClick={refetch}>🔄 بروزرسانی</button>
      </div>

      <div className="stat-grid">
        <div className="stat-card">
          <div className="icon" style={{ background: "#dcfce7" }}>📱</div>
          <div className="value">{(sessions.active || 0).toLocaleString("fa-IR")}</div>
          <div className="label">سشن فعال</div>
        </div>
        <div className="stat-card">
          <div className="icon" style={{ background: "#fee2e2" }}>🔴</div>
          <div className="value">{(sessions.logged_out || 0).toLocaleString("fa-IR")}</div>
          <div className="label">لاگ‌اوت شده</div>
        </div>
        <div className="stat-card">
          <div className="icon" style={{ background: "#fef3c7" }}>🌊</div>
          <div className="value">{(sessions.flood || 0).toLocaleString("fa-IR")}</div>
          <div className="label">فلود</div>
        </div>
        <div className="stat-card">
          <div className="icon" style={{ background: "#dbeafe" }}>👥</div>
          <div className="value">{(data?.users?.total || 0).toLocaleString("fa-IR")}</div>
          <div className="label">کاربران</div>
        </div>
        <div className="stat-card">
          <div className="icon" style={{ background: "#f3e8ff" }}>💰</div>
          <div className="value">${(data?.orders_today?.total_usd || 0).toFixed(2)}</div>
          <div className="label">درآمد امروز</div>
        </div>
        <div className="stat-card">
          <div className="icon" style={{ background: "#dcfce7" }}>✅</div>
          <div className="value">{(tasks.completed || 0).toLocaleString("fa-IR")}</div>
          <div className="label">تسک تکمیل‌شده</div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", marginBottom: "24px" }}>
        <div className="card">
          <h3 style={{ marginBottom: "20px", fontSize: "1rem" }}>📱 وضعیت سشن‌ها</h3>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie data={sessionChartData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, value }) => `${statusLabel[name] || name}: ${value}`}>
                {sessionChartData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [v.toLocaleString("fa-IR"), statusLabel[n] || n]} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <h3 style={{ marginBottom: "20px", fontSize: "1rem" }}>📋 وضعیت تسک‌ها</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={taskChartData}>
              <XAxis dataKey="name" tickFormatter={n => taskLabel[n] || n} tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v, n) => [v.toLocaleString("fa-IR"), taskLabel[n] || n]} />
              <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
