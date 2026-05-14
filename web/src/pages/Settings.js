import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const SETTING_GROUPS = {
  "⏱ تأخیر و محدودیت": ["join_delay_min","join_delay_max","max_retries","flood_multiplier","max_concurrent_joins","check_interval_minutes"],
  "💰 مالی": ["min_deposit_usd","usdt_rate","ton_rate","trx_rate"],
  "👛 کیف‌پول‌ها": ["usdt_wallet","ton_wallet","trx_wallet"],
};

const SETTING_LABELS = {
  join_delay_min: "تأخیر حداقل join (ثانیه)",
  join_delay_max: "تأخیر حداکثر join (ثانیه)",
  max_retries: "حداکثر تلاش مجدد",
  flood_multiplier: "ضریب زمان فلود",
  min_deposit_usd: "حداقل واریز (دلار)",
  usdt_rate: "نرخ USDT (هر دلار)",
  ton_rate: "نرخ TON (هر دلار)",
  trx_rate: "نرخ TRX (هر دلار)",
  usdt_wallet: "آدرس کیف پول USDT",
  ton_wallet: "آدرس کیف پول TON",
  trx_wallet: "آدرس کیف پول TRX",
  check_interval_minutes: "فاصله بررسی سلامت سشن (دقیقه)",
  max_concurrent_joins: "حداکثر join همزمان",
};

const SETTING_ICONS = {
  join_delay_min: "⏱", join_delay_max: "⏱", max_retries: "🔄",
  flood_multiplier: "🌊", min_deposit_usd: "💵", usdt_rate: "🟢",
  ton_rate: "💎", trx_rate: "🔴", usdt_wallet: "👛", ton_wallet: "👛",
  trx_wallet: "👛", check_interval_minutes: "🕐", max_concurrent_joins: "⚡",
};

