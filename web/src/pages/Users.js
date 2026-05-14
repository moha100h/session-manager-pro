import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const AVATAR_COLORS = ["#6366f1","#8b5cf6","#06b6d4","#22c55e","#f59e0b","#ef4444"];
function avatarColor(name) { return AVATAR_COLORS[(name||"?").charCodeAt(0) % AVATAR_COLORS.length]; }

function Avatar({ name, size=40 }) {
  const c = avatarColor(name);
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%", flexShrink: 0,
      background: `linear-gradient(135deg,${c},${c}99)`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: "white", fontWeight: 700, fontSize: size * 0.38,
      boxShadow: `0 2px 8px ${c}40`
    }}>
      {(name||"?")[0].toUpperCase()}
    </div>
  );
}

export default function Users() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [page, setPage] = useState(1);
  const [selUser, setSelUser] = useState(null);
  const [balAmt, setBalAmt] = useState("");
  const [balType, setBalType] = useState("add");

  const { data, isLoading } = useQuery(
    ["users", search, page],
    () => {
      const p = new URLSearchParams();
      if (search) p.set("search", search);
      p.set("page", page); p.set("limit", 20);
      return api.get(`/users/?${p}`).then(r => r.data);
    },
    { keepPreviousData: true, refetchInterval: 20000 }
  );

  const users = Array.isArray(data) ? data : (Array.isArray(data?.users) ? data.users : []);
  const total = data?.total || users.length;
  const totalPages = Math.max(1, Math.ceil(total / 20));

  const banM = useMutation(id => api.post(`/users/${id}/ban`),
    { onSuccess: () => { qc.invalidateQueries("users"); toast.success("کاربر بن شد."); } });
  const unbanM = useMutation(id => api.post(`/users/${id}/unban`),
    { onSuccess: () => { qc.invalidateQueries("users"); toast.success("کاربر آنبن شد."); } });
  const balM = useMutation(
    ({ id, amount, type }) => api.post(`/users/${id}/balance`, { amount: type === "add" ? Math.abs(amount) : -Math.abs(amount) }),
    { onSuccess: () => { qc.invalidateQueries("users"); toast.success("✅ موجودی بروز شد."); setSelUser(null); setBalAmt(""); setBalType("add"); }, onError: e => toast.error(e.response?.data?.detail || "خطا") }
  );

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
        <h2 style={{ fontSize: "1.3rem", fontWeight: 800 }}>
          👥 کاربران
          <span style={{ fontSize: "0.85rem", color: "var(--text-3)", fontWeight: 400, marginRight: 8 }}>({total.toLocaleString("fa-IR")} نفر)</span>
        </h2>
      </div>

      <div className="card">
        <form onSubmit={e => { e.preventDefault(); setSearch(searchInput); setPage(1); }} style={{ display: "flex", gap: 8 }}>
          <div className="search-box" style={{ flex: 1 }}>
            <input placeholder="جستجو با نام یا یوزرنیم..." value={searchInput} onChange={e => setSearchInput(e.target.value)} />
          </div>
          <button type="submit" className="btn btn-primary">🔍 جستجو</button>
          {search && <button type="button" className="btn btn-ghost" onClick={() => { setSearch(""); setSearchInput(""); setPage(1); }}>✕</button>}
        </form>
      </div>

      {isLoading ? (
        <div className="loading"><div className="loading-spinner" />در حال بارگذاری...</div>
      ) : users.length === 0 ? (
        <div className="card"><div className="empty-state"><div className="icon">👥</div><p>کاربری یافت نشد</p></div></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {users.map(u => (
            <div key={u.id} className="card" style={{ marginBottom: 0, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
              transition: "box-shadow 0.2s" }}
              onMouseEnter={e => e.currentTarget.style.boxShadow = "0 6px 20px rgba(0,0,0,0.1)"}
              onMouseLeave={e => e.currentTarget.style.boxShadow = ""}>
              <Avatar name={u.full_name || u.username} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.92rem" }}>{u.full_name || "—"}</span>
                  {u.username && <span style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>@{u.username}</span>}
                  {u.is_banned
                    ? <span className="badge badge-error">🚫 بن</span>
                    : <span className="badge badge-active">✅ فعال</span>}
                </div>
                <div style={{ display: "flex", gap: 14, marginTop: 5, flexWrap: "wrap" }}>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>
                    💰 موجودی: <strong style={{ color: "#22c55e" }}>${u.balance || 0}</strong>
                  </span>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>
                    💳 خرج: <strong>${u.total_spent || 0}</strong>
                  </span>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-3)" }}>
                    📅 {u.created_at ? new Date(u.created_at).toLocaleDateString("fa-IR") : "—"}
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6", flexWrap: "wrap" }}>
                <button className="btn btn-success btn-sm" onClick={() => { setSelUser(u); setBalAmt(""); setBalType("add"); }}>💰 شارژ</button>
                {u.is_banned
                  ? <button className="btn btn-primary btn-sm" onClick={() => unbanM.mutate(u.id)}>🔓 آنبن</button>
                  : <button className="btn btn-danger btn-sm" onClick={() => { if(window.confirm("بن کردن کاربر؟")) banM.mutate(u.id); }}>🚫 بن</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="pagination">
          <button className="page-btn" disabled={page===1} onClick={() => setPage(p=>p-1)}>قبلی</button>
          {Array.from({length: Math.min(5,totalPages)},(_,i)=>{
            const p = page<=3?i+1:page-2+i;
            if(p<1||p>totalPages) return null;
            return <button key={p} className={`page-btn ${p===page?"active":""}`} onClick={()=>setPage(p)}>{p}</button>;
          })}
          <button className="page-btn" disabled={page===totalPages} onClick={() => setPage(p=>p+1)}>بعدی</button>
        </div>
      )}

      {selUser && (
        <div className="modal-backdrop" onClick={e => e.target===e.currentTarget && setSelUser(null)}>
          <div className="modal" style={{ maxWidth: 380 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
              <Avatar name={selUser.full_name || selUser.username} size={50} />
              <div>
                <h3 style={{ fontWeight: 700 }}>{selUser.full_name}</h3>
                <p style={{ fontSize: "0.82rem", color: "var(--text-3)" }}>موجودی: <strong style={{ color: "#22c55e" }}>${selUser.balance || 0}</strong></p>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">نوع عملیات</label>
              <div style={{ display: "flex", gap: 8 }}>
                <button className={`btn btn-sm ${balType==="add"?"btn-success":"btn-ghost"}`} style={{ flex: 1 }} onClick={() => setBalType("add")}>+ افزودن</button>
                <button className={`btn btn-sm ${balType==="sub"?"btn-danger":"btn-ghost"}`} style={{ flex: 1 }} onClick={() => setBalType("sub")}>− کسر</button>
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">مبلغ ($)</label>
              <input className="form-control" type="number" min="0" step="0.01" placeholder="مثلاً ۱۰" value={balAmt} onChange={e => setBalAmt(e.target.value)} autoFocus />
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setSelUser(null)}>انصراف</button>
              <button className={`btn ${balType==="add"?"btn-success":"btn-danger"}`}
                onClick={() => balM.mutate({ id: selUser.id, amount: parseFloat(balAmt), type: balType })}
                disabled={!balAmt || balM.isLoading}>
                {balM.isLoading ? "در حال ارسال..." : "✅ تأیید"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
