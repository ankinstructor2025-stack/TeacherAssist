import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeAuth } from "./firebase-config.js";
import { loadSession, showError } from "./common.js";

const content = document.getElementById("content");
const status = document.getElementById("status");
try {
  const { auth } = await initializeAuth();
  document.getElementById("logoutButton").addEventListener("click", async () => {
    try {
      await signOut(auth);
      window.location.replace("../index.html");
    } catch (error) { showError(error); }
  });
  onAuthStateChanged(auth, async user => {
    content.hidden = true;
    if (!user) {
      window.location.replace("../index.html");
      return;
    }
    try {
      const session = await loadSession(user);
      if (auth.currentUser !== user) return;
      if (session.is_system_administrator) {
        window.location.replace("system_menu.html");
        return;
      }
      document.getElementById("userName").textContent = session.name || session.email;
      document.getElementById("userEmail").textContent = session.email;
      status.textContent = "";
      content.hidden = false;
    } catch (error) {
      if (error.status === 401 || error.status === 403) await signOut(auth).catch(() => {});
      status.textContent = "ログイン情報を確認できませんでした。";
      showError(error);
    }
  }, showError);
} catch (error) { showError(error); }
