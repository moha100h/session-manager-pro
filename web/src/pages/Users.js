import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

export default function Users() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [balanceAmount, setBalanceAmount] = useState("");

  const { data, isLoading } = useQuery(
    ["users", search],
    () => api.get(`/users/${search ? `?search=${search}` : ""}`).then(r => r.data),
    { keepPreviousData: true }
  );

  const banMutation = useMutation(
    ({ id, reason }) => api.post(`/users/${id}/ban`, null, { params: { reason } }),
    { onSuccess: () => { qc.invalidateQueries("users"); toast.success("کاربر بن شد."); } }
  );

  const unbanMutation = useMutation(
    (id) => api.post(`/users/${id}/unban`),
    { onSuccess: () => { qc.invalidateQueries("users"); toast.success("کاربر آنبن شد."); } }
  );

  const balanceMutation = useMutation(
    ({ id, amount }) => api.post(`/users/${id}/balance`, { amount }),
    { onSuccess: () => { qc.invalidateQueries("users"); toast.success("موجودی شارژ شد."); setSelectedUser(null); setBalanceAmount(""); } }
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 style={{ fontSize: "1.4rem", fontWeight: 700 }}>👥 مدیریت کاربران</h2>
      </div>

      <div className="card mb-4">
        <input className="input" placeholder="🔍 جستجو با نام یا یوزرنیم..." value={search} onChange={e => setSearch(e.target.value)} style={{ maxWidth: 300 }} />
      </div>

      <div className="card">
        {isLoading ? <div className="loading">⏳ در حال بارگذاری...</div> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>کاربر</th>
                  <th>آیدی تلگرام</th>
                  <th>موجودی</th>
                  <th>کل خرید</th>
                  <th>وضعیت</th>
                  <th>تاریخ عضویت</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {(data || []).map(u => (
                  <tr key={u.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{u.full_name}</div>
                      <div className="text-sm text-light">@{u.username || "—"}</div>
                    </td>
                    <td><code style={{ fontSize: "0.82rem" }}>{u.id}</code></td>
                    <td><strong style={{ color: "#22c55e" }}>${u.balance || 0}</strong></td>
                    <td className="text-sm text-light">${u.total_spent || 0}</td>
                    <td>{u.is_banned ? <span className="badge badge-error">🚫 بن</span> : <span className="badge badge-active">✅ فعال</span>}</td>
                    <td className="text-sm text-light">{new Date(u.created_at).toLocaleDateString("fa-IR")}</td>
                    <td>
                      <div className="flex gap-2">
                        <button className="btn btn-success btn-sm" onClick={() => setSelectedUser(u)}>💰 شارژ</button>
                        {u.is_banned
                          ? <button className="btn btn-primary btn-sm" onClick={() => unbanMutation.mutate(u.id)}>آنبن</button>
                          : <button className="btn btn-danger btn-sm" onClick={() => { const r = prompt("دلیل بن:"); if (r !== null) banMutation.mutate({ id: u.id, reason: r }); }}>🚫 بن</button>
                        }
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!(data || []).length && <div className="loading">📭 کاربری یافت نشد.</div>}
          </div>
        )}
      </div>

      {selectedUser && (
        <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>💰 شارژ موجودی — {selectedUser.full_name}</h3>
            <p className="text-sm text-light mb-4">موجودی فعلی: <strong>${selectedUser.balance || 0}</strong></p>
            <div className="form-group">
              <label>مبلغ (دلار)</label>
              <input className="input" type="number" placeholder="50" min="0.01" step="0.01" value={balanceAmount} onChange={e => setBalanceAmount(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn" onClick={() => setSelectedUser(null)}>انصراف</button>
              <button className="btn btn-primary" onClick={() => balanceMutation.mutate({ id: selectedUser.id, amount: parseFloat(balanceAmount) })} disabled={balanceMutation.isLoading || !balanceAmount}>
                {balanceMutation.isLoading ? "در حال شارژ..." : "شارژ موجودی"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
