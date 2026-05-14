import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

function Avatar({ name, size = 40 }) {
  const colors = ["#6366f1","#8b5cf6","#06b6d4","#22c55e","#f59e0b","#ef4444"];
  const color = colors[(name || "?").charCodeAt(0) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: `linear-gradient(135deg, ${color}, ${color}99)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "white", fontWeight: 700, fontSize: size * 0.4,
      flexShrink: 0, boxShadow: `0 2px 8px ${color}40`
    }}>
      {(name || "?")[0].toUpperCase()}
    </div>
  );
}

function UserCard({ user, onBalance, onBan, onUnban }) {
  return (
    <div style={{
      background: "white", borderRadius: 16, padding: "18px 20px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.06)", border: "1.5px solid #e2e8f0",
      display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap",
      transition: "box-shadow 0.2s"
    }}
    onMouseEnter={e => e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.1)"}
    onMouseLeave={e => e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.06)"}
    >
      <Avatar name={user.full_name || user.username} />

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: "0.95rem", color: "#1e293b" }}>
            {user.full_name || "—"}
          </span>
          {user.username && <span style={{ fontSize: "0.8rem", color: "#64748b" }}>@{user.username}</span>}
          {user.is_banned
            ? <span className="badge badge-error">🚫 بن</span>
            : <span className="badge badge-active">✅ فعال</span>
          }
        </div>
        <div style={{ display: "flex", gap: 16, marginTop: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: "0.82rem", color: "#64748b" }}>
            💰 موجودی: <strong style={{ color: "#22c55e" }}>${user.balance || 0}</strong>
          </span>
          <span style={{ fontSize: "0.82rem", color: "#64748b" }}>
            💳 خرج: <strong>${user.total_spent || 0}</strong>
          </span>
          <span style={{ fontSize: "0.82rem", color: "#94a3b8" }}>
            📅 {new Date(user.created_at).toLocaleDateString("fa-IR")}
          </span>
        </div>
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-success btn-sm" onClick={() => onBalance(user)}>
          💰 شارژ
        </button>
        {user.is_banned
          ? <button className="btn btn-primary btn-sm" onClick={() => onUnban(user.id)}>🔓 آنبن</button>
          : <button className="btn btn-danger btn-sm" onClick={() => onBan(user.id)}>🚫 بن</button>
        }
      </div>
    </div>
  );
}

export default function Users() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [selectedUser, setSelectedUser] = useState(null);
  const [balanceAmount, setBalanceAmount] = useState("");
  const [balanceType, setBalanceType] = useState("add");

  const { data, isLoading } = useQuery(
    ["users", search, page],
    () => api.get(`/users/?${search ? `search=${search}&` : ""}page=${page}&limit=20`).then(r => r.data),
    { keepPreviousData: true, refetchInterval: 20000 }
  );

  const users = data?.users || data || [];
  const total = data?.total || users.length;
  const totalPages = Math.ceil(total / 20);

  const banMutation = useMutation(
    (id) => api.post(`/users/${id}/ban`),
    { onSuccess: () => { qc.invalidateQueries("users"); toast.success("کاربر بن شد."); } }
  );
  const unbanMutation = useMutation(
    (id) => api.post(`/users/${id}/unban`),
    { onSuccess: () => { qc.invalidateQueries("users"); toast.success("کاربر آنبن شد."); } }
  );
  const balanceMutation = useMutation(
    ({ id, amount, type }) => api.post(`/users/${id}/balance`, { amount: type === "add" ? Math.abs(amount) : -Math.abs(amount) }),
    {
      onSuccess: () => {
        qc.invalidateQueries("users");
        toast.success("✅ موجودی به‌روز شد.");
        setSelectedUser(null); setBalanceAmount(""); setBalanceType("add");
      },
      onError: (e) => toast.error(e.response?.data?.detail || "خطا")
    }
  );

  const handleSearch = (e) => { e.preventDefault(); setSearch(searchInput); setPage(1); };

  return (
    <div>
      <div className="flex justify-between items-center mb-6" style={{ flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: "1.3rem", fontWeight: 700 }}>👥 کاربران
          <span style={{ fontSize: "0.9rem", color: "#64748b", fontWeight: 400, marginRight: 8 }}>({total.toLocaleString("fa-IR")} نفر)</span>
        </h2>
      </div>

      <div className="card mb-4">
        <form onSubmit={handleSearch} style={{ display: "flex", gap: 8 }}>
          <div className="search-box" style={{ flex: 1 }}>
            <input placeholder="جستجو با نام یا یوزرنیم..." value={searchInput} onChange={e => setSearchInput(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary">🔍 جستجو</button>
          {search && <button type="button" className="btn btn-ghost" onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}>✕</button>}
        </form>
      </div>

      {isLoading ? (
        <div className="loading">⏳ در حال بارگذاری...</div>
      ) : users.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="icon">👥</div><p>کاربری یافت نشد</p></div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {users.map(u => (
            <UserCard
              key={u.id}
              user={u}
              onBalance={setSelectedUser}
              onBan={(id) => { if (window.confirm("بن کردن کاربر؟")) banMutation.mutate(id); }}
              onUnban={(id) => unbanMutation.mutate(id)}
            />
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button className="page-btn" disabled={page === 1} onClick={() => setPage(p => p-1)}>قبلی</button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
            const p = page <= 3 ? i+1 : page-2+i;
            if (p < 1 || p > totalPages) return null;
            return <button key={p} className={`page-btn ${p===page?"active":""}`} onClick={() => setPage(p)}>{p}</button>;
          })}
          <button className="page-btn" disabled={page === totalPages} onClick={() => setPage(p => p+1)}>بعدی</button>
        </div>
      )}

      {selectedUser && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setSelectedUser(null)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <Avatar name={selectedUser.full_name || selectedUser.username} size={52} />
              <div>
                <h3 style={{ fontWeight: 700, fontSize: "1.05rem" }}>{selectedUser.full_name}</h3>
                <p style={{ fontSize: "0.82rem", color: "#64748b" }}>موجودی: <strong style={{ color: "#22c55e" }}>${selectedUser.balance || 0}</strong></p>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">نوع عملیات</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className={`btn btn-sm ${balanceType === "add" ? "btn-success" : "btn-ghost"}`}
                  style={{ flex: 1 }}
                  onClick={() => setBalanceType("add")}
                >+ افزودن</button>
                <button
                  className={`btn btn-sm ${balanceType === "sub" ? "btn-danger" : "btn-ghost"}`}
                  style={{ flex: 1 }}
                  onClick={() => setBalanceType("sub")}
                >− کسر</button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">مبلغ ($)</label>
              <input
                className="form-control"
                type="number"
                min="0"
                step="0.01"
                placeholder="مثلاً ۱۰"
                value={balanceAmount}
                onChange={e => setBalanceAmount(e.target.value)}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setSelectedUser(null)}>انصراف</button>
              <button
                className={`btn ${balanceType === "add" ? "btn-success" : "btn-danger"}`}
                style={balanceType === "sub" ? { background: "#ef4444", color: "white" } : {}}
                onClick={() => balanceMutation.mutate({ id: selectedUser.id, amount: parseFloat(balanceAmount), type: balanceType })}
                disabled={!balanceAmount || balanceMutation.isLoading}
              >
                {balanceMutation.isLoading ? "در حال ارسال..." : "✅ تأیید"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
