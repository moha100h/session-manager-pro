import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const STATUS_CONFIG = {
  pending:    { label: "در انتظار",      icon: "⏳", cls: "badge-gray",    bg: "#f8fafc",  border: "#e2e8f0" },
  confirming: { label: "در حال بررسی",  icon: "🔍", cls: "badge-warning", bg: "#fffbeb",  border: "#fde68a" },
  confirmed:  { label: "تأیید شده",     icon: "✅", cls: "badge-active",  bg: "#f0fdf4",  border: "#86efac" },
  rejected:   { label: "رد شده",        icon: "❌", cls: "badge-error",   bg: "#fff1f2",  border: "#fecdd3" },
  expired:    { label: "منقضی شده",     icon: "⌛", cls: "badge-gray",    bg: "#f8fafc",  border: "#e2e8f0" },
};

const CURRENCY_COLORS = { USDT: "#26a17b", TON: "#0098ea", TRX: "#ef0027" };
const STATUSES = ["", "confirming", "pending", "confirmed", "rejected", "expired"];
const STATUS_NAMES = { "": "همه", confirming: "در حال بررسی", pending: "در انتظار", confirmed: "تأیید", rejected: "رد", expired: "منقضی" };

function CurrencyBadge({ currency }) {
  const color = CURRENCY_COLORS[currency] || "#6366f1";
  return (
    <span style={{
      background: color + "18", color, border: `1.5px solid ${color}40`,
      padding: "3px 10px", borderRadius: 20, fontSize: "0.78rem", fontWeight: 700,
      display: "inline-flex", alignItems: "center", gap: 4
    }}>
      {currency === "USDT" ? "🟢" : currency === "TON" ? "💎" : "🔴"} {currency}
    </span>
  );
}

function TxHashBadge({ hash }) {
  if (!hash) return <span style={{ color: "#94a3b8", fontSize: "0.82rem" }}>— ثبت نشده</span>;
  const short = hash.slice(0, 8) + "..." + hash.slice(-6);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <code style={{ background: "#f1f5f9", padding: "3px 8px", borderRadius: 6, fontSize: "0.75rem", cursor: "pointer" }}
        onClick={() => { navigator.clipboard.writeText(hash); toast.success("کپی شد!"); }}
        title={hash}>
        {short}
      </code>
      <button
        style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "#6366f1" }}
        onClick={() => { navigator.clipboard.writeText(hash); toast.success("کپی شد!"); }}
        title="کپی کردن">
        📋
      </button>
    </div>
  );
}

