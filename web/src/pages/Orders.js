import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const safe = (v) => Array.isArray(v) ? v : [];
const num  = (v) => Number(v) || 0;
const usd  = (v) => "$" + num(v).toFixed(2);
const btn  = (bg, color="#fff") => ({ display:"inline-flex", alignItems:"center", gap:4, padding:"5px 12px", borderRadius:6, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, background:bg, color });

const OS = {
  pending:    { label:"در انتظار",  icon:"⏳", bg:"#fef3c7", color:"#92400e" },
  confirming: { label:"در بررسی",  icon:"🔍", bg:"#dbeafe", color:"#1e40af" },
  confirmed:  { label:"تأیید شده", icon:"✅", bg:"#dcfce7", color:"#15803d" },
  rejected:   { label:"رد شده",    icon:"❌", bg:"#fee2e2", color:"#b91c1c" },
  expired:    { label:"منقضی",     icon:"⌛", bg:"#f1f5f9", color:"#475569" },
};
const bdg = (st) => ({ display:"inline-flex", alignItems:"center", gap:3, padding:"3px 9px", borderRadius:20, fontSize:11, fontWeight:700, background:(OS[st]||OS.pending).bg, color:(OS[st]||OS.pending).color });

export default function Orders() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [page,   setPage]   = useState(1);
  const [sel,    setSel]    = useState(null);
  const [note,   setNote]   = useState("");
  const [copied, setCopied] = useState("");

  const copy = (text, key) => {
    navigator.clipboard.writeText(text).then(()=>{ setCopied(key); setTimeout(()=>setCopied(""),1500); });
  };

  const { data, isLoading } = useQuery(
    ["orders", status, page],
    () => {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      p.set("page", page);
      p.set("limit", 20);
      return api.get("/orders/?" + p).then(r => r.data);
    },
    { keepPreviousData:true, refetchInterval:20000, retry:1, onError:()=>{} }
  );
  const orders = safe(data);

  const { data: statsRaw } = useQuery("dash_stats",
    () => api.get("/stats/dashboard").then(r => r.data),
    { refetchInterval:30000, retry:1, onError:()=>{} }
  );
  const ot = statsRaw?.orders_today || {};
  const pendingCount = num(statsRaw?.pending_orders);

  // backend: POST /orders/{id}/confirm
  const confirmM = useMutation(
    id => api.post("/orders/" + id + "/confirm"),
    {
      onSuccess: (res) => {
        qc.invalidateQueries("orders");
        qc.invalidateQueries("dash_stats");
        toast.success("✅ تأیید شد — موجودی جدید: " + usd(res.data?.new_balance));
        setSel(null);
      },
      onError: e => toast.error(e?.response?.data?.detail || "خطا در تأیید")
    }
  );

  // backend: POST /orders/{id}/reject → { admin_note: "" }
  const rejectM = useMutation(
    ({id, admin_note}) => api.post("/orders/" + id + "/reject", { admin_note }),
    {
      onSuccess: () => {
        qc.invalidateQueries("orders");
        qc.invalidateQueries("dash_stats");
        toast.success("سفارش رد شد");
        setSel(null); setNote("");
      },
      onError: e => toast.error(e?.response?.data?.detail || "خطا")
    }
  );

  const FILTERS = ["","pending","confirming","confirmed","rejected","expired"];

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>
      <h2 style={{ fontSize:20, fontWeight:800, marginBottom:20 }}>🧾 سفارشات</h2>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(130px,1fr))", gap:10, marginBottom:16 }}>
        {[
          ["💰","درآمد امروز",usd(ot.total_usd),"#22c55e"],
          ["📦","سفارش امروز",num(ot.count)+" عدد","#6366f1"],
          ["⏳","در انتظار",pendingCount+" عدد","#f59e0b"],
        ].map(([icon,label,val,color])=>(
          <div key={label} style={{ background:"#fff", borderRadius:10, border:"1px solid #e2e8f0", padding:"14px 16px", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:color }} />
            <div style={{ fontSize:22, marginBottom:6, marginTop:2 }}>{icon}</div>
            <div style={{ fontSize:18, fontWeight:800, color }}>{val}</div>
            <div style={{ fontSize:11, color:"#94a3b8", marginTop:3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:"12px 16px", marginBottom:16 }}>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {FILTERS.map(s=>(
            <button key={s} onClick={()=>{ setStatus(s); setPage(1); }}
              style={{ padding:"5px 14px", borderRadius:20, border:"1.5px solid "+(status===s?"#6366f1":"#e2e8f0"), background:status===s?"#6366f1":"#fff", color:status===s?"#fff":"#475569", fontFamily:"inherit", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              {s===""?"همه":((OS[s]||{}).icon+" "+(OS[s]||{}).label)}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div style={{ textAlign:"center", padding:48, color:"#94a3b8" }}>
          <div style={{ width:32, height:32, border:"3px solid #e2e8f0", borderTopColor:"#6366f1", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 10px" }} />
          در حال بارگذاری...
        </div>
      ) : orders.length===0 ? (
        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:48, textAlign:"center", color:"#94a3b8" }}>
          <div style={{ fontSize:40, marginBottom:10 }}>🧾</div><p>سفارشی یافت نشد</p>
        </div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {orders.map(o=>(
            <div key={o.id}
              style={{ background:"#fff", borderRadius:12, border:"1px solid "+(o.status==="confirming"?"#fde68a":"#e2e8f0"), padding:"14px 16px", cursor:"pointer", transition:"all 0.15s" }}
              onClick={()=>{ setSel(o); setNote(""); }}
              onMouseEnter={e=>{ e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.08)"; e.currentTarget.style.transform="translateY(-1px)"; }}
              onMouseLeave={e=>{ e.currentTarget.style.boxShadow=""; e.currentTarget.style.transform=""; }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", flexWrap:"wrap", gap:8 }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:6 }}>
                    <span style={bdg(o.status)}>{(OS[o.status]||OS.pending).icon} {(OS[o.status]||OS.pending).label}</span>
                    <span style={{ fontWeight:700, fontSize:15, color:"#22c55e" }}>{usd(o.amount)}</span>
                    <span style={{ fontSize:12, color:"#94a3b8" }}>{o.currency}</span>
                    {o.amount_crypto && <span style={{ fontSize:12, color:"#6366f1", fontWeight:600 }}>{num(o.amount_crypto).toFixed(6)} {o.currency}</span>}
                  </div>
                  <div style={{ display:"flex", gap:12, flexWrap:"wrap" }}>
                    <span style={{ fontSize:12, color:"#475569" }}>👤 {o.full_name||o.username||o.user_id}</span>
                    <span style={{ fontSize:12, color:"#94a3b8" }}>📅 {o.created_at?new Date(o.created_at).toLocaleString("fa-IR"):"—"}</span>
                    {o.tx_hash && <span style={{ fontSize:12, color:"#6366f1" }}>🔗 هش موجود</span>}
                  </div>
                </div>
                {(o.status==="pending"||o.status==="confirming") && (
                  <div style={{ display:"flex", gap:6 }} onClick={e=>e.stopPropagation()}>
                    <button style={{ ...btn("#22c55e"), padding:"6px 14px" }}
                      onClick={()=>{ if(window.confirm("تأیید سفارش؟")) confirmM.mutate(o.id); }}
                      disabled={confirmM.isLoading}>
                      {confirmM.isLoading?"...":"✅ تأیید"}
                    </button>
                    <button style={{ ...btn("#ef4444"), padding:"6px 14px" }}
                      onClick={()=>{ setSel(o); setNote(""); }}>
                      ❌ رد
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {(orders.length===20||page>1) && (
        <div style={{ display:"flex", gap:6, justifyContent:"center", marginTop:16 }}>
          <button disabled={page===1} onClick={()=>setPage(p=>p-1)} style={{ ...btn("#f1f5f9","#475569"), border:"1.5px solid #e2e8f0" }}>قبلی</button>
          <span style={{ padding:"6px 14px", fontWeight:700, fontSize:13 }}>صفحه {page}</span>
          <button disabled={orders.length<20} onClick={()=>setPage(p=>p+1)} style={{ ...btn("#f1f5f9","#475569"), border:"1.5px solid #e2e8f0" }}>بعدی</button>
        </div>
      )}

      {/* Modal جزئیات */}
      {sel && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
          onClick={e=>e.target===e.currentTarget&&setSel(null)}>
          <div style={{ background:"#fff", borderRadius:16, padding:24, width:"100%", maxWidth:500, maxHeight:"92vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:18 }}>
              <div>
                <h3 style={{ fontWeight:800, fontSize:16 }}>🧾 جزئیات سفارش</h3>
                <span style={{ ...bdg(sel.status), marginTop:6, display:"inline-flex" }}>{(OS[sel.status]||OS.pending).icon} {(OS[sel.status]||OS.pending).label}</span>
              </div>
              <button onClick={()=>setSel(null)} style={{ background:"none", border:"none", fontSize:18, cursor:"pointer", color:"#94a3b8" }}>✕</button>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
              {[
                ["💰 مبلغ (USD)", usd(sel.amount)],
                ["🪙 مبلغ کریپتو", num(sel.amount_crypto).toFixed(6)+" "+(sel.currency||"")],
                ["💳 ارز", sel.currency||"—"],
                ["👤 کاربر", sel.full_name||sel.username||String(sel.user_id)],
                ["📅 تاریخ", sel.created_at?new Date(sel.created_at).toLocaleString("fa-IR"):"—"],
                ["⌛ انقضا", sel.expires_at?new Date(sel.expires_at).toLocaleString("fa-IR"):"—"],
              ].map(([l,v])=>(
                <div key={l} style={{ background:"#f8fafc", borderRadius:8, padding:"10px 12px" }}>
                  <div style={{ fontSize:11, color:"#94a3b8", marginBottom:3 }}>{l}</div>
                  <div style={{ fontSize:13, fontWeight:600, wordBreak:"break-all" }}>{v}</div>
                </div>
              ))}
            </div>

            {sel.wallet_address && (
              <div style={{ background:"#f8fafc", borderRadius:8, padding:"10px 12px", marginBottom:10 }}>
                <div style={{ fontSize:11, color:"#94a3b8", marginBottom:4 }}>🏦 آدرس کیف پول</div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <code style={{ fontSize:11, flex:1, wordBreak:"break-all", color:"#475569" }}>{sel.wallet_address}</code>
                  <button onClick={()=>copy(sel.wallet_address,"wallet")} style={{ ...btn(copied==="wallet"?"#22c55e":"#6366f1"), flexShrink:0, padding:"4px 10px" }}>
                    {copied==="wallet"?"✅":"📋"}
                  </button>
                </div>
              </div>
            )}

            {sel.tx_hash && (
              <div style={{ background:"#f8fafc", borderRadius:8, padding:"10px 12px", marginBottom:10 }}>
                <div style={{ fontSize:11, color:"#94a3b8", marginBottom:4 }}>🔗 هش تراکنش</div>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <code style={{ fontSize:11, flex:1, wordBreak:"break-all", color:"#6366f1" }}>{sel.tx_hash}</code>
                  <button onClick={()=>copy(sel.tx_hash,"tx")} style={{ ...btn(copied==="tx"?"#22c55e":"#6366f1"), flexShrink:0, padding:"4px 10px" }}>
                    {copied==="tx"?"✅":"📋"}
                  </button>
                </div>
              </div>
            )}

            {sel.admin_note && (
              <div style={{ background:"#fef3c7", borderRadius:8, padding:"10px 12px", marginBottom:14, border:"1px solid #fde68a" }}>
                <div style={{ fontSize:11, color:"#92400e", marginBottom:3 }}>📝 یادداشت ادمین</div>
                <div style={{ fontSize:12, color:"#78350f" }}>{sel.admin_note}</div>
              </div>
            )}

            {(sel.status==="pending"||sel.status==="confirming") && (
              <div style={{ borderTop:"1px solid #e2e8f0", paddingTop:16, marginTop:8 }}>
                <div style={{ marginBottom:12 }}>
                  <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:6 }}>📝 یادداشت (برای رد)</label>
                  <textarea rows={2} value={note} onChange={e=>setNote(e.target.value)}
                    placeholder="دلیل رد سفارش..."
                    style={{ width:"100%", padding:"8px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontFamily:"inherit", fontSize:13, outline:"none", resize:"none" }} />
                </div>
                <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                  <button onClick={()=>setSel(null)} style={{ ...btn("#f1f5f9","#475569"), padding:"8px 16px", fontSize:13 }}>بستن</button>
                  <button onClick={()=>{ if(window.confirm("رد سفارش؟")) rejectM.mutate({id:sel.id, admin_note:note}); }}
                    disabled={rejectM.isLoading}
                    style={{ ...btn("#ef4444"), padding:"8px 16px", fontSize:13 }}>
                    {rejectM.isLoading?"...":"❌ رد"}
                  </button>
                  <button onClick={()=>{ if(window.confirm("تأیید سفارش؟")) confirmM.mutate(sel.id); }}
                    disabled={confirmM.isLoading}
                    style={{ ...btn("#22c55e"), padding:"8px 18px", fontSize:13 }}>
                    {confirmM.isLoading?"...":"✅ تأیید"}
                  </button>
                </div>
              </div>
            )}

            {(sel.status==="confirmed"||sel.status==="rejected"||sel.status==="expired") && (
              <div style={{ display:"flex", justifyContent:"flex-end", marginTop:16 }}>
                <button onClick={()=>setSel(null)} style={{ ...btn("#f1f5f9","#475569"), padding:"8px 16px", fontSize:13 }}>بستن</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
