import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const STATUS_MAP = {
  active:     { label:"فعال",      icon:"✅", cls:"badge-active" },
  logged_out: { label:"لاگ‌اوت",  icon:"🔴", cls:"badge-error" },
  flood:      { label:"فلود",      icon:"🌊", cls:"badge-warning" },
  banned:     { label:"بن",        icon:"🚫", cls:"badge-error" },
  error:      { label:"خطا",       icon:"⚠️", cls:"badge-error" },
  deleted:    { label:"حذف",       icon:"🗑", cls:"badge-gray" },
  inactive:   { label:"غیرفعال",   icon:"⏸", cls:"badge-gray" },
};
const ALL_STATUSES = ["","active","logged_out","flood","banned","error"];

export default function Sessions() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [selSession, setSelSession] = useState(null);

  const { data, isLoading } = useQuery(
    ["sessions", status, search, page],
    () => {
      const p = new URLSearchParams();
      if (status) p.set("status", status);
      if (search) p.set("search", search);
      p.set("page", page); p.set("limit", 20);
      return api.get(`/sessions/?${p}`).then(r => r.data);
    },
    { keepPreviousData: true, refetchInterval: 15000 }
  );

  const sessions = Array.isArray(data) ? data : (Array.isArray(data?.sessions) ? data.sessions : []);
  const total = data?.total || sessions.length;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  const { data: statsRaw } = useQuery("session_stats",
    () => api.get("/stats/dashboard").then(r => r.data?.sessions || {}),
    { refetchInterval: 20000 }
  );
  const stats = statsRaw || {};

  const deleteM = useMutation(id => api.delete(`/sessions/${id}`),
    { onSuccess: () => { qc.invalidateQueries("sessions"); qc.invalidateQueries("session_stats"); toast.success("سشن حذف شد."); setSelSession(null); }, onError: e => toast.error(e.response?.data?.detail||"خطا") }
  );
  const reactivateM = useMutation(id => api.post(`/sessions/${id}/reactivate`),
    { onSuccess: () => { qc.invalidateQueries("sessions"); toast.success("✅ سشن فعال‌سازی مجدد شد."); setSelSession(null); }, onError: e => toast.error(e.response?.data?.detail||"خطا") }
  );

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:10 }}>
        <h2 style={{ fontSize:"1.3rem", fontWeight:800 }}>
          📱 سشن‌ها
          <span style={{ fontSize:"0.85rem", color:"var(--text-3)", fontWeight:400, marginRight:8 }}>({total.toLocaleString("fa-IR")})</span>
        </h2>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card"><div className="icon">📱</div><div className="value">{stats.total||0}</div><div className="label">کل</div><div className="bar" style={{background:"#6366f1"}} /></div>
        <div className="stat-card"><div className="icon">✅</div><div className="value">{stats.active||0}</div><div className="label">فعال</div><div className="bar" style={{background:"#22c55e"}} /></div>
        <div className="stat-card"><div className="icon">🌊</div><div className="value">{stats.flood||0}</div><div className="label">فلود</div><div className="bar" style={{background:"#f59e0b"}} /></div>
        <div className="stat-card"><div className="icon">🚫</div><div className="value">{stats.banned||0}</div><div className="label">بن</div><div className="bar" style={{background:"#ef4444"}} /></div>
        <div className="stat-card"><div className="icon">🔴</div><div className="value">{stats.logged_out||0}</div><div className="label">لاگ‌اوت</div><div className="bar" style={{background:"#ef4444"}} /></div>
        <div className="stat-card"><div className="icon">⚠️</div><div className="value">{stats.error||0}</div><div className="label">خطا</div><div className="bar" style={{background:"#f59e0b"}} /></div>
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
          <form onSubmit={e => { e.preventDefault(); setSearch(searchInput); setPage(1); }}
            style={{ display:"flex", gap:6, flex:1, minWidth:180 }}>
            <div className="search-box" style={{ flex:1 }}>
              <input placeholder="جستجو شماره یا نام..." value={searchInput} onChange={e => setSearchInput(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary btn-sm">جستجو</button>
            {search && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}>✕</button>}
          </form>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="loading"><div className="loading-spinner" />در حال بارگذاری...</div>
      ) : sessions.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="icon">📱</div><p>سشنی یافت نشد</p></div></div>
      ) : (
        <div className="card" style={{ padding:0 }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>شماره / نام</th>
                  <th>وضعیت</th>
                  <th>پروکسی</th>
                  <th>آخرین فعالیت</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s, idx) => {
                  const st = STATUS_MAP[s.status] || STATUS_MAP.inactive;
                  return (
                    <tr key={s.id} style={{ cursor:"pointer" }} onClick={() => setSelSession(s)}>
                      <td style={{ color:"var(--text-3)", fontSize:"0.78rem" }}>{(page-1)*20+idx+1}</td>
                      <td>
                        <div style={{ fontWeight:600, fontSize:"0.88rem" }}>
                          {s.phone || s.session_name || "—"}
                        </div>
                        {s.first_name && (
                          <div style={{ fontSize:"0.75rem", color:"var(--text-3)" }}>
                            {s.first_name} {s.last_name||""}
                          </div>
                        )}
                      </td>
                      <td><span className={`badge ${st.cls}`}>{st.icon} {st.label}</span></td>
                      <td>
                        {s.proxy_host ? (
                          <code style={{ fontSize:"0.75rem", background:"var(--bg)", padding:"2px 6px", borderRadius:4 }}>
                            {s.proxy_host}:{s.proxy_port}
                          </code>
                        ) : <span style={{ color:"var(--text-3)", fontSize:"0.78rem" }}>—</span>}
                      </td>
                      <td style={{ fontSize:"0.78rem", color:"var(--text-3)" }}>
                        {s.last_used ? new Date(s.last_used).toLocaleString("fa-IR") : "—"}
                      </td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display:"flex", gap:4 }}>
                          {(s.status==="logged_out"||s.status==="error"||s.status==="flood") && (
                            <button className="btn btn-success btn-xs" onClick={() => reactivateM.mutate(s.id)}>🔄</button>
                          )}
                          <button className="btn btn-danger btn-xs" onClick={() => { if(window.confirm("حذف سشن؟")) deleteM.mutate(s.id); }}>🗑</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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

      {/* Detail Modal */}
      {selSession && (
        <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && setSelSession(null)}>
          <div className="modal" style={{ maxWidth:460 }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:20 }}>
              <div>
                <h3 style={{ fontWeight:800, fontSize:"1.1rem" }}>{selSession.phone||selSession.session_name||"سشن"}</h3>
                <span className={`badge ${(STATUS_MAP[selSession.status]||STATUS_MAP.inactive).cls}`} style={{ marginTop:6, display:"inline-flex" }}>
                  {(STATUS_MAP[selSession.status]||STATUS_MAP.inactive).icon} {(STATUS_MAP[selSession.status]||STATUS_MAP.inactive).label}
                </span>
              </div>
              <button className="btn btn-ghost btn-sm" onClick={() => setSelSession(null)}>✕</button>
            </div>

            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
              {[
                ["👤 نام", `${selSession.first_name||""} ${selSession.last_name||""}`.trim()||"—"],
                ["📱 شماره", selSession.phone||"—"],
                ["🆔 یوزرنیم", selSession.username ? `@${selSession.username}` : "—"],
                ["🌐 پروکسی", selSession.proxy_host ? `${selSession.proxy_host}:${selSession.proxy_port}` : "—"],
                ["📅 ایجاد", selSession.created_at ? new Date(selSession.created_at).toLocaleDateString("fa-IR") : "—"],
                ["⏱ آخرین فعالیت", selSession.last_used ? new Date(selSession.last_used).toLocaleString("fa-IR") : "—"],
              ].map(([label, val]) => (
                <div key={label} style={{ background:"var(--bg)", borderRadius:10, padding:"10px 12px" }}>
                  <div style={{ fontSize:"0.72rem", color:"var(--text-3)", marginBottom:4 }}>{label}</div>
                  <div style={{ fontSize:"0.85rem", fontWeight:600, wordBreak:"break-all" }}>{val}</div>
                </div>
              ))}
            </div>

            {selSession.error_message && (
              <div style={{ background:"#fee2e2", borderRadius:10, padding:"10px 14px", marginBottom:16, border:"1px solid #fecaca" }}>
                <div style={{ fontSize:"0.72rem", color:"#b91c1c", marginBottom:4 }}>⚠️ پیام خطا</div>
                <div style={{ fontSize:"0.82rem", color:"#7f1d1d" }}>{selSession.error_message}</div>
              </div>
            )}

            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setSelSession(null)}>بستن</button>
              {(selSession.status==="logged_out"||selSession.status==="error"||selSession.status==="flood") && (
                <button className="btn btn-success" onClick={() => reactivateM.mutate(selSession.id)} disabled={reactivateM.isLoading}>
                  {reactivateM.isLoading?"در حال...":"🔄 فعال‌سازی مجدد"}
                </button>
              )}
              <button className="btn btn-danger" onClick={() => { if(window.confirm("حذف سشن؟")) deleteM.mutate(selSession.id); }} disabled={deleteM.isLoading}>
                {deleteM.isLoading?"در حال...":"🗑 حذف"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
