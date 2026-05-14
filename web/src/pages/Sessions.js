import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const ST = {
  active:     { label:"فعال",     icon:"✅", bg:"#dcfce7", color:"#15803d" },
  logged_out: { label:"لاگ‌اوت", icon:"🔴", bg:"#fee2e2", color:"#b91c1c" },
  flood:      { label:"فلود",     icon:"🌊", bg:"#fef3c7", color:"#92400e" },
  banned:     { label:"بن",       icon:"🚫", bg:"#fee2e2", color:"#b91c1c" },
  error:      { label:"خطا",      icon:"⚠️", bg:"#fee2e2", color:"#b91c1c" },
  inactive:   { label:"غیرفعال", icon:"⏸",  bg:"#f1f5f9", color:"#475569" },
};
const safe = (v) => Array.isArray(v) ? v : [];
const num  = (v) => Number(v) || 0;
const btn  = (bg, color="#fff") => ({ display:"inline-flex", alignItems:"center", gap:4, padding:"5px 12px", borderRadius:6, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, background:bg, color });
const bdg  = (st) => ({ display:"inline-flex", alignItems:"center", gap:3, padding:"3px 9px", borderRadius:20, fontSize:11, fontWeight:700, background:(ST[st]||ST.inactive).bg, color:(ST[st]||ST.inactive).color });
const inp  = { padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontFamily:"inherit", fontSize:13, outline:"none", background:"#fff" };
const ADD_TABS = [
  { key:"file",   icon:"📁", label:"آپلود فایل" },
  { key:"string", icon:"🔑", label:"Session String" },
  { key:"bulk",   icon:"📋", label:"گروهی" },
];

