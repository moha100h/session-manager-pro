import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import toast from "react-hot-toast";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const res = await api.post("/auth/admin/login", { username, password });
      localStorage.setItem("admin_token", res.data.access_token);
      toast.success("ورود موفق!");
      navigate("/");
    } catch (e) {
      toast.error("نام کاربری یا رمز اشتباه است.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f1f5f9" }}>
      <div className="card" style={{ width: "100%", maxWidth: "400px" }}>
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <div style={{ fontSize: "3rem", marginBottom: "12px" }}>🤖</div>
          <h1 style={{ fontSize: "1.5rem", color: "#1e293b" }}>Session Manager Pro</h1>
          <p style={{ color: "#64748b", marginTop: "8px" }}>ورود به پنل مدیریت</p>
        </div>
        <form onSubmit={handleLogin}>
          <div className="form-group">
            <label>نام کاربری</label>
            <input className="input" type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="admin" required />
          </div>
          <div className="form-group">
            <label>رمز عبور</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" required />
          </div>
          <button className="btn btn-primary" type="submit" disabled={loading} style={{ width: "100%", padding: "14px" }}>
            {loading ? "در حال ورود..." : "ورود به سیستم"}
          </button>
        </form>
      </div>
    </div>
  );
}
