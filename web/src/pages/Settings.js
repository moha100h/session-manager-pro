import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

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
    { onSuccess: () => { qc.invalidateQueries("settings"); toast.success("تنظیم ذخیره شد."); setEditKey(null); } }
  );

  const addPlanMutation = useMutation(
    (d) => api.post("/settings/plans", { ...d, session_count: parseInt(d.session_count), price_usd: parseFloat(d.price_usd), duration_days: d.duration_days ? parseInt(d.duration_days) : null }),
    { onSuccess: () => { qc.invalidateQueries("plans"); toast.success("پلن اضافه شد."); setShowPlanModal(false); setPlanForm({ name_fa: "", name_en: "", session_count: "", price_usd: "", duration_days: "" }); } }
  );

  const deletePlanMutation = useMutation(
    (id) => api.delete(`/settings/plans/${id}`),
    { onSuccess: () => { qc.invalidateQueries("plans"); toast.success("پلن حذف شد."); } }
  );

  const addDiscountMutation = useMutation(
    (d) => api.post("/settings/discounts", { ...d, value: parseFloat(d.value), max_uses: d.max_uses ? parseInt(d.max_uses) : null }),
    { onSuccess: () => { qc.invalidateQueries("discounts"); toast.success("کد تخفیف اضافه شد."); setShowDiscountModal(false); setDiscountForm({ code: "", type: "percent", value: "", max_uses: "" }); } }
  );

  const deleteDiscountMutation = useMutation(
    (id) => api.delete(`/settings/discounts/${id}`),
    { onSuccess: () => { qc.invalidateQueries("discounts"); toast.success("کد تخفیف حذف شد."); } }
  );

  const settingLabels = {
    join_delay_min: "تأخیر حداقل join (ثانیه)",
    join_delay_max: "تأخیر حداکثر join (ثانیه)",
    max_retries: "حداکثر تلاش مجدد",
    flood_multiplier: "ضریب زمان فلود",
    min_deposit_usd: "حداقل واریز (دلار)",
    usdt_rate: "نرخ USDT",
    ton_rate: "نرخ TON",
    trx_rate: "نرخ TRX",
    check_interval_minutes: "فاصله بررسی سلامت سشن (دقیقه)",
    max_concurrent_joins: "حداکثر join همزمان",
  };

  return (
    <div>
      <h2 style={{ fontSize: "1.4rem", fontWeight: 700, marginBottom: 24 }}>⚙️ تنظیمات سیستم</h2>

      {/* System Settings */}
      <div className="card mb-6">
        <h3 style={{ marginBottom: 20, fontSize: "1.1rem" }}>🔧 تنظیمات عمومی</h3>
        <div className="table-wrap">
          <table>
            <thead><tr><th>تنظیم</th><th>مقدار فعلی</th><th>عملیات</th></tr></thead>
            <tbody>
              {settings && Object.entries(settings).map(([key, { value, description }]) => (
                <tr key={key}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{settingLabels[key] || key}</div>
                    {description && <div className="text-sm text-light">{description}</div>}
                  </td>
                  <td>
                    {editKey === key
                      ? <input className="input" value={editVal} onChange={e => setEditVal(e.target.value)} style={{ maxWidth: 160 }} autoFocus onKeyDown={e => { if (e.key === "Enter") updateMutation.mutate({ key, value: editVal }); if (e.key === "Escape") setEditKey(null); }} />
                      : <strong>{value}</strong>
                    }
                  </td>
                  <td>
                    {editKey === key
                      ? <div className="flex gap-2">
                          <button className="btn btn-success btn-sm" onClick={() => updateMutation.mutate({ key, value: editVal })}>✅ ذخیره</button>
                          <button className="btn btn-sm" onClick={() => setEditKey(null)}>انصراف</button>
                        </div>
                      : <button className="btn btn-primary btn-sm" onClick={() => { setEditKey(key); setEditVal(value); }}>✏️ ویرایش</button>
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Plans */}
      <div className="card mb-6">
        <div className="flex justify-between items-center mb-4">
          <h3 style={{ fontSize: "1.1rem" }}>📦 پلن‌های فروش</h3>
          <button className="btn btn-primary btn-sm" onClick={() => setShowPlanModal(true)}>➕ پلن جدید</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 16 }}>
          {(plans || []).map(p => (
            <div key={p.id} style={{ border: "2px solid #e2e8f0", borderRadius: 14, padding: 20, position: "relative" }}>
              <button onClick={() => { if (window.confirm("حذف شود؟")) deletePlanMutation.mutate(p.id); }} style={{ position: "absolute", top: 12, left: 12, background: "none", border: "none", cursor: "pointer", fontSize: "1.1rem" }}>🗑</button>
              <div style={{ fontSize: "1.5rem", marginBottom: 8 }}>📦</div>
              <div style={{ fontWeight: 700, fontSize: "1.05rem", marginBottom: 4 }}>{p.name_fa}</div>
              <div className="text-sm text-light" style={{ marginBottom: 12 }}>{p.name_en}</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 700, color: "#6366f1" }}>${p.price_usd}</div>
              <div className="text-sm text-light">{Number(p.session_count).toLocaleString("fa-IR")} سشن</div>
              {p.duration_days && <div className="text-sm text-light">{p.duration_days} روز</div>}
            </div>
          ))}
          {!(plans || []).length && <div className="text-light text-sm">هیچ پلنی تعریف نشده.</div>}
        </div>
      </div>

      {/* Discounts */}
      <div className="card">
        <div className="flex justify-between items-center mb-4">
          <h3 style={{ fontSize: "1.1rem" }}>🎟 کدهای تخفیف</h3>
          <button className="btn btn-primary btn-sm" onClick={() => setShowDiscountModal(true)}>➕ کد جدید</button>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>کد</th><th>نوع</th><th>مقدار</th><th>استفاده</th><th>انقضا</th><th>عملیات</th></tr></thead>
            <tbody>
              {(discounts || []).map(d => (
                <tr key={d.id}>
                  <td><code style={{ background: "#f1f5f9", padding: "3px 8px", borderRadius: 6 }}>{d.code}</code></td>
                  <td><span className="badge badge-info">{d.type === "percent" ? "درصدی" : "ثابت"}</span></td>
                  <td><strong>{d.type === "percent" ? `${d.value}%` : `$${d.value}`}</strong></td>
                  <td className="text-sm text-light">{d.used_count} / {d.max_uses || "∞"}</td>
                  <td className="text-sm text-light">{d.expires_at ? new Date(d.expires_at).toLocaleDateString("fa-IR") : "بدون انقضا"}</td>
                  <td><button className="btn btn-danger btn-sm" onClick={() => { if (window.confirm("حذف شود؟")) deleteDiscountMutation.mutate(d.id); }}>🗑</button></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!(discounts || []).length && <div className="loading">📭 کد تخفیفی وجود ندارد.</div>}
        </div>
      </div>

      {/* Plan Modal */}
      {showPlanModal && (
        <div className="modal-overlay" onClick={() => setShowPlanModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>📦 پلن جدید</h3>
            <div className="form-group"><label>نام فارسی</label><input className="input" placeholder="پلن برنزی" value={planForm.name_fa} onChange={e => setPlanForm({...planForm, name_fa: e.target.value})} /></div>
            <div className="form-group"><label>نام انگلیسی</label><input className="input" placeholder="Bronze Plan" value={planForm.name_en} onChange={e => setPlanForm({...planForm, name_en: e.target.value})} /></div>
            <div className="flex gap-2">
              <div className="form-group" style={{ flex: 1 }}><label>تعداد سشن</label><input className="input" type="number" placeholder="1000" value={planForm.session_count} onChange={e => setPlanForm({...planForm, session_count: e.target.value})} /></div>
              <div className="form-group" style={{ flex: 1 }}><label>قیمت (دلار)</label><input className="input" type="number" placeholder="50" step="0.01" value={planForm.price_usd} onChange={e => setPlanForm({...planForm, price_usd: e.target.value})} /></div>
            </div>
            <div className="form-group"><label>مدت (روز) — اختیاری</label><input className="input" type="number" placeholder="بدون محدودیت زمانی" value={planForm.duration_days} onChange={e => setPlanForm({...planForm, duration_days: e.target.value})} /></div>
            <div className="flex gap-2 justify-end">
              <button className="btn" onClick={() => setShowPlanModal(false)}>انصراف</button>
              <button className="btn btn-primary" onClick={() => addPlanMutation.mutate(planForm)} disabled={addPlanMutation.isLoading}>{addPlanMutation.isLoading ? "در حال افزودن..." : "افزودن پلن"}</button>
            </div>
          </div>
        </div>
      )}

      {/* Discount Modal */}
      {showDiscountModal && (
        <div className="modal-overlay" onClick={() => setShowDiscountModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>🎟 کد تخفیف جدید</h3>
            <div className="form-group"><label>کد تخفیف</label><input className="input" placeholder="SUMMER30" value={discountForm.code} onChange={e => setDiscountForm({...discountForm, code: e.target.value.toUpperCase()})} /></div>
            <div className="flex gap-2">
              <div className="form-group" style={{ flex: 1 }}><label>نوع</label><select className="input" value={discountForm.type} onChange={e => setDiscountForm({...discountForm, type: e.target.value})}><option value="percent">درصدی (%)</option><option value="fixed">ثابت ($)</option></select></div>
              <div className="form-group" style={{ flex: 1 }}><label>مقدار</label><input className="input" type="number" placeholder={discountForm.type === "percent" ? "30" : "10"} value={discountForm.value} onChange={e => setDiscountForm({...discountForm, value: e.target.value})} /></div>
            </div>
            <div className="form-group"><label>حداکثر استفاده — اختیاری</label><input className="input" type="number" placeholder="بدون محدودیت" value={discountForm.max_uses} onChange={e => setDiscountForm({...discountForm, max_uses: e.target.value})} /></div>
            <div className="flex gap-2 justify-end">
              <button className="btn" onClick={() => setShowDiscountModal(false)}>انصراف</button>
              <button className="btn btn-primary" onClick={() => addDiscountMutation.mutate(discountForm)} disabled={addDiscountMutation.isLoading}>{addDiscountMutation.isLoading ? "در حال افزودن..." : "افزودن کد"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
