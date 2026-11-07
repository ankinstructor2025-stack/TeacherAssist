import { signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { initializeAuth } from "./firebase-config.js";
import { loadSession, showError } from "./common.js";

const button = document.getElementById("loginButton");
try {
  const { auth, provider } = await initializeAuth();
  button.disabled = false;
  button.addEventListener("click", async () => {
    button.disabled = true;
    button.textContent = "ログインしています…";
    document.getElementById("error").textContent = "";
    try {
      const { user } = await signInWithPopup(auth, provider);
      await loadSession(user);
      window.location.replace("./html/home.html");
    } catch (error) {
      await signOut(auth).catch(() => {});
      showError(error);
    } finally {
      button.disabled = false;
      button.textContent = "Googleでログイン";
    }
  });
} catch (error) {
  showError(error);
}
