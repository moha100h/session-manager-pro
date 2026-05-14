import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const btn = (bg, color="#fff") => ({ display:"inline-flex", alignItems:"center", gap:4, padding:"6px 14px", borderRadius:7, border:"none", cursor:"pointer", fontFamily:"inherit", fontSize:12, fontWeight:600, background:bg, color });
const inp = { width:"100%", padding:"9px 12px", border:"1.5px solid #e2e8f0", borderRadius:8, fontFamily:"inherit", fontSize:13, outline:"none", background:"#fff" };
const SECTIONS = [
  { key:"general",  icon:"⚙️",  label:"عمومی" },
  { key:"plans",    icon:"📦",  label:"پلن‌ها" },
  { key:"payment",  icon:"💳",  label:"پرداخت" },
  { key:"telegram", icon:"📱",  label:"تلگرام" },
];

// backend: GET /settings/ → { key: { value, description, updated_at } }
const useSettings = () => useQuery("settings",
  () => api.get("/api/settings/").then(r => {
    // تبدیل به flat object: { key: value }
    const raw = r.data;
    if (!raw || typeof raw !== "object") return {};
    const flat = {};
    Object.entries(raw).forEach(([k, v]) => {
      flat[k] = typeof v === "object" && v !== null && "value" in v ? v.value : v;
    });
    return flat;
  }),
  { retry:1, onError:()=>{} }
);

