import { api } from "./api.js";

function esc(v = "") {
  return String(v)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

const formatMoney = v =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) || 0);

const AVATAR_GRADIENTS = [
  "linear-gradient(135deg,#C4963A,#8A6420)",
  "linear-gradient(135deg,#5B8DB8,#2A5E8A)",
  "linear-gradient(135deg,#ffc84d,#c07800)",
  "linear-gradient(135deg,#7B68EE,#4B3BA8)",
  "linear-gradient(135deg,#48BB78,#276749)"
];

async function loadServicos() {
  const grid = document.getElementById("sobre-servicos-grid");
  if (!grid) return;
  try {
    const services = (await api.services.list()) || [];

    if (!services.length) {
      grid.innerHTML = `<p class="sobre-loading-hint">Nenhum serviço cadastrado.</p>`;
      return;
    }

    grid.innerHTML = services.map((s, idx) => `
      <div class="sobre-servico-card anim-fade-up${idx > 0 && idx <= 5 ? ` anim-d${idx}` : ''}">
        <div class="sobre-servico-icon">
          <span class="material-symbols-outlined">${esc(s.icon || "content_cut")}</span>
        </div>
        <div class="sobre-servico-info">
          <h3>${esc(s.name)}</h3>
        </div>
        <div class="sobre-servico-price">${esc(formatMoney(s.price))}</div>
      </div>
    `).join("");
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<p class="sobre-loading-hint">Não foi possível carregar os serviços.</p>`;
  }
}

async function loadEquipe() {
  const grid = document.getElementById("sobre-equipe-grid");
  if (!grid) return;
  try {
    const barbeiros = (await api.barbeiros.list()) || [];

    if (!barbeiros.length) {
      grid.innerHTML = `<p class="sobre-loading-hint">Nenhum barbeiro cadastrado.</p>`;
      return;
    }

    grid.innerHTML = barbeiros.map((b, i) => {
      const svcNames      = Array.isArray(b.services) ? b.services : Object.keys(b.services || {});
      const especialidades = svcNames.join(" · ") || "Barbeiro";
      const hasPhoto      = Boolean(b.photo);
      const gradient      = AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length];
      const initial       = (b.name || "B").charAt(0).toUpperCase();

      const avatarHTML = hasPhoto
        ? `<div class="equipe-avatar" style="background:${gradient};padding:0;overflow:hidden;">
             <img src="${esc(b.photo)}" alt="${esc(b.name)}" style="width:100%;height:100%;object-fit:cover;display:block;" />
           </div>`
        : `<div class="equipe-avatar" style="background:${gradient}">${esc(initial)}</div>`;

      return `
        <div class="sobre-equipe-card anim-fade-up${i > 0 && i <= 5 ? ` anim-d${i}` : ''}">
          ${avatarHTML}
          <div class="equipe-info">
            <h3>${esc(b.name || "Barbeiro")}</h3>
            <p class="equipe-role">${esc(especialidades)}</p>
            ${b.bio ? `<p>${esc(b.bio)}</p>` : ""}
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<p class="sobre-loading-hint">Não foi possível carregar a equipe.</p>`;
  }
}

loadServicos();
loadEquipe();
