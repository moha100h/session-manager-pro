import React, { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";

const NAV = [
  { to: "/",          icon: "📊", label: "داشبورد",    end: true },
  { to: "/sessions",  icon: "📱", label: "سشن‌ها" },
  { to: "/tasks",     icon: "📋", label: "تسک‌ها" },
  { to: "/orders",    icon: "💰", label: "سفارشات" },
  { to: "/users",     icon: "👥", label: "کاربران" },
  { to: "/proxies",   icon: "🌐", label: "پروکسی‌ها" },
  { to: "/settings",  icon: "⚙️", label: "تنظیمات" },
];

export default function Layout() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  const logout = () => {
    localStorage.removeItem("admin_token");
    navigate("/login");
  };

  return (
    <div className="app-shell">
      {/* Overlay */}
      <div
        className={`sidebar-overlay ${open ? "open" : ""}`}
        onClick={() => setOpen(false)}
      />

      {/* Sidebar */}
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-logo">
          <h1>🤖 Session Manager</h1>
          <p>پنل مدیریت حرفه‌ای</p>
        </div>

        <nav className="sidebar-nav">
          {NAV.map(n => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              onClick={() => setOpen(false)}
            >
              <span className="icon">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>

        <div className="sidebar-footer">
          <button className="nav-item" onClick={logout} style={{ color: "#ef4444" }}>
            <span className="icon">🚪</span>
            خروج از سیستم
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="main-wrap">
        <header className="topbar">
          <button className="hamburger" onClick={() => setOpen(o => !o)}>☰</button>
          <span className="topbar-title">Session Manager Pro</span>
          <div className="topbar-right">
            <span style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>
              {new Date().toLocaleDateString("fa-IR")}
            </span>
          </div>
        </header>

        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
