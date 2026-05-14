import React, { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";

const navItems = [
  { path: "/", label: "📊 داشبورد", exact: true },
  { path: "/sessions", label: "📱 سشن‌ها" },
  { path: "/tasks", label: "📋 تسک‌ها" },
  { path: "/orders", label: "💰 سفارشات" },
  { path: "/users", label: "👥 کاربران" },
  { path: "/proxies", label: "🌐 پروکسی‌ها" },
  { path: "/settings", label: "⚙️ تنظیمات" },
];

export default function Layout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const logout = () => {
    localStorage.removeItem("admin_token");
    navigate("/login");
  };

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div>
      <div
        className={`overlay ${sidebarOpen ? "open" : ""}`}
        onClick={closeSidebar}
      />
      <div className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="sidebar-logo">
          <h1>🤖 Session Manager</h1>
          <p>پنل مدیریت حرفه‌ای</p>
        </div>
        <nav className="sidebar-nav">
          {navItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.exact}
              className={({ isActive }) => `nav-item ${isActive ? "active" : ""}`}
              onClick={closeSidebar}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: "16px 12px", borderTop: "1px solid #334155" }}>
          <button
            className="nav-item"
            style={{ width: "100%", textAlign: "right" }}
            onClick={logout}
          >
            🚪 خروج از سیستم
          </button>
        </div>
      </div>
      <div className="main-content">
        <div className="topbar">
          <button
            className="hamburger"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="منو"
          >
            ☰
          </button>
          <h2>Session Manager Pro</h2>
          <span style={{ fontSize: "0.82rem", color: "#64748b", background: "#f1f5f9", padding: "4px 10px", borderRadius: "20px" }}>
            پنل ادمین
          </span>
        </div>
        <div className="page-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