export default function Settings() {
  const qc = useQueryClient();
  const [tab, setTab] = useState("general");
  const [editing, setEditing] = useState({});
  const [saving, setSaving] = useState({});
  const [showPlan, setShowPlan] = useState(false);
  const [planForm, setPlanForm] = useState({ name_fa:"", name_en:"", price_usd:"", session_count:"", duration_days:"", sort_order:"0" });

  const { data: settings={}, isLoading } = useSettings();

  // backend: GET /settings/plans
  const { data: plansRaw } = useQuery("plans",
    () => api.get("/api/settings/plans").then(r => r.data),
    { retry:1, onError:()=>{} }
  );
  const plans = Array.isArray(plansRaw) ? plansRaw : [];

  // backend: PUT /settings/{key} با body { value: "..." }
  const saveSetting = async (key, value) => {
    setSaving(s => ({...s, [key]:true}));
    try {
      await api.put("/api/settings/" + key, { value: String(value) });
      qc.invalidateQueries("settings");
      toast.success("✅ ذخیره شد");
      setEditing(ed => { const n={...ed}; delete n[key]; return n; });
    } catch(e) {
      const msg = e?.response?.data?.detail || "خطا در ذخیره";
      toast.error(msg);
    } finally {
      setSaving(s => ({...s, [key]:false}));
    }
  };

  // backend: POST /settings/plans با { name_fa, name_en, session_count, price_usd, duration_days, is_active, sort_order }
  const createPlanM = useMutation(
    d => api.post("/api/settings/plans", {
      name_fa: d.name_fa,
      name_en: d.name_en || d.name_fa,
      session_count: parseInt(d.session_count),
      price_usd: parseFloat(d.price_usd),
      duration_days: d.duration_days ? parseInt(d.duration_days) : null,
      is_active: true,
      sort_order: parseInt(d.sort_order) || 0,
    }),
    { onSuccess:()=>{ qc.invalidateQueries("plans"); toast.success("✅ پلن ایجاد شد"); setShowPlan(false); setPlanForm({name_fa:"",name_en:"",price_usd:"",session_count:"",duration_days:"",sort_order:"0"}); },
      onError:e=>toast.error(e?.response?.data?.detail||"خطا") }
  );

  // backend: DELETE /settings/plans/{id}
  const delPlanM = useMutation(
    id => api.delete("/api/settings/plans/" + id),
    { onSuccess:()=>{ qc.invalidateQueries("plans"); toast.success("حذف شد"); },
      onError:e=>toast.error(e?.response?.data?.detail||"خطا") }
  );

  // backend: PUT /settings/plans/{id}
  const togglePlanM = useMutation(
    p => api.put("/api/settings/plans/" + p.id, { is_active: !p.is_active }),
    { onSuccess:()=>qc.invalidateQueries("plans"),
      onError:e=>toast.error(e?.response?.data?.detail||"خطا") }
  );

  const Field = ({ label, k, type="text" }) => {
    const isEdit = editing[k] !== undefined;
    const val = isEdit ? editing[k] : (settings[k] !== undefined ? String(settings[k]) : "");
    return (
      <div style={{ background:"#f8fafc", borderRadius:10, padding:"12px 14px", display:"flex", alignItems:"center", gap:12, flexWrap:"wrap" }}>
        <div style={{ flex:1, minWidth:120 }}>
          <div style={{ fontSize:11, color:"#94a3b8", marginBottom:4, fontWeight:600 }}>{label}</div>
          {isEdit ? (
            <input type={type} value={val}
              onChange={e=>setEditing(ed=>({...ed,[k]:e.target.value}))}
              onKeyDown={e=>e.key==="Enter"&&saveSetting(k,editing[k])}
              style={{ ...inp, padding:"6px 10px" }} autoFocus />
          ) : (
            <div style={{ fontSize:13, fontWeight:600, color:"#0f172a", wordBreak:"break-all" }}>
              {type==="password" ? (val?"••••••••":<span style={{color:"#94a3b8"}}>تنظیم نشده</span>) : (val||<span style={{color:"#94a3b8"}}>تنظیم نشده</span>)}
            </div>
          )}
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {isEdit ? (
            <>
              <button style={btn("#22c55e")} onClick={()=>saveSetting(k,editing[k])} disabled={saving[k]}>
                {saving[k]?"...":"✅"}
              </button>
              <button style={btn("#f1f5f9","#475569")} onClick={()=>setEditing(ed=>{const n={...ed};delete n[k];return n;})}>✕</button>
            </>
          ) : (
            <button style={btn("#6366f1")} onClick={()=>setEditing(ed=>({...ed,[k]:settings[k]!==undefined?String(settings[k]):""}))}>✏️</button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ animation:"fadeIn 0.3s ease" }}>
      <h2 style={{ fontSize:20, fontWeight:800, marginBottom:20 }}>⚙️ تنظیمات</h2>
      <div style={{ display:"flex", gap:6, marginBottom:20, flexWrap:"wrap" }}>
        {SECTIONS.map(s=>(
          <button key={s.key} onClick={()=>setTab(s.key)} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 16px", borderRadius:10, border:"1.5px solid "+(tab===s.key?"#6366f1":"#e2e8f0"), background:tab===s.key?"#6366f1":"#fff", color:tab===s.key?"#fff":"#475569", fontFamily:"inherit", fontSize:13, fontWeight:600, cursor:"pointer" }}>
            {s.icon} {s.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div style={{ textAlign:"center", padding:48, color:"#94a3b8" }}>
          <div style={{ width:32, height:32, border:"3px solid #e2e8f0", borderTopColor:"#6366f1", borderRadius:"50%", animation:"spin 0.8s linear infinite", margin:"0 auto 10px" }} />
          در حال بارگذاری...
        </div>
      ) : (
        <>
          {tab==="general" && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:18 }}>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>🔧 تنظیمات عمومی</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <Field label="نام سایت" k="site_name" />
                  <Field label="حداکثر سشن فعال" k="max_active_sessions" type="number" />
                  <Field label="تأخیر پیش‌فرض (ثانیه)" k="default_delay" type="number" />
                  <Field label="حداکثر تلاش مجدد" k="max_retries" type="number" />
                  <Field label="انقضای سشن (ساعت)" k="session_expire_hours" type="number" />
                  <Field label="انقضای سفارش (دقیقه)" k="order_expire_minutes" type="number" />
                  <Field label="حداقل واریز ($)" k="min_deposit_usd" type="number" />
                </div>
              </div>
              <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:18 }}>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>🔒 امنیت</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <Field label="JWT Secret" k="jwt_secret" type="password" />
                  <Field label="مدت توکن (دقیقه)" k="token_expire_minutes" type="number" />
                </div>
              </div>
            </div>
          )}

          {tab==="plans" && (
            <div>
              <div style={{ display:"flex", justifyContent:"flex-end", marginBottom:14 }}>
                <button onClick={()=>setShowPlan(true)} style={btn("#6366f1")}>+ پلن جدید</button>
              </div>
              {plans.length===0 ? (
                <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:48, textAlign:"center", color:"#94a3b8" }}>
                  <div style={{ fontSize:40, marginBottom:10 }}>📦</div>
                  <p style={{ marginBottom:16 }}>پلنی تعریف نشده</p>
                  <button onClick={()=>setShowPlan(true)} style={{ ...btn("#6366f1"), padding:"10px 24px", fontSize:14 }}>+ ایجاد اولین پلن</button>
                </div>
              ) : (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(220px,1fr))", gap:12 }}>
                  {plans.map(p=>(
                    <div key={p.id} style={{ background:"#fff", borderRadius:12, border:"2px solid "+(p.is_active?"#6366f1":"#e2e8f0"), padding:18, opacity:p.is_active?1:0.65, position:"relative" }}>
                      {p.is_active && <div style={{ position:"absolute", top:10, left:10, background:"#dcfce7", color:"#15803d", padding:"2px 8px", borderRadius:20, fontSize:11, fontWeight:700 }}>✅ فعال</div>}
                      <div style={{ fontSize:22, marginBottom:8 }}>📦</div>
                      <div style={{ fontWeight:800, fontSize:15, marginBottom:2 }}>{p.name_fa}</div>
                      {p.name_en && <div style={{ fontSize:12, color:"#94a3b8", marginBottom:6 }}>{p.name_en}</div>}
                      <div style={{ fontSize:22, fontWeight:800, color:"#6366f1", marginBottom:8 }}>${p.price_usd}</div>
                      <div style={{ display:"flex", flexDirection:"column", gap:3, marginBottom:14 }}>
                        <span style={{ fontSize:12, color:"#475569" }}>📱 {p.session_count} سشن</span>
                        {p.duration_days && <span style={{ fontSize:12, color:"#475569" }}>📅 {p.duration_days} روز</span>}
                      </div>
                      <div style={{ display:"flex", gap:6 }}>
                        <button style={{ ...btn(p.is_active?"#f59e0b":"#22c55e"), flex:1 }} onClick={()=>togglePlanM.mutate(p)}>{p.is_active?"⏸ غیرفعال":"▶ فعال"}</button>
                        <button style={btn("#ef4444")} onClick={()=>{ if(window.confirm("حذف پلن؟")) delPlanM.mutate(p.id); }}>🗑</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab==="payment" && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:18 }}>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>💳 کیف پول‌ها</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <Field label="آدرس USDT (TRC20)" k="usdt_wallet" />
                  <Field label="آدرس TON" k="ton_wallet" />
                  <Field label="آدرس TRX" k="trx_wallet" />
                </div>
              </div>
              <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:18 }}>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>📈 نرخ تبدیل (هر دلار = X ارز)</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <Field label="نرخ USDT" k="usdt_rate" type="number" />
                  <Field label="نرخ TON" k="ton_rate" type="number" />
                  <Field label="نرخ TRX" k="trx_rate" type="number" />
                </div>
              </div>
              <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:18 }}>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>⚙️ محدودیت‌ها</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  <Field label="حداقل واریز ($)" k="min_deposit_usd" type="number" />
                  <Field label="انقضای سفارش (دقیقه)" k="order_expire_minutes" type="number" />
                </div>
              </div>
            </div>
          )}

          {tab==="telegram" && (
            <div style={{ background:"#fff", borderRadius:12, border:"1px solid #e2e8f0", padding:18 }}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>📱 تنظیمات تلگرام</div>
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                <Field label="Bot Token" k="bot_token" type="password" />
                <Field label="Admin Chat ID" k="admin_chat_id" />
                <Field label="API ID" k="api_id" />
                <Field label="API Hash" k="api_hash" type="password" />
                <Field label="کانال اطلاع‌رسانی" k="notification_channel" />
              </div>
            </div>
          )}
        </>
      )}

      {showPlan && (
        <div style={{ position:"fixed", inset:0, background:"rgba(15,23,42,0.5)", zIndex:200, display:"flex", alignItems:"center", justifyContent:"center", padding:16 }} onClick={e=>e.target===e.currentTarget&&setShowPlan(false)}>
          <div style={{ background:"#fff", borderRadius:16, padding:24, width:"100%", maxWidth:440, maxHeight:"90vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ fontWeight:800, fontSize:16, marginBottom:18 }}>📦 پلن جدید</h3>
            {[
              ["نام فارسی *","name_fa","text"],
              ["نام انگلیسی","name_en","text"],
              ["قیمت ($) *","price_usd","number"],
              ["تعداد سشن *","session_count","number"],
              ["مدت (روز)","duration_days","number"],
              ["ترتیب نمایش","sort_order","number"],
            ].map(([label,key,type])=>(
              <div key={key} style={{ marginBottom:12 }}>
                <label style={{ display:"block", fontSize:12, fontWeight:600, color:"#475569", marginBottom:5 }}>{label}</label>
                <input type={type} value={planForm[key]} onChange={e=>setPlanForm(f=>({...f,[key]:e.target.value}))} style={inp} />
              </div>
            ))}
            <div style={{ display:"flex", justifyContent:"flex-end", gap:8, marginTop:18 }}>
              <button onClick={()=>setShowPlan(false)} style={{ ...btn("#f1f5f9","#475569"), padding:"8px 16px", fontSize:13 }}>انصراف</button>
              <button
                onClick={()=>createPlanM.mutate(planForm)}
                disabled={!planForm.name_fa||!planForm.price_usd||!planForm.session_count||createPlanM.isLoading}
                style={{ ...btn("#6366f1"), padding:"8px 18px", fontSize:13, opacity:(!planForm.name_fa||!planForm.price_usd||!planForm.session_count)?0.5:1 }}>
                {createPlanM.isLoading?"...":"✅ ایجاد"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
