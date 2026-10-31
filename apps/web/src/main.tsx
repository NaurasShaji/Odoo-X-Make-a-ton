import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

function App() {
  return (
    <main className="app-shell">
      <p className="eyebrow">Subscription Management Platform</p>
      <h1>NexBill</h1>
      <p className="subtitle">One platform. Every subscription. Every transaction. Fully connected.</p>
      <div className="status-card">
        <strong>Architecture foundation ready</strong>
        <span>React frontend · Express API · PostgreSQL · Redis/BullMQ</span>
      </div>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
