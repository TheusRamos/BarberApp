import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  onSnapshot,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import {
  getAuth,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyBmWNHnYemnft_N542e9wa_1jRZeqCc5zE",
  authDomain: "barbearia-7387c.firebaseapp.com",
  projectId: "barbearia-7387c",
  storageBucket: "barbearia-7387c.firebasestorage.app",
  messagingSenderId: "16693210556",
  appId: "1:16693210556:web:3510e53c285b3dc257cfb9"
};

const app  = initializeApp(firebaseConfig);
const db   = getFirestore(app);
const auth = getAuth(app);

const barbeirosCol = collection(db, "barbeiros");
const servicesCol  = collection(db, "services");

const DIAS_SEMANA = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" }
];

const $ = id => document.getElementById(id);

let barbeirosCache = [];
let servicesCache  = [];
let pendingPhoto   = null;
let editingId      = null;

// ============================================================
// TOAST
// ============================================================

function showToast(msg) {
  const t = $("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t.classList.remove("show"), 2800);
}

// ============================================================
// HELPERS
// ============================================================

function escapeHTML(v = "") {
  return String(v)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(v = "") {
  return String(v).normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "h";
}

function initial(name) {
  return (name || "B").charAt(0).toUpperCase();
}

function getServicesForUI() {
  return servicesCache;
}

// ============================================================
// PHOTO UPLOAD (canvas compress)
// ============================================================

function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) return showToast("Selecione uma imagem válida.");

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const SIZE   = 200;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx  = canvas.getContext("2d");
      const side = Math.min(img.width, img.height);
      const sx   = (img.width  - side) / 2;
      const sy   = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);

      pendingPhoto = canvas.toDataURL("image/jpeg", 0.82);

      const avatarImg  = $("barbeiro-avatar-img");
      const avatarInit = $("barbeiro-avatar-initial");
      if (avatarImg)  { avatarImg.src = pendingPhoto; avatarImg.classList.add("visible"); }
      if (avatarInit) avatarInit.style.display = "none";
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ============================================================
// RENDER — BARBERS LIST
// ============================================================

function renderBarbeirosList() {
  const container = $("barbeiros-list");
  if (!container) return;

  if (!barbeirosCache.length) {
    container.innerHTML = `
      <div class="empty-barbeiros">
        <span class="material-symbols-outlined">group</span>
        <h3>Nenhum barbeiro cadastrado</h3>
        <p>Adicione o primeiro barbeiro usando o formulário ao lado.</p>
      </div>`;
    return;
  }

  container.innerHTML = barbeirosCache.map(b => {
    const svcNames     = Array.isArray(b.services) ? b.services : Object.keys(b.services || {});
    const servicesList = svcNames.slice(0, 3).join(", ") || "Sem serviços definidos";
    const inicio       = b.horarioInicio || "09:00";
    const fim          = b.horarioFim    || "20:00";
    const hasPhoto     = Boolean(b.photo);

    return `
      <div class="barbeiro-card" data-id="${escapeHTML(b.id)}">
        <div class="barbeiro-card-avatar">
          ${hasPhoto
            ? `<img src="${escapeHTML(b.photo)}" alt="${escapeHTML(b.name)}" class="visible" />`
            : escapeHTML(initial(b.name))}
        </div>
        <div class="barbeiro-card-info">
          <strong>${escapeHTML(b.name || "Barbeiro")}</strong>
          <span class="barbeiro-card-services">${escapeHTML(servicesList)}</span>
          <span class="barbeiro-card-horario">${escapeHTML(inicio)} – ${escapeHTML(fim)}</span>
        </div>
        <div class="barbeiro-card-actions">
          <button class="action-btn edit-barbeiro" type="button" data-id="${escapeHTML(b.id)}" title="Editar">
            <span class="material-symbols-outlined" style="font-size:16px">edit</span>
          </button>
          <button class="action-btn delete-btn delete-barbeiro" type="button" data-id="${escapeHTML(b.id)}" title="Remover">
            <span class="material-symbols-outlined" style="font-size:16px">delete</span>
          </button>
        </div>
      </div>`;
  }).join("");

  container.querySelectorAll(".edit-barbeiro").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const b = barbeirosCache.find(x => x.id === btn.dataset.id);
      if (b) openEditForm(b);
    });
  });

  container.querySelectorAll(".delete-barbeiro").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      deleteBarbeiro(btn.dataset.id);
    });
  });
}

// ============================================================
// FORM — open for add / edit
// ============================================================

