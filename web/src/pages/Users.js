import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const safe = (v) => Array.isArray(v) ? v : [];
const num = (v) => Number(v) || 0;
const btn = (bg, color="#fff") => ({ display:"inline-flex", alignItems:"center", gap:4, padding:"6px 14px", borderRadius:7, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, background:bg, color });
const COLORS = ["#6366f1","#8b5cf6","#06b6d4","#22c55e","#f59e0b","#ef4444","#ec4899","#14b8a6"];
const avatarColor = (name) => COLORS[(name||"?").charCodeAt(0) % COLORS.length];

export default function Users() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState(null);
  const [balAmt, setBalAmt] = useState("");
  const [balType, setBalType] = useState("add");
  const [showBal, setShowBal] = useState(false);

  const { data, isLoading } = useQuery(
    ["users", search, page],
    () => { const p = new URLSearchParams(); if(search) p.set("search",search); p.set("page",page); p.set("limit",20); return api.get("/users/?"+p).then(r=>r.data); },
    { keepPreviousData:true, refetchInterval:30000, retry:1, onError:()=>{} }
  );
  const users = safe(data) || safe(data && data.users);
  const total = num(data && data.total) || users.length;
  const totalPages = Math.max(1, Math.ceil(total/20));

  const { data: statsRaw } = useQuery("user_stats2",
    () => api.get("/stats/dashboard").then(r => r.data && r.data.users ? r.data.users : {}),
    { refetchInterval:30000, retry:1, onError:()=>{} }
  );
  const stats = (statsRaw && typeof statsRaw==="object") ? statsRaw : {};

  const banM = useMutation(id=>api.post("/users/"+id+"/ban"),
    { onSuccess:()=>{ qc.invalidateQueries("users"); toast.success("کاربر بن شد"); setSel(s=>s?{...s,is_banned:true}:s); } });
  const unbanM = useMutation(id=>api.post("/users/"+id+"/unban"),
    { onSuccess:()=>{ qc.invalidateQueries("users"); toast.success("آنبن شد"); setSel(s=>s?{...s,is_banned:false}:s); } });
  const balM = useMutation(({id,amount,type})=>api.post("/users/"+id+"/balance",{amount:parseFloat(amount),type}),
    { onSuccess:()=>{ qc.invalidateQueries("users"); toast.success("موجودی بروز شد"); setShowBal(false); setBalAmt(""); } });

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>
      <h2 style={{ fontSize:20, fontWeight:800, marginBottom:20 }}>👥 کاربران <span style={{ fontSize:13, color:"#94a3b8", fontWeight:400 }}>({total.toLocaleString("fa-IR")})</span></h2>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))", gap:10, marginBottom:16 }}>
        {[["👥","کل",stats.total,"#6366f1"],["✅","فعال",stats.active,"#22c55e"],["🚫","بن",stats.banned,"#ef4444"],["💰","موجودی","$"+num(stats.total_balance).toFixed(0),"#f59e0b"]].map(([icon,label,val,color])=>(
          <div key={label} style={{ background:"#fff", borderRadius:10, border:"1px solid #e2e8f0", padding:"12px 14px", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:color }} />
            <div style={{ fontSize:18, marginBottom:6, marginTop:2 }}>{icon}</div>
            <div style={{ fontSize:20, fontWeight:800 }}>{val||0}</div>
            <div style={{ fontSize:11, color:"#94a3b8", marginTop:3 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:"12px 16px", marginBottom:16 }}>
        <form onSubmit={e=>{ e.preventDefault(); setSearch(searchInput); setPage(1); }} style={{ display:"flex", gap:8 }}>
          <input style={{ flex:1, padding:"8px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontFamily:"inherit", fontSize:13, outline:"none" }} placeholder="جستجو نام، یوزرنیم، آیدی..." value={searchInput} onChange={e=>setSearchInput(e.target.value)} />
          <button type="submit" style={btn("#6366f1")}>🔍 جستجو</button>
          {search && <button type="button" onClick={()=>{ setSearch(""); setSearchInput(""); }} style={btn("#f1f5f9","#475569")}>✕</button>}
        </form>
      </div>

      {isLoading ? (
        <div style={{ textAlign:"center", padding:48, color:"#94a3b8" }}>
          <div style={{ width:32, height:32, border:"3px solid #e2e8f0", borderTopColor:"#6366f1", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 10px" }} />
          در حال بارگذاری...
        </div>
      ) : users.length===0 ? (
        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:48, textAlign:"center", color:"#94a3b8" }}><div style={{ fontSize:40, marginBottom:10 }}>👥</div><p>کاربری یافت نشد</p></div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {users.map(u=>{
            const ac = avatarColor(u.full_name||u.username||"?");
            const initials = (u.full_name||u.username||"?").slice(0,2).toUpperCase();
            return (
              <div key={u.id} style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:"14px 16px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap", cursor:"pointer", transition:"all 0.15s", opacity:u.is_banned?0.65:1 }}
                onClick={()=>setSel(u)}
                onMouseEnter={e=>{ e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.08)"; e.currentTarget.style.transform="translateY(-1px)"; }}
                onMouseLeave={e=>{ e.currentTarget.style.boxShadow=""; e.currentTarget.style.transform=""; }}>
                <div style={{ width:44, height:44, borderRadius:"50%", background:"linear-gradient(135deg,"+ac+","+ac+"99)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:16, flexShrink:0 }}>{initials}</div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                    <span style={{ fontWeight:700, fontSize:14 }}>{u.full_name||"—"}</span>
                    {u.username && <span style={{ fontSize:12, color:"#94a3b8" }}>@{u.username}</span>}
                    {u.is_banned && <span style={{ background:"#fee2e2", color:"#b91c1c", padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:700 }}>🚫 بن</span>}
                  </div>
                  <div style={{ display:"flex", gap:12, marginTop:4, flexWrap:"wrap" }}>
                    <span style={{ fontSize:12, color:"#94a3b8" }}>🆔 {u.telegram_id||u.id}</span>
                    <span style={{ fontSize:12, fontWeight:600, color:"#22c55e" }}>💰 ${num(u.balance).toFixed(2)}</span>
                    <span style={{ fontSize:12, color:"#94a3b8" }}>📅 {u.created_at?new Date(u.created_at).toLocaleDateString("fa-IR"):"—"}</span>
                  </div>
                </div>
                <div style={{ display:"flex", gap:6 }} onClick={e=>e.stopPropagation()}>
                  <button style={btn("#6366f1")} onClick={()=>{ setSel(u); setShowBal(true); setBalAmt(""); setBalType("add"); }}>💰</button>
                  {u.is_banned
                    ? <button style={btn("#22c55e")} onClick={()=>unbanM.mutate(u.id)}>🔓</button>
                    : <button style={btn("#ef4444")} onClick={()=>{ if(window.confirm("بن کردن کاربر؟")) banM.mutate(u.id); }}>🚫</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages>1 && (
        <div style={{ display:"flex", gap:6, justifyContent:"center", marginTop:16, flexWrap:"wrap" }}>
          <button disabled={page===1} onClick={()=>setPage(p=>p-1)} style={{ ...btn("#f1f5f9","#475569"), border:"1.5px solid #e2e8f0" }}>قبلی</button>
          {Array.from({length:Math.min(5,totalPages)},(_,i)=>{ const p=page<=3?i+1:page-2+i; if(p<1||p>totalPages)return null; return <button key={p} onClick={()=>setPage(p)} style={{ ...btn(p===page?"#6366f1":"#fff",p===page?"#fff":"#475569"), border:"1.5px solid "+(p===page?"#6366f1":"#e2e8f0"), minWidth:36 }}>{p}</button>; })}
          <button disabled={page===totalPages} onClick={()=>setPage(p=>p+1)} style={{ ...btn("#f1f5f9","#475569"), border:"1.5px solid #e2e8f0" }}>بعدی</button>
        </div>
      )}

      {sel && !showBal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={e=>e.target===e.currentTarget&&setSel(null)}>
          <div style={{ background:"#fff", borderRadius:16, padding:24, width:"100%", maxWidth:420, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
              <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                <div style={{ width:52, height:52, borderRadius:"50%", background:"linear-gradient(135deg,"+avatarColor(sel.full_name||sel.username||"?")+","+avatarColor(sel.full_name||sel.username||"?")+"99)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:800, fontSize:20 }}>
                  {(sel.full_name||sel.username||"?").slice(0,2).toUpperCase()}
                </div>
                <div>
                  <h3 style={{ fontWeight:800, fontSize:16 }}>{sel.full_name||"—"}</h3>
                  {sel.username && <p style={{ fontSize:13, color:"#94a3b8" }}>@{sel.username}</p>}
                </div>
              </div>
              <button onClick={()=>setSel(null)} style={{ background:"none", border:"none", fontSize:18, cursor:"pointer", color:"#94a3b8" }}>✕</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:16 }}>
              {[["🆔 آیدی",sel.telegram_id||sel.id||"—"],["💰 موجودی","$"+num(sel.balance).toFixed(2)],["📅 عضویت",sel.created_at?new Date(sel.created_at).toLocaleDateString("fa-IR"):"—"],["📦 سفارشات",num(sel.orders_count)],["📱 سشن‌ها",num(sel.sessions_count)],["🌍 زبان",sel.language||"—"]].map(([l,v])=>(
                <div key={l} style={{ background:"#f8fafc", borderRadius:8, padding:"10px 12px" }}>
                  <div style={{ fontSize:11, color:"#94a3b8", marginBottom:3 }}>{l}</div>
                  <div style={{ fontSize:13, fontWeight:600 }}>{v}</div>
                </div>
              ))}
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
              <button onClick={()=>setSel(null)} style={{ ...btn("#f1f5f9","#475569"), padding:"8px 16px", fontSize:13 }}>بستن</button>
              <button onClick={()=>{ setShowBal(true); setBalAmt(""); setBalType("add"); }} style={{ ...btn("#6366f1"), padding:"8px 16px", fontSize:13 }}>💰 شارژ</button>
              {sel.is_banned
                ? <button onClick={()=>unbanM.mutate(sel.id)} style={{ ...btn("#22c55e"), padding:"8px 16px", fontSize:13 }}>🔓 آنبن</button>
                : <button onClick={()=>{ if(window.confirm("بن کردن کاربر؟")) banM.mutate(sel.id); }} style={{ ...btn("#ef4444"), padding:"8px 16px", fontSize:13 }}>🚫 بن</button>}
            </div>
          </div>
        </div>
      )}

      {sel && showBal && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={e=>e.target===e.currentTarget&&(setShowBal(false),setSel(null))}>
          <div style={{ background:"#fff", borderRadius:16, padding:24, width:"100%", maxWidth:360, boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ fontWeight:800, fontSize:16, marginBottom:6 }}>💰 شارژ موجودی</h3>
            <p style={{ fontSize:13, color:"#94a3b8", marginBottom:18 }}>{sel.full_name||sel.username||"—"} — موجودی: <strong style={{ color:"#22c55e" }}>${num(sel.balance).toFixed(2)}</strong></p>
            <div style={{ marginBottom:12 }}>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>نوع عملیات</label>
              <div style={{ display:"flex", gap:8 }}>
                {[["add","➕ افزایش","#22c55e"],["subtract","➖ کاهش","#ef4444"]].map(([v,l,c])=>(
                  <button key={v} onClick={()=>setBalType(v)} style={{ flex:1, padding:"8px", borderRadius:8, border:"2px solid "+(balType===v?c:"#e2e8f0"), background:balType===v?c+"18":"#fff", color:balType===v?c:"#475569", fontFamily:"inherit", fontSize:13, fontWeight:600, cursor:"pointer" }}>{l}</button>
                ))}
              </div>
            </div>
            <div style={{ marginBottom:18 }}>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>مبلغ (دلار)</label>
              <input type="number" min="0" step="0.01" value={balAmt} onChange={e=>setBalAmt(e.target.value)} placeholder="مثلاً ۱۰" style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontFamily:"inherit", fontSize:14, outline:"none" }} />
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
              <button onClick={()=>setShowBal(false)} style={{ ...btn("#f1f5f9","#475569"), padding:"8px 16px", fontSize:13 }}>انصراف</button>
              <button onClick={()=>balM.mutate({id:sel.id,amount:balAmt,type:balType})} disabled={!balAmt||balM.isLoading} style={{ ...btn(balType==="add"?"#22c55e":"#ef4444"), padding:"8px 18px", fontSize:13, opacity:!balAmt?0.5:1 }}>
                {balM.isLoading?"...":balType==="add"?"➕ افزایش":"➖ کاهش"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
