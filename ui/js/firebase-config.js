import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, GoogleAuthProvider, browserSessionPersistence, setPersistence } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { firebaseConfig } from "./config.js";

export async function initializeAuth() {
  if (Object.values(firebaseConfig).some(value => !value.trim())) {
    throw new Error("TeacherAssist専用Firebaseの設定を ui/js/config.js に入力してください。");
  }
  const auth = getAuth(initializeApp(firebaseConfig));
  await setPersistence(auth, browserSessionPersistence);
  return { auth, provider: new GoogleAuthProvider() };
}