function OrderCard({ order, onConfirm, onReject, confirmLoading }) {
  const [expanded, setExpanded] = useState(false);
  const st = STATUS_CONFIG[order.status] || STATUS_CONFIG.pending;
  const timeAgo = (dateStr) => {
    if (!dateStr) return "—";
    const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
    if (diff < 60) return `${diff} ثانیه پیش`;
    if (diff < 3600) return `${Math.floor(diff/60)} دقیقه پیش`;
    if (diff < 86400) return `${Math.floor(diff/3600)} ساعت پیش`;
    return new Date(dateStr).toLocaleDateString("fa-IR");
  };

  return (
    <div style={{
      background: st.bg, border: `1.5px solid ${st.border}`,
      borderRadius: 16, overflow: "hidden",
      transition: "all 0.2s", boxShadow: "0 2px 8px rgba(0,0,0,0.06)"
    }}>
      {/* Header */}
      <div
        style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Avatar */}
        <div style={{
          width: 44, height: 44, borderRadius: "50%",
          background: "linear-gradient(135deg, #6366f1, #8b5cf6)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "white", fontWeight: 700, fontSize: "1.1rem", flexShrink: 0
        }}>
          {(order.full_name || order.username || "?")[0].toUpperCase()}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1e293b" }}>
              {order.full_name || "—"}
            </span>
            {order.username && (
              <span style={{ fontSize: "0.8rem", color: "#64748b" }}>@{order.username}</span>
            )}
            <span className={`badge ${st.cls}`}>{st.icon} {st.label}</span>
          </div>
          <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ fontSize: "1.1rem", fontWeight: 700, color: "#1e293b" }}>
              ${order.amount}
            </span>
            <CurrencyBadge currency={order.currency} />
            <span style={{ fontSize: "0.8rem", color: "#94a3b8" }}>{timeAgo(order.created_at)}</span>
          </div>
        </div>

        {/* Actions - فقط برای confirming */}
        {order.status === "confirming" && (
          <div style={{ display: "flex", gap: 8 }} onClick={e => e.stopPropagation()}>
            <button
              className="btn btn-success btn-sm"
              style={{ borderRadius: 10, fontWeight: 700 }}
              onClick={() => onConfirm(order.id)}
              disabled={confirmLoading}
            >
              ✅ تأیید
            </button>
            <button
              className="btn btn-danger btn-sm"
              style={{ borderRadius: 10, fontWeight: 700 }}
              onClick={() => onReject(order.id)}
            >
              ❌ رد
            </button>
          </div>
        )}

        <span style={{ color: "#94a3b8", fontSize: "1rem", transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>
          ▾
        </span>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div style={{ padding: "0 20px 20px", borderTop: `1px solid ${st.border}` }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px,1fr))", gap: 14, marginTop: 16 }}>

            {/* مبلغ کریپتو */}
            <div style={{ background: "white", borderRadius: 12, padding: "14px 16px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: 4 }}>💰 مبلغ کریپتو</div>
              <div style={{ fontWeight: 700, fontSize: "1rem" }}>{order.amount_crypto} {order.currency}</div>
            </div>

            {/* پلن */}
            {order.plan_name && (
              <div style={{ background: "white", borderRadius: 12, padding: "14px 16px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: 4 }}>📦 پلن</div>
                <div style={{ fontWeight: 700, fontSize: "1rem" }}>{order.plan_name}</div>
              </div>
            )}

            {/* تعداد سشن */}
            {order.session_count && (
              <div style={{ background: "white", borderRadius: 12, padding: "14px 16px", border: "1px solid #e2e8f0" }}>
                <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: 4 }}>📱 تعداد سشن</div>
                <div style={{ fontWeight: 700, fontSize: "1rem" }}>{order.session_count}</div>
              </div>
            )}

            {/* تاریخ */}
            <div style={{ background: "white", borderRadius: 12, padding: "14px 16px", border: "1px solid #e2e8f0" }}>
              <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: 4 }}>📅 تاریخ ثبت</div>
              <div style={{ fontWeight: 600, fontSize: "0.88rem" }}>{new Date(order.created_at).toLocaleString("fa-IR")}</div>
            </div>
          </div>

          {/* TX Hash */}
          <div style={{ marginTop: 14, background: "white", borderRadius: 12, padding: "14px 16px", border: "1px solid #e2e8f0" }}>
            <div style={{ fontSize: "0.78rem", color: "#64748b", marginBottom: 8 }}>🔗 هش تراکنشن</div>
            <TxHashBadge hash={order.tx_hash} />
            {order.tx_hash && (
              <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                {order.currency === "TON" && (
                  <a href={`https://tonscan.org/tx/${order.tx_hash}`} target="_blank" rel="noreferrer"
                    className="btn btn-info btn-sm" style={{ textDecoration: "none" }}>
                    🔍 بررسی در TONScan
                  </a>
                )}
                {order.currency === "USDT" && (
                  <a href={`https://tronscan.org/#/transaction/${order.tx_hash}`} target="_blank" rel="noreferrer"
                    className="btn btn-info btn-sm" style={{ textDecoration: "none" }}>
                    🔍 بررسی در TronScan
                  </a>
                )}
                {order.currency === "TRX" && (
                  <a href={`https://tronscan.org/#/transaction/${order.tx_hash}`} target="_blank" rel="noreferrer"
                    className="btn btn-info btn-sm" style={{ textDecoration: "none" }}>
                    🔍 بررسی در TronScan
                  </a>
                )}
              </div>
            )}
          </div>

          {/* یادداشت ادمین */}
          {order.admin_note && (
            <div style={{ marginTop: 14, background: "#fff7ed", borderRadius: 12, padding: "12px 16px", border: "1px solid #fed7aa" }}>
              <div style={{ fontSize: "0.78rem", color: "#92400e", marginBottom: 4 }}>📝 یادداشت ادمین</div>
              <div style={{ fontSize: "0.88rem", color: "#78350f" }}>{order.admin_note}</div>
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
  const [rejectingId, setRejectingId] = useState(null);
  const [rejectNote, setRejectNote] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const { data, isLoading } = useQuery(
    ["orders", statusFilter, search, page],
    () => api.get(`/orders/?${statusFilter ? `status=${statusFilter}&` : ""}${search ? `search=${search}&` : ""}page=${page}&limit=15`).then(r => r.data),
    { refetchInterval: 12000, keepPreviousData: true }
  );

  const orders = data?.orders || data || [];
  const total = data?.total || orders.length;
  const totalPages = Math.ceil(total / 15);

  // Stats
  const { data: stats } = useQuery(
    "order_stats",
    () => api.get("/stats/dashboard").then(r => r.data?.orders || {}),
    { refetchInterval: 30000 }
  );

  const confirmMutation = useMutation(
    (id) => api.post(`/orders/${id}/confirm`, {}),
    {
      onSuccess: () => {
        qc.invalidateQueries("orders");
        qc.invalidateQueries("order_stats");
        toast.success("✅ سفارش تأیید شد و سشن‌ها تخصیص یافت.");
      },
      onError: (e) => toast.error(e.response?.data?.detail || "خطا در تأیید")
    }
  );

  const rejectMutation = useMutation(
    ({ id, note }) => api.post(`/orders/${id}/reject`, { admin_note: note }),
    {
      onSuccess: () => {
        qc.invalidateQueries("orders");
        qc.invalidateQueries("order_stats");
        toast.success("سفارش رد شد.");
        setRejectingId(null);
        setRejectNote("");
      },
      onError: (e) => toast.error(e.response?.data?.detail || "خطا")
    }
  );

  const handleSearch = (e) => { e.preventDefault(); setSearch(searchInput); setPage(1); };

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6" style={{ flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>💰 سفارشات</h2>
      </div>

      {/* Stats Cards */}
      <div className="stat-grid mb-6">
        <div className="stat-card">
          <div className="icon" style={{ background: "#fef3c720" }}>🔍</div>
          <div className="value">{stats?.confirming || 0}</div>
          <div className="label">در حال بررسی</div>
        </div>
        <div className="stat-card">
          <div className="icon" style={{ background: "#f0fdf420" }}>✅</div>
          <div className="value">{stats?.confirmed || 0}</div>
          <div className="label">تأیید شده</div>
        </div>
        <div className="stat-card">
          <div className="icon" style={{ background: "#fff1f220" }}>❌</div>
          <div className="value">{stats?.rejected || 0}</div>
          <div className="label">رد شده</div>
        </div>
        <div className="stat-card">
          <div className="icon" style={{ background: "#f0fdf420" }}>💵</div>
          <div className="value">${Number(stats?.total_revenue || 0).toFixed(0)}</div>
          <div className="label">درآمد کل</div>
        </div>
      </div>

      {/* Filters + Search */}
      <div className="card mb-4">
        <div className="filters">
          {STATUSES.map(s => (
            <button
              key={s}
              className={`filter-btn ${statusFilter === s ? "active" : ""}`}
              onClick={() => { setStatusFilter(s); setPage(1); }}
            >
              {s === "" ? "همه" : `${STATUS_CONFIG[s]?.icon} ${STATUS_NAMES[s]}`}
            </button>
          ))}
          <form onSubmit={handleSearch} style={{ display: "flex", gap: 8, flex: 1, minWidth: 200 }}>
            <div className="search-box" style={{ flex: 1 }}>
              <input placeholder="جستجو نام یا یوزرنیم..." value={searchInput} onChange={e => setSearchInput(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-primary btn-sm">جستجو</button>
            {search && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}>✕</button>}
          </form>
        </div>
      </div>

      {/* Orders List */}
      {isLoading ? (
        <div className="loading">⏳ در حال بارگذاری...</div>
      ) : orders.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <div className="icon">💰</div>
            <p>هیچ سفارشی یافت نشد</p>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {orders.map(order => (
            <OrderCard
              key={order.id}
              order={order}
              onConfirm={(id) => confirmMutation.mutate(id)}
              onReject={(id) => { setRejectingId(id); setRejectNote(""); }}
              confirmLoading={confirmMutation.isLoading}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination" style={{ marginTop: 20 }}>
          <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>قبلی</button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            const p = page <= 3 ? i + 1 : page - 2 + i;
            if (p < 1 || p > totalPages) return null;
            return <button key={p} className={`page-btn ${p === page ? "active" : ""}`} onClick={() => setPage(p)}>{p}</button>;
          })}
          <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>بعدی</button>
        </div>
      )}

      {/* Reject Modal */}
      {rejectingId && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setRejectingId(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: "3rem", marginBottom: 8 }}>❌</div>
              <h3 className="modal-title" style={{ marginBottom: 4 }}>رد سفارش</h3>
              <p style={{ fontSize: "0.88rem", color: "#64748b" }}>دلیل رد را برای کاربر بنویسید</p>
            </div>
            <div className="form-group">
              <label className="form-label">یادداشت برای کاربر (اختیاری)</label>
              <textarea
                className="form-control"
                rows={3}
                placeholder="مثلاً: تراکنشن یافت نشد یا مبلغ اشتباه است..."
                value={rejectNote}
                onChange={e => setRejectNote(e.target.value)}
                style={{ resize: "none" }}
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setRejectingId(null)}>انصراف</button>
              <button
                className="btn btn-danger"
                style={{ background: "#ef4444", color: "white" }}
                onClick={() => rejectMutation.mutate({ id: rejectingId, note: rejectNote })}
                disabled={rejectMutation.isLoading}
              >
                {rejectMutation.isLoading ? "در حال ارسال..." : "❌ تأیید رد"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
