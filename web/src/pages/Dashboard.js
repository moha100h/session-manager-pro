import React from "react";
import { useQuery } from "react-query";
import api from "../api";

const num = (v) => Number(v) || 0;
const usd = (v) => "$" + num(v).toLocaleString("en-US", {minimumFractionDigits:2, maximumFractionDigits:2});

const StatCard = ({ icon, label, value, sub, color="#6366f1" }) => (
  <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:"16px 18px", position:"relative", overflow:"hidden" }}>
    <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:color }} />
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
      <div>
        <div style={{ fontSize:12, color:"#94a3b8", fontWeight:600, marginBottom:8 }}>{label}</div>
        <div style={{ fontSize:26, fontWeight:800, color:"#0f172a" }}>{value}</div>
        {sub && <div style={{ fontSize:12, color:"#94a3b8", marginTop:4 }}>{sub}</div>}
      </div>
      <div style={{ fontSize:28, opacity:0.8 }}>{icon}</div>
    </div>
  </div>
);

export default function Dashboard() {
  const { data, isLoading, error } = useQuery(
    "dash_stats",
    () => api.get("/api/stats/dashboard").then(r => r.data),
    { refetchInterval:30000, retry:2, onError:()=>{} }
  );

  if (isLoading) return (
    <div style={{ textAlign:"center", padding:80, color:"#94a3b8" }}>
      <div style={{ width:40, height:40, border:"3px solid #e2e8f0", borderTopColor:"#6366f1", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 16px" }} />
      <p>در حال بارگذاری آمار...</p>
    </div>
  );

  if (error || !data) return (
    <div style={{ background:"#fff", borderRadius:12, border:"1px solid #fee2e2", padding:32, textAlign:"center", color:"#b91c1c" }}>
      <div style={{ fontSize:36, marginBottom:10 }}>⚠️</div>
      <p style={{ fontWeight:700 }}>خطا در دریافت آمار</p>
      <p style={{ fontSize:13, color:"#94a3b8", marginTop:6 }}>اتصال به API را بررسی کنید</p>
    </div>
  );

  const s  = data.sessions      || {};
  const t  = data.tasks         || {};
  const u  = data.users         || {};
  const ot = data.orders_today  || {};
  const pr = data.proxies       || {};

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:24, flexWrap:"wrap", gap:10 }}>
        <h2 style={{ fontSize:20, fontWeight:800 }}>📊 داشبورد</h2>
        <div style={{ fontSize:12, color:"#94a3b8", background:"#f1f5f9", padding:"5px 12px", borderRadius:20 }}>
          🔄 هر ۳۰ ثانیه بروزرسانی
        </div>
      </div>

      {/* ── ردیف اول: مالی ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:12, marginBottom:12 }}>
        <StatCard icon="💰" label="درآمد امروز" value={usd(ot.total_usd)} sub={num(ot.count)+" سفارش تأیید شده"} color="#22c55e" />
        <StatCard icon="💵" label="کل درآمد" value={usd(data.total_revenue)} color="#6366f1" />
        <StatCard icon="⏳" label="سفارشات در انتظار" value={num(data.pending_orders)} sub="نیاز به بررسی" color="#f59e0b" />
      </div>

      {/* ── ردیف دوم: سشن‌ها ── */}
      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:18, marginBottom:12 }}>
        <div style={{ fontWeight:700, fontSize:14, marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
          📱 سشن‌ها
          <span style={{ background:"#6366f1", color:"#fff", padding:"2px 10px", borderRadius:20, fontSize:12 }}>{num(s.total)} کل</span>
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))", gap:8 }}>
          {[
            ["✅","فعال",s.active,"#22c55e"],
            ["🌊","فلود",s.flood,"#f59e0b"],
            ["🚫","بن",s.banned,"#8b5cf6"],
            ["🔴","لاگ‌اوت",s.logged_out,"#ef4444"],
            ["⚠️","خطا",s.error,"#94a3b8"],
            ["⏸","غیرفعال",s.inactive,"#64748b"],
          ].map(([icon,label,val,color])=>(
            <div key={label} style={{ background:"#f8fafc", borderRadius:10, padding:"12px 10px", textAlign:"center", border:"1px solid #e2e8f0" }}>
              <div style={{ fontSize:20, marginBottom:4 }}>{icon}</div>
              <div style={{ fontSize:20, fontWeight:800, color }}>{num(val)}</div>
              <div style={{ fontSize:11, color:"#94a3b8", marginTop:2 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── ردیف سوم: تسک‌ها + کاربران + پروکسی ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:12 }}>
        {/* تسک‌ها */}
        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:18 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:14, display:"flex", alignItems:"center", gap:8 }}>
            📋 تسک‌ها
            <span style={{ background:"#8b5cf6", color:"#fff", padding:"2px 10px", borderRadius:20, fontSize:12 }}>{num(t.total)} کل</span>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
            {[
              ["⏳","در انتظار",t.pending,"#f59e0b"],
              ["▶️","در حال اجرا",t.running,"#6366f1"],
              ["✅","انجام شده",t.done,"#22c55e"],
              ["❌","ناموفق",t.failed,"#ef4444"],
            ].map(([icon,label,val,color])=>(
              <div key={label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"8px 12px", background:"#f8fafc", borderRadius:8 }}>
                <span style={{ fontSize:13, color:"#475569" }}>{icon} {label}</span>
                <span style={{ fontWeight:800, fontSize:15, color }}>{num(val)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* کاربران + پروکسی */}
        <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
          <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:18 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>👥 کاربران</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {[
                ["👥","کل",u.total,"#6366f1"],
                ["🚫","بن",u.banned,"#ef4444"],
                ["✅","فعال",num(u.total)-num(u.banned),"#22c55e"],
              ].map(([icon,label,val,color])=>(
                <div key={label} style={{ background:"#f8fafc", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
                  <div style={{ fontSize:18, marginBottom:4 }}>{icon}</div>
                  <div style={{ fontSize:18, fontWeight:800, color }}>{num(val)}</div>
                  <div style={{ fontSize:11, color:"#94a3b8" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:18 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>🌐 پروکسی‌ها</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {[
                ["🌐","کل",pr.total,"#6366f1"],
                ["✅","فعال",pr.active,"#22c55e"],
              ].map(([icon,label,val,color])=>(
                <div key={label} style={{ background:"#f8fafc", borderRadius:8, padding:"10px 12px", textAlign:"center" }}>
                  <div style={{ fontSize:18, marginBottom:4 }}>{icon}</div>
                  <div style={{ fontSize:18, fontWeight:800, color }}>{num(val)}</div>
                  <div style={{ fontSize:11, color:"#94a3b8" }}>{label}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
