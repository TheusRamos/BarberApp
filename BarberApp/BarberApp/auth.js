import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyBmWNHnYemnft_N542e9wa_1jRZeqCc5zE",
  authDomain: "barbearia-7387c.firebaseapp.com",
  projectId: "barbearia-7387c",
  storageBucket: "barbearia-7387c.firebasestorage.app",
  messagingSenderId: "16693210556",
  appId: "1:16693210556:web:3510e53c285b3dc257cfb9",
  measurementId: "G-WXJJ75FC11"
};

const firebaseApp = initializeApp(firebaseConfig);
const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const googleProvider = new GoogleAuthProvider();

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const shouldLogout = params.get("logout") === "1";

let pendingPhotoBase64 = null;

// ============================================================
// TOAST
// ============================================================

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

// ============================================================
// FIELD ERRORS
// ============================================================

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

// ============================================================
// VALIDATION
// ============================================================

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
    "auth/network-request-failed": "Falha de conexão. Verifique sua internet.",
    "auth/operation-not-allowed": "Login por e-mail não está ativado no Firebase Console.",
    "auth/too-many-requests": "Muitas tentativas. Aguarde alguns minutos e tente novamente.",
    "auth/user-disabled": "Esta conta foi desativada.",
    "auth/popup-closed-by-user": "Login cancelado.",
    "auth/popup-blocked": "Pop-up bloqueado pelo navegador. Permita pop-ups e tente novamente.",
    "auth/cancelled-popup-request": "Login cancelado.",
    "auth/account-exists-with-different-credential": "Este e-mail já está cadastrado com outro método de login.",
    "permission-denied": "Sem permissão para salvar os dados. Verifique as regras do Firestore.",
    "unavailable": "Serviço temporariamente indisponível. Tente novamente."
  };
  return map[code] || `Erro inesperado (${code || "desconhecido"}). Tente novamente.`;
}

// ============================================================
// AUTH PANEL TABS
// ============================================================

function showLogin() {
  clearAllErrors();
  $("login-form")?.classList.remove("hidden");
  $("register-form")?.classList.add("hidden");
  $("tab-login")?.classList.replace("ghost-btn", "secondary-btn");
  $("tab-register")?.classList.replace("secondary-btn", "ghost-btn");
}

function showRegister() {
  clearAllErrors();
  $("register-form")?.classList.remove("hidden");
  $("login-form")?.classList.add("hidden");
  $("tab-register")?.classList.replace("ghost-btn", "secondary-btn");
  $("tab-login")?.classList.replace("secondary-btn", "ghost-btn");
}

// ============================================================
// PANEL VISIBILITY
// ============================================================

function showLoggedPanel(user, userDoc = null) {
  $("auth-panel")?.classList.add("hidden");
  $("logged-panel")?.classList.remove("hidden");

  const title = $("auth-title");
  const subtitle = $("auth-subtitle");
  if (title) title.textContent = "Meu Perfil";
  if (subtitle) subtitle.textContent = "Gerencie suas informações pessoais.";

  // Hide auth-only elements (google btn, divider, auth-footer)
  document.querySelector(".auth-divider")?.classList.add("hidden");
  $("google-sign-in")?.classList.add("hidden");
  document.querySelector(".auth-footer")?.classList.add("hidden");

  populateProfileForm(user, userDoc);
}

function showAuthPanel() {
  $("auth-panel")?.classList.remove("hidden");
  $("logged-panel")?.classList.add("hidden");

  const title = $("auth-title");
  const subtitle = $("auth-subtitle");
  if (title) title.textContent = "Acessar conta";
  if (subtitle) subtitle.textContent = "Faça login ou crie um novo cadastro.";

  document.querySelector(".auth-divider")?.classList.remove("hidden");
  $("google-sign-in")?.classList.remove("hidden");
  document.querySelector(".auth-footer")?.classList.remove("hidden");
}

// ============================================================
// PROFILE – POPULATE
// ============================================================

function populateProfileForm(user, userDoc) {
  const name = userDoc?.name || user?.displayName || "";
  const phone = userDoc?.phone || "";
  const email = user?.email || "";
  const photoURL = userDoc?.photoURL || user?.photoURL || "";

  const nameInput = $("profile-name");
  const phoneInput = $("profile-phone");
  const emailField = $("profile-email-field");
  const nameDisplay = $("profile-name-display");
  const emailDisplay = $("profile-email-display");
  const avatarInitial = $("avatar-initial");
  const avatarImg = $("avatar-img");

  if (nameInput) nameInput.value = name;
  if (phoneInput) phoneInput.value = phone;
  if (emailField) emailField.value = email;
  if (nameDisplay) nameDisplay.textContent = name || "Usuário";
  if (emailDisplay) emailDisplay.textContent = email;
  if (avatarInitial) avatarInitial.textContent = (name.charAt(0) || "?").toUpperCase();

  if (photoURL && avatarImg) {
    avatarImg.src = photoURL;
    avatarImg.classList.add("visible");
    if (avatarInitial) avatarInitial.style.display = "none";
  } else {
    if (avatarImg) avatarImg.classList.remove("visible");
    if (avatarInitial) avatarInitial.style.display = "";
  }
}

// ============================================================
// PROFILE – PHOTO UPLOAD
// ============================================================

