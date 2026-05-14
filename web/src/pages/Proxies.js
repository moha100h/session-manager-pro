import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const safe = (v) => Array.isArray(v) ? v : [];
const num = (v) => Number(v) || 0;
const btn = (bg, color="#fff") => ({ display:"inline-flex", alignItems:"center", gap:4, padding:"6px 14px", borderRadius:7, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, background:bg, color });
const TYPE_COLORS = { socks5:"#6366f1", socks4:"#8b5cf6", http:"#06b6d4", https:"#22c55e" };

export default function Proxies() {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [filterType, setFilterType] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [form, setForm] = useState({ host:"", port:"", proxy_type:"socks5", username:"", password:"", country:"" });
  const [bulk, setBulk] = useState("");

  const { data, isLoading } = useQuery("proxies",
    () => api.get("/proxies/").then(r=>r.data),
    { refetchInterval:30000, retry:1, onError:()=>{} }
  );
  const proxies = safe(data);
  const filtered = proxies.filter(p => {
    if (filterType && p.proxy_type!==filterType) return false;
    if (filterStatus==="active" && !p.is_active) return false;
    if (filterStatus==="inactive" && p.is_active) return false;
    return true;
  });

  const addM = useMutation(d=>api.post("/proxies/",{...d,port:parseInt(d.port)}),
    { onSuccess:()=>{ qc.invalidateQueries("proxies"); toast.success("پروکسی اضافه شد"); setShowAdd(false); setForm({host:"",port:"",proxy_type:"socks5",username:"",password:"",country:""}); }, onError:e=>toast.error((e&&e.response&&e.response.data&&e.response.data.detail)||"خطا") });
  const delM = useMutation(id=>api.delete("/proxies/"+id),
    { onSuccess:()=>{ qc.invalidateQueries("proxies"); toast.success("حذف شد"); } });
  const toggleM = useMutation(id=>api.patch("/proxies/"+id+"/toggle"),
    { onSuccess:()=>qc.invalidateQueries("proxies") });

  const handleBulk = () => {
    const lines = bulk.trim().split("\n").filter(l=>l.trim());
    const items = [];
    for (const line of lines) {
      try {
        if (line.includes("://")) {
          const u = new URL(line);
          items.push({ proxy_type:u.protocol.replace(":",""), host:u.hostname, port:parseInt(u.port), username:u.username||null, password:u.password||null });
        } else {
          const p = line.split(":");
          items.push({ proxy_type:"socks5", host:p[0], port:parseInt(p[1]), username:p[2]||null, password:p[3]||null });
        }
      } catch(e) {}
    }
    if (!items.length) return toast.error("هیچ پروکسی معتبری یافت نشد");
    api.post("/proxies/bulk",items)
      .then(res=>{ qc.invalidateQueries("proxies"); toast.success((res.data&&res.data.added||items.length)+" پروکسی اضافه شد"); setShowBulk(false); setBulk(""); })
      .catch(()=>toast.error("خطا در آپلود"));
  };

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <h2 style={{ fontSize:20, fontWeight:800 }}>🌐 پروکسی‌ها</h2>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={()=>setShowBulk(true)} style={{ ...btn("#f1f5f9","#475569"), border:"1.5px solid #e2e8f0" }}>📤 گروهی</button>
          <button onClick={()=>setShowAdd(true)} style={btn("#6366f1")}>+ افزودن</button>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))", gap:10, marginBottom:16 }}>
        {[["🌐","کل",proxies.length,"#6366f1"],["✅","فعال",proxies.filter(p=>p.is_active).length,"#22c55e"],["⏸","غیرفعال",proxies.filter(p=>!p.is_active).length,"#94a3b8"],["🔄","SOCKS5",proxies.filter(p=>p.proxy_type==="socks5").length,"#8b5cf6"]].map(([icon,label,val,color])=>(
          <div key={label} style={{ background:"#fff", borderRadius:10, border:"1px solid #e2e8f0", padding:"12px 14px", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:0, left:0, right:0, height:3, background:color }} />
            <div style={{ fontSize:18, marginBottom:6, marginTop:2 }}>{icon}</div>
            <div style={{ fontSize:20, fontWeight:800 }}>{val}</div>
            <div style={{ fontSize:11, color:"#94a3b8", marginTop:3 }}>{label}</div>
          </div>
        ))}
      </div>

      <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:"12px 16px", marginBottom:16 }}>
        <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
          {["","socks5","socks4","http","https"].map(t=>(
            <button key={t} onClick={()=>setFilterType(t)} style={{ padding:"5px 14px", borderRadius:20, border:"1.5px solid "+(filterType===t?"#6366f1":"#e2e8f0"), background:filterType===t?"#6366f1":"#fff", color:filterType===t?"#fff":"#475569", fontFamily:"inherit", fontSize:12, fontWeight:600, cursor:"pointer" }}>
              {t===""?"همه نوع":t.toUpperCase()}
            </button>
          ))}
          <div style={{ width:1, background:"#e2e8f0", margin:"0 4px" }} />
          {[["","همه"],["active","✅ فعال"],["inactive","⏸ غیرفعال"]].map(([v,l])=>(
            <button key={v} onClick={()=>setFilterStatus(v)} style={{ padding:"5px 14px", borderRadius:20, border:"1.5px solid "+(filterStatus===v?"#6366f1":"#e2e8f0"), background:filterStatus===v?"#6366f1":"#fff", color:filterStatus===v?"#fff":"#475569", fontFamily:"inherit", fontSize:12, fontWeight:600, cursor:"pointer" }}>{l}</button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div style={{ textAlign:"center", padding:48, color:"#94a3b8" }}>
          <div style={{ width:32, height:32, border:"3px solid #e2e8f0", borderTopColor:"#6366f1", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 10px" }} />
          در حال بارگذاری...
        </div>
      ) : filtered.length===0 ? (
        <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:48, textAlign:"center", color:"#94a3b8" }}><div style={{ fontSize:40, marginBottom:10 }}>🌐</div><p>پروکسی‌ای یافت نشد</p></div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {filtered.map(p=>{
            const tc = TYPE_COLORS[p.proxy_type]||"#64748b";
            return (
              <div key={p.id} style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:"14px 16px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap", opacity:p.is_active?1:0.6, transition:"box-shadow 0.15s" }}
                onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.08)"}
                onMouseLeave={e=>e.currentTarget.style.boxShadow=""}>
                <div style={{ background:tc+"18", color:tc, border:"1.5px solid "+tc+"40", borderRadius:8, padding:"4px 10px", fontWeight:700, fontSize:12, flexShrink:0 }}>
                  {(p.proxy_type||"").toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <code style={{ background:"#f1f5f9", padding:"3px 8px", borderRadius:6, fontSize:13, fontWeight:700 }}>{p.host}:{p.port}</code>
                  <div style={{ display:"flex", gap:10, marginTop:5, flexWrap:"wrap" }}>
                    {p.username && <span style={{ fontSize:12, color:"#94a3b8" }}>👤 {p.username}</span>}
                    {p.country && <span style={{ fontSize:12, color:"#94a3b8" }}>🌍 {p.country}</span>}
                    {p.latency_ms!=null && <span style={{ fontSize:12, fontWeight:600, color:p.latency_ms<200?"#22c55e":p.latency_ms<500?"#f59e0b":"#ef4444" }}>⚡ {p.latency_ms}ms</span>}
                  </div>
                </div>
                <div style={{ display:"flex", gap:6 }}>
                  <button style={btn(p.is_active?"#f59e0b":"#22c55e")} onClick={()=>toggleM.mutate(p.id)}>{p.is_active?"⏸":"▶"}</button>
                  <button style={btn("#ef4444")} onClick={()=>{ if(window.confirm("حذف پروکسی؟")) delM.mutate(p.id); }}>🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={e=>e.target===e.currentTarget&&setShowAdd(false)}>
          <div style={{ background:"#fff", borderRadius:16, padding:24, width:"100%", maxWidth:440, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ fontWeight:800, fontSize:16, marginBottom:18 }}>🌐 افزودن پروکسی</h3>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
              {[["Host","host","text","1.2.3.4"],["Port","port","number","1080"]].map(([label,key,type,ph])=>(
                <div key={key}>
                  <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>{label}</label>
                  <input type={type} placeholder={ph} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontFamily:"inherit", fontSize:13, outline:"none" }} />
                </div>
              ))}
            </div>
            <div style={{ marginTop:10 }}>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>نوع</label>
              <select value={form.proxy_type} onChange={e=>setForm(f=>({...f,proxy_type:e.target.value}))} style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontFamily:"inherit", fontSize:13, outline:"none" }}>
                {["socks5","socks4","http","https"].map(t=><option key={t} value={t}>{t.toUpperCase()}</option>)}
              </select>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginTop:10 }}>
              {[["یوزرنیم","username","text"],["رمز","password","password"]].map(([label,key,type])=>(
                <div key={key}>
                  <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>{label} (اختیاری)</label>
                  <input type={type} value={form[key]} onChange={e=>setForm(f=>({...f,[key]:e.target.value}))} style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontFamily:"inherit", fontSize:13, outline:"none" }} />
                </div>
              ))}
            </div>
            <div style={{ marginTop:10 }}>
              <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>کشور (اختیاری)</label>
              <input placeholder="IR, DE, US" value={form.country} onChange={e=>setForm(f=>({...f,country:e.target.value.toUpperCase()}))} style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontFamily:"inherit", fontSize:13, outline:"none" }} />
            </div>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:18 }}>
              <button onClick={()=>setShowAdd(false)} style={{ ...btn("#f1f5f9","#475569"), padding:"8px 16px", fontSize:13 }}>انصراف</button>
              <button onClick={()=>addM.mutate(form)} disabled={!form.host||!form.port||addM.isLoading} style={{ ...btn("#6366f1"), padding:"8px 18px", fontSize:13, opacity:(!form.host||!form.port)?0.5:1 }}>
                {addM.isLoading?"...":"✅ افزودن"}
              </button>
            </div>
          </div>
        </div>
      )}

      {showBulk && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={e=>e.target===e.currentTarget&&setShowBulk(false)}>
          <div style={{ background:"#fff", borderRadius:16, padding:24, width:"100%", maxWidth:500, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ fontWeight:800, fontSize:16, marginBottom:8 }}>📤 آپلود گروهی</h3>
            <p style={{ fontSize:12, color:"#94a3b8", marginBottom:14 }}>فرمت: <code style={{ background:"#f1f5f9", padding:"2px 6px", borderRadius:4 }}>host:port:user:pass</code> یا <code style={{ background:"#f1f5f9", padding:"2px 6px", borderRadius:4 }}>socks5://user:pass@host:port</code></p>
            <textarea rows={10} placeholder="1.2.3.4:1080:user:pass" value={bulk} onChange={e=>setBulk(e.target.value)} style={{ width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontFamily:"monospace", fontSize:12, outline:"none", resize:"vertical" }} />
            <p style={{ fontSize:12, color:"#94a3b8", marginTop:6 }}>{bulk.trim().split("\n").filter(l=>l.trim()).length} پروکسی آماده</p>
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:16 }}>
              <button onClick={()=>setShowBulk(false)} style={{ ...btn("#f1f5f9","#475569"), padding:"8px 16px", fontSize:13 }}>انصراف</button>
              <button onClick={handleBulk} style={{ ...btn("#6366f1"), padding:"8px 18px", fontSize:13 }}>📤 آپلود</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
