import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

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

export default function Settings() {
  const qc = useQueryClient();
  const [editKey, setEditKey] = useState(null);
  const [editVal, setEditVal] = useState("");
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [planForm, setPlanForm] = useState({ name_fa: "", name_en: "", session_count: "", price_usd: "", duration_days: "" });
  const [discountForm, setDiscountForm] = useState({ code: "", type: "percent", value: "", max_uses: "" });

  const { data: settings } = useQuery("settings", () => api.get("/settings/").then(r => r.data));
  const { data: plans } = useQuery("plans", () => api.get("/settings/plans").then(r => r.data));
  const { data: discounts } = useQuery("discounts", () => api.get("/settings/discounts").then(r => r.data));

  const updateMutation = useMutation(
    ({ key, value }) => api.patch(`/settings/${key}`, { value }),
    { onSuccess: () => { qc.invalidateQueries("settings"); toast.success("✅ تنظیم ذخیره شد."); setEditKey(null); }, onError: () => toast.error("خطا در ذخیره") }
  );

  const addPlanMutation = useMutation(
    (d) => api.post("/settings/plans", { ...d, session_count: parseInt(d.session_count), price_usd: parseFloat(d.price_usd), duration_days: d.duration_days ? parseInt(d.duration_days) : null }),
    { onSuccess: () => { qc.invalidateQueries("plans"); toast.success("✅ پلن اضافه شد."); setShowPlanModal(false); setPlanForm({ name_fa: "", name_en: "", session_count: "", price_usd: "", duration_days: "" }); }, onError: () => toast.error("خطا در افزودن پلن") }
  );

  const deletePlanMutation = useMutation(
    (id) => api.delete(`/settings/plans/${id}`),
    { onSuccess: () => { qc.invalidateQueries("plans"); toast.success("پلن حذف شد."); }, onError: () => toast.error("خطا") }
  );

  const addDiscountMutation = useMutation(
    (d) => api.post("/settings/discounts", { ...d, value: parseFloat(d.value), max_uses: d.max_uses ? parseInt(d.max_uses) : null }),
    { onSuccess: () => { qc.invalidateQueries("discounts"); toast.success("✅ کد تخفیف اضافه شد."); setShowDiscountModal(false); setDiscountForm({ code: "", type: "percent", value: "", max_uses: "" }); }, onError: () => toast.error("خطا") }
  );

  const deleteDiscountMutation = useMutation(
    (id) => api.delete(`/settings/discounts/${id}`),
    { onSuccess: () => { qc.invalidateQueries("discounts"); toast.success("کد تخفیف حذف شد."); }, onError: () => toast.error("خطا") }
  );

  const startEdit = (key, val) => { setEditKey(key); setEditVal(val ?? ""); };

  return (
    <div>
      <h2 style={{ fontSize: "1.3rem", fontWeight: 700, marginBottom: 24 }}>⚙️ تنظیمات سیستم</h2>

      {/* تنظیمات عمومی */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">🔧 تنظیمات عمومی</span>
        </div>
        <div style={{ display: "grid", gap: 10 }}>
          {settings && Object.entries(settings).map(([key, val]) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: "#f8fafc", borderRadius: 10, flexWrap: "wrap" }}>
              <span style={{ flex: 1, fontSize: "0.9rem", fontWeight: 600, color: "#1e293b", minWidth: 180 }}>
                {SETTING_LABELS[key] || key}
              </span>
              {editKey === key ? (
                <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
                  <input
                    className="form-control"
                    style={{ maxWidth: 280 }}
                    value={editVal}
                    onChange={e => setEditVal(e.target.value)}
                    autoFocus
                    onKeyDown={e => { if (e.key === "Enter") updateMutation.mutate({ key, value: editVal }); if (e.key === "Escape") setEditKey(null); }}
                  />
                  <button className="btn btn-primary btn-sm" onClick={() => updateMutation.mutate({ key, value: editVal })} disabled={updateMutation.isLoading}>ذخیره</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setEditKey(null)}>لغو</button>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <code style={{ background: "#e2e8f0", padding: "4px 10px", borderRadius: 6, fontSize: "0.88rem", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "inline-block" }}>
                    {val ?? "—"}
                  </code>
                  <button className="btn btn-ghost btn-sm" onClick={() => startEdit(key, val)}>✏️ ویرایش</button>
                </div>
              )}
            </div>
          ))}
          {!settings && <div className="loading">⏳ در حال بارگذاری...</div>}
        </div>
      </div>

      {/* پلن‌ها */}
      <div className="card mb-6">
        <div className="card-header">
          <span className="card-title">📦 پلن‌های خرید</span>
          <button className="btn btn-primary btn-sm" onClick={() => setShowPlanModal(true)}>+ پلن جدید</button>
        </div>
        {!plans || plans.length === 0 ? (
          <div className="empty-state"><div className="icon">📦</div><p>هیچ پلنی تعریف نشده</p></div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px,1fr))", gap: 14 }}>
            {plans.map(p => (
              <div key={p.id} style={{ border: "1.5px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
                <div style={{ fontWeight: 700, fontSize: "1rem", marginBottom: 4 }}>{p.name_fa}</div>
                <div style={{ fontSize: "0.82rem", color: "#64748b", marginBottom: 8 }}>{p.name_en}</div>
                <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#6366f1", marginBottom: 6 }}>${p.price_usd}</div>
                <div style={{ fontSize: "0.85rem", color: "#475569" }}>📱 {p.session_count} سشن</div>
                {p.duration_days && <div style={{ fontSize: "0.85rem", color: "#475569" }}>⏱ {p.duration_days} روز</div>}
                <button className="btn btn-danger btn-sm" style={{ marginTop: 12, width: "100%" }} onClick={() => { if (window.confirm("حذف این پلن؟")) deletePlanMutation.mutate(p.id); }}>🗑 حذف</button>
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
                    <td><code style={{ background: "#f1f5f9", padding: "2px 8px", borderRadius: 6 }}>{d.code}</code></td>
                    <td><span className="badge badge-info">{d.type === "percent" ? "درصد" : "مقدار ثابت"}</span></td>
                    <td>{d.type === "percent" ? `${d.value}%` : `$${d.value}`}</td>
                    <td>{d.used_count || 0}</td>
                    <td>{d.max_uses ?? "∞"}</td>
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
            <div className="form-group"><label className="form-label">نام فارسی</label><input className="form-control" value={planForm.name_fa} onChange={e => setPlanForm(f => ({ ...f, name_fa: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">نام انگلیسی</label><input className="form-control" value={planForm.name_en} onChange={e => setPlanForm(f => ({ ...f, name_en: e.target.value }))} /></div>
            <div className="form-row">
              <div className="form-group"><label className="form-label">تعداد سشن</label><input className="form-control" type="number" min="1" value={planForm.session_count} onChange={e => setPlanForm(f => ({ ...f, session_count: e.target.value }))} /></div>
              <div className="form-group"><label className="form-label">قیمت (دلار)</label><input className="form-control" type="number" min="0" step="0.01" value={planForm.price_usd} onChange={e => setPlanForm(f => ({ ...f, price_usd: e.target.value }))} /></div>
            </div>
            <div className="form-group"><label className="form-label">مدت (روز) — اختیاری</label><input className="form-control" type="number" min="1" value={planForm.duration_days} onChange={e => setPlanForm(f => ({ ...f, duration_days: e.target.value }))} /></div>
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
            <div className="form-group"><label className="form-label">کد تخفیف</label><input className="form-control" placeholder="مثلاً SUMMER20" value={discountForm.code} onChange={e => setDiscountForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} /></div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">نوع</label>
                <select className="form-control" value={discountForm.type} onChange={e => setDiscountForm(f => ({ ...f, type: e.target.value }))}>
                  <option value="percent">درصد</option>
                  <option value="fixed">مقدار ثابت ($)</option>
                </select>
              </div>
              <div className="form-group"><label className="form-label">مقدار</label><input className="form-control" type="number" min="0" step="0.01" value={discountForm.value} onChange={e => setDiscountForm(f => ({ ...f, value: e.target.value }))} /></div>
            </div>
            <div className="form-group"><label className="form-label">حداکثر استفاده — اختیاری</label><input className="form-control" type="number" min="1" placeholder="خالی = نامحدود" value={discountForm.max_uses} onChange={e => setDiscountForm(f => ({ ...f, max_uses: e.target.value }))} /></div>
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
