import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "react-query";
import api from "../api";
import toast from "react-hot-toast";

const orderStatusBadge = {
  pending: <span className="badge badge-gray">⏳ در انتظار</span>,
  confirming: <span className="badge badge-warning">🔍 در حال بررسی</span>,
  confirmed: <span className="badge badge-active">✅ تأیید شده</span>,
  rejected: <span className="badge badge-error">❌ رد شده</span>,
  expired: <span className="badge badge-gray">⌛ منقضی</span>,
};

export default function Orders() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("confirming");
  const [rejectNote, setRejectNote] = useState("");
  const [rejectingId, setRejectingId] = useState(null);

  const { data, isLoading } = useQuery(
    ["orders", statusFilter],
    () => api.get(`/orders/${statusFilter ? `?status=${statusFilter}` : ""}`).then(r => r.data),
    { refetchInterval: 15000 }
  );

  const confirmMutation = useMutation(
    (id) => api.post(`/orders/${id}/confirm`, {}),
    { onSuccess: () => { qc.invalidateQueries("orders"); toast.success("سفارش تأیید شد و موجودی شارژ شد."); } }
  );

  const rejectMutation = useMutation(
    ({ id, note }) => api.post(`/orders/${id}/reject`, { admin_note: note }),
    { onSuccess: () => { qc.invalidateQueries("orders"); toast.success("سفارش رد شد."); setRejectingId(null); setRejectNote(""); } }
  );

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <h2 style={{ fontSize: "1.4rem", fontWeight: 700 }}>💰 مدیریت سفارشات</h2>
      </div>

      <div className="card mb-4">
        <div className="flex gap-3">
          <select className="input" value={statusFilter} onChange={e => setStatusFilter(e.target.value)} style={{ maxWidth: 200 }}>
            <option value="">همه</option>
            <option value="confirming">🔍 در حال بررسی</option>
            <option value="pending">⏳ در انتظار</option>
            <option value="confirmed">✅ تأیید شده</option>
            <option value="rejected">❌ رد شده</option>
          </select>
        </div>
      </div>

      <div className="card">
        {isLoading ? <div className="loading">⏳ در حال بارگذاری...</div> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>کاربر</th>
                  <th>مبلغ</th>
                  <th>ارز</th>
                  <th>مقدار کریپتو</th>
                  <th>هش تراکنش</th>
                  <th>وضعیت</th>
                  <th>تاریخ</th>
                  <th>عملیات</th>
                </tr>
              </thead>
              <tbody>
                {(data || []).map(o => (
                  <tr key={o.id}>
                    <td>
                      <div>{o.full_name || "—"}</div>
                      <div className="text-sm text-light">@{o.username || "—"}</div>
                    </td>
                    <td><strong>${o.amount}</strong></td>
                    <td><span className="badge badge-info">{o.currency}</span></td>
                    <td className="text-sm">{o.amount_crypto} {o.currency}</td>
                    <td>
                      {o.tx_hash ? <code style={{ fontSize: "0.75rem" }}>{o.tx_hash.slice(0, 16)}...</code> : <span className="text-light">—</span>}
                    </td>
                    <td>{orderStatusBadge[o.status] || o.status}</td>
                    <td className="text-sm text-light">{new Date(o.created_at).toLocaleString("fa-IR")}</td>
                    <td>
                      {o.status === "confirming" && (
                        <div className="flex gap-2">
                          <button className="btn btn-success btn-sm" onClick={() => { if (window.confirm("تأیید شود؟")) confirmMutation.mutate(o.id); }}>✅ تأیید</button>
                          <button className="btn btn-danger btn-sm" onClick={() => setRejectingId(o.id)}>❌ رد</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!(data || []).length && <div className="loading">📭 سفارشی یافت نشد.</div>}
          </div>
        )}
      </div>

      {rejectingId && (
        <div className="modal-overlay" onClick={() => setRejectingId(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h3>❌ رد سفارش</h3>
            <div className="form-group">
              <label>دلیل رد</label>
              <textarea className="input" rows={3} placeholder="دلیل رد سفارش را بنویسید..." value={rejectNote} onChange={e => setRejectNote(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <button className="btn" onClick={() => setRejectingId(null)}>انصراف</button>
              <button className="btn btn-danger" onClick={() => rejectMutation.mutate({ id: rejectingId, note: rejectNote })} disabled={rejectMutation.isLoading}>رد سفارش</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
