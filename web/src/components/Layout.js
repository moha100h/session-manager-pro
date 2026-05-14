import React, { useState } from "react";
import { Outlet, NavLink, useNavigate } from "react-router-dom";

const NAV = [
  { to: "/",         icon: "📊", label: "داشبورد",   end: true },
  { to: "/sessions", icon: "📱", label: "سشن‌ها" },
  { to: "/tasks",    icon: "📋", label: "تسک‌ها" },
  { to: "/orders",   icon: "💰", label: "سفارشات" },
  { to: "/users",    icon: "👥", label: "کاربران" },
  { to: "/proxies",  icon: "🌐", label: "پروکسی‌ها" },
  { to: "/settings", icon: "⚙️", label: "تنظیمات" },
];

const C = {
  sidebar: { width: 220, background: "#fff", borderLeft: "1px solid #e2e8f0", display: "flex", flexDirection: "column", position: "fixed", top: 0, right: 0, bottom: 0, zIndex: 100 },
  logo: { padding: "18px 16px 14px", borderBottom: "1px solid #e2e8f0" },
  logoTitle: { fontSize: 15, fontWeight: 800, color: "#6366f1", display: "flex", alignItems: "center", gap: 8 },
  logoSub: { fontSize: 11, color: "#94a3b8", marginTop: 2 },
  nav: { flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" },
  footer: { padding: "10px 8px", borderTop: "1px solid #e2e8f0" },
  main: { marginRight: 220, minHeight: "100vh", display: "flex", flexDirection: "column" },
  topbar: { height: 56, background: "#fff", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", position: "sticky", top: 0, zIndex: 50 },
  content: { padding: 20, flex: 1 },
};

export default function Layout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  const logout = () => { localStorage.removeItem("admin_token"); navigate("/login"); };

  const sidebarStyle = {
    ...C.sidebar,
    ...(window.innerWidth < 768 ? {
      transform: mobileOpen ? "translateX(0)" : "translateX(100%)",
      transition: "transform 0.25s ease",
    } : {})
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", background: "#f1f5f9" }}>
      {mobileOpen && window.innerWidth < 768 && (
        <div onClick={() => setMobileOpen(false)}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 99 }} />
      )}

      <aside style={sidebarStyle}>
        <div style={C.logo}>
          <div style={C.logoTitle}>🤖 Session Manager</div>
          <div style={C.logoSub}>پنل مدیریت حرفه‌ای</div>
        </div>
        <nav style={C.nav}>
          {NAV.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setMobileOpen(false)}
              style={({ isActive }) => ({
                display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                borderRadius: 8, color: isActive ? "#6366f1" : "#475569",
                background: isActive ? "#e0e7ff" : "transparent",
                fontWeight: isActive ? 700 : 500, fontSize: 14,
                textDecoration: "none", transition: "all 0.15s",
              })}>
              <span style={{ fontSize: 16, width: 20, textAlign: "center" }}>{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div style={C.footer}>
          <button onClick={logout} style={{
            display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
            borderRadius: 8, color: "#ef4444", background: "transparent",
            fontWeight: 600, fontSize: 14, border: "none", width: "100%", cursor: "pointer",
          }}>
            <span style={{ fontSize: 16 }}>🚪</span> خروج
          </button>
        </div>
      </aside>

      <div style={{ ...C.main, marginRight: window.innerWidth < 768 ? 0 : 220 }}>
        <header style={C.topbar}>
          <button onClick={() => setMobileOpen(o => !o)}
            style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", display: window.innerWidth < 768 ? "block" : "none" }}>
            ☰
          </button>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Session Manager Pro</span>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>{new Date().toLocaleDateString("fa-IR")}</span>
        </header>
        <main style={C.content}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
