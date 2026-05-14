import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const GROUPS = {
  "⏱ تأخیر و محدودیت": ["join_delay_min","join_delay_max","max_retries","flood_multiplier","max_concurrent_joins","check_interval_minutes"],
  "💰 مالی": ["min_deposit_usd","usdt_rate","ton_rate","trx_rate"],
  "👛 کیف‌پول‌ها": ["usdt_wallet","ton_wallet","trx_wallet"],
};
const LABELS = {
  join_delay_min:"تأخیر حداقل join (ثانیه)", join_delay_max:"تأخیر حداکثر join (ثانیه)",
  max_retries:"حداکثر تلاش مجدد", flood_multiplier:"ضریب زمان فلود",
  min_deposit_usd:"حداقل واریز (دلار)", usdt_rate:"نرخ USDT", ton_rate:"نرخ TON",
  trx_rate:"نرخ TRX", usdt_wallet:"آدرس USDT", ton_wallet:"آدرس TON",
  trx_wallet:"آدرس TRX", check_interval_minutes:"فاصله بررسی سلامت (دقیقه)",
  max_concurrent_joins:"حداکثر join همزمان",
};
const ICONS = {
  join_delay_min:"⏱", join_delay_max:"⏱", max_retries:"🔄", flood_multiplier:"🌊",
  min_deposit_usd:"💵", usdt_rate:"🟢", ton_rate:"💎", trx_rate:"🔴",
  usdt_wallet:"👛", ton_wallet:"👛", trx_wallet:"👛",
  check_interval_minutes:"🕐", max_concurrent_joins:"⚡",
};

