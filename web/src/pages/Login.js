import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api";
import toast from "react-hot-toast";

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS   = 5 * 60 * 1000; // 5 دقیقه

export default function Login() {
  const [username,  setUsername]  = useState("");
  const [password,  setPassword]  = useState("");
  const [showPass,  setShowPass]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [attempts,  setAttempts]  = useState(0);
  const [lockedUntil, setLockedUntil] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const navigate = useNavigate();

  // countdown تایمر قفل
  useEffect(() => {
    if (!lockedUntil) return;
    const iv = setInterval(() => {
      const left = Math.ceil((lockedUntil - Date.now()) / 1000);
      if (left <= 0) { setLockedUntil(null); setAttempts(0); setRemaining(0); clearInterval(iv); }
      else setRemaining(left);
    }, 1000);
    return () => clearInterval(iv);
  }, [lockedUntil]);

  const isLocked = lockedUntil && Date.now() < lockedUntil;

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isLocked) return;
    if (!username.trim() || !password.trim()) {
      toast.error("نام کاربری و رمز عبور الزامی است");
      return;
    }
    setLoading(true);
    try {
      // endpoint درست: /api/auth/admin/login
      const res = await api.post("/api/auth/admin/login", { username: username.trim(), password });
      localStorage.setItem("admin_token", res.data.access_token);
      setAttempts(0);
      toast.success("✅ ورود موفق");
      navigate("/");
    } catch (err) {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      const left = MAX_ATTEMPTS - newAttempts;
      if (newAttempts >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_MS;
        setLockedUntil(until);
        toast.error("⛔ حساب به مدت ۵ دقیقه قفل شد");
      } else {
        const msg = err?.response?.data?.detail || "نام کاربری یا رمز اشتباه است";
        toast.error(`${msg} — ${left} تلاش باقی‌مانده`);
      }
    } finally {
      setLoading(false);
    }
  };

  const fmtTime = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  return (
    <div style={{
      minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center",
      background:"linear-gradient(135deg,#0f172a 0%,#1e1b4b 50%,#0f172a 100%)",
      fontFamily:"Vazirmatn,sans-serif", padding:16, position:"relative", overflow:"hidden"
    }}>
      {/* پس‌زمینه انیمیشن */}
      {[...Array(6)].map((_,i)=>(
        <div key={i} style={{
          position:"absolute", borderRadius:"50%",
          background:"rgba(99,102,241,0.06)",
          width: 200+i*120, height: 200+i*120,
          top:"50%", left:"50%",
          transform:`translate(-50%,-50%) scale(${1+i*0.15})`,
          animation:`pulse ${3+i*0.5}s ease-in-out infinite alternate`,
          pointerEvents:"none"
        }} />
      ))}

      <div style={{
        width:"100%", maxWidth:420, position:"relative", zIndex:1,
        background:"rgba(255,255,255,0.05)",
        backdropFilter:"blur(20px)",
        border:"1px solid rgba(255,255,255,0.1)",
        borderRadius:24, padding:"40px 36px",
        boxShadow:"0 25px 60px rgba(0,0,0,0.5)"
      }}>
        {/* لوگو */}
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <div style={{
            width:72, height:72, borderRadius:20, margin:"0 auto 16px",
            background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
            display:"flex", alignItems:"center", justifyContent:"center",
            fontSize:32, boxShadow:"0 8px 24px rgba(99,102,241,0.4)"
          }}>🤖</div>
          <h1 style={{ fontSize:22, fontWeight:800, color:"#fff", marginBottom:6 }}>
            Session Manager Pro
          </h1>
          <p style={{ fontSize:13, color:"rgba(255,255,255,0.5)" }}>
            پنل مدیریت — ورود ادمین
          </p>
        </div>

        {/* هشدار قفل */}
        {isLocked && (
          <div style={{
            background:"rgba(239,68,68,0.15)", border:"1px solid rgba(239,68,68,0.3)",
            borderRadius:12, padding:"12px 16px", marginBottom:20, textAlign:"center"
          }}>
            <div style={{ fontSize:20, marginBottom:4 }}>⛔</div>
            <div style={{ color:"#fca5a5", fontWeight:700, fontSize:14 }}>حساب قفل شده</div>
            <div style={{ color:"rgba(255,255,255,0.5)", fontSize:13, marginTop:4 }}>
              {fmtTime(remaining)} تا باز شدن
            </div>
          </div>
        )}

        {/* فرم */}
        <form onSubmit={handleLogin} autoComplete="off">
          {/* نام کاربری */}
          <div style={{ marginBottom:16 }}>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:"rgba(255,255,255,0.6)", marginBottom:8 }}>
              نام کاربری
            </label>
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", fontSize:16, opacity:0.5 }}>👤</span>
              <input
                type="text"
                value={username}
                onChange={e=>setUsername(e.target.value)}
                placeholder="admin"
                disabled={isLocked || loading}
                autoComplete="username"
                style={{
                  width:"100%", padding:"12px 42px 12px 14px",
                  background:"rgba(255,255,255,0.07)",
                  border:"1.5px solid rgba(255,255,255,0.1)",
                  borderRadius:12, color:"#fff", fontFamily:"inherit",
                  fontSize:14, outline:"none", boxSizing:"border-box",
                  transition:"border-color 0.2s",
                  opacity: isLocked ? 0.5 : 1
                }}
                onFocus={e=>e.target.style.borderColor="rgba(99,102,241,0.6)"}
                onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.1)"}
              />
            </div>
          </div>

          {/* رمز عبور */}
          <div style={{ marginBottom:24 }}>
            <label style={{ display:"block", fontSize:12, fontWeight:600, color:"rgba(255,255,255,0.6)", marginBottom:8 }}>
              رمز عبور
            </label>
            <div style={{ position:"relative" }}>
              <span style={{ position:"absolute", right:14, top:"50%", transform:"translateY(-50%)", fontSize:16, opacity:0.5 }}>🔒</span>
              <input
                type={showPass ? "text" : "password"}
                value={password}
                onChange={e=>setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLocked || loading}
                autoComplete="current-password"
                style={{
                  width:"100%", padding:"12px 42px 12px 42px",
                  background:"rgba(255,255,255,0.07)",
                  border:"1.5px solid rgba(255,255,255,0.1)",
                  borderRadius:12, color:"#fff", fontFamily:"inherit",
                  fontSize:14, outline:"none", boxSizing:"border-box",
                  transition:"border-color 0.2s",
                  opacity: isLocked ? 0.5 : 1
                }}
                onFocus={e=>e.target.style.borderColor="rgba(99,102,241,0.6)"}
                onBlur={e=>e.target.style.borderColor="rgba(255,255,255,0.1)"}
              />
              <button type="button" onClick={()=>setShowPass(s=>!s)}
                style={{ position:"absolute", left:14, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", cursor:"pointer", fontSize:16, opacity:0.5, padding:0 }}>
                {showPass ? "🙈" : "👁"}
              </button>
            </div>
          </div>

          {/* نمایش تعداد تلاش */}
          {attempts > 0 && !isLocked && (
            <div style={{ marginBottom:16, textAlign:"center" }}>
              {[...Array(MAX_ATTEMPTS)].map((_,i)=>(
                <span key={i} style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", margin:"0 3px", background: i < attempts ? "#ef4444" : "rgba(255,255,255,0.2)" }} />
              ))}
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginTop:6 }}>
                {MAX_ATTEMPTS - attempts} تلاش باقی‌مانده
              </div>
            </div>
          )}

          {/* دکمه ورود */}
          <button
            type="submit"
            disabled={loading || isLocked || !username || !password}
            style={{
              width:"100%", padding:"14px",
              background: (loading||isLocked||!username||!password)
                ? "rgba(99,102,241,0.3)"
                : "linear-gradient(135deg,#6366f1,#8b5cf6)",
              border:"none", borderRadius:12, color:"#fff",
              fontFamily:"inherit", fontSize:15, fontWeight:700,
              cursor: (loading||isLocked||!username||!password) ? "not-allowed" : "pointer",
              transition:"all 0.2s",
              boxShadow: (loading||isLocked) ? "none" : "0 4px 16px rgba(99,102,241,0.4)"
            }}>
            {loading ? (
              <span style={{ display:"flex", alignItems:"center", justifyContent:"center", gap:8 }}>
                <span style={{ width:16, height:16, border:"2px solid rgba(255,255,255,0.3)", borderTopColor:"#fff", borderRadius:"50%", animation:"spin 0.8s linear infinite", display:"inline-block" }} />
                در حال ورود...
              </span>
            ) : isLocked ? `⛔ قفل — ${fmtTime(remaining)}` : "ورود به سیستم →"}
          </button>
        </form>

        {/* footer */}
        <div style={{ textAlign:"center", marginTop:24, fontSize:11, color:"rgba(255,255,255,0.25)" }}>
          Session Manager Pro v1.0 — فقط برای ادمین
        </div>
      </div>

      <style>{`
        @keyframes pulse { from { opacity:0.3; transform:translate(-50%,-50%) scale(1); } to { opacity:0.6; transform:translate(-50%,-50%) scale(1.05); } }
        @keyframes spin  { to { transform:rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(20px); } to { opacity:1; transform:translateY(0); } }
        input::placeholder { color: rgba(255,255,255,0.25) !important; }
        input:-webkit-autofill { -webkit-box-shadow:0 0 0 100px rgba(99,102,241,0.1) inset !important; -webkit-text-fill-color:#fff !important; }
      `}</style>
    </div>
  );
}
