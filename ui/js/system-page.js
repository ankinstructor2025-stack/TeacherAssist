import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeAuth } from "./firebase-config.js";
import { loadSession, showError } from "./common.js";
import { API_BASE_URL } from "./config.js";

export async function startSystemPage(onReady) {
  const el = id => document.getElementById(id);
  try {
    const { auth } = await initializeAuth();
    el("logoutButton").onclick = async () => {
      try { await signOut(auth); window.location.replace("../index.html"); } catch (error) { showError(error); }
    };
    onAuthStateChanged(auth, async user => {
      el("content").hidden = true;
      if (!user) { window.location.replace("../index.html"); return; }
      const isCurrent = () => auth.currentUser === user;
      async function request(path = "", settings = {}) {
        if (!isCurrent()) throw new Error("ログイン情報が変更されました。再読み込みしてください。");
        const response = await fetch(`${API_BASE_URL}/system/models${path}`, { ...settings, cache: "no-store", headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw Object.assign(new Error(typeof data.detail === "string" ? data.detail : "モデル情報を取得・保存できませんでした。"), { status: response.status });
        return data;
      }
      try {
        const session = await loadSession(user);
        if (!isCurrent()) return;
        if (!session.is_system_administrator) { window.location.replace("home.html"); return; }
        await onReady(request, isCurrent);
        if (!isCurrent()) return;
        el("status").textContent = "";
        el("content").hidden = false;
      } catch (error) {
        if (!isCurrent()) return;
        el("status").textContent = "モデル管理を表示できませんでした。";
        showError(error);
        if (error.status === 401 || error.status === 403) await signOut(auth).catch(() => {});
      }
    }, showError);
  } catch (error) { showError(error); }
}