function SettingRow({ k, value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");
  const isWallet = k.includes("wallet");

  return (
    <div style={{
      display:"flex", alignItems:"center", gap:12, padding:"11px 14px",
      background: editing ? "#f5f3ff" : "var(--bg)", borderRadius:10,
      border: editing ? "1.5px solid var(--primary)" : "1.5px solid transparent",
      transition:"all 0.15s", flexWrap:"wrap"
    }}>
      <span style={{ fontSize:"1rem", flexShrink:0, width:22, textAlign:"center" }}>{ICONS[k]||"⚙️"}</span>
      <span style={{ flex:1, fontSize:"0.85rem", fontWeight:600, color:"var(--text)", minWidth:140 }}>
        {LABELS[k]||k}
      </span>
      {editing ? (
        <div style={{ display:"flex", gap:6, alignItems:"center", flex:1, minWidth:180 }}>
          <input
            className="form-control"
            style={{ maxWidth: isWallet?320:160, fontFamily:isWallet?"monospace":"inherit", fontSize:"0.85rem" }}
            value={val}
            onChange={e => setVal(e.target.value)}
            autoFocus
            onKeyDown={e => { if(e.key==="Enter"){onSave(k,val);setEditing(false);} if(e.key==="Escape")setEditing(false); }}
          />
          <button className="btn btn-primary btn-sm" onClick={() => { onSave(k,val); setEditing(false); }}>✓</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setVal(value??""); }}>✕</button>
        </div>
      ) : (
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <code
            style={{ background:"white", border:"1px solid var(--border)", padding:"3px 10px", borderRadius:6,
              fontSize:isWallet?"0.7rem":"0.85rem", maxWidth:isWallet?180:130,
              overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", display:"inline-block",
              cursor:isWallet?"pointer":"default" }}
            onClick={isWallet ? () => { navigator.clipboard.writeText(value??""); toast.success("کپی شد!"); } : undefined}
            title={isWallet ? (value??"") : undefined}
          >
            {value ?? "—"}
          </code>
          <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(true); setVal(value??""); }}>✏️</button>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const qc = useQueryClient();
  const [showPlan, setShowPlan] = useState(false);
  const [showDiscount, setShowDiscount] = useState(false);
  const [planForm, setPlanForm] = useState({ name_fa:"", name_en:"", session_count:"", price_usd:"", duration_days:"" });
  const [discForm, setDiscForm] = useState({ code:"", type:"percent", value:"", max_uses:"" });

  const { data: settings } = useQuery("settings", () => api.get("/settings/").then(r => r.data), { retry:1 });
  const { data: plansRaw } = useQuery("plans", () => api.get("/settings/plans").then(r => r.data), { retry:1 });
  const { data: discsRaw } = useQuery("discounts", () => api.get("/settings/discounts").then(r => r.data), { retry:1 });

  const plans = Array.isArray(plansRaw) ? plansRaw : [];
  const discounts = Array.isArray(discsRaw) ? discsRaw : [];

  const updateM = useMutation(
    ({ key, value }) => api.patch(`/settings/${key}`, { value }),
    { onSuccess: () => { qc.invalidateQueries("settings"); toast.success("✅ ذخیره شد."); }, onError: () => toast.error("خطا در ذخیره") }
  );
  const addPlanM = useMutation(
    d => api.post("/settings/plans", { ...d, session_count:parseInt(d.session_count), price_usd:parseFloat(d.price_usd), duration_days:d.duration_days?parseInt(d.duration_days):null }),
    { onSuccess: () => { qc.invalidateQueries("plans"); toast.success("✅ پلن اضافه شد."); setShowPlan(false); setPlanForm({name_fa:"",name_en:"",session_count:"",price_usd:"",duration_days:""}); }, onError: () => toast.error("خطا") }
  );
  const delPlanM = useMutation(id => api.delete(`/settings/plans/${id}`),
    { onSuccess: () => { qc.invalidateQueries("plans"); toast.success("پلن حذف شد."); } });
  const addDiscM = useMutation(
    d => api.post("/settings/discounts", { ...d, value:parseFloat(d.value), max_uses:d.max_uses?parseInt(d.max_uses):null }),
    { onSuccess: () => { qc.invalidateQueries("discounts"); toast.success("✅ کد تخفیف اضافه شد."); setShowDiscount(false); setDiscForm({code:"",type:"percent",value:"",max_uses:""}); }, onError: () => toast.error("خطا") }
  );
  const delDiscM = useMutation(id => api.delete(`/settings/discounts/${id}`),
    { onSuccess: () => { qc.invalidateQueries("discounts"); toast.success("کد تخفیف حذف شد."); } });

  const allGroupKeys = Object.values(GROUPS).flat();

  return (
    <div>
      <h2 style={{ fontSize:"1.3rem", fontWeight:800, marginBottom:24 }}>⚙️ تنظیمات سیستم</h2>

      {/* Setting Groups */}
      {Object.entries(GROUPS).map(([gName, keys]) => (
        <div key={gName} className="card">
          <div className="card-header"><span className="card-title">{gName}</span></div>
          {!settings ? (
            <div className="loading"><div className="loading-spinner" /></div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {keys.filter(k => k in settings).map(k => (
                <SettingRow key={k} k={k} value={settings[k]} onSave={(key,val) => updateM.mutate({key,value:val})} />
              ))}
              {keys.filter(k => k in settings).length === 0 && (
                <p style={{ fontSize:"0.82rem", color:"var(--text-3)", padding:"8px 0" }}>تنظیمی در این گروه یافت نشد</p>
              )}
            </div>
          )}
        </div>
      ))}

      {/* Other settings */}
      {settings && (() => {
        const others = Object.keys(settings).filter(k => !allGroupKeys.includes(k));
        if (!others.length) return null;
        return (
          <div className="card">
            <div className="card-header"><span className="card-title">🔧 سایر تنظیمات</span></div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {others.map(k => <SettingRow key={k} k={k} value={settings[k]} onSave={(key,val) => updateM.mutate({key,value:val})} />)}
            </div>
          </div>
        );
      })()}

      {/* Plans */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">📦 پلن‌های خرید</span>
          <button className="btn btn-primary btn-sm" onClick={() => setShowPlan(true)}>+ پلن جدید</button>
        </div>
        {plans.length === 0 ? (
          <div className="empty-state"><div className="icon">📦</div><p>هیچ پلنی تعریف نشده</p></div>
        ) : (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(190px,1fr))", gap:12 }}>
            {plans.map(p => (
              <div key={p.id} style={{ border:"1.5px solid var(--border)", borderRadius:14, padding:18, background:"white", position:"relative", overflow:"hidden" }}>
                <div style={{ position:"absolute", top:0, left:0, right:0, height:4, background:"linear-gradient(90deg,#6366f1,#8b5cf6)" }} />
                <div style={{ fontWeight:700, fontSize:"0.95rem", marginTop:8, marginBottom:2 }}>{p.name_fa}</div>
                <div style={{ fontSize:"0.75rem", color:"var(--text-3)", marginBottom:10 }}>{p.name_en}</div>
                <div style={{ fontSize:"1.5rem", fontWeight:800, color:"var(--primary)", marginBottom:8 }}>${p.price_usd}</div>
                <div style={{ fontSize:"0.8rem", color:"var(--text-2)", marginBottom:2 }}>📱 {p.session_count} سشن</div>
                {p.duration_days && <div style={{ fontSize:"0.8rem", color:"var(--text-2)", marginBottom:10 }}>⏱ {p.duration_days} روز</div>}
                <button className="btn btn-danger btn-sm" style={{ width:"100%" }}
                  onClick={() => { if(window.confirm("حذف این پلن؟")) delPlanM.mutate(p.id); }}>🗑 حذف</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Discounts */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🎟 کدهای تخفیف</span>
          <button className="btn btn-primary btn-sm" onClick={() => setShowDiscount(true)}>+ کد جدید</button>
        </div>
        {discounts.length === 0 ? (
          <div className="empty-state"><div className="icon">🎟</div><p>هیچ کد تخفیفی وجود ندارد</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>کد</th><th>نوع</th><th>مقدار</th><th>استفاده</th><th>حداکثر</th><th>عملیات</th></tr></thead>
              <tbody>
                {discounts.map(d => (
                  <tr key={d.id}>
                    <td><code style={{ background:"var(--bg)", padding:"3px 10px", borderRadius:6, fontWeight:700 }}>{d.code}</code></td>
                    <td><span className={`badge ${d.type==="percent"?"badge-info":"badge-purple"}`}>{d.type==="percent"?"درصد":"ثابت"}</span></td>
                    <td style={{ fontWeight:700 }}>{d.type==="percent"?`${d.value}%`:`$${d.value}`}</td>
                    <td style={{ textAlign:"center" }}>{d.used_count||0}</td>
                    <td style={{ textAlign:"center" }}>{d.max_uses??"∞"}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => { if(window.confirm("حذف کد تخفیف؟")) delDiscM.mutate(d.id); }}>🗑</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Plan Modal */}
      {showPlan && (
        <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && setShowPlan(false)}>
          <div className="modal">
            <h3 className="modal-title">📦 پلن جدید</h3>
            <div className="form-group"><label className="form-label">نام فارسی</label><input className="form-control" value={planForm.name_fa} onChange={e => setPlanForm(f=>({...f,name_fa:e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">نام انگلیسی</label><input className="form-control" value={planForm.name_en} onChange={e => setPlanForm(f=>({...f,name_en:e.target.value}))} /></div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">تعداد سشن</label><input className="form-control" type="number" min="1" value={planForm.session_count} onChange={e => setPlanForm(f=>({...f,session_count:e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">قیمت ($)</label><input className="form-control" type="number" min="0" step="0.01" value={planForm.price_usd} onChange={e => setPlanForm(f=>({...f,price_usd:e.target.value}))} /></div>
            </div>
            <div className="form-group"><label className="form-label">مدت (روز) — اختیاری</label><input className="form-control" type="number" min="1" value={planForm.duration_days} onChange={e => setPlanForm(f=>({...f,duration_days:e.target.value}))} /></div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowPlan(false)}>انصراف</button>
              <button className="btn btn-primary" onClick={() => addPlanM.mutate(planForm)} disabled={!planForm.name_fa||!planForm.session_count||!planForm.price_usd||addPlanM.isLoading}>✅ افزودن</button>
            </div>
          </div>
        </div>
      )}

      {/* Discount Modal */}
      {showDiscount && (
        <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && setShowDiscount(false)}>
          <div className="modal">
            <h3 className="modal-title">🎟 کد تخفیف جدید</h3>
            <div className="form-group"><label className="form-label">کد تخفیف</label><input className="form-control" placeholder="مثلاً SUMMER20" value={discForm.code} onChange={e => setDiscForm(f=>({...f,code:e.target.value.toUpperCase()}))} /></div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">نوع</label>
                <select className="form-control" value={discForm.type} onChange={e => setDiscForm(f=>({...f,type:e.target.value}))}>
                  <option value="percent">درصد (%)</option>
                  <option value="fixed">مقدار ثابت ($)</option>
                </select>
              </div>
              <div className="form-group"><label className="form-label">مقدار</label><input className="form-control" type="number" min="0" step="0.01" value={discForm.value} onChange={e => setDiscForm(f=>({...f,value:e.target.value}))} /></div>
            </div>
            <div className="form-group"><label className="form-label">حداکثر استفاده (اختیاری)</label><input className="form-control" type="number" min="1" placeholder="خالی = نامحدود" value={discForm.max_uses} onChange={e => setDiscForm(f=>({...f,max_uses:e.target.value}))} /></div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowDiscount(false)}>انصراف</button>
              <button className="btn btn-primary" onClick={() => addDiscM.mutate(discForm)} disabled={!discForm.code||!discForm.value||addDiscM.isLoading}>✅ افزودن</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
