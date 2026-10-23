import { api, getToken, setToken } from "./api.js";

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const shouldLogout = params.get("logout") === "1";

let pendingPhotoBase64 = null;
let currentUser = null;

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

function translateApiError(error) {
  const code = error?.code || "";
  const map = {
    "INVALID_CREDENTIALS": "Email ou senha incorretos.",
    "USER_NOT_FOUND": "Usuário não encontrado.",
    "EMAIL_IN_USE": "Este email já está cadastrado.",
    "WEAK_PASSWORD": "A senha precisa ter pelo menos 8 caracteres.",
    "UNAUTHORIZED": "Sessão expirada. Faça login novamente.",
    "NETWORK_ERROR": "Falha de conexão. Verifique sua internet e tente novamente.",
    "GOOGLE_EMAIL_IN_USE": "Este email já tem cadastro com senha. Entre com email e senha.",
    "GOOGLE_CANCELLED": "Login com Google cancelado.",
    "GOOGLE_DISABLED": "Login com Google indisponível no momento.",
    "GOOGLE_FAILED": "Não foi possível entrar com o Google. Tente novamente."
  };
  return map[code] || error?.message || "Erro inesperado. Tente novamente.";
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

function showLoggedPanel(user) {
  $("auth-panel")?.classList.add("hidden");
  $("logged-panel")?.classList.remove("hidden");

  const title = $("auth-title");
  const subtitle = $("auth-subtitle");
  if (title) title.textContent = "Meu Perfil";
  if (subtitle) subtitle.textContent = "Gerencie suas informações pessoais.";

  document.querySelector(".auth-footer")?.classList.add("hidden");

  populateProfileForm(user);
}

function showAuthPanel() {
  $("auth-panel")?.classList.remove("hidden");
  $("logged-panel")?.classList.add("hidden");

  const title = $("auth-title");
  const subtitle = $("auth-subtitle");
  if (title) title.textContent = "Acessar conta";
  if (subtitle) subtitle.textContent = "Faça login ou crie um novo cadastro.";

  document.querySelector(".auth-footer")?.classList.remove("hidden");
}

// ============================================================
// PROFILE – POPULATE
// ============================================================

function populateProfileForm(user) {
  const name = user?.name || "";
  const phone = user?.phone || "";
  const email = user?.email || "";
  const photoURL = user?.photoURL || "";

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
  if ($("password-username")) $("password-username").value = email;
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

  // Contas do Google não têm senha para alterar e começam sem telefone.
  $("password-form")?.classList.toggle("hidden", !user?.hasPassword);
  $("password-divider")?.classList.toggle("hidden", !user?.hasPassword);
  if (!phone) setError("profile-phone", "Informe seu telefone para poder agendar.");
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

  if (phone.replace(/\D/g, "").length < 10) {
    setError("profile-phone", "Informe um telefone válido com DDD.");
    return;
  }

  if (!currentUser) {
    showToast("Sessão expirada. Faça login novamente.");
    return;
  }

  const saveBtn = $("profile-save-btn");
  if (saveBtn) saveBtn.disabled = true;

  try {
    const payload = { name, phone };
    if (pendingPhotoBase64) payload.photoURL = pendingPhotoBase64;

    currentUser = await api.users.update(currentUser.id, payload);

    const nameDisplay = $("profile-name-display");
    if (nameDisplay) nameDisplay.textContent = name;

    pendingPhotoBase64 = null;
    showToast("Perfil atualizado com sucesso!");
  } catch (error) {
    console.error("Erro ao salvar perfil:", error);
    showToast(translateApiError(error));
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

// ============================================================
// PROFILE – PASSWORD
// ============================================================

async function handlePasswordChange(event) {
  event.preventDefault();
  clearAllErrors();

  const currentPassword = $("password-current")?.value || "";
  const newPassword     = $("password-new")?.value || "";
  const confirm         = $("password-new-confirm")?.value || "";

  let valid = true;
  if (!currentPassword)                { setError("password-current", "Informe sua senha atual."); valid = false; }
  if (newPassword.length < 8)          { setError("password-new", "A senha precisa ter pelo menos 8 caracteres."); valid = false; }
  else if (newPassword === currentPassword) { setError("password-new", "A nova senha deve ser diferente da atual."); valid = false; }
  if (newPassword !== confirm)         { setError("password-new-confirm", "As senhas não coincidem."); valid = false; }
  if (!valid) return;

  const submitBtn = submitButton(event);
  if (submitBtn) submitBtn.disabled = true;

  try {
    await api.auth.changePassword({ currentPassword, newPassword });
    ["password-current", "password-new", "password-new-confirm"].forEach(id => ($(id).value = ""));
    showToast("Senha alterada. Os outros dispositivos foram desconectados.");
  } catch (error) {
    console.error("Erro ao alterar senha:", error);
    if (error.code === "WRONG_PASSWORD") setError("password-current", "Senha atual incorreta.");
    else showToast(translateApiError(error));
  } finally {
    if (submitBtn) submitBtn.disabled = false;
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

  const submitBtn = submitButton(event);
  if (submitBtn) submitBtn.disabled = true;

  try {
    const { token, user } = await api.auth.login({ email, password });
    setToken(token);
    currentUser = user;
    showToast("Login realizado com sucesso.");
    setTimeout(() => (window.location.href = "index.html"), 650);
  } catch (error) {
    console.error(error);
    showToast(translateApiError(error));
    if (submitBtn) submitBtn.disabled = false;
  }
}

// O botão fica desabilitado durante o envio e, após sucesso, até o redirecionamento.
function submitButton(event) {
  return event.submitter || event.target.querySelector('button[type="submit"]');
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
  if (password.length < 8)                            { setError("register-password", "A senha precisa ter pelo menos 8 caracteres."); valid = false; }
  if (password !== confirm)                           { setError("register-password-confirm", "As senhas não coincidem."); valid = false; }
  if (!valid) return;

  const submitBtn = submitButton(event);
  if (submitBtn) submitBtn.disabled = true;

  try {
    const { token, user } = await api.auth.register({ name, email, phone, password });
    setToken(token);
    currentUser = user;
    showToast("Cadastro realizado com sucesso.");
    setTimeout(() => (window.location.href = "index.html"), 700);
  } catch (error) {
    console.error("Erro no cadastro:", error);
    showToast(translateApiError(error));
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function handleLogout() {
  try {
    await api.auth.logout();
  } catch (error) {
    console.warn("Erro ao encerrar sessão no servidor:", error);
  } finally {
    setToken(null);
    currentUser = null;
    showToast("Você saiu da conta.");
    setTimeout(() => (window.location.href = "auth.html"), 600);
  }
}

// Diferente do logout comum, só limpa o token local se o servidor confirmar:
// do contrário, os outros dispositivos continuariam conectados sem o usuário saber.
async function handleLogoutAll() {
  if (!confirm("Encerrar a sessão em todos os dispositivos, inclusive neste?")) return;

  const btn = $("logout-all-btn");
  if (btn) btn.disabled = true;

  try {
    await api.auth.logoutAll();
    setToken(null);
    currentUser = null;
    showToast("Você saiu de todos os dispositivos.");
    setTimeout(() => (window.location.href = "auth.html"), 600);
  } catch (error) {
    console.error("Erro ao encerrar as sessões:", error);
    showToast(translateApiError(error));
    if (btn) btn.disabled = false;
  }
}

// ============================================================
// INIT
// ============================================================

// Retorno do login com Google: o servidor devolve um código de uso único (ou um erro) no fragmento da URL.
async function handleGoogleReturn() {
  const hash = new URLSearchParams(location.hash.slice(1));
  const code = hash.get("google_code");
  const error = hash.get("google_error");
  if (!code && !error) return false;
  history.replaceState(null, "", location.pathname + location.search);

  if (error) {
    showToast(translateApiError({ code: error }));
    return false;
  }
  try {
    const { token } = await api.auth.googleSession(code);
    setToken(token);
    return true;
  } catch (err) {
    console.error("Erro no login com Google:", err);
    showToast(translateApiError(err));
    return false;
  }
}

async function showGoogleButton() {
  try {
    const { google } = await api.auth.options();
    $("google-login")?.classList.toggle("hidden", !google);
  } catch (error) {
    console.warn("Não foi possível consultar as opções de login.", error);
  }
}

async function loadCurrentUser() {
  if (!getToken()) return null;
  try {
    const { user } = await api.auth.me();
    return user;
  } catch (error) {
    console.warn("Sessão inválida ou expirada.", error);
    setToken(null);
    return null;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  $("tab-login")?.addEventListener("click", showLogin);
  $("tab-register")?.addEventListener("click", showRegister);
  $("login-form")?.addEventListener("submit", handleLogin);
  $("register-form")?.addEventListener("submit", handleRegister);
  $("logout-btn")?.addEventListener("click", handleLogout);
  $("logout-all-btn")?.addEventListener("click", handleLogoutAll);
  $("profile-form")?.addEventListener("submit", handleProfileSave);
  $("password-form")?.addEventListener("submit", handlePasswordChange);
  $("photo-upload")?.addEventListener("change", handlePhotoUpload);

  document.querySelectorAll("input").forEach(input => {
    input.addEventListener("input", () => {
      const id = input.id;
      if (id) clearError(id);
    });
  });

  const googleLogin = await handleGoogleReturn();
  currentUser = await loadCurrentUser();

  if (shouldLogout) {
    if (currentUser) await handleLogout();
    else showAuthPanel();
    return;
  }

  if (googleLogin && currentUser?.phone) {
    showToast("Login realizado com sucesso.");
    setTimeout(() => (window.location.href = "index.html"), 650);
    return;
  }

  if (currentUser) {
    showLoggedPanel(currentUser);
    if (googleLogin) {
      showToast("Conta conectada. Informe seu telefone para poder agendar.");
      $("profile-phone")?.focus();
    }
  } else {
    showAuthPanel();
    showGoogleButton();
  }
});
