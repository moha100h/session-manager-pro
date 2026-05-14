import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const ST = {
  pending:    { label: "در انتظار",    icon: "⏳", cls: "badge-gray" },
  confirming: { label: "در بررسی",    icon: "🔍", cls: "badge-warning" },
  confirmed:  { label: "تأیید شده",   icon: "✅", cls: "badge-active" },
  rejected:   { label: "رد شده",      icon: "❌", cls: "badge-error" },
  expired:    { label: "منقضی",       icon: "⌛", cls: "badge-gray" },
};
const CUR_COLOR = { USDT: "#26a17b", TON: "#0098ea", TRX: "#ef0027" };
const STATUSES = ["", "confirming", "pending", "confirmed", "rejected", "expired"];

function OrderRow({ o, onConfirm, onReject, loading }) {
  const [open, setOpen] = useState(false);
  const st = ST[o.status] || ST.pending;
  const curColor = CUR_COLOR[o.currency] || "#6366f1";

  return (
    <div className="acc-card">
      <div className="acc-header" onClick={() => setOpen(v => !v)}>
        {/* Avatar */}
        <div style={{
          width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
          background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "white", fontWeight: 700, fontSize: "1rem"
        }}>
          {((o.full_name || o.username || "?")[0]).toUpperCase()}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: "0.92rem" }}>{o.full_name || "—"}</span>
            {o.username && <span style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>@{o.username}</span>}
            <span className={`badge ${st.cls}`}>{st.icon} {st.label}</span>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
            <strong style={{ fontSize: "1rem" }}>${o.amount}</strong>
            <span style={{
              background: curColor + "18", color: curColor, border: `1px solid ${curColor}40`,
              padding: "2px 8px", borderRadius: 12, fontSize: "0.72rem", fontWeight: 700
            }}>{o.currency}</span>
            <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>
              {o.created_at ? new Date(o.created_at).toLocaleString("fa-IR") : "—"}
            </span>
          </div>
        </div>

        {/* Actions */}
        {o.status === "confirming" && (
          <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
            <button className="btn btn-success btn-sm" onClick={() => onConfirm(o.id)} disabled={loading}>✅ تأیید</button>
            <button className="btn btn-danger btn-sm" onClick={() => onReject(o.id)}>❌ رد</button>
          </div>
        )}
        <span style={{ color: "var(--text-3)", transition: "transform 0.2s", transform: open ? "rotate(180deg)" : "" }}>▾</span>
      </div>

      {open && (
        <div className="acc-body">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 10, marginTop: 14 }}>
            {o.amount_crypto && (
              <div style={{ background: "var(--bg)", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginBottom: 4 }}>💰 مبلغ کریپتو</div>
                <div style={{ fontWeight: 700 }}>{o.amount_crypto} {o.currency}</div>
              </div>
            )}
            {o.plan_name && (
              <div style={{ background: "var(--bg)", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginBottom: 4 }}>📦 پلن</div>
                <div style={{ fontWeight: 700 }}>{o.plan_name}</div>
              </div>
            )}
            {o.session_count && (
              <div style={{ background: "var(--bg)", borderRadius: 10, padding: "10px 14px" }}>
                <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginBottom: 4 }}>📱 تعداد سشن</div>
                <div style={{ fontWeight: 700 }}>{o.session_count}</div>
              </div>
            )}
          </div>

          {/* TX Hash */}
          <div style={{ background: "var(--bg)", borderRadius: 10, padding: "10px 14px", marginTop: 10 }}>
            <div style={{ fontSize: "0.72rem", color: "var(--text-3)", marginBottom: 6 }}>🔗 هش تراکنش</div>
            {o.tx_hash ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <code style={{ fontSize: "0.75rem", background: "white", padding: "3px 8px", borderRadius: 6, cursor: "pointer" }}
                  onClick={() => { navigator.clipboard.writeText(o.tx_hash); toast.success("کپی شد!"); }}>
                  {o.tx_hash.slice(0,10)}...{o.tx_hash.slice(-8)}
                </code>
                {(o.currency === "TON") && (
                  <a href={`https://tonscan.org/tx/${o.tx_hash}`} target="_blank" rel="noreferrer" className="btn btn-info btn-xs">TONScan</a>
                )}
                {(o.currency === "USDT" || o.currency === "TRX") && (
                  <a href={`https://tronscan.org/#/transaction/${o.tx_hash}`} target="_blank" rel="noreferrer" className="btn btn-info btn-xs">TronScan</a>
                )}
              </div>
            ) : <span style={{ fontSize: "0.82rem", color: "var(--text-3)" }}>— ثبت نشده</span>}
          </div>

          {o.admin_note && (
            <div style={{ background: "#fff7ed", borderRadius: 10, padding: "10px 14px", marginTop: 10, border: "1px solid #fed7aa" }}>
              <div style={{ fontSize: "0.72rem", color: "#92400e", marginBottom: 4 }}>📝 یادداشت ادمین</div>
              <div style={{ fontSize: "0.85rem", color: "#78350f" }}>{o.admin_note}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Orders() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("confirming");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [rejectId, setRejectId] = useState(null);
  const [rejectNote, setRejectNote] = useState("");

  const { data, isLoading } = useQuery(
    ["orders", statusFilter, search, page],
    () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);
      params.set("page", page);
      params.set("limit", 15);
      return api.get(`/orders/?${params}`).then(r => r.data);
    },
    { keepPreviousData: true, refetchInterval: 15000 }
  );

  const orders = Array.isArray(data) ? data : (Array.isArray(data?.orders) ? data.orders : []);
  const total = data?.total || orders.length;
  const totalPages = Math.max(1, Math.ceil(total / 15));

  const { data: stats } = useQuery("order_stats",
    () => api.get("/stats/dashboard").then(r => r.data?.orders || {}),
    { refetchInterval: 30000 }
  );

  const confirmM = useMutation(
    id => api.post(`/orders/${id}/confirm`, {}),
    { onSuccess: () => { qc.invalidateQueries("orders"); qc.invalidateQueries("order_stats"); toast.success("✅ سفارش تأیید شد."); }, onError: e => toast.error(e.response?.data?.detail || "خطا") }
  );
  const rejectM = useMutation(
    ({ id, note }) => api.post(`/orders/${id}/reject`, { admin_note: note }),
    { onSuccess: () => { qc.invalidateQueries("orders"); qc.invalidateQueries("order_stats"); toast.success("سفارش رد شد."); setRejectId(null); setRejectNote(""); }, onError: e => toast.error(e.response?.data?.detail || "خطا") }
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>💰 سفارشات</h2>
      </div>

      {/* Stats */}
      <div className="stat-grid">
        <div className="stat-card"><div className="icon">🔍</div><div className="value">{stats?.confirming || 0}</div><div className="label">در بررسی</div><div className="bar" style={{ background: "#f59e0b" }} /></div>
        <div className="stat-card"><div className="icon">✅</div><div className="value">{stats?.confirmed || 0}</div><div className="label">تأیید شده</div><div className="bar" style={{ background: "#22c55e" }} /></div>
        <div className="stat-card"><div className="icon">❌</div><div className="value">{stats?.rejected || 0}</div><div className="label">رد شده</div><div className="bar" style={{ background: "#ef4444" }} /></div>
        <div className="stat-card"><div className="icon">💵</div><div className="value">${Number(stats?.total_revenue || 0).toFixed(0)}</div><div className="label">درآمد کل</div><div className="bar" style={{ background: "#22c55e" }} /></div>
      </div>

      {/* Filters */}
      <div className="card">
        <div className="filters">
          {STATUSES.map(s => (
            <button key={s} className={`filter-btn ${statusFilter === s ? "active" : ""}`}
              onClick={() => { setStatusFilter(s); setPage(1); }}>
              {s === "" ? "همه" : `${ST[s]?.icon} ${ST[s]?.label}`}
            </button>
          ))}
          <form onSubmit={e => { e.preventDefault(); setSearch(searchInput); setPage(1); }}
            style={{ display: "flex", gap: 6, flex: 1, minWidth: 180 }}>
            <div className="search-box" style={{ flex: 1 }}>
              <input placeholder="جستجو نام یا یوزرنیم..." value={searchInput} onChange={e => setSearchInput(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary btn-sm">جستجو</button>
            {search && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}>✕</button>}
          </form>
        </div>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="loading"><div className="loading-spinner" />در حال بارگذاری...</div>
      ) : orders.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="icon">💰</div><p>سفارشی یافت نشد</p></div></div>
      ) : (
        <div>{orders.map(o => (
          <OrderRow key={o.id} o={o}
            onConfirm={id => confirmM.mutate(id)}
            onReject={id => { setRejectId(id); setRejectNote(""); }}
            loading={confirmM.isLoading}
          />
        ))}</div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p-1)}>قبلی</button>
          {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
            const p = page <= 3 ? i+1 : page-2+i;
            if (p < 1 || p > totalPages) return null;
            return <button key={p} className={`page-btn ${p===page?"active":""}`} onClick={() => setPage(p)}>{p}</button>;
          })}
          <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p+1)}>بعدی</button>
        </div>
      )}

      {/* Reject Modal */}
      {rejectId && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setRejectId(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: "3rem" }}>❌</div>
              <h3 className="modal-title" style={{ marginBottom: 4 }}>رد سفارش</h3>
              <p style={{ fontSize: "0.85rem", color: "var(--text-3)" }}>دلیل رد را بنویسید (اختیاری)</p>
            </div>
            <div className="form-group">
              <textarea className="form-control" rows={3} placeholder="مثلاً: تراکنش یافت نشد..."
                value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setRejectId(null)}>انصراف</button>
              <button className="btn btn-danger" onClick={() => rejectM.mutate({ id: rejectId, note: rejectNote })} disabled={rejectM.isLoading}>
                {rejectM.isLoading ? "در حال ارسال..." : "❌ تأیید رد"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
