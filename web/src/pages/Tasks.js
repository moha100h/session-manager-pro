import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const STATUS_MAP = {
  pending:   { label:"در صف",       icon:"⏳", cls:"badge-gray" },
  running:   { label:"در حال اجرا", icon:"⚡", cls:"badge-info" },
  completed: { label:"تکمیل",       icon:"✅", cls:"badge-active" },
  failed:    { label:"ناموفق",      icon:"❌", cls:"badge-error" },
  cancelled: { label:"لغو شده",     icon:"🚫", cls:"badge-gray" },
};
const TYPE_MAP = {
  join_channel:  { label:"عضویت کانال",  icon:"📢" },
  join_group:    { label:"عضویت گروه",   icon:"👥" },
  send_message:  { label:"ارسال پیام",   icon:"💬" },
  leave_channel: { label:"خروج کانال",   icon:"🚪" },
};
const ALL_STATUSES = ["","pending","running","completed","failed","cancelled"];

export default function Tasks() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [selTask, setSelTask] = useState(null);
  const [form, setForm] = useState({
    task_type: "join_channel",
    target: "",
    session_count: "",
    delay_between: "",
    priority: "normal",
  });

  const { data, isLoading } = useQuery(
    ["tasks", status, page],
    () => {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      p.set("page", page); p.set("limit", 20);
      return api.get(`/tasks/?${p}`).then(r => r.data);
    },
    { keepPreviousData: true, refetchInterval: 10000 }
  );

  const tasks = Array.isArray(data) ? data : (Array.isArray(data?.tasks) ? data.tasks : []);
  const total = data?.total || tasks.length;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  const { data: statsRaw } = useQuery("task_stats",
    () => api.get("/stats/dashboard").then(r => r.data?.tasks || {}),
    { refetchInterval: 15000 }
  );
  const stats = statsRaw || {};

  const createM = useMutation(
    d => api.post("/tasks/", { ...d, session_count: parseInt(d.session_count)||1, delay_between: d.delay_between?parseInt(d.delay_between):null }),
    { onSuccess: () => { qc.invalidateQueries("tasks"); qc.invalidateQueries("task_stats"); toast.success("✅ تسک ایجاد شد."); setShowCreate(false); setForm({task_type:"join_channel",target:"",session_count:"",delay_between:"",priority:"normal"}); }, onError: e => toast.error(e.response?.data?.detail||"خطا در ایجاد تسک") }
  );
  const cancelM = useMutation(
    id => api.post(`/tasks/${id}/cancel`),
    { onSuccess: () => { qc.invalidateQueries("tasks"); qc.invalidateQueries("task_stats"); toast.success("تسک لغو شد."); setSelTask(null); }, onError: e => toast.error(e.response?.data?.detail||"خطا") }
  );
  const retryM = useMutation(
    id => api.post(`/tasks/${id}/retry`),
    { onSuccess: () => { qc.invalidateQueries("tasks"); toast.success("✅ تسک مجدداً در صف قرار گرفت."); setSelTask(null); }, onError: e => toast.error(e.response?.data?.detail||"خطا") }
  );

  const progressPct = (t) => {
    if (!t.total_count || t.total_count === 0) return 0;
    return Math.round(((t.success_count||0) / t.total_count) * 100);
  };

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <h2 style={{ fontSize:"1.3rem", fontWeight:800 }}>
          📋 تسک‌ها
          <span style={{ fontSize:"0.85rem", color:"var(--text-3)", fontWeight:400, marginRight:8 }}>({total.toLocaleString("fa-IR")})</span>
        </h2>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>+ تسک جدید</button>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card"><div className="icon">⏳</div><div className="value">{stats.pending||0}</div><div className="label">در صف</div><div className="bar" style={{background:"#94a3b8"}} /></div>
        <div className="stat-card"><div className="icon">⚡</div><div className="value">{stats.running||0}</div><div className="label">در حال اجرا</div><div className="bar" style={{background:"#06b6d4"}} /></div>
        <div className="stat-card"><div className="icon">✅</div><div className="value">{stats.completed||0}</div><div className="label">تکمیل</div><div className="bar" style={{background:"#22c55e"}} /></div>
        <div className="stat-card"><div className="icon">❌</div><div className="value">{stats.failed||0}</div><div className="label">ناموفق</div><div className="bar" style={{background:"#ef4444"}} /></div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="filters">
          {ALL_STATUSES.map(s => (
            <button key={s} className={`filter-btn ${status===s?"active":""}`}
              onClick={() => { setStatus(s); setPage(1); }}>
              {s===""?"همه":`${STATUS_MAP[s]?.icon} ${STATUS_MAP[s]?.label}`}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="loading"><div className="loading-spinner" />در حال بارگذاری...</div>
      ) : tasks.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="icon">📋</div><p>تسکی یافت نشد</p></div></div>
      ) : (
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {tasks.map(t => {
            const st = STATUS_MAP[t.status] || STATUS_MAP.pending;
            const tp = TYPE_MAP[t.task_type] || { label: t.task_type, icon:"📋" };
            const pct = progressPct(t);
            return (
              <div key={t.id} className="card" style={{ marginBottom:0, cursor:"pointer", transition:"box-shadow 0.2s" }}
                onClick={() => setSelTask(t)}
                onMouseEnter={e => e.currentTarget.style.boxShadow="0 6px 20px rgba(0,0,0,0.1)"}
                onMouseLeave={e => e.currentTarget.style.boxShadow=""}>
                <div style={{ display:"flex", alignItems:"flex-start", gap:14, flexWrap:"wrap" }}>
                  {/* Type Icon */}
                  <div style={{ width:44, height:44, borderRadius:12, background:"var(--primary-light)",
                    display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1.3rem", flexShrink:0 }}>
                    {tp.icon}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginBottom:4 }}>
                      <span style={{ fontWeight:700, fontSize:"0.9rem" }}>{tp.label}</span>
                      <span className={`badge ${st.cls}`}>{st.icon} {st.label}</span>
                      {t.priority === "high" && <span className="badge badge-error">🔥 اولویت بالا</span>}
                    </div>
                    <div style={{ fontSize:"0.82rem", color:"var(--text-2)", marginBottom:6 }}>
                      🎯 <code style={{ background:"var(--bg)", padding:"1px 6px", borderRadius:4 }}>{t.target||"—"}</code>
                    </div>
                    {/* Progress */}
                    {t.total_count > 0 && (
                      <div>
                        <div style={{ display:"flex", justifyContent:"space-between", fontSize:"0.72rem", color:"var(--text-3)", marginBottom:4 }}>
                          <span>پیشرفت: {t.success_count||0} / {t.total_count}</span>
                          <span>{pct}%</span>
                        </div>
                        <div style={{ background:"var(--bg)", borderRadius:6, height:6, overflow:"hidden" }}>
                          <div style={{ width:`${pct}%`, height:"100%", borderRadius:6,
                            background: t.status==="completed"?"#22c55e":t.status==="failed"?"#ef4444":"#6366f1",
                            transition:"width 0.5s ease" }} />
                        </div>
                      </div>
                    )}
                    <div style={{ display:"flex", gap:12, marginTop:6, flexWrap:"wrap" }}>
                      {t.fail_count > 0 && <span style={{ fontSize:"0.72rem", color:"#ef4444" }}>❌ ناموفق: {t.fail_count}</span>}
                      <span style={{ fontSize:"0.72rem", color:"var(--text-3)" }}>
                        📅 {t.created_at ? new Date(t.created_at).toLocaleString("fa-IR") : "—"}
                      </span>
                    </div>
                  </div>
                  {/* Quick Actions */}
                  <div style={{ display:"flex", gap:6 }} onClick={e => e.stopPropagation()}>
                    {(t.status==="pending"||t.status==="running") && (
                      <button className="btn btn-warning btn-sm" onClick={() => cancelM.mutate(t.id)}>🚫 لغو</button>
                    )}
                    {t.status==="failed" && (
                      <button className="btn btn-primary btn-sm" onClick={() => retryM.mutate(t.id)}>🔄 تلاش مجدد</button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button className="page-btn" disabled={page===1} onClick={() => setPage(p=>p-1)}>قبلی</button>
          {Array.from({length:Math.min(5,totalPages)},(_,i)=>{
            const p = page<=3?i+1:page-2+i;
            if(p<1||p>totalPages) return null;
            return <button key={p} className={`page-btn ${p===page?"active":""}`} onClick={()=>setPage(p)}>{p}</button>;
          })}
          <button className="page-btn" disabled={page===totalPages} onClick={() => setPage(p=>p+1)}>بعدی</button>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && setShowCreate(false)}>
          <div className="modal">
            <h3 className="modal-title">📋 تسک جدید</h3>
            <div className="form-group">
              <label className="form-label">نوع تسک</label>
              <select className="form-control" value={form.task_type} onChange={e => setForm(f=>({...f,task_type:e.target.value}))}>
                {Object.entries(TYPE_MAP).map(([k,v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">هدف (لینک یا یوزرنیم)</label>
              <input className="form-control" placeholder="@channel یا t.me/..." value={form.target} onChange={e => setForm(f=>({...f,target:e.target.value}))} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">تعداد سشن</label>
                <input className="form-control" type="number" min="1" placeholder="مثلاً ۱۰" value={form.session_count} onChange={e => setForm(f=>({...f,session_count:e.target.value}))} />
              </div>
              <div className="form-group">
                <label className="form-label">تأخیر بین هر سشن (ثانیه)</label>
                <input className="form-control" type="number" min="0" placeholder="پیش‌فرض: تنظیمات" value={form.delay_between} onChange={e => setForm(f=>({...f,delay_between:e.target.value}))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">اولویت</label>
              <select className="form-control" value={form.priority} onChange={e => setForm(f=>({...f,priority:e.target.value}))}>
                <option value="low">🔵 پایین</option>
                <option value="normal">🟡 معمولی</option>
                <option value="high">🔴 بالا</option>
              </select>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowCreate(false)}>انصراف</button>
              <button className="btn btn-primary" onClick={() => createM.mutate(form)} disabled={!form.target||!form.session_count||createM.isLoading}>
                {createM.isLoading?"در حال ایجاد...":"✅ ایجاد تسک"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selTask && (
        <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && setSelTask(null)}>
          <div className="modal" style={{ maxWidth:480 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
              <div>
                <h3 style={{ fontWeight:800, fontSize:"1.1rem" }}>
                  {(TYPE_MAP[selTask.task_type]||{icon:"📋"}).icon} {(TYPE_MAP[selTask.task_type]||{label:selTask.task_type}).label}
                </h3>
                <span className={`badge ${(STATUS_MAP[selTask.status]||STATUS_MAP.pending).cls}`} style={{ marginTop:6, display:"inline-flex" }}>
                  {(STATUS_MAP[selTask.status]||STATUS_MAP.pending).icon} {(STATUS_MAP[selTask.status]||STATUS_MAP.pending).label}
                </span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelTask(null)}>✕</button>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
              {[
                ["🎯 هدف", selTask.target||"—"],
                ["📱 تعداد سشن", selTask.session_count||"—"],
                ["✅ موفق", selTask.success_count||0],
                ["❌ ناموفق", selTask.fail_count||0],
                ["📊 کل", selTask.total_count||0],
                ["🔥 اولویت", selTask.priority||"normal"],
                ["📅 ایجاد", selTask.created_at?new Date(selTask.created_at).toLocaleString("fa-IR"):"—"],
                ["⏱ پایان", selTask.finished_at?new Date(selTask.finished_at).toLocaleString("fa-IR"):"—"],
              ].map(([label,val]) => (
                <div key={label} style={{ background:"var(--bg)", borderRadius:10, padding:"10px 12px" }}>
                  <div style={{ fontSize:"0.72rem", color:"var(--text-3)", marginBottom:4 }}>{label}</div>
                  <div style={{ fontSize:"0.85rem", fontWeight:600, wordBreak:"break-all" }}>{val}</div>
                </div>
              ))}
            </div>

            {selTask.total_count > 0 && (
              <div style={{ marginBottom:16 }}>
                <div style={{ display:"flex", justifyContent:"space-between", fontSize:"0.78rem", color:"var(--text-3)", marginBottom:6 }}>
                  <span>پیشرفت</span>
                  <span>{progressPct(selTask)}%</span>
                </div>
                <div style={{ background:"var(--bg)", borderRadius:8, height:10, overflow:"hidden" }}>
                  <div style={{ width:`${progressPct(selTask)}%`, height:"100%", borderRadius:8,
                    background: selTask.status==="completed"?"#22c55e":selTask.status==="failed"?"#ef4444":"#6366f1",
                    transition:"width 0.5s" }} />
                </div>
              </div>
            )}

            {selTask.error_message && (
              <div style={{ background:"#fee2e2", borderRadius:10, padding:"10px 14px", marginBottom:16, border:"1px solid #fecaca" }}>
                <div style={{ fontSize:"0.72rem", color:"#b91c1c", marginBottom:4 }}>⚠️ پیام خطا</div>
                <div style={{ fontSize:"0.82rem", color:"#7f1d1d" }}>{selTask.error_message}</div>
              </div>
            )}

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setSelTask(null)}>بستن</button>
              {(selTask.status==="pending"||selTask.status==="running") && (
                <button className="btn btn-warning" onClick={() => cancelM.mutate(selTask.id)} disabled={cancelM.isLoading}>
                  {cancelM.isLoading?"در حال...":"🚫 لغو تسک"}
                </button>
              )}
              {selTask.status==="failed" && (
                <button className="btn btn-primary" onClick={() => retryM.mutate(selTask.id)} disabled={retryM.isLoading}>
                  {retryM.isLoading?"در حال...":"🔄 تلاش مجدد"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
