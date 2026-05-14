import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const ST = {
  pending:    { label:"در انتظار",  icon:"⏳", bg:"#f1f5f9", color:"#475569" },
  confirming: { label:"در بررسی",  icon:"🔍", bg:"#fef3c7", color:"#92400e" },
  confirmed:  { label:"تأیید شده", icon:"✅", bg:"#dcfce7", color:"#15803d" },
  rejected:   { label:"رد شده",    icon:"❌", bg:"#fee2e2", color:"#b91c1c" },
  expired:    { label:"منقضی",     icon:"⌛", bg:"#f1f5f9", color:"#475569" },
};
const CUR = { USDT:"#26a17b", TON:"#0098ea", TRX:"#ef0027" };
const safe = (v) => Array.isArray(v) ? v : [];
const num = (v) => Number(v) || 0;
const btn = (bg, color="#fff") => ({ display:"inline-flex", alignItems:"center", gap:4, padding:"6px 14px", borderRadius:7, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, background:bg, color });
const bdg = (st) => ({ display:"inline-flex", alignItems:"center", gap:3, padding:"3px 9px", borderRadius:20, fontSize:11, fontWeight:700, background:(ST[st]||ST.pending).bg, color:(ST[st]||ST.pending).color });

export default function Orders() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("confirming");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [openId, setOpenId] = useState(null);
  const [rejectId, setRejectId] = useState(null);
  const [rejectNote, setRejectNote] = useState("");

  const { data, isLoading } = useQuery(
    ["orders", statusFilter, search, page],
    () => { const p = new URLSearchParams(); if(statusFilter) p.set("status",statusFilter); if(search) p.set("search",search); p.set("page",page); p.set("limit",15); return api.get("/orders/?"+p).then(r=>r.data); },
    { keepPreviousData:true, refetchInterval:15000, retry:1, onError:()=>{} }
  );
  const orders = safe(data) || safe(data && data.orders);
  const total = num(data && data.total) || orders.length;
  const totalPages = Math.max(1, Math.ceil(total/15));

  const { data: statsRaw } = useQuery("order_stats2",
    () => api.get("/stats/dashboard").then(r => r.data && r.data.orders ? r.data.orders : {}),
    { refetchInterval:30000, retry:1, onError:()=>{} }
  );
  const stats = (statsRaw && typeof statsRaw==="object") ? statsRaw : {};

  const confirmM = useMutation(id=>api.post("/orders/"+id+"/confirm",{}),
    { onSuccess:()=>{ qc.invalidateQueries("orders"); qc.invalidateQueries("order_stats2"); toast.success("✅ تأیید شد"); }, onError:e=>toast.error((e&&e.response&&e.response.data&&e.response.data.detail)||"خطا") });
  const rejectM = useMutation(({id,note})=>api.post("/orders/"+id+"/reject",{admin_note:note}),
    { onSuccess:()=>{ qc.invalidateQueries("orders"); qc.invalidateQueries("order_stats2"); toast.success("رد شد"); setRejectId(null); setRejectNote(""); }, onError:e=>toast.error((e&&e.response&&e.response.data&&e.response.data.detail)||"خطا") });

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>
      <h2 style={{ fontSize:20, fontWeight:800, marginBottom:20 }}>💰 سفارشات</h2>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))", gap:10, marginBottom:16 }}>
        {[["🔍","در بررسی",stats.confirming,"#f59e0b"],["✅","تأیید",stats.confirmed,"#22c55e"],["❌","رد شده",stats.rejected,"#ef4444"],["💵","درآمد","$"+num(stats.total_revenue).toFixed(0),"#22c55e"]].map(([icon,label,val,color])=>(
          <div key={label} style={{ background:"#fff", borderRadius:10, border:"1px solid #e2e8f0", padding:"12px 14px", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:color }} />
            <div style={{ fontSize:18, marginBottom:6, marginTop:2 }}>{icon}</div>
            <div style={{ fontSize:20, fontWeight:800 }}>{val||0}</div>
            <div style={{ fontSize:11, color:"#94a3b8", marginTop:3 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:"12px 16px", marginBottom:16 }}>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, alignItems:"center" }}>
          {["","confirming","pending","confirmed","rejected","expired"].map(s=>(
            <button key={s} onClick={()=>{ setStatusFilter(s); setPage(1); }} style={{ padding:"5px 14px", borderRadius:20, border:"1.5px solid "+(statusFilter===s?"#6366f1":"#e2e8f0"), background:statusFilter===s?"#6366f1":"#fff", color:statusFilter===s?"#fff":"#475569", fontFamily:"inherit", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              {s===""?"همه":((ST[s]||{}).icon+" "+(ST[s]||{}).label)}
            </button>
          ))}
          <form onSubmit={e=>{ e.preventDefault(); setSearch(searchInput); setPage(1); }} style={{ display:"flex", gap:6, flex:1, minWidth:160 }}>
            <input style={{ flex:1, padding:"7px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontFamily:"inherit", fontSize:12, outline:"none" }} placeholder="جستجو..." value={searchInput} onChange={e=>setSearchInput(e.target.value)} />
            <button type="submit" style={btn("#6366f1")}>🔍</button>
            {search && <button type="button" onClick={()=>{ setSearch(""); setSearchInput(""); }} style={btn("#f1f5f9","#475569")}>✕</button>}
          </form>
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign:"center", padding:48, color:"#94a3b8" }}>
          <div style={{ width:32, height:32, border:"3px solid #e2e8f0", borderTopColor:"#6366f1", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 10px" }} />
          در حال بارگذاری...
        </div>
      ) : orders.length===0 ? (
        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:48, textAlign:"center", color:"#94a3b8" }}><div style={{ fontSize:40, marginBottom:10 }}>💰</div><p>سفارشی یافت نشد</p></div>
      ) : orders.map(o=>{
        const st = ST[o.status]||ST.pending;
        const curColor = CUR[o.currency]||"#6366f1";
        const isOpen = openId===o.id;
        return (
          <div key={o.id} style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", marginBottom:10, overflow:"hidden", transition:"box-shadow 0.15s" }}
            onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.08)"}
            onMouseLeave={e=>e.currentTarget.style.boxShadow=""}>
            <div style={{ display:"flex", alignItems:"center", gap:12, padding:"14px 16px", cursor:"pointer", flexWrap:"wrap" }} onClick={()=>setOpenId(isOpen?null:o.id)}>
              <div style={{ width:40, height:40, borderRadius:"50%", background:"linear-gradient(135deg,#6366f1,#8b5cf6)", display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:700, fontSize:16, flexShrink:0 }}>
                {((o.full_name||o.username||"?")[0]).toUpperCase()}
              </div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                  <span style={{ fontWeight:700, fontSize:14 }}>{o.full_name||"—"}</span>
                  {o.username && <span style={{ fontSize:12, color:"#94a3b8" }}>@{o.username}</span>}
                  <span style={bdg(o.status)}>{st.icon} {st.label}</span>
                </div>
                <div style={{ display:"flex", gap:10, marginTop:4, alignItems:"center", flexWrap:"wrap" }}>
                  <strong style={{ fontSize:15 }}>${o.amount}</strong>
                  <span style={{ background:curColor+"18", color:curColor, border:"1px solid "+curColor+"40", padding:"2px 8px", borderRadius:12, fontSize:11, fontWeight:700 }}>{o.currency}</span>
                  <span style={{ fontSize:11, color:"#94a3b8" }}>{o.created_at?new Date(o.created_at).toLocaleString("fa-IR"):"—"}</span>
                </div>
              </div>
              {o.status==="confirming" && (
                <div style={{ display:"flex", gap:6 }} onClick={e=>e.stopPropagation()}>
                  <button style={btn("#22c55e")} onClick={()=>confirmM.mutate(o.id)} disabled={confirmM.isLoading}>✅ تأیید</button>
                  <button style={btn("#ef4444")} onClick={()=>{ setRejectId(o.id); setRejectNote(""); }}>❌ رد</button>
                </div>
              )}
              <span style={{ color:"#94a3b8", transition:"transform 0.2s", transform:isOpen?"rotate(180deg)":"" }}>▾</span>
            </div>
            {isOpen && (
              <div style={{ padding:"0 16px 16px", borderTop:"1px solid #f1f5f9" }}>
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:8, marginTop:12 }}>
                  {o.amount_crypto && <div style={{ background:"#f8fafc", borderRadius:8, padding:"10px 12px" }}><div style={{ fontSize:11, color:"#94a3b8", marginBottom:3 }}>💰 مبلغ کریپتو</div><div style={{ fontWeight:700 }}>{o.amount_crypto} {o.currency}</div></div>}
                  {o.plan_name && <div style={{ background:"#f8fafc", borderRadius:8, padding:"10px 12px" }}><div style={{ fontSize:11, color:"#94a3b8", marginBottom:3 }}>📦 پلن</div><div style={{ fontWeight:700 }}>{o.plan_name}</div></div>}
                  {o.session_count && <div style={{ background:"#f8fafc", borderRadius:8, padding:"10px 12px" }}><div style={{ fontSize:11, color:"#94a3b8", marginBottom:3 }}>📱 سشن</div><div style={{ fontWeight:700 }}>{o.session_count}</div></div>}
                </div>
                <div style={{ background:"#f8fafc", borderRadius:8, padding:"10px 12px", marginTop:8 }}>
                  <div style={{ fontSize:11, color:"#94a3b8", marginBottom:6 }}>🔗 هش تراکنش</div>
                  {o.tx_hash ? (
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap" }}>
                      <code style={{ fontSize:12, background:"#fff", padding:"3px 8px", borderRadius:6, cursor:"pointer", border:"1px solid #e2e8f0" }}
                        onClick={()=>{ navigator.clipboard.writeText(o.tx_hash); toast.success("کپی شد!"); }}>
                        {o.tx_hash.slice(0,10)}...{o.tx_hash.slice(-8)}
                      </code>
                      {o.currency==="TON" && <a href={"https://tonscan.org/tx/"+o.tx_hash} target="_blank" rel="noreferrer" style={{ ...btn("#06b6d4"), textDecoration:"none" }}>TONScan</a>}
                      {(o.currency==="USDT"||o.currency==="TRX") && <a href={"https://tronscan.org/#/transaction/"+o.tx_hash} target="_blank" rel="noreferrer" style={{ ...btn("#06b6d4"), textDecoration:"none" }}>TronScan</a>}
                    </div>
                  ) : <span style={{ fontSize:13, color:"#94a3b8" }}>ثبت نشده</span>}
                </div>
                {o.admin_note && <div style={{ background:"#fff7ed", borderRadius:8, padding:"10px 12px", marginTop:8, border:"1px solid #fed7aa" }}><div style={{ fontSize:11, color:"#92400e", marginBottom:3 }}>📝 یادداشت</div><div style={{ fontSize:13, color:"#78350f" }}>{o.admin_note}</div></div>}
              </div>
            )}
          </div>
        );
      })}

      {totalPages>1 && (
        <div style={{ display:"flex", gap:6, justifyContent:"center", marginTop:16, flexWrap:"wrap" }}>
          <button disabled={page===1} onClick={()=>setPage(p=>p-1)} style={{ ...btn("#f1f5f9","#475569"), border:"1.5px solid #e2e8f0" }}>قبلی</button>
          {Array.from({length:Math.min(5,totalPages)},(_,i)=>{ const p=page<=3?i+1:page-2+i; if(p<1||p>totalPages)return null; return <button key={p} onClick={()=>setPage(p)} style={{ ...btn(p===page?"#6366f1":"#fff",p===page?"#fff":"#475569"), border:"1.5px solid "+(p===page?"#6366f1":"#e2e8f0"), minWidth:36 }}>{p}</button>; })}
          <button disabled={page===totalPages} onClick={()=>setPage(p=>p+1)} style={{ ...btn("#f1f5f9","#475569"), border:"1.5px solid #e2e8f0" }}>بعدی</button>
        </div>
      )}

      {rejectId && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={e=>e.target===e.currentTarget&&setRejectId(null)}>
          <div style={{ background:"#fff", borderRadius:16, padding:24, width:"100%", maxWidth:380, boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ textAlign:"center", marginBottom:18 }}>
              <div style={{ fontSize:40, marginBottom:8 }}>❌</div>
              <h3 style={{ fontWeight:800, fontSize:16 }}>رد سفارش</h3>
              <p style={{ fontSize:12, color:"#94a3b8", marginTop:4 }}>دلیل رد (اختیاری)</p>
            </div>
            <textarea value={rejectNote} onChange={e=>setRejectNote(e.target.value)} rows={3} placeholder="مثلاً: تراکنش یافت نشد..." style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontFamily:"inherit", fontSize:13, outline:"none", resize:"vertical" }} />
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:16 }}>
              <button onClick={()=>setRejectId(null)} style={{ ...btn("#f1f5f9","#475569"), padding:"8px 16px", fontSize:13 }}>انصراف</button>
              <button onClick={()=>rejectM.mutate({id:rejectId,note:rejectNote})} disabled={rejectM.isLoading} style={{ ...btn("#ef4444"), padding:"8px 16px", fontSize:13 }}>
                {rejectM.isLoading?"...":"❌ تأیید رد"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
