import axios from "axios";

const BASE_URL = process.env.REACT_APP_API_URL || "";

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

// ── Request interceptor: اضافه کردن token ─────────────────
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("admin_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// ── Response interceptor: مدیریت 401 ──────────────────────
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("admin_token");
      window.location.href = "/login";
    }
    return Promise.reject(error);
  }
);

// ── Auth ───────────────────────────────────────────────────
export const login = (username, password) =>
  api.post("/api/auth/admin/login", { username, password });

export const getMe = () => api.get("/api/auth/me");

// ── Dashboard ──────────────────────────────────────────────
export const getDashboard = () => api.get("/api/stats/dashboard");
export const getSessionHistory = (days = 7) =>
  api.get(`/api/stats/sessions/history?days=${days}`);
export const getTaskHistory = (days = 7) =>
  api.get(`/api/stats/tasks/history?days=${days}`);
export const getOrderHistory = (days = 30) =>
  api.get(`/api/stats/orders/history?days=${days}`);

// ── Sessions ───────────────────────────────────────────────
export const getSessions = (params = {}) =>
  api.get("/api/sessions/", { params });
export const getSessionStats = () => api.get("/api/sessions/stats");
export const getSession = (id) => api.get(`/api/sessions/${id}`);
export const createSession = (data) => api.post("/api/sessions/", data);
export const deleteSession = (id) => api.delete(`/api/sessions/${id}`);
export const deleteLoggedOut = () => api.delete("/api/sessions/logged-out");
export const bulkImportSessions = (data) =>
  api.post("/api/sessions/bulk", data);

// ── Tasks ──────────────────────────────────────────────────
export const getTasks = (params = {}) => api.get("/api/tasks/", { params });
export const getTask = (id) => api.get(`/api/tasks/${id}`);
export const getTaskSessions = (id) => api.get(`/api/tasks/${id}/sessions`);
export const createJoinTask = (data) => api.post("/api/tasks/join", data);
export const cancelTask = (id) => api.post(`/api/tasks/${id}/cancel`);
export const pauseTask = (id) => api.post(`/api/tasks/${id}/pause`);
export const resumeTask = (id) => api.post(`/api/tasks/${id}/resume`);

// ── Orders ─────────────────────────────────────────────────
export const getOrders = (params = {}) => api.get("/api/orders/", { params });
export const getOrder = (id) => api.get(`/api/orders/${id}`);
export const confirmOrder = (id) => api.post(`/api/orders/${id}/confirm`);
export const rejectOrder = (id, note) =>
  api.post(`/api/orders/${id}/reject`, { admin_note: note });

// ── Users ──────────────────────────────────────────────────
export const getUsers = (params = {}) => api.get("/api/users/", { params });
export const getUser = (id) => api.get(`/api/users/${id}`);
export const banUser = (id, reason) =>
  api.post(`/api/users/${id}/ban`, { reason });
export const unbanUser = (id) => api.post(`/api/users/${id}/unban`);
export const addBalance = (id, amount) =>
  api.post(`/api/users/${id}/balance`, { amount });

// ── Proxies ────────────────────────────────────────────────
export const getProxies = (params = {}) =>
  api.get("/api/proxies/", { params });
export const createProxy = (data) => api.post("/api/proxies/", data);
export const bulkAddProxies = (proxies) =>
  api.post("/api/proxies/bulk", { proxies });
export const deleteProxy = (id) => api.delete(`/api/proxies/${id}`);
export const toggleProxy = (id) => api.post(`/api/proxies/${id}/toggle`);

// ── Settings ───────────────────────────────────────────────
export const getSettings = () => api.get("/api/settings/");
export const updateSetting = (key, value) =>
  api.put(`/api/settings/${key}`, { value: String(value) });

// ── Plans ──────────────────────────────────────────────────
export const getPlans = () => api.get("/api/settings/plans");
export const createPlan = (data) => api.post("/api/settings/plans", data);
export const updatePlan = (id, data) =>
  api.put(`/api/settings/plans/${id}`, data);
export const deletePlan = (id) => api.delete(`/api/settings/plans/${id}`);

// ── Discounts ──────────────────────────────────────────────
export const getDiscounts = () => api.get("/api/settings/discounts");
export const createDiscount = (data) =>
  api.post("/api/settings/discounts", data);
export const deleteDiscount = (id) =>
  api.delete(`/api/settings/discounts/${id}`);

export default api;