export default function Sessions() {
  const qc = useQueryClient();
  const [status,      setStatus]      = useState("");
  const [search,      setSearch]      = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page,        setPage]        = useState(1);
  const [sel,         setSel]         = useState(null);
  const [showAdd,     setShowAdd]     = useState(false);
  const [addTab,      setAddTab]      = useState("file");
  const [files,       setFiles]       = useState([]);
  const [dragOver,    setDragOver]    = useState(false);
  const [sessStr,     setSessStr]     = useState("");
  const [sessPhone,   setSessPhone]   = useState("");
  const [bulkText,    setBulkText]    = useState("");
  const [uploading,   setUploading]   = useState(false);

  const { data, isLoading } = useQuery(
    ["sessions", status, search, page],
    () => {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      if (search) p.set("search", search);
      p.set("page", page); p.set("limit", 20);
      return api.get("/sessions/?" + p).then(r => r.data);
    },
    { keepPreviousData:true, refetchInterval:15000, retry:1, onError:()=>{} }
  );
  const sessions   = safe(data) || safe(data && data.sessions);
  const total      = num(data && data.total) || sessions.length;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  const { data: statsRaw } = useQuery("sess_stats",
    () => api.get("/stats/dashboard").then(r => r.data && r.data.sessions ? r.data.sessions : {}),
    { refetchInterval:20000, retry:1, onError:()=>{} }
  );
  const stats = (statsRaw && typeof statsRaw==="object") ? statsRaw : {};

  const delM   = useMutation(id => api.delete("/sessions/"+id),
    { onSuccess:()=>{ qc.invalidateQueries("sessions"); toast.success("سشن حذف شد"); setSel(null); } });
  const reactM = useMutation(id => api.post("/sessions/"+id+"/reactivate"),
    { onSuccess:()=>{ qc.invalidateQueries("sessions"); toast.success("فعال‌سازی شد"); setSel(null); } });

  const resetAdd = () => { setFiles([]); setSessStr(""); setSessPhone(""); setBulkText(""); setUploading(false); };
  const closeAdd = () => { setShowAdd(false); resetAdd(); };

  const uploadFiles = async (fileList) => {
    if (!fileList.length) return;
    setUploading(true);
    let ok = 0, fail = 0;
    for (const file of fileList) {
      try {
        const fd = new FormData();
        fd.append("file", file);
        await api.post("/sessions/upload", fd, { headers:{ "Content-Type":"multipart/form-data" } });
        ok++;
      } catch(e) {
        fail++;
        const msg = e && e.response && e.response.data && e.response.data.detail;
        toast.error((msg || file.name) + " — خطا");
      }
    }
    setUploading(false);
    if (ok > 0) { toast.success(ok + " سشن اضافه شد"); qc.invalidateQueries("sessions"); closeAdd(); }
  };

  const uploadString = async () => {
    if (!sessStr.trim()) return toast.error("Session String خالی است");
    setUploading(true);
    try {
      await api.post("/sessions/add-string", { session_string: sessStr.trim(), phone: sessPhone.trim()||null });
      toast.success("سشن اضافه شد");
      qc.invalidateQueries("sessions");
      closeAdd();
    } catch(e) {
      const msg = e && e.response && e.response.data && e.response.data.detail;
      toast.error(msg || "خطا در افزودن سشن");
    } finally { setUploading(false); }
  };

  const uploadBulk = async () => {
    const lines = bulkText.trim().split("\n").map(l=>l.trim()).filter(Boolean);
    if (!lines.length) return toast.error("متن خالی است");
    setUploading(true);
    let ok = 0, fail = 0;
    for (const line of lines) {
      try { await api.post("/sessions/add-string", { session_string: line }); ok++; }
      catch(e) { fail++; }
    }
    setUploading(false);
    if (ok > 0) { toast.success(ok + " سشن اضافه شد" + (fail>0?" ("+fail+" ناموفق)":"")); qc.invalidateQueries("sessions"); closeAdd(); }
    else toast.error("همه ناموفق بودند");
  };

  const onDrop = (e) => {
    e.preventDefault(); setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f => f.name.endsWith(".session")||f.name.endsWith(".json")||f.name.endsWith(".txt"));
    if (!dropped.length) return toast.error("فقط .session / .json / .txt");
    setFiles(dropped);
  };

  const Spinner = () => (
    <span style={{ width:14, height:14, border:"2px solid rgba(255,255,255,0.3)", borderTopColor:"#fff", borderRadius:"50%", animation:"spin 0.7s linear infinite", display:"inline-block" }} />
  );

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <h2 style={{ fontSize:20, fontWeight:800 }}>📱 سشن‌ها <span style={{ fontSize:13, color:"#94a3b8", fontWeight:400 }}>({total.toLocaleString("fa-IR")})</span></h2>
        <button onClick={()=>setShowAdd(true)} style={{ ...btn("#6366f1"), padding:"9px 20px", fontSize:13 }}>+ افزودن سشن</button>
      </div>

      {/* Stats */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(100px,1fr))", gap:10, marginBottom:16 }}>
        {[["📱","کل",stats.total,"#6366f1"],["✅","فعال",stats.active,"#22c55e"],["🌊","فلود",stats.flood,"#f59e0b"],["🚫","بن",stats.banned,"#8b5cf6"],["🔴","لاگ‌اوت",stats.logged_out,"#ef4444"],["⚠️","خطا",stats.error,"#94a3b8"]].map(([icon,label,val,color])=>(
          <div key={label} style={{ background:"#fff", borderRadius:10, border:"1px solid #e2e8f0", padding:"12px 14px", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:color }} />
            <div style={{ fontSize:18, marginBottom:6, marginTop:2 }}>{icon}</div>
            <div style={{ fontSize:20, fontWeight:800 }}>{num(val)}</div>
            <div style={{ fontSize:11, color:"#94a3b8", marginTop:3 }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:"12px 16px", marginBottom:16 }}>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6, alignItems:"center" }}>
          {["","active","logged_out","flood","banned","error"].map(s=>(
            <button key={s} onClick={()=>{ setStatus(s); setPage(1); }} style={{ padding:"5px 14px", borderRadius:20, border:"1.5px solid "+(status===s?"#6366f1":"#e2e8f0"), background:status===s?"#6366f1":"#fff", color:status===s?"#fff":"#475569", fontFamily:"inherit", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              {s===""?"همه":((ST[s]||{}).icon+" "+(ST[s]||{}).label)}
            </button>
          ))}
          <form onSubmit={e=>{ e.preventDefault(); setSearch(searchInput); setPage(1); }} style={{ display:"flex", gap:6, flex:1, minWidth:160 }}>
            <input style={{ ...inp, flex:1, padding:"7px 12px" }} placeholder="جستجو..." value={searchInput} onChange={e=>setSearchInput(e.target.value)} />
            <button type="submit" style={btn("#6366f1")}>🔍</button>
            {search && <button type="button" onClick={()=>{ setSearch(""); setSearchInput(""); }} style={btn("#f1f5f9","#475569")}>✕</button>}
          </form>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div style={{ textAlign:"center", padding:48, color:"#94a3b8" }}>
          <div style={{ width:32, height:32, border:"3px solid #e2e8f0", borderTopColor:"#6366f1", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 10px" }} />
          در حال بارگذاری...
        </div>
      ) : sessions.length===0 ? (
        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:48, textAlign:"center", color:"#94a3b8" }}>
          <div style={{ fontSize:40, marginBottom:10 }}>📱</div>
          <p style={{ marginBottom:16 }}>سشنی یافت نشد</p>
          <button onClick={()=>setShowAdd(true)} style={{ ...btn("#6366f1"), padding:"10px 24px", fontSize:14 }}>+ افزودن اولین سشن</button>
        </div>
      ) : (
        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", overflow:"hidden" }}>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr style={{ background:"#f8fafc" }}>
                  {["#","شماره / نام","وضعیت","پروکسی","آخرین فعالیت","عملیات"].map(h=>(
                    <th key={h} style={{ padding:"10px 14px", textAlign:"right", fontWeight:700, color:"#475569", fontSize:12, borderBottom:"1px solid #e2e8f0", whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sessions.map((s,idx)=>(
                  <tr key={s.id} onClick={()=>setSel(s)} style={{ cursor:"pointer", borderBottom:"1px solid #f1f5f9" }}
                    onMouseEnter={e=>e.currentTarget.style.background="#f8fafc"}
                    onMouseLeave={e=>e.currentTarget.style.background=""}>
                    <td style={{ padding:"10px 14px", color:"#94a3b8", fontSize:12 }}>{(page-1)*20+idx+1}</td>
                    <td style={{ padding:"10px 14px" }}>
                      <div style={{ fontWeight:600 }}>{s.phone||s.session_name||"—"}</div>
                      {s.first_name && <div style={{ fontSize:11, color:"#94a3b8" }}>{s.first_name} {s.last_name||""}</div>}
                    </td>
                    <td style={{ padding:"10px 14px" }}>
                      <span style={bdg(s.status)}>{(ST[s.status]||ST.inactive).icon} {(ST[s.status]||ST.inactive).label}</span>
                    </td>
                    <td style={{ padding:"10px 14px" }}>
                      {s.proxy_host ? <code style={{ background:"#f1f5f9", padding:"2px 6px", borderRadius:4, fontSize:11 }}>{s.proxy_host}:{s.proxy_port}</code> : <span style={{ color:"#94a3b8" }}>—</span>}
                    </td>
                    <td style={{ padding:"10px 14px", fontSize:12, color:"#94a3b8", whiteSpace:"nowrap" }}>
                      {s.last_used ? new Date(s.last_used).toLocaleString("fa-IR") : "—"}
                    </td>
                    <td style={{ padding:"10px 14px" }} onClick={e=>e.stopPropagation()}>
                      <div style={{ display:"flex", gap:4 }}>
                        {["logged_out","error","flood"].includes(s.status) && <button style={btn("#22c55e")} onClick={()=>reactM.mutate(s.id)}>🔄</button>}
                        <button style={btn("#ef4444")} onClick={()=>{ if(window.confirm("حذف سشن؟")) delM.mutate(s.id); }}>🗑</button>
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
      {totalPages>1 && (
        <div style={{ display:"flex", gap:6, justifyContent:"center", marginTop:16, flexWrap:"wrap" }}>
          <button disabled={page===1} onClick={()=>setPage(p=>p-1)} style={{ ...btn(page===1?"#f1f5f9":"#fff","#475569"), border:"1.5px solid #e2e8f0" }}>قبلی</button>
          {Array.from({length:Math.min(5,totalPages)},(_,i)=>{ const p=page<=3?i+1:page-2+i; if(p<1||p>totalPages)return null; return <button key={p} onClick={()=>setPage(p)} style={{ ...btn(p===page?"#6366f1":"#fff",p===page?"#fff":"#475569"), border:"1.5px solid "+(p===page?"#6366f1":"#e2e8f0"), minWidth:36 }}>{p}</button>; })}
          <button disabled={page===totalPages} onClick={()=>setPage(p=>p+1)} style={{ ...btn(page===totalPages?"#f1f5f9":"#fff","#475569"), border:"1.5px solid #e2e8f0" }}>بعدی</button>
        </div>
      )}

      {/* ══ Modal افزودن سشن ══════════════════════════════════════════════════ */}
      {showAdd && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.55)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
          onClick={e=>e.target===e.currentTarget&&closeAdd()}>
          <div style={{ background:"#fff", borderRadius:18, padding:24, width:"100%", maxWidth:500, maxHeight:"92vh", overflowY:"auto", boxShadow:"0 24px 64px rgba(0,0,0,0.22)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20 }}>
              <h3 style={{ fontWeight:800, fontSize:17 }}>➕ افزودن سشن</h3>
              <button onClick={closeAdd} style={{ background:"none", border:"none", fontSize:20, cursor:"pointer", color:"#94a3b8" }}>✕</button>
            </div>

            {/* tabs */}
            <div style={{ display:"flex", gap:4, marginBottom:20, background:"#f1f5f9", borderRadius:10, padding:4 }}>
              {ADD_TABS.map(t=>(
                <button key={t.key} onClick={()=>setAddTab(t.key)} style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", gap:5, padding:"8px 4px", borderRadius:8, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, background:addTab===t.key?"#fff":"transparent", color:addTab===t.key?"#6366f1":"#64748b", boxShadow:addTab===t.key?"0 1px 4px rgba(0,0,0,0.1)":"none", transition:"all 0.15s" }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* ── فایل ── */}
            {addTab==="file" && (
              <div>
                <div
                  onDragOver={e=>{ e.preventDefault(); setDragOver(true); }}
                  onDragLeave={()=>setDragOver(false)}
                  onDrop={onDrop}
                  onClick={()=>document.getElementById("sess-file-inp").click()}
                  style={{ border:"2px dashed "+(dragOver?"#6366f1":"#cbd5e1"), borderRadius:12, padding:"32px 20px", textAlign:"center", cursor:"pointer", background:dragOver?"#e0e7ff":"#f8fafc", transition:"all 0.2s", marginBottom:14 }}>
                  <div style={{ fontSize:36, marginBottom:10 }}>📁</div>
                  <p style={{ fontWeight:700, fontSize:14, color:"#475569", marginBottom:4 }}>فایل‌ها را اینجا رها کنید</p>
                  <p style={{ fontSize:12, color:"#94a3b8" }}>یا کلیک کنید — .session / .json / .txt</p>
                  <input id="sess-file-inp" type="file" multiple accept=".session,.json,.txt" style={{ display:"none" }}
                    onChange={e=>setFiles(Array.from(e.target.files))} />
                </div>
                {files.length>0 && (
                  <div style={{ background:"#f8fafc", borderRadius:10, padding:"10px 14px", marginBottom:14 }}>
                    <div style={{ fontSize:12, fontWeight:700, color:"#475569", marginBottom:8 }}>📋 {files.length} فایل:</div>
                    <div style={{ display:"flex", flexDirection:"column", gap:4, maxHeight:120, overflowY:"auto" }}>
                      {files.map((f,i)=>(
                        <div key={i} style={{ display:"flex", justifyContent:"space-between", fontSize:12, color:"#475569" }}>
                          <span>📄 {f.name}</span>
                          <span style={{ color:"#94a3b8" }}>{(f.size/1024).toFixed(1)} KB</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                  <button onClick={closeAdd} style={{ ...btn("#f1f5f9","#475569"), padding:"9px 18px", fontSize:13 }}>انصراف</button>
                  <button onClick={()=>uploadFiles(files)} disabled={!files.length||uploading}
                    style={{ ...btn("#6366f1"), padding:"9px 20px", fontSize:13, opacity:(!files.length||uploading)?0.5:1 }}>
                    {uploading ? <><Spinner /> آپلود...</> : "📤 آپلود "+files.length+" فایل"}
                  </button>
                </div>
              </div>
            )}

            {/* ── session string ── */}
            {addTab==="string" && (
              <div>
                <div style={{ marginBottom:14 }}>
                  <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:6 }}>🔑 Session String</label>
                  <textarea rows={4} value={sessStr} onChange={e=>setSessStr(e.target.value)}
                    placeholder="1BQANOTEuMTg1LjE3Ni43MwO..."
                    style={{ width:"100%", padding:"10px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontFamily:"monospace", fontSize:12, outline:"none", resize:"vertical", direction:"ltr" }} />
                </div>
                <div style={{ marginBottom:18 }}>
                  <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:6 }}>📱 شماره تلفن (اختیاری)</label>
                  <input type="tel" value={sessPhone} onChange={e=>setSessPhone(e.target.value)}
                    placeholder="+989123456789"
                    style={{ ...inp, width:"100%", direction:"ltr" }} />
                </div>
                <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                  <button onClick={closeAdd} style={{ ...btn("#f1f5f9","#475569"), padding:"9px 18px", fontSize:13 }}>انصراف</button>
                  <button onClick={uploadString} disabled={!sessStr.trim()||uploading}
                    style={{ ...btn("#6366f1"), padding:"9px 20px", fontSize:13, opacity:(!sessStr.trim()||uploading)?0.5:1 }}>
                    {uploading ? <><Spinner /> در حال افزودن...</> : "✅ افزودن سشن"}
                  </button>
                </div>
              </div>
            )}

            {/* ── bulk ── */}
            {addTab==="bulk" && (
              <div>
                <div style={{ background:"#fef3c7", borderRadius:8, padding:"10px 14px", marginBottom:14, border:"1px solid #fde68a" }}>
                  <p style={{ fontSize:12, color:"#92400e", fontWeight:600 }}>هر خط = یک Session String</p>
                </div>
                <textarea rows={8} value={bulkText} onChange={e=>setBulkText(e.target.value)}
                  placeholder="1BQANOTEuMTg1LjE3Ni43MwO..."
                  style={{ width:"100%", padding:"10px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontFamily:"monospace", fontSize:12, outline:"none", resize:"vertical", direction:"ltr", marginBottom:8 }} />
                <p style={{ fontSize:12, color:"#94a3b8", marginBottom:14 }}>
                  {bulkText.trim().split("\n").filter(l=>l.trim()).length} سشن آماده
                </p>
                <div style={{ display:"flex", justifyContent:"flex-end", gap:8 }}>
                  <button onClick={closeAdd} style={{ ...btn("#f1f5f9","#475569"), padding:"9px 18px", fontSize:13 }}>انصراف</button>
                  <button onClick={uploadBulk} disabled={!bulkText.trim()||uploading}
                    style={{ ...btn("#6366f1"), padding:"9px 20px", fontSize:13, opacity:(!bulkText.trim()||uploading)?0.5:1 }}>
                    {uploading ? <><Spinner /> آپلود...</> : "📤 آپلود گروهی"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ Modal جزئیات ══════════════════════════════════════════════════════ */}
      {sel && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }}
          onClick={e=>e.target===e.currentTarget&&setSel(null)}>
          <div style={{ background:"#fff", borderRadius:16, padding:24, width:"100%", maxWidth:440, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:18 }}>
              <div>
                <h3 style={{ fontWeight:800, fontSize:16 }}>{sel.phone||sel.session_name||"سشن"}</h3>
                <span style={{ ...bdg(sel.status), marginTop:6, display:"inline-flex" }}>{(ST[sel.status]||ST.inactive).icon} {(ST[sel.status]||ST.inactive).label}</span>
              </div>
              <button onClick={()=>setSel(null)} style={{ background:"none", border:"none", fontSize:18, cursor:"pointer", color:"#94a3b8" }}>✕</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:14 }}>
              {[["👤 نام",(sel.first_name||"")+" "+(sel.last_name||"").trim()||"—"],["📱 شماره",sel.phone||"—"],["🆔 یوزرنیم",sel.username?"@"+sel.username:"—"],["🌐 پروکسی",sel.proxy_host?sel.proxy_host+":"+sel.proxy_port:"—"],["📅 ایجاد",sel.created_at?new Date(sel.created_at).toLocaleDateString("fa-IR"):"—"],["⏱ آخرین فعالیت",sel.last_used?new Date(sel.last_used).toLocaleString("fa-IR"):"—"]].map(([l,v])=>(
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
              <button onClick={()=>setSel(null)} style={{ ...btn("#f1f5f9","#475569"), padding:"8px 16px", fontSize:13 }}>بستن</button>
              {["logged_out","error","flood"].includes(sel.status) && (
                <button onClick={()=>reactM.mutate(sel.id)} style={{ ...btn("#22c55e"), padding:"8px 16px", fontSize:13 }}>🔄 فعال‌سازی</button>
              )}
              <button onClick={()=>{ if(window.confirm("حذف سشن؟")) delM.mutate(sel.id); }} style={{ ...btn("#ef4444"), padding:"8px 16px", fontSize:13 }}>🗑 حذف</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
