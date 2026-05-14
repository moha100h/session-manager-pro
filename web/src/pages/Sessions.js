import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const ST = {
  active:     { label:"فعال",      icon:"✅", bg:"#dcfce7", color:"#15803d" },
  logged_out: { label:"لاگ‌اوت",  icon:"🔴", bg:"#fee2e2", color:"#b91c1c" },
  flood:      { label:"فلود",      icon:"🌊", bg:"#fef3c7", color:"#92400e" },
  banned:     { label:"بن",        icon:"🚫", bg:"#fee2e2", color:"#b91c1c" },
  error:      { label:"خطا",       icon:"⚠️", bg:"#fee2e2", color:"#b91c1c" },
  inactive:   { label:"غیرفعال",   icon:"⏸", bg:"#f1f5f9", color:"#475569" },
};
const safe = (v) => Array.isArray(v) ? v : [];
const num = (v) => Number(v) || 0;
const C = {
  card: { background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", boxShadow:"0 2px 8px rgba(0,0,0,0.06)", padding:20, marginBottom:16 },
  btn: (bg,color="#fff") => ({ display:"inline-flex", alignItems:"center", gap:4, padding:"5px 12px", borderRadius:6, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, background:bg, color }),
  input: { padding:"8px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontFamily:"inherit", fontSize:13, outline:"none", background:"#fff" },
  badge: (st) => ({ display:"inline-flex", alignItems:"center", gap:3, padding:"3px 9px", borderRadius:20, fontSize:11, fontWeight:700, background:(ST[st]||ST.inactive).bg, color:(ST[st]||ST.inactive).color }),
};

export default function Sessions() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState(null);

  const { data, isLoading } = useQuery(
    ["sessions", status, search, page],
    () => {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      if (search) p.set("search", search);
      p.set("page", page); p.set("limit", 20);
      return api.get(`/sessions/?${p}`).then(r => r.data);
    },
    { keepPreviousData: true, refetchInterval: 15000, retry: 1, onError: () => {} }
  );

  const sessions = safe(data) || safe(data?.sessions);
  const total = num(data?.total) || sessions.length;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  const { data: statsRaw } = useQuery("sess_stats",
    () => api.get("/stats/dashboard").then(r => r.data?.sessions || {}),
    { refetchInterval: 20000, retry: 1, onError: () => {} }
  );
  const stats = (statsRaw && typeof statsRaw === "object") ? statsRaw : {};

  const delM = useMutation(id => api.delete(`/sessions/${id}`),
    { onSuccess: () => { qc.invalidateQueries("sessions"); toast.success("سشن حذف شد."); setSel(null); } });
  const reactM = useMutation(id => api.post(`/sessions/${id}/reactivate`),
    { onSuccess: () => { qc.invalidateQueries("sessions"); toast.success("✅ فعال‌سازی شد."); setSel(null); } });

  const FILTERS = ["","active","logged_out","flood","banned","error"];

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <h2 style={{ fontSize:20, fontWeight:800 }}>📱 سشن‌ها <span style={{ fontSize:13, color:"#94a3b8", fontWeight:400 }}>({total.toLocaleString("fa-IR")})</span></h2>
      </div>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))", gap:10, marginBottom:16 }}>
        {[["📱","کل",stats.total,"#6366f1"],["✅","فعال",stats.active,"#22c55e"],["🌊","فلود",stats.flood,"#f59e0b"],["🚫","بن",stats.banned,"#8b5cf6"],["🔴","لاگ‌اوت",stats.logged_out,"#ef4444"],["⚠️","خطا",stats.error,"#94a3b8"]].map(([icon,label,val,color]) => (
          <div key={label} style={{ background:"#fff", borderRadius:10, border:"1px solid #e2e8f0", padding:"12px 14px", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:color }} />
            <div style={{ fontSize:18, marginBottom:6, marginTop:2 }}>{icon}</div>
            <div style={{ fontSize:20, fontWeight:800 }}>{num(val)}</div>
            <div style={{ fontSize:11, color:"#94a3b8", marginTop:3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ ...C.card, padding:"14px 16px" }}>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, alignItems:"center" }}>
          {FILTERS.map(s => (
            <button key={s} onClick={() => { setStatus(s); setPage(1); }} style={{
              padding:"5px 14px", borderRadius:20, border:`1.5px solid ${status===s?"#6366f1":"#e2e8f0"}`,
              background: status===s?"#6366f1":"#fff", color: status===s?"#fff":"#475569",
              fontFamily:"inherit", fontSize:12, fontWeight:600, cursor:"pointer",
            }}>
              {s===""?"همه":`${(ST[s]||{}).icon} ${(ST[s]||{}).label}`}
            </button>
          ))}
          <form onSubmit={e => { e.preventDefault(); setSearch(searchInput); setPage(1); }} style={{ display:"flex", gap:6, flex:1, minWidth:160 }}>
            <input style={{ ...C.input, flex:1 }} placeholder="جستجو..." value={searchInput} onChange={e => setSearchInput(e.target.value)} />
            <button type="submit" style={C.btn("#6366f1")}>🔍</button>
            {search && <button type="button" onClick={() => { setSearch(""); setSearchInput(""); }} style={C.btn("#f1f5f9","#475569")}>✕</button>}
          </form>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ textAlign:"center", padding:"48px", color:"#94a3b8" }}>
          <div style={{ width:32, height:32, border:"3px solid #e2e8f0", borderTopColor:"#6366f1", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 10px" }} />
          در حال بارگذاری...
        </div>
      ) : sessions.length === 0 ? (
        <div style={{ ...C.card, textAlign:"center", padding:"48px", color:"#94a3b8" }}>
          <div style={{ fontSize:40, marginBottom:10 }}>📱</div>
          <p>سشنی یافت نشد</p>
        </div>
      ) : (
        <div style={{ ...C.card, padding:0, overflow:"hidden" }}>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#f8fafc" }}>
                  {["#","شماره / نام","وضعیت","پروکسی","آخرین فعالیت","عملیات"].map(h => (
                    <th key={h} style={{ padding:"10px 14px", textAlign:"right", fontWeight:700, color:"#475569", fontSize:12, borderBottom:"1px solid #e2e8f0", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, idx) => (
                  <tr key={s.id} onClick={() => setSel(s)} style={{ cursor:"pointer", borderBottom:"1px solid #f1f5f9" }}
                    onMouseEnter={e => e.currentTarget.style.background="#f8fafc"}
                    onMouseLeave={e => e.currentTarget.style.background=""}>
                    <td style={{ padding:"10px 14px", color:"#94a3b8", fontSize:12 }}>{(page-1)*20+idx+1}</td>
                    <td style={{ padding:"10px 14px" }}>
                      <div style={{ fontWeight:600 }}>{s.phone || s.session_name || "—"}</div>
                      {s.first_name && <div style={{ fontSize:11, color:"#94a3b8" }}>{s.first_name} {s.last_name||""}</div>}
                    </td>
                    <td style={{ padding:"10px 14px" }}>
                      <span style={C.badge(s.status)}>{(ST[s.status]||ST.inactive).icon} {(ST[s.status]||ST.inactive).label}</span>
                    </td>
                    <td style={{ padding:"10px 14px" }}>
                      {s.proxy_host
                        ? <code style={{ background:"#f1f5f9", padding:"2px 6px", borderRadius:4, fontSize:11 }}>{s.proxy_host}:{s.proxy_port}</code>
                        : <span style={{ color:"#94a3b8" }}>—</span>}
                    </td>
                    <td style={{ padding:"10px 14px", fontSize:12, color:"#94a3b8", whiteSpace:"nowrap" }}>
                      {s.last_used ? new Date(s.last_used).toLocaleString("fa-IR") : "—"}
                    </td>
                    <td style={{ padding:"10px 14px" }} onClick={e => e.stopPropagation()}>
                      <div style={{ display:"flex", gap:4 }}>
                        {["logged_out","error","flood"].includes(s.status) && (
                          <button style={C.btn("#22c55e")} onClick={() => reactM.mutate(s.id)}>🔄</button>
                        )}
                        <button style={C.btn("#ef4444")} onClick={() => { if(window.confirm("حذف سشن؟")) delM.mutate(s.id); }}>🗑</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display:"flex", gap:6, justifyContent:"center", marginTop:16, flexWrap:"wrap" }}>
          <button disabled={page===1} onClick={() => setPage(p=>p-1)} style={{ ...C.btn(page===1?"#f1f5f9":"#fff","#475569"), border:"1.5px solid #e2e8f0" }}>قبلی</button>
          {Array.from({length:Math.min(5,totalPages)},(_,i)=>{const p=page<=3?i+1:page-2+i;if(p<1||p>totalPages)return null;return(
            <button key={p} onClick={()=>setPage(p)} style={{ ...C.btn(p===page?"#6366f1":"#fff",p===page?"#fff":"#475569"), border:`1.5px solid ${p===page?"#6366f1":"#e2e8f0"}`, minWidth:36 }}>{p}</button>
          );})}
          <button disabled={page===totalPages} onClick={() => setPage(p=>p+1)} style={{ ...C.btn(page===totalPages?"#f1f5f9":"#fff","#475569"), border:"1.5px solid #e2e8f0" }}>بعدی</button>
        </div>
      )}

      {/* Detail Modal */}
      {sel && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
          onClick={e => e.target===e.currentTarget && setSel(null)}>
          <div style={{ background:"#fff", borderRadius:16, padding:24, width:"100%", maxWidth:440, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
              <div>
                <h3 style={{ fontWeight:800, fontSize:16 }}>{sel.phone||sel.session_name||"سشن"}</h3>
                <span style={C.badge(sel.status)}>{(ST[sel.status]||ST.inactive).icon} {(ST[sel.status]||ST.inactive).label}</span>
              </div>
              <button onClick={() => setSel(null)} style={{ background:"none", border:"none", fontSize:18, cursor:"pointer", color:"#94a3b8" }}>✕</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
              {[["👤 نام",`${sel.first_name||""} ${sel.last_name||""}`.trim()||"—"],["📱 شماره",sel.phone||"—"],["🆔 یوزرنیم",sel.username?`@${sel.username}`:"—"],["🌐 پروکسی",sel.proxy_host?`${sel.proxy_host}:${sel.proxy_port}`:"—"],["📅 ایجاد",sel.created_at?new Date(sel.created_at).toLocaleDateString("fa-IR"):"—"],["⏱ آخرین فعالیت",sel.last_used?new Date(sel.last_used).toLocaleString("fa-IR"):"—"]].map(([l,v])=>(
                <div key={l} style={{ background:"#f8fafc", borderRadius:8, padding:"10px 12px" }}>
                  <div style={{ fontSize:11, color:"#94a3b8", marginBottom:3 }}>{l}</div>
                  <div style={{ fontSize:13, fontWeight:600, wordBreak:"break-all" }}>{v}</div>
                </div>
              ))}
            </div>
            {sel.error_message && (
              <div style={{ background:"#fee2e2", borderRadius:8, padding:"10px 12px", marginBottom:14, border:"1px solid #fecaca" }}>
                <div style={{ fontSize:11, color:"#b91c1c", marginBottom:3 }}>⚠️ پیام خطا</div>
                <div style={{ fontSize:12, color:"#7f1d1d" }}>{sel.error_message}</div>
              </div>
            )}
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:16 }}>
              <button onClick={() => setSel(null)} style={{ ...C.btn("#f1f5f9","#475569"), padding:"8px 16px", fontSize:13 }}>بستن</button>
              {["logged_out","error","flood"].includes(sel.status) && (
                <button onClick={() => reactM.mutate(sel.id)} style={{ ...C.btn("#22c55e"), padding:"8px 16px", fontSize:13 }}>🔄 فعال‌سازی</button>
              )}
              <button onClick={() => { if(window.confirm("حذف سشن؟")) delM.mutate(sel.id); }} style={{ ...C.btn("#ef4444"), padding:"8px 16px", fontSize:13 }}>🗑 حذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
