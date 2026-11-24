// ============================================================
// LINK DO PERFIL NO MENU LATERAL
// Igual em todas as páginas: a foto de quem está logado (ou o ícone de pessoa,
// se não tiver foto) e o nome. Sem login, o link vira "Entrar".
// ============================================================

export function showProfileInMenu(user) {
  const link = document.getElementById("auth-link");
  if (!link) return;

  let icon;
  if (user?.photoURL) {
    icon = document.createElement("img");
    icon.className = "sidebar-avatar";
    icon.src = user.photoURL;
    icon.alt = ""; // o nome já vem escrito ao lado
  } else {
    icon = document.createElement("span");
    icon.className = "material-symbols-outlined";
    icon.setAttribute("aria-hidden", "true");
    icon.textContent = "person";
  }

  link.replaceChildren(icon, user ? user.name || user.email || "Perfil" : "Entrar");
}
