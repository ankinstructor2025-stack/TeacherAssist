import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeAuth } from "./firebase-config.js";
import { loadSession, showError } from "./common.js";
import { API_BASE_URL } from "./config.js";
import { mountSchoolToolbar } from "./school-toolbar.js?v=20261108-5";

export async function startTeachingPage(title, toolbar, onReady, endpoint = "/teaching-assignments") {
  const el = id => document.getElementById(id);
  const updateToolbar = mountSchoolToolbar(title, toolbar);
  try {
    const { auth } = await initializeAuth();
    el("logoutButton").onclick = async () => {
      try { await signOut(auth); window.location.replace("../index.html"); } catch (error) { showError(error); }
    };
    onAuthStateChanged(auth, async user => {
      el("content").hidden = true;
      updateToolbar(null, "確認中…");
      if (!user) { window.location.replace("../index.html"); return; }
      const isCurrent = () => auth.currentUser === user;
      let profileLoaded = false;
      async function request(path, settings = {}) {
        const response = await fetch(`${API_BASE_URL}${path}`, { ...settings, cache: "no-store", headers: { Authorization: `Bearer ${await user.getIdToken()}`, "Content-Type": "application/json" } });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          const message = response.status === 404 && path === "/teaching-assignments"
            ? "担当科目のAPIが見つかりません。公開更新が完了してから再読み込みしてください。"
            : typeof data.detail === "string" ? data.detail : `${title}を取得・保存できませんでした。`;
          throw Object.assign(new Error(message), { status: response.status });
        }
        return data;
      }
      try {
        const session = await loadSession(user);
        if (!isCurrent()) return;
        if (session.is_system_administrator) { window.location.replace("system_menu.html"); return; }
        const { profile } = await request("/profile");
        if (!isCurrent()) return;
        updateToolbar(profile);
        profileLoaded = true;
        const data = await request(endpoint);
        if (!isCurrent()) return;
        updateToolbar(data.profile);
        await onReady(data, request, isCurrent);
        if (!isCurrent()) return;
        el("status").textContent = "";
        el("content").hidden = false;
      } catch (error) {
        if (!isCurrent()) return;
        if (!profileLoaded) updateToolbar(null, "取得できません");
        el("status").textContent = `${title}を表示できませんでした。`;
        showError(error);
        if (error.status === 401 || error.status === 403) await signOut(auth).catch(() => {});
      }
    }, showError);
  } catch (error) { showError(error); }
}
