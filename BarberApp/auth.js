import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBvYcmsxGQYUWX-yNDTWDnvtq7XEy6Kqjc",
  authDomain: "sistemaagendamentos-df894.firebaseapp.com",
  projectId: "sistemaagendamentos-df894",
  storageBucket: "sistemaagendamentos-df894.firebasestorage.app",
  messagingSenderId: "797201253786",
  appId: "1:797201253786:web:cb02e86159ab3d2b9ea623",
  measurementId: "G-GYQP42ECBQ"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const shouldLogout = params.get("logout") === "1";

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function setError(fieldName, message) {
  const errorEl = $(`error-${fieldName}`);
  if (errorEl) errorEl.textContent = message;
}

function clearError(fieldName) {
  const errorEl = $(`error-${fieldName}`);
  if (errorEl) errorEl.textContent = "";
}

function clearAllErrors() {
  document.querySelectorAll(".field-error").forEach(el => (el.textContent = ""));
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function translateFirebaseError(error) {
  const code = error?.code || "";
  const map = {
    "auth/invalid-email": "Email inválido.",
    "auth/missing-password": "Informe a senha.",
    "auth/invalid-credential": "Email ou senha incorretos.",
    "auth/user-not-found": "Usuário não encontrado.",
    "auth/wrong-password": "Senha incorreta.",
    "auth/email-already-in-use": "Este email já está cadastrado.",
    "auth/weak-password": "A senha precisa ter pelo menos 6 caracteres.",
    "auth/network-request-failed": "Falha de conexão. Verifique sua internet."
  };
  return map[code] || "Não foi possível concluir a operação.";
}

function showLogin() {
  clearAllErrors();
  $("login-form")?.classList.remove("hidden");
  $("register-form")?.classList.add("hidden");
  $("tab-login")?.classList.add("secondary-btn");
  $("tab-login")?.classList.remove("ghost-btn");
  $("tab-register")?.classList.add("ghost-btn");
  $("tab-register")?.classList.remove("secondary-btn");
}

function showRegister() {
  clearAllErrors();
  $("register-form")?.classList.remove("hidden");
  $("login-form")?.classList.add("hidden");
  $("tab-register")?.classList.add("secondary-btn");
  $("tab-register")?.classList.remove("ghost-btn");
  $("tab-login")?.classList.add("ghost-btn");
  $("tab-login")?.classList.remove("secondary-btn");
}

function showLoggedPanel(user, userDoc = null) {
  const authPanel = $("auth-panel");
  const loggedPanel = $("logged-panel");
  const title = $("auth-title");
  const subtitle = $("auth-subtitle");
  const message = $("logged-message");

  authPanel?.classList.add("hidden");
  loggedPanel?.classList.remove("hidden");

  if (title) title.textContent = "Conta conectada";
  if (subtitle) subtitle.textContent = "Você já está autenticado no BarberApp.";
  if (message) {
    message.textContent = `${userDoc?.name || user.displayName || "Usuário"} • ${user.email || "email não informado"}`;
  }
}

function showAuthPanel() {
  const authPanel = $("auth-panel");
  const loggedPanel = $("logged-panel");
  const title = $("auth-title");
  const subtitle = $("auth-subtitle");

  authPanel?.classList.remove("hidden");
  loggedPanel?.classList.add("hidden");

  if (title) title.textContent = "Acessar conta";
  if (subtitle) subtitle.textContent = "Faça login ou crie um novo cadastro.";
}

async function handleLogin(event) {
  event.preventDefault();
  clearAllErrors();

  const email = ($("login-email")?.value || "").trim();
  const password = $("login-password")?.value || "";

  let valid = true;
  if (!isValidEmail(email)) {
    setError("login-email", "Informe um email válido.");
    valid = false;
  }
  if (!password) {
    setError("login-password", "Informe sua senha.");
    valid = false;
  }
  if (!valid) return;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    showToast("Login realizado com sucesso.");
    setTimeout(() => (window.location.href = "index.html"), 650);
  } catch (error) {
    console.error(error);
    showToast(translateFirebaseError(error));
  }
}

async function handleRegister(event) {
  event.preventDefault();
  clearAllErrors();

  const name = ($("register-name")?.value || "").trim();
  const email = ($("register-email")?.value || "").trim();
  const phone = ($("register-phone")?.value || "").trim();
  const password = $("register-password")?.value || "";
  const passwordConfirm = $("register-password-confirm")?.value || "";

  let valid = true;
  if (name.length < 3) {
    setError("register-name", "Informe um nome válido.");
    valid = false;
  }
  if (!isValidEmail(email)) {
    setError("register-email", "Informe um email válido.");
    valid = false;
  }
  if (phone && phone.replace(/\D/g, "").length < 10) {
    setError("register-phone", "Informe um telefone válido.");
    valid = false;
  }
  if (password.length < 6) {
    setError("register-password", "A senha precisa ter pelo menos 6 caracteres.");
    valid = false;
  }
  if (password !== passwordConfirm) {
    setError("register-password-confirm", "As senhas não coincidem.");
    valid = false;
  }
  if (!valid) return;

  try {
    const credential = await createUserWithEmailAndPassword(auth, email, password);

    await updateProfile(credential.user, { displayName: name });

    await setDoc(doc(db, "users", credential.user.uid), {
      name,
      email,
      phone,
      role: "client",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    showToast("Cadastro realizado com sucesso.");
    setTimeout(() => (window.location.href = "index.html"), 700);
  } catch (error) {
    console.error(error);
    showToast(translateFirebaseError(error));
  }
}

async function handleLogout() {
  try {
    await signOut(auth);
    showToast("Você saiu da conta.");
    setTimeout(() => (window.location.href = "auth.html"), 600);
  } catch (error) {
    console.error(error);
    showToast("Erro ao sair da conta.");
  }
}

async function readUserDoc(user) {
  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    return userSnap.exists() ? userSnap.data() : null;
  } catch (error) {
    console.warn("Não foi possível ler o documento do usuário.", error);
    return null;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  $("tab-login")?.addEventListener("click", showLogin);
  $("tab-register")?.addEventListener("click", showRegister);
  $("login-form")?.addEventListener("submit", handleLogin);
  $("register-form")?.addEventListener("submit", handleRegister);
  $("logout-btn")?.addEventListener("click", handleLogout);

  document.querySelectorAll("input").forEach(input => {
    input.addEventListener("input", () => clearError(input.id.replace("-", "-")));
  });

  onAuthStateChanged(auth, async user => {
    if (shouldLogout) {
      if (user) await handleLogout();
      else showAuthPanel();
      return;
    }

    if (user) {
      const userDoc = await readUserDoc(user);
      showLoggedPanel(user, userDoc);
    } else {
      showAuthPanel();
    }
  });
});
