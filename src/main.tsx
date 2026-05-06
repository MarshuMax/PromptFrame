import React from "react";
import ReactDOM from "react-dom/client";
import AdminApp from "./AdminApp";
import App from "./App";
import "./styles.css";

function isAdminPath(pathname: string, baseUrl: string) {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  const adminRoot = `${base}/admin`;
  return pathname === adminRoot || pathname.startsWith(`${adminRoot}/`);
}

const Root = isAdminPath(window.location.pathname, import.meta.env.BASE_URL) ? AdminApp : App;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>,
);