function openAddForm() {
  editingId    = null;
  pendingPhoto = null;

  if ($("barbeiro-name"))           $("barbeiro-name").value = "";
  if ($("barbeiro-inicio"))         $("barbeiro-inicio").value = "09:00";
  if ($("barbeiro-fim"))            $("barbeiro-fim").value   = "20:00";
  if ($("barbeiro-avatar-img"))     { $("barbeiro-avatar-img").src = ""; $("barbeiro-avatar-img").classList.remove("visible"); }
  if ($("barbeiro-avatar-initial")) { $("barbeiro-avatar-initial").textContent = "B"; $("barbeiro-avatar-initial").style.display = ""; }
  if ($("barbeiro-photo-upload"))   $("barbeiro-photo-upload").value = "";
  if ($("form-panel-title"))        $("form-panel-title").textContent = "Novo barbeiro";
  if ($("barbeiro-cancel-btn"))     $("barbeiro-cancel-btn").classList.add("hidden");

  renderServicesChecks({});
  renderDiasChecks([1, 2, 3, 4, 5, 6]);
}

function openEditForm(b) {
  editingId    = b.id;
  pendingPhoto = null;

  if ($("barbeiro-name"))      $("barbeiro-name").value = b.name || "";
  if ($("barbeiro-inicio"))    $("barbeiro-inicio").value = b.horarioInicio || "09:00";
  if ($("barbeiro-fim"))       $("barbeiro-fim").value   = b.horarioFim    || "20:00";
  if ($("form-panel-title"))   $("form-panel-title").textContent = "Editar barbeiro";
  if ($("barbeiro-cancel-btn")) $("barbeiro-cancel-btn").classList.remove("hidden");

  const avatarImg  = $("barbeiro-avatar-img");
  const avatarInit = $("barbeiro-avatar-initial");
  if (b.photo && avatarImg) {
    avatarImg.src = b.photo;
    avatarImg.classList.add("visible");
    if (avatarInit) avatarInit.style.display = "none";
  } else {
    if (avatarImg)  { avatarImg.src = ""; avatarImg.classList.remove("visible"); }
    if (avatarInit) { avatarInit.textContent = initial(b.name); avatarInit.style.display = ""; }
  }

  const svcSelected = Array.isArray(b.services)
    ? Object.fromEntries(b.services.map(n => [n, 0]))  // legacy migration
    : (b.services || {});
  renderServicesChecks(svcSelected);
  renderDiasChecks(Array.isArray(b.diasDisponiveis) ? b.diasDisponiveis : [1, 2, 3, 4, 5, 6]);
}

// ============================================================
// SERVICES CHECKBOXES (with per-service duration input)
// ============================================================

function renderServicesChecks(selected = {}) {
  const container = $("barbeiro-services-checks");
  if (!container) return;

  const services = getServicesForUI();

  if (!services.length) {
    container.innerHTML = `<p class="svc-empty-hint">Nenhum serviço cadastrado. Adicione serviços na página de Administração.</p>`;
    return;
  }

  const isObject = typeof selected === "object" && !Array.isArray(selected);

  container.innerHTML = services.map(s => {
    const id        = `svc-check-${slugify(s.name)}`;
    const isChecked = isObject ? Object.prototype.hasOwnProperty.call(selected, s.name) : false;
    const duration  = isChecked ? (selected[s.name] || "") : "";
    return `
      <div class="service-check-item${isChecked ? " active" : ""}">
        <label class="svc-check-label" for="${escapeHTML(id)}">
          <input type="checkbox" id="${escapeHTML(id)}" value="${escapeHTML(s.name)}" ${isChecked ? "checked" : ""} />
          <span>${escapeHTML(s.name)}</span>
        </label>
        <div class="svc-duration-wrap${isChecked ? "" : " hidden"}">
          <input type="number" class="svc-duration-input"
            data-service="${escapeHTML(s.name)}"
            placeholder="min" min="5" max="480" step="5"
            value="${escapeHTML(String(duration))}" />
          <span class="svc-duration-unit">min</span>
        </div>
      </div>`;
  }).join("");

  container.querySelectorAll("input[type='checkbox']").forEach(cb => {
    cb.addEventListener("change", () => {
      const row          = cb.closest(".service-check-item");
      const durationWrap = row.querySelector(".svc-duration-wrap");
      const durationInput = row.querySelector(".svc-duration-input");
      row.classList.toggle("active", cb.checked);
      durationWrap.classList.toggle("hidden", !cb.checked);
      if (cb.checked) durationInput.focus();
      else durationInput.value = "";
    });
  });
}

function getCheckedServices() {
  const result = {};
  document.querySelectorAll("#barbeiro-services-checks input[type='checkbox']:checked").forEach(cb => {
    const row          = cb.closest(".service-check-item");
    const durationInput = row?.querySelector(".svc-duration-input");
    result[cb.value]   = Number(durationInput?.value || 0);
  });
  return result;
}

// ============================================================
// WORKING DAYS CHECKBOXES
// ============================================================

