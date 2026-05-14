import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "react-query";
import { Toaster } from "react-hot-toast";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Sessions from "./pages/Sessions";
import Tasks from "./pages/Tasks";
import Orders from "./pages/Orders";
import Users from "./pages/Users";
import Proxies from "./pages/Proxies";
import Settings from "./pages/Settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      onError: (err) => {
        if (err?.response?.status === 401) {
          localStorage.removeItem("admin_token");
          window.location.href = "/login";
        }
      }
    }
  }
});

function RequireAuth({ children }) {
  const token = localStorage.getItem("admin_token");
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    console.error("ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: "100vh", display: "flex", alignItems: "center",
          justifyContent: "center", background: "#f1f5f9", padding: 24
        }}>
          <div style={{
            background: "white", borderRadius: 18, padding: 40,
            maxWidth: 480, width: "100%", textAlign: "center",
            boxShadow: "0 8px 32px rgba(0,0,0,0.1)"
          }}>
            <div style={{ fontSize: "3.5rem", marginBottom: 16 }}>⚠️</div>
            <h2 style={{ fontSize: "1.2rem", fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>
              خطایی رخ داد
            </h2>
            <p style={{ fontSize: "0.88rem", color: "#64748b", marginBottom: 24 }}>
              {this.state.error?.message || "یک خطای غیرمنتظره رخ داد."}
            </p>
            <button
              onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
              style={{
                background: "#6366f1", color: "white", border: "none",
                borderRadius: 10, padding: "10px 24px", cursor: "pointer",
                fontFamily: "inherit", fontSize: "0.9rem", fontWeight: 600
              }}
            >
              🔄 بارگذاری مجدد
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ErrorBoundary>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
              <Route index element={<ErrorBoundary><Dashboard /></ErrorBoundary>} />
              <Route path="sessions" element={<ErrorBoundary><Sessions /></ErrorBoundary>} />
              <Route path="tasks" element={<ErrorBoundary><Tasks /></ErrorBoundary>} />
              <Route path="orders" element={<ErrorBoundary><Orders /></ErrorBoundary>} />
              <Route path="users" element={<ErrorBoundary><Users /></ErrorBoundary>} />
              <Route path="proxies" element={<ErrorBoundary><Proxies /></ErrorBoundary>} />
              <Route path="settings" element={<ErrorBoundary><Settings /></ErrorBoundary>} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </ErrorBoundary>
      </BrowserRouter>
      <Toaster
        position="bottom-left"
        toastOptions={{
          style: { fontFamily: "Vazirmatn, sans-serif", fontSize: "0.9rem", direction: "rtl" },
          success: { iconTheme: { primary: "#22c55e", secondary: "white" } },
          error: { iconTheme: { primary: "#ef4444", secondary: "white" } },
          duration: 3500
        }}
      />
    </QueryClientProvider>
  );
}