function SettingRow({ settingKey, value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value ?? "");
  const isWallet = settingKey.includes("wallet");

  const handleSave = () => { onSave(settingKey, val); setEditing(false); };

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, padding: "12px 16px",
      background: editing ? "#f8f7ff" : "#f8fafc", borderRadius: 12,
      border: editing ? "1.5px solid #6366f1" : "1.5px solid transparent",
      transition: "all 0.2s", flexWrap: "wrap"
    }}>
      <span style={{ fontSize: "1.1rem", flexShrink: 0 }}>{SETTING_ICONS[settingKey] || "⚙️"}</span>
      <span style={{ flex: 1, fontSize: "0.88rem", fontWeight: 600, color: "#1e293b", minWidth: 160 }}>
        {SETTING_LABELS[settingKey] || settingKey}
      </span>
      {editing ? (
        <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1, minWidth: 200 }}>
          <input
            className="form-control"
            style={{ maxWidth: isWallet ? 340 : 180, fontFamily: isWallet ? "monospace" : "inherit", fontSize: isWallet ? "0.8rem" : "0.9rem" }}
            value={val}
            onChange={e => setVal(e.target.value)}
            autoFocus
            onKeyDown={e => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setEditing(false); }}
          />
          <button className="btn btn-primary btn-sm" onClick={handleSave}>✓</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(false); setVal(value ?? ""); }}>✕</button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <code style={{
            background: "white", border: "1px solid #e2e8f0",
            padding: "4px 12px", borderRadius: 8, fontSize: isWallet ? "0.72rem" : "0.88rem",
            maxWidth: isWallet ? 200 : 140, overflow: "hidden", textOverflow: "ellipsis",
            whiteSpace: "nowrap", display: "inline-block", cursor: isWallet ? "pointer" : "default"
          }}
          onClick={isWallet ? () => { navigator.clipboard.writeText(value ?? ""); toast.success("کپی شد!"); } : undefined}
          title={isWallet ? value : undefined}
          >
            {value ?? "—"}
          </code>
          <button className="btn btn-ghost btn-sm" onClick={() => { setEditing(true); setVal(value ?? ""); }}>✏️</button>
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const qc = useQueryClient();
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [planForm, setPlanForm] = useState({ name_fa: "", name_en: "", session_count: "", price_usd: "", duration_days: "" });
  const [discountForm, setDiscountForm] = useState({ code: "", type: "percent", value: "", max_uses: "" });

  const { data: settings } = useQuery("settings", () => api.get("/settings/").then(r => r.data));
  const { data: plans } = useQuery("plans", () => api.get("/settings/plans").then(r => r.data));
  const { data: discounts } = useQuery("discounts", () => api.get("/settings/discounts").then(r => r.data));

  const updateMutation = useMutation(
    ({ key, value }) => api.patch(`/settings/${key}`, { value }),
    { onSuccess: () => { qc.invalidateQueries("settings"); toast.success("✅ ذخیره شد."); }, onError: () => toast.error("خطا در ذخیره") }
  );

  const addPlanMutation = useMutation(
    (d) => api.post("/settings/plans", { ...d, session_count: parseInt(d.session_count), price_usd: parseFloat(d.price_usd), duration_days: d.duration_days ? parseInt(d.duration_days) : null }),
    { onSuccess: () => { qc.invalidateQueries("plans"); toast.success("✅ پلن اضافه شد."); setShowPlanModal(false); setPlanForm({ name_fa: "", name_en: "", session_count: "", price_usd: "", duration_days: "" }); }, onError: () => toast.error("خطا") }
  );

  const deletePlanMutation = useMutation(
    (id) => api.delete(`/settings/plans/${id}`),
    { onSuccess: () => { qc.invalidateQueries("plans"); toast.success("پلن حذف شد."); } }
  );

  const addDiscountMutation = useMutation(
    (d) => api.post("/settings/discounts", { ...d, value: parseFloat(d.value), max_uses: d.max_uses ? parseInt(d.max_uses) : null }),
    { onSuccess: () => { qc.invalidateQueries("discounts"); toast.success("✅ کد تخفیف اضافه شد."); setShowDiscountModal(false); setDiscountForm({ code: "", type: "percent", value: "", max_uses: "" }); }, onError: () => toast.error("خطا") }
  );

  const deleteDiscountMutation = useMutation(
    (id) => api.delete(`/settings/discounts/${id}`),
    { onSuccess: () => { qc.invalidateQueries("discounts"); toast.success("کد تخفیف حذف شد."); } }
  );

  return (
    <div>
      <h2 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 24 }}>⚙️ تنظیمات سیستم</h2>

      {/* Settings Groups */}
      {Object.entries(SETTING_GROUPS).map(([groupName, keys]) => (
        <div key={groupName} className="card mb-6">
          <div className="card-header">
            <span className="card-title">{groupName}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {settings
              ? keys.filter(k => k in settings).map(k => (
                  <SettingRow
                    key={k}
                    settingKey={k}
                    value={settings[k]}
                    onSave={(key, val) => updateMutation.mutate({ key, value: val })}
                  />
                ))
              : <div className="loading">⏳ در حال بارگذاری...</div>
            }
          </div>
        </div>
      ))}

      {/* سایر تنظیمات */}
      {settings && (() => {
        const allGroupKeys = Object.values(SETTING_GROUPS).flat();
        const otherKeys = Object.keys(settings).filter(k => !allGroupKeys.includes(k));
        if (!otherKeys.length) return null;
        return (
          <div className="card mb-6">
            <div className="card-header"><span className="card-title">🔧 سایر تنظیمات</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {otherKeys.map(k => (
                <SettingRow key={k} settingKey={k} value={settings[k]} onSave={(key, val) => updateMutation.mutate({ key, value: val })} />
              ))}
            </div>
          </div>
        );
      })()}

      {/* پلن‌ها */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">📦 پلن‌های خرید</span>
          <button className="btn btn-primary btn-sm" onClick={() => setShowPlanModal(true)}>+ پلن جدید</button>
        </div>
        {!plans || plans.length === 0 ? (
          <div className="empty-state"><div className="icon">📦</div><p>هیچ پلنی تعریف نشده</p></div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px,1fr))", gap: 14 }}>
            {plans.map(p => (
              <div key={p.id} style={{
                border: "1.5px solid #e2e8f0", borderRadius: 14, padding: 18,
                background: "white", position: "relative", overflow: "hidden"
              }}>
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: "linear-gradient(90deg,#6366f1,#8b5cf6)" }} />
                <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 4, marginTop: 8 }}>{p.name_fa}</div>
                <div style={{ fontSize: "0.8rem", color: "#64748b", marginBottom: 12 }}>{p.name_en}</div>
                <div style={{ fontSize: "1.6rem", fontWeight: 800, color: "#6366f1", marginBottom: 8 }}>${p.price_usd}</div>
                <div style={{ fontSize: "0.82rem", color: "#475569", marginBottom: 4 }}>📱 {p.session_count} سشن</div>
                {p.duration_days && <div style={{ fontSize: "0.82rem", color: "#475569", marginBottom: 12 }}>⏱ {p.duration_days} روز</div>}
                <button className="btn btn-danger btn-sm" style={{ width: "100%" }} onClick={() => { if (window.confirm("حذف این پلن؟")) deletePlanMutation.mutate(p.id); }}>🗑 حذف</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* کدهای تخفیف */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">🎟 کدهای تخفیف</span>
          <button className="btn btn-primary btn-sm" onClick={() => setShowDiscountModal(true)}>+ کد جدید</button>
        </div>
        {!discounts || discounts.length === 0 ? (
          <div className="empty-state"><div className="icon">🎟</div><p>هیچ کد تخفیفی وجود ندارد</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>کد</th><th>نوع</th><th>مقدار</th><th>استفاده</th><th>حداکثر</th><th>عملیات</th></tr></thead>
              <tbody>
                {discounts.map(d => (
                  <tr key={d.id}>
                    <td><code style={{ background: "#f1f5f9", padding: "3px 10px", borderRadius: 6, fontWeight: 700 }}>{d.code}</code></td>
                    <td><span className="badge badge-info">{d.type === "percent" ? "درصد" : "ثابت"}</span></td>
                    <td style={{ fontWeight: 700 }}>{d.type === "percent" ? `${d.value}%` : `$${d.value}`}</td>
                    <td style={{ textAlign: "center" }}>{d.used_count || 0}</td>
                    <td style={{ textAlign: "center" }}>{d.max_uses ?? "∞"}</td>
                    <td><button className="btn btn-danger btn-sm" onClick={() => { if (window.confirm("حذف کد تخفیف؟")) deleteDiscountMutation.mutate(d.id); }}>🗑</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal پلن */}
      {showPlanModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowPlanModal(false)}>
          <div className="modal">
            <h3 className="modal-title">📦 پلن جدید</h3>
            <div className="form-group"><label className="form-label">نام فارسی</label><input className="form-control" value={planForm.name_fa} onChange={e => setPlanForm(f => ({...f, name_fa: e.target.value}))} /></div>
            <div className="form-group"><label className="form-label">نام انگلیسی</label><input className="form-control" value={planForm.name_en} onChange={e => setPlanForm(f => ({...f, name_en: e.target.value}))} /></div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">تعداد سشن</label><input className="form-control" type="number" min="1" value={planForm.session_count} onChange={e => setPlanForm(f => ({...f, session_count: e.target.value}))} /></div>
              <div className="form-group"><label className="form-label">قیمت ($)</label><input className="form-control" type="number" min="0" step="0.01" value={planForm.price_usd} onChange={e => setPlanForm(f => ({...f, price_usd: e.target.value}))} /></div>
            </div>
            <div className="form-group"><label className="form-label">مدت (روز) — اختیاری</label><input className="form-control" type="number" min="1" value={planForm.duration_days} onChange={e => setPlanForm(f => ({...f, duration_days: e.target.value}))} /></div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowPlanModal(false)}>انصراف</button>
              <button className="btn btn-primary" onClick={() => addPlanMutation.mutate(planForm)} disabled={addPlanMutation.isLoading}>✅ افزودن</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal تخفیف */}
      {showDiscountModal && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setShowDiscountModal(false)}>
          <div className="modal">
            <h3 className="modal-title">🎟 کد تخفیف جدید</h3>
            <div className="form-group"><label className="form-label">کد تخفیف</label><input className="form-control" placeholder="مثلاً SUMMER20" value={discountForm.code} onChange={e => setDiscountForm(f => ({...f, code: e.target.value.toUpperCase()}))} /></div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">نوع</label>
                <select className="form-control" value={discountForm.type} onChange={e => setDiscountForm(f => ({...f, type: e.target.value}))}>
                  <option value="percent">درصد</option>
                  <option value="fixed">مقدار ثابت ($)</option>
                </select>
              </div>
              <div className="form-group"><label className="form-label">مقدار</label><input className="form-control" type="number" min="0" step="0.01" value={discountForm.value} onChange={e => setDiscountForm(f => ({...f, value: e.target.value}))} /></div>
            </div>
            <div className="form-group"><label className="form-label">حداکثر استفاده — اختیاری</label><input className="form-control" type="number" min="1" placeholder="خالی = نامحدود" value={discountForm.max_uses} onChange={e => setDiscountForm(f => ({...f, max_uses: e.target.value}))} /></div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowDiscountModal(false)}>انصراف</button>
              <button className="btn btn-primary" onClick={() => addDiscountMutation.mutate(discountForm)} disabled={addDiscountMutation.isLoading}>✅ افزودن</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
