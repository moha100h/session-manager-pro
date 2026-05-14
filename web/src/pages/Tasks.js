import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const ST = {
  pending:   { label:"در صف",       icon:"⏳", bg:"#f1f5f9", color:"#475569" },
  running:   { label:"در حال اجرا", icon:"⚡", bg:"#cffafe", color:"#0e7490" },
  completed: { label:"تکمیل",       icon:"✅", bg:"#dcfce7", color:"#15803d" },
  failed:    { label:"ناموفق",      icon:"❌", bg:"#fee2e2", color:"#b91c1c" },
  cancelled: { label:"لغو",         icon:"🚫", bg:"#f1f5f9", color:"#475569" },
};
const TP = {
  join_channel:  { label:"عضویت کانال", icon:"📢" },
  join_group:    { label:"عضویت گروه",  icon:"👥" },
  send_message:  { label:"ارسال پیام",  icon:"💬" },
  leave_channel: { label:"خروج کانال", icon:"🚪" },
};
const safe = (v) => Array.isArray(v) ? v : [];
const num = (v) => Number(v) || 0;
const btn = (bg, color="#fff") => ({ display:"inline-flex", alignItems:"center", gap:4, padding:"6px 14px", borderRadius:7, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, background:bg, color });
const bdg = (st) => ({ display:"inline-flex", alignItems:"center", gap:3, padding:"3px 9px", borderRadius:20, fontSize:11, fontWeight:700, background:(ST[st]||ST.pending).bg, color:(ST[st]||ST.pending).color });
const card = { background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", boxShadow:"0 2px 8px rgba(0,0,0,0.06)", padding:18, marginBottom:12 };

export default function Tasks() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [sel, setSel] = useState(null);
  const [form, setForm] = useState({ task_type:"join_channel", target:"", session_count:"", delay_between:"", priority:"normal" });

  const { data, isLoading } = useQuery(
    ["tasks", status, page],
    () => { const p = new URLSearchParams(); if(status) p.set("status",status); p.set("page",page); p.set("limit",20); return api.get("/tasks/?"+p).then(r=>r.data); },
    { keepPreviousData:true, refetchInterval:10000, retry:1, onError:()=>{} }
  );
  const tasks = safe(data) || safe(data && data.tasks);
  const total = num(data && data.total) || tasks.length;
  const totalPages = Math.max(1, Math.ceil(total/20));

  const { data: statsRaw } = useQuery("task_stats2",
    () => api.get("/stats/dashboard").then(r => r.data && r.data.tasks ? r.data.tasks : {}),
    { refetchInterval:15000, retry:1, onError:()=>{} }
  );
  const stats = (statsRaw && typeof statsRaw==="object") ? statsRaw : {};

  const createM = useMutation(
    d => api.post("/tasks/", { ...d, session_count:parseInt(d.session_count)||1, delay_between:d.delay_between?parseInt(d.delay_between):null }),
    { onSuccess:()=>{ qc.invalidateQueries("tasks"); toast.success("تسک ایجاد شد"); setShowCreate(false); setForm({task_type:"join_channel",target:"",session_count:"",delay_between:"",priority:"normal"}); }, onError:e=>toast.error((e&&e.response&&e.response.data&&e.response.data.detail)||"خطا") }
  );
  const cancelM = useMutation(id=>api.post("/tasks/"+id+"/cancel"),
    { onSuccess:()=>{ qc.invalidateQueries("tasks"); toast.success("لغو شد"); setSel(null); } });
  const retryM = useMutation(id=>api.post("/tasks/"+id+"/retry"),
    { onSuccess:()=>{ qc.invalidateQueries("tasks"); toast.success("در صف قرار گرفت"); setSel(null); } });

  const pct = (t) => num(t.total_count)>0 ? Math.round((num(t.success_count)/num(t.total_count))*100) : 0;

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <h2 style={{ fontSize:20, fontWeight:800 }}>📋 تسک‌ها <span style={{ fontSize:13, color:"#94a3b8", fontWeight:400 }}>({total.toLocaleString("fa-IR")})</span></h2>
        <button onClick={()=>setShowCreate(true)} style={{ ...btn("#6366f1"), padding:"8px 18px", fontSize:13 }}>+ تسک جدید</button>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))", gap:10, marginBottom:16 }}>
        {[["⏳","در صف",stats.pending,"#94a3b8"],["⚡","اجرا",stats.running,"#06b6d4"],["✅","تکمیل",stats.completed,"#22c55e"],["❌","ناموفق",stats.failed,"#ef4444"]].map(([icon,label,val,color])=>(
          <div key={label} style={{ background:"#fff", borderRadius:10, border:"1px solid #e2e8f0", padding:"12px 14px", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:color }} />
            <div style={{ fontSize:18, marginBottom:6, marginTop:2 }}>{icon}</div>
            <div style={{ fontSize:20, fontWeight:800 }}>{num(val)}</div>
            <div style={{ fontSize:11, color:"#94a3b8", marginTop:3 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:"12px 16px", marginBottom:16 }}>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {["","pending","running","completed","failed","cancelled"].map(s=>(
            <button key={s} onClick={()=>{ setStatus(s); setPage(1); }} style={{ padding:"5px 14px", borderRadius:20, border:"1.5px solid "+(status===s?"#6366f1":"#e2e8f0"), background:status===s?"#6366f1":"#fff", color:status===s?"#fff":"#475569", fontFamily:"inherit", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              {s===""?"همه":((ST[s]||{}).icon+" "+(ST[s]||{}).label)}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign:"center", padding:48, color:"#94a3b8" }}>
          <div style={{ width:32, height:32, border:"3px solid #e2e8f0", borderTopColor:"#6366f1", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 10px" }} />
          در حال بارگذاری...
        </div>
      ) : tasks.length===0 ? (
        <div style={{ ...card, textAlign:"center", padding:48, color:"#94a3b8" }}><div style={{ fontSize:40, marginBottom:10 }}>📋</div><p>تسکی یافت نشد</p></div>
      ) : tasks.map(t=>{
        const st = ST[t.status]||ST.pending;
        const tp = TP[t.task_type]||{ label:t.task_type||"تسک", icon:"📋" };
        const p = pct(t);
        return (
          <div key={t.id} style={{ ...card, cursor:"pointer", transition:"all 0.15s" }}
            onClick={()=>setSel(t)}
            onMouseEnter={e=>{ e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,0.1)"; e.currentTarget.style.transform="translateY(-1px)"; }}
            onMouseLeave={e=>{ e.currentTarget.style.boxShadow="0 2px 8px rgba(0,0,0,0.06)"; e.currentTarget.style.transform=""; }}>
            <div style={{ display:"flex", alignItems:"flex-start", gap:12, flexWrap:"wrap" }}>
              <div style={{ width:42, height:42, borderRadius:10, background:"#e0e7ff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, flexShrink:0 }}>{tp.icon}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:5 }}>
                  <span style={{ fontWeight:700, fontSize:14 }}>{tp.label}</span>
                  <span style={bdg(t.status)}>{st.icon} {st.label}</span>
                  {t.priority==="high" && <span style={{ background:"#fee2e2", color:"#b91c1c", padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:700 }}>🔥 اولویت بالا</span>}
                </div>
                <div style={{ fontSize:12, color:"#475569", marginBottom:8 }}>🎯 <code style={{ background:"#f1f5f9", padding:"1px 6px", borderRadius:4 }}>{t.target||"—"}</code></div>
                {num(t.total_count)>0 && (
                  <div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:"#94a3b8", marginBottom:4 }}>
                      <span>پیشرفت: {num(t.success_count)} / {num(t.total_count)}</span><span>{p}%</span>
                    </div>
                    <div style={{ background:"#f1f5f9", borderRadius:6, height:7, overflow:"hidden" }}>
                      <div style={{ width:p+"%", height:"100%", borderRadius:6, transition:"width 0.5s", background:t.status==="completed"?"#22c55e":t.status==="failed"?"#ef4444":"#6366f1" }} />
                    </div>
                  </div>
                )}
                <div style={{ fontSize:11, color:"#94a3b8", marginTop:6 }}>📅 {t.created_at?new Date(t.created_at).toLocaleString("fa-IR"):"—"}</div>
              </div>
              <div style={{ display:"flex", gap:6 }} onClick={e=>e.stopPropagation()}>
                {["pending","running"].includes(t.status) && <button style={btn("#f59e0b")} onClick={()=>cancelM.mutate(t.id)}>🚫 لغو</button>}
                {t.status==="failed" && <button style={btn("#6366f1")} onClick={()=>retryM.mutate(t.id)}>🔄</button>}
              </div>
            </div>
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

      {showCreate && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={e=>e.target===e.currentTarget&&setShowCreate(false)}>
          <div style={{ background:"#fff", borderRadius:16, padding:24, width:"100%", maxWidth:440, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ fontWeight:800, fontSize:16, marginBottom:18 }}>📋 تسک جدید</h3>
            {[["نوع تسک","task_type","select"],["هدف","target","text"],["تعداد سشن","session_count","number"],["تأخیر (ثانیه)","delay_between","number"],["اولویت","priority","select"]].map(([label,key,type])=>(
              <div key={key} style={{ marginBottom:12 }}>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>{label}</label>
                {type==="select" ? (
                  <select value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontFamily:"inherit", fontSize:13, outline:"none" }}>
                    {key==="task_type" ? Object.entries(TP).map(([k,v])=><option key={k} value={k}>{v.icon} {v.label}</option>) : [["low","🔵 پایین"],["normal","🟡 معمولی"],["high","🔴 بالا"]].map(([k,v])=><option key={k} value={k}>{v}</option>)}
                  </select>
                ) : (
                  <input type={type} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontFamily:"inherit", fontSize:13, outline:"none" }} />
                )}
              </div>
            ))}
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:18 }}>
              <button onClick={()=>setShowCreate(false)} style={{ ...btn("#f1f5f9","#475569"), padding:"8px 16px", fontSize:13 }}>انصراف</button>
              <button onClick={()=>createM.mutate(form)} disabled={!form.target||!form.session_count||createM.isLoading} style={{ ...btn("#6366f1"), padding:"8px 18px", fontSize:13, opacity:(!form.target||!form.session_count)?0.5:1 }}>
                {createM.isLoading?"...":"✅ ایجاد"}
              </button>
            </div>
          </div>
        </div>
      )}

      {sel && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={e=>e.target===e.currentTarget&&setSel(null)}>
          <div style={{ background:"#fff", borderRadius:16, padding:24, width:"100%", maxWidth:440, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
              <div>
                <h3 style={{ fontWeight:800, fontSize:16 }}>{(TP[sel.task_type]||{icon:"📋"}).icon} {(TP[sel.task_type]||{label:sel.task_type||"تسک"}).label}</h3>
                <span style={{ ...bdg(sel.status), marginTop:6, display:"inline-flex" }}>{(ST[sel.status]||ST.pending).icon} {(ST[sel.status]||ST.pending).label}</span>
              </div>
              <button onClick={()=>setSel(null)} style={{ background:"none", border:"none", fontSize:18, cursor:"pointer", color:"#94a3b8" }}>✕</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
              {[["🎯 هدف",sel.target||"—"],["📱 سشن",num(sel.session_count)],["✅ موفق",num(sel.success_count)],["❌ ناموفق",num(sel.fail_count)],["📊 کل",num(sel.total_count)],["🔥 اولویت",sel.priority||"normal"],["📅 ایجاد",sel.created_at?new Date(sel.created_at).toLocaleString("fa-IR"):"—"],["⏱ پایان",sel.finished_at?new Date(sel.finished_at).toLocaleString("fa-IR"):"—"]].map(([l,v])=>(
                <div key={l} style={{ background:"#f8fafc", borderRadius:8, padding:"10px 12px" }}>
                  <div style={{ fontSize:11, color:"#94a3b8", marginBottom:3 }}>{l}</div>
                  <div style={{ fontSize:13, fontWeight:600, wordBreak:"break-all" }}>{v}</div>
                </div>
              ))}
            </div>
            {num(sel.total_count)>0 && (
              <div style={{ marginBottom:14 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#94a3b8", marginBottom:5 }}><span>پیشرفت</span><span>{pct(sel)}%</span></div>
                <div style={{ background:"#f1f5f9", borderRadius:8, height:10, overflow:"hidden" }}>
                  <div style={{ width:pct(sel)+"%", height:"100%", borderRadius:8, background:sel.status==="completed"?"#22c55e":sel.status==="failed"?"#ef4444":"#6366f1", transition:"width 0.5s" }} />
                </div>
              </div>
            )}
            {sel.error_message && <div style={{ background:"#fee2e2", borderRadius:8, padding:"10px 12px", marginBottom:14, border:"1px solid #fecaca" }}><div style={{ fontSize:11, color:"#b91c1c", marginBottom:3 }}>⚠️ خطا</div><div style={{ fontSize:12, color:"#7f1d1d" }}>{sel.error_message}</div></div>}
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:16 }}>
              <button onClick={()=>setSel(null)} style={{ ...btn("#f1f5f9","#475569"), padding:"8px 16px", fontSize:13 }}>بستن</button>
              {["pending","running"].includes(sel.status) && <button onClick={()=>cancelM.mutate(sel.id)} style={{ ...btn("#f59e0b"), padding:"8px 16px", fontSize:13 }}>🚫 لغو</button>}
              {sel.status==="failed" && <button onClick={()=>retryM.mutate(sel.id)} style={{ ...btn("#6366f1"), padding:"8px 16px", fontSize:13 }}>🔄 تلاش مجدد</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