function renderDiasChecks(selected = [1, 2, 3, 4, 5, 6]) {
  const container = $("barbeiro-dias-checks");
  if (!container) return;

  container.innerHTML = DIAS_SEMANA.map(d => {
    const isChecked = selected.includes(d.value);
    return `
      <label class="dia-check-item${isChecked ? " active" : ""}" for="dia-${d.value}">
        <input type="checkbox" id="dia-${d.value}" value="${d.value}" ${isChecked ? "checked" : ""} />
        ${escapeHTML(d.label)}
      </label>`;
  }).join("");

  container.querySelectorAll("input").forEach(cb => {
    cb.addEventListener("change", () => {
      cb.closest("label").classList.toggle("active", cb.checked);
    });
  });
}

function getCheckedDias() {
  return [...document.querySelectorAll("#barbeiro-dias-checks input:checked")]
    .map(cb => Number(cb.value));
}

// ============================================================
// CRUD — BARBEIROS
// ============================================================

async function saveBarbeiro() {
  const name         = ($("barbeiro-name")?.value || "").trim();
  const horarioInicio = ($("barbeiro-inicio")?.value || "09:00");
  const horarioFim    = ($("barbeiro-fim")?.value    || "20:00");

  if (name.length < 2) return showToast("Informe um nome válido.");
  if (horarioInicio >= horarioFim) return showToast("O horário de início deve ser anterior ao de fim.");

  const services        = getCheckedServices();
  const serviceEntries  = Object.entries(services);
  if (!serviceEntries.length) return showToast("Selecione ao menos um serviço.");
  for (const [svcName, dur] of serviceEntries) {
    if (!dur || dur < 5) return showToast(`Informe o tempo em minutos para "${svcName}".`);
  }

  const diasDisponiveis = getCheckedDias();
  if (!diasDisponiveis.length) return showToast("Selecione ao menos um dia de atendimento.");

  const data = {
    name,
    services,
    diasDisponiveis,
    horarioInicio,
    horarioFim
  };

  if (pendingPhoto) data.photo = pendingPhoto;

  try {
    if (editingId) {
      data.updatedAt = serverTimestamp();
      await updateDoc(doc(db, "barbeiros", editingId), data);
      showToast("Barbeiro atualizado.");
    } else {
      data.photo      = pendingPhoto || "";
      data.createdAt  = serverTimestamp();
      await addDoc(barbeirosCol, data);
      showToast("Barbeiro adicionado.");
    }
    openAddForm();
  } catch (err) {
    console.error(err);
    showToast("Erro ao salvar barbeiro.");
  }
}

async function deleteBarbeiro(id) {
  if (!confirm("Remover este barbeiro?")) return;
  try {
    await deleteDoc(doc(db, "barbeiros", id));
    showToast("Barbeiro removido.");
  } catch (err) {
    console.error(err);
    showToast("Erro ao remover barbeiro.");
  }
}

// ============================================================
// REAL-TIME SUBSCRIPTIONS
// ============================================================

function subscribeAll() {
  onSnapshot(barbeirosCol, snap => {
    barbeirosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderBarbeirosList();

    if (editingId) {
      const current = barbeirosCache.find(b => b.id === editingId);
      if (current) {
        const svcSelected = Array.isArray(current.services)
          ? Object.fromEntries(current.services.map(n => [n, 0]))
          : (current.services || {});
        renderServicesChecks(svcSelected);
        renderDiasChecks(Array.isArray(current.diasDisponiveis)
          ? current.diasDisponiveis : [1, 2, 3, 4, 5, 6]);
      }
    }
  });

  onSnapshot(servicesCol, snap => {
    servicesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const current  = editingId ? barbeirosCache.find(b => b.id === editingId) : null;
    const svcSel   = current
      ? (Array.isArray(current.services)
          ? Object.fromEntries(current.services.map(n => [n, 0]))
          : (current.services || {}))
      : {};
    renderServicesChecks(svcSel);
  });
}

// ============================================================
// AUTH GUARD (admin only)
// ============================================================

function initAuth() {
  onAuthStateChanged(auth, async user => {
    if (!user) { window.location.href = "auth.html"; return; }

    const snap    = await getDoc(doc(db, "users", user.uid));
    const isAdmin = snap.exists() && snap.data().role === "admin";
    if (!isAdmin) { window.location.href = "index.html"; return; }

    subscribeAll();
    openAddForm();
  });
}

// ============================================================
// INIT
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  initAuth();

  $("barbeiro-photo-upload")?.addEventListener("change", handlePhotoUpload);
  $("barbeiro-save-btn")?.addEventListener("click", saveBarbeiro);
  $("barbeiro-cancel-btn")?.addEventListener("click", () => {
    editingId = null;
    openAddForm();
  });
});