function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  if (!file.type.startsWith("image/")) {
    showToast("Selecione um arquivo de imagem válido.");
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    showToast("A imagem deve ter no máximo 5 MB.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      const SIZE = 180;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");

      const side = Math.min(img.width, img.height);
      const sx = (img.width - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);

      pendingPhotoBase64 = canvas.toDataURL("image/jpeg", 0.82);

      const avatarImg = $("avatar-img");
      const avatarInitial = $("avatar-initial");
      if (avatarImg) {
        avatarImg.src = pendingPhotoBase64;
        avatarImg.classList.add("visible");
      }
      if (avatarInitial) avatarInitial.style.display = "none";

      showToast("Foto selecionada. Clique em Salvar para confirmar.");
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ============================================================
// PROFILE – SAVE
// ============================================================

async function handleProfileSave(event) {
  event.preventDefault();
  clearAllErrors();

  const name = ($("profile-name")?.value || "").trim();
  const phone = ($("profile-phone")?.value || "").trim();

  if (name.length < 3) {
    setError("profile-name", "Informe um nome válido (mínimo 3 caracteres).");
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    showToast("Sessão expirada. Faça login novamente.");
    return;
  }

  const saveBtn = $("profile-save-btn");
  if (saveBtn) saveBtn.disabled = true;

  try {
    const profileUpdate = { displayName: name };
    if (pendingPhotoBase64) profileUpdate.photoURL = pendingPhotoBase64;
    await updateProfile(user, profileUpdate);

    const firestoreData = { name, phone, updatedAt: serverTimestamp() };
    if (pendingPhotoBase64) firestoreData.photoURL = pendingPhotoBase64;
    await setDoc(doc(db, "users", user.uid), firestoreData, { merge: true });

    const nameDisplay = $("profile-name-display");
    if (nameDisplay) nameDisplay.textContent = name;

    pendingPhotoBase64 = null;
    showToast("Perfil atualizado com sucesso!");
  } catch (error) {
    console.error("Erro ao salvar perfil:", error);
    showToast("Erro ao salvar perfil. Tente novamente.");
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

// ============================================================
// AUTH HANDLERS
// ============================================================

async function handleLogin(event) {
  event.preventDefault();
  clearAllErrors();

  const email = ($("login-email")?.value || "").trim();
  const password = $("login-password")?.value || "";

  let valid = true;
  if (!isValidEmail(email)) { setError("login-email", "Informe um email válido."); valid = false; }
  if (!password)            { setError("login-password", "Informe sua senha."); valid = false; }
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

  const name     = ($("register-name")?.value || "").trim();
  const email    = ($("register-email")?.value || "").trim();
  const phone    = ($("register-phone")?.value || "").trim();
  const password = $("register-password")?.value || "";
  const confirm  = $("register-password-confirm")?.value || "";

  let valid = true;
  if (name.length < 3)                                { setError("register-name", "Informe um nome válido."); valid = false; }
  if (!isValidEmail(email))                           { setError("register-email", "Informe um email válido."); valid = false; }
  if (!phone || phone.replace(/\D/g, "").length < 10) { setError("register-phone", "Informe um telefone válido com DDD."); valid = false; }
  if (password.length < 6)                            { setError("register-password", "A senha precisa ter pelo menos 6 caracteres."); valid = false; }
  if (password !== confirm)                           { setError("register-password-confirm", "As senhas não coincidem."); valid = false; }
  if (!valid) return;

  let credential = null;
  try {
    credential = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(credential.user, { displayName: name });
  } catch (authError) {
    console.error("Erro de autenticação:", authError);
    showToast(translateFirebaseError(authError));
    return;
  }

  try {
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
  } catch (firestoreError) {
    console.error("Erro ao salvar perfil no Firestore:", firestoreError);
    showToast(translateFirebaseError(firestoreError));
  }
}

async function handleGoogleSignIn() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;

    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (!userSnap.exists()) {
      await setDoc(doc(db, "users", user.uid), {
        name: user.displayName || "Usuário Google",
        email: user.email || "",
        phone: "",
        role: "client",
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
    }

    showToast("Login realizado com sucesso.");
    setTimeout(() => (window.location.href = "index.html"), 650);
  } catch (error) {
    if (error.code === "auth/popup-closed-by-user" || error.code === "auth/cancelled-popup-request") return;
    console.error("Erro no login com Google:", error);
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

// ============================================================
// FIRESTORE USER DOC
// ============================================================

async function readUserDoc(user) {
  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    return userSnap.exists() ? userSnap.data() : null;
  } catch (error) {
    console.warn("Não foi possível ler o documento do usuário.", error);
    return null;
  }
}

// ============================================================
// INIT
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  $("tab-login")?.addEventListener("click", showLogin);
  $("tab-register")?.addEventListener("click", showRegister);
  $("login-form")?.addEventListener("submit", handleLogin);
  $("register-form")?.addEventListener("submit", handleRegister);
  $("logout-btn")?.addEventListener("click", handleLogout);
  $("google-sign-in")?.addEventListener("click", handleGoogleSignIn);
  $("profile-form")?.addEventListener("submit", handleProfileSave);
  $("photo-upload")?.addEventListener("change", handlePhotoUpload);

  document.querySelectorAll("input").forEach(input => {
    input.addEventListener("input", () => {
      const id = input.id;
      if (id) clearError(id);
    });
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
