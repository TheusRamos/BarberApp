import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore,
  collection,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  onSnapshot,
  getDoc,
  query,
  where
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

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);
const auth = getAuth(app);

const barbeirosCol = collection(db, "barbeiros");
const servicesCol  = collection(db, "services");
const horariosCol  = collection(db, "horarios");
const slotsCol     = collection(db, "slots");

const DEFAULT_SERVICES = [
  { name: "Corte Simples" },
  { name: "Corte e Barba" },
  { name: "Experiência Premium" }
];

const $ = id => document.getElementById(id);

let barbeirosCache  = [];
let servicesCache   = [];
let horariosCache   = [];
let slotsCache      = new Map();
let selectedBarbeiro = null;
let pendingPhoto    = null;
let editingId       = null;

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

function formatDateBR(d) {
  if (!d) return "";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function getTodayISO() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().split("T")[0];
}

function getServicesForUI() {
  return servicesCache.length ? servicesCache : DEFAULT_SERVICES;
}

function initial(name) {
  return (name || "B").charAt(0).toUpperCase();
}

// ============================================================
// PHOTO UPLOAD (canvas compress — same as auth.js)
// ============================================================

function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.type.startsWith("image/")) return showToast("Selecione uma imagem válida.");

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const SIZE = 200;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE;
      canvas.height = SIZE;
      const ctx = canvas.getContext("2d");

      const side = Math.min(img.width, img.height);
      const sx = (img.width  - side) / 2;
      const sy = (img.height - side) / 2;
      ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);

      pendingPhoto = canvas.toDataURL("image/jpeg", 0.82);

      const avatarImg = $("barbeiro-avatar-img");
      const avatarInit = $("barbeiro-avatar-initial");
      if (avatarImg) { avatarImg.src = pendingPhoto; avatarImg.classList.add("visible"); }
      if (avatarInit) avatarInit.style.display = "none";
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// ============================================================
// RENDER BARBERS LIST
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
    const isSelected = selectedBarbeiro?.id === b.id;
    const servicesList = (b.services || []).slice(0, 3).join(", ") || "Sem serviços definidos";
    const hasPhoto = Boolean(b.photo);
    return `
      <div class="barbeiro-card${isSelected ? " selected" : ""}" data-id="${escapeHTML(b.id)}">
        <div class="barbeiro-card-avatar">
          ${hasPhoto ? `<img src="${escapeHTML(b.photo)}" alt="${escapeHTML(b.name)}" class="visible" />` : escapeHTML(initial(b.name))}
        </div>
        <div class="barbeiro-card-info">
          <strong>${escapeHTML(b.name || "Barbeiro")}</strong>
          <span class="barbeiro-card-services">${escapeHTML(servicesList)}</span>
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

  // Select barber on card click
  container.querySelectorAll(".barbeiro-card").forEach(card => {
    card.addEventListener("click", e => {
      if (e.target.closest("button")) return;
      const id = card.dataset.id;
      const b = barbeirosCache.find(x => x.id === id);
      if (b) selectBarbeiro(b);
    });
  });

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
// SELECT BARBER → show horarios section
// ============================================================

function selectBarbeiro(b) {
  selectedBarbeiro = b;
  renderBarbeirosList();
  showHorariosSection(b);
}

function showHorariosSection(b) {
  const section = $("barbeiro-horarios-section");
  const nameEl  = $("barbeiro-horarios-name");
  if (!section) return;
  section.classList.remove("hidden");
  if (nameEl) nameEl.textContent = b.name || "Barbeiro";
  renderBarbeiroHorarios();
}

// ============================================================
// RENDER HORARIOS OF SELECTED BARBER
// ============================================================

function renderBarbeiroHorarios() {
  const container = $("bh-list");
  if (!container || !selectedBarbeiro) return;

  const myHorarios = horariosCache
    .filter(h => h.barbeiroId === selectedBarbeiro.id)
    .sort((a, b) => `${a.data}T${a.hora}`.localeCompare(`${b.data}T${b.hora}`));

  if (!myHorarios.length) {
    container.innerHTML = `<div class="empty-row">Nenhum horário cadastrado para este barbeiro.</div>`;
    return;
  }

  container.innerHTML = myHorarios.map(h => {
    const reserved = slotsCache.has(h.id);
    return `
      <div class="bh-horario-row${reserved ? " reserved" : ""}">
        <div class="bh-horario-info">
          <strong>${escapeHTML(formatDateBR(h.data))} às ${escapeHTML(h.hora)}</strong>
          <span>${reserved ? "Reservado" : "Disponível"}</span>
        </div>
        ${!reserved ? `
          <button class="action-btn delete-btn delete-bh-horario" type="button" data-id="${escapeHTML(h.id)}">
            <span class="material-symbols-outlined" style="font-size:15px">delete</span>
          </button>` : ""}
      </div>`;
  }).join("");

  container.querySelectorAll(".delete-bh-horario").forEach(btn => {
    btn.addEventListener("click", () => deleteBarbeiroHorario(btn.dataset.id));
  });
}

// ============================================================
// FORM — open for add / edit
// ============================================================

function openAddForm() {
  editingId = null;
  pendingPhoto = null;

  if ($("barbeiro-name"))         $("barbeiro-name").value = "";
  if ($("barbeiro-avatar-img"))   { $("barbeiro-avatar-img").src = ""; $("barbeiro-avatar-img").classList.remove("visible"); }
  if ($("barbeiro-avatar-initial")) { $("barbeiro-avatar-initial").textContent = "B"; $("barbeiro-avatar-initial").style.display = ""; }
  if ($("barbeiro-photo-upload")) $("barbeiro-photo-upload").value = "";
  if ($("form-panel-title"))      $("form-panel-title").textContent = "Novo barbeiro";
  if ($("barbeiro-cancel-btn"))   $("barbeiro-cancel-btn").classList.add("hidden");

  renderServicesChecks([], false);
}

function openEditForm(b) {
  editingId = b.id;
  pendingPhoto = null;

  if ($("barbeiro-name")) $("barbeiro-name").value = b.name || "";
  if ($("form-panel-title")) $("form-panel-title").textContent = "Editar barbeiro";
  if ($("barbeiro-cancel-btn")) $("barbeiro-cancel-btn").classList.remove("hidden");

  const avatarImg  = $("barbeiro-avatar-img");
  const avatarInit = $("barbeiro-avatar-initial");
  if (b.photo && avatarImg) {
    avatarImg.src = b.photo;
    avatarImg.classList.add("visible");
    if (avatarInit) avatarInit.style.display = "none";
  } else {
    if (avatarImg) { avatarImg.src = ""; avatarImg.classList.remove("visible"); }
    if (avatarInit) { avatarInit.textContent = initial(b.name); avatarInit.style.display = ""; }
  }

  renderServicesChecks(b.services || [], true);
}

// ============================================================
// SERVICES CHECKBOXES
// ============================================================

function renderServicesChecks(selected = [], checked = false) {
  const container = $("barbeiro-services-checks");
  if (!container) return;

  const services = getServicesForUI();
  container.innerHTML = services.map(s => {
    const isChecked = selected.includes(s.name);
    const id = `svc-check-${slugify(s.name)}`;
    return `
      <label class="service-check-item" for="${escapeHTML(id)}">
        <input type="checkbox" id="${escapeHTML(id)}" value="${escapeHTML(s.name)}" ${isChecked ? "checked" : ""} />
        <span>${escapeHTML(s.name)}</span>
      </label>`;
  }).join("");
}

function getCheckedServices() {
  return [...document.querySelectorAll("#barbeiro-services-checks input[type='checkbox']:checked")]
    .map(cb => cb.value);
}

// ============================================================
// CRUD — BARBEIROS
// ============================================================

async function saveBarbeiro() {
  const name = ($("barbeiro-name")?.value || "").trim();
  if (name.length < 2) return showToast("Informe um nome válido.");

  const services = getCheckedServices();
  const photoValue = pendingPhoto;

  try {
    if (editingId) {
      const data = { name, services, updatedAt: serverTimestamp() };
      if (photoValue) data.photo = photoValue;
      await updateDoc(doc(db, "barbeiros", editingId), data);
      showToast("Barbeiro atualizado.");
    } else {
      const data = { name, services, photo: photoValue || "", createdAt: serverTimestamp() };
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
  if (!confirm("Remover este barbeiro? Os horários associados também serão excluídos.")) return;
  try {
    const myHorarios = horariosCache.filter(h => h.barbeiroId === id);
    await Promise.all(myHorarios.map(h => deleteDoc(doc(db, "horarios", h.id))));
    await deleteDoc(doc(db, "barbeiros", id));
    if (selectedBarbeiro?.id === id) {
      selectedBarbeiro = null;
      const section = $("barbeiro-horarios-section");
      if (section) section.classList.add("hidden");
    }
    showToast("Barbeiro removido.");
  } catch (err) {
    console.error(err);
    showToast("Erro ao remover barbeiro.");
  }
}

// ============================================================
// CRUD — HORARIOS PER BARBER
// ============================================================

async function saveBarbeiroHorario() {
  if (!selectedBarbeiro) return showToast("Selecione um barbeiro primeiro.");

  const data = ($("bh-data")?.value || "").trim();
  const hora = ($("bh-hora")?.value || "").trim();

  if (!data) return showToast("Selecione uma data.");
  if (data < getTodayISO()) return showToast("A data não pode ser anterior ao dia atual.");
  if (!hora) return showToast("Informe o horário.");

  const horarioId = `${data}_${hora}_${slugify(selectedBarbeiro.name)}_${selectedBarbeiro.id.slice(0, 6)}`;

  try {
    const existingSnap = await getDoc(doc(db, "horarios", horarioId));
    if (existingSnap.exists()) return showToast("Este horário já está cadastrado para o barbeiro.");

    await setDoc(doc(db, "horarios", horarioId), {
      data,
      hora,
      barbeiro: selectedBarbeiro.name,
      barbeiroId: selectedBarbeiro.id,
      createdAt: serverTimestamp()
    });

    if ($("bh-data")) $("bh-data").value = "";
    if ($("bh-hora")) $("bh-hora").value = "";
    showToast("Horário adicionado.");
  } catch (err) {
    console.error(err);
    showToast("Erro ao salvar horário.");
  }
}

async function deleteBarbeiroHorario(horarioId) {
  if (slotsCache.has(horarioId)) return showToast("Horário reservado — cancele o agendamento primeiro.");
  if (!confirm("Remover este horário?")) return;
  try {
    await deleteDoc(doc(db, "horarios", horarioId));
    showToast("Horário removido.");
  } catch (err) {
    console.error(err);
    showToast("Erro ao remover horário.");
  }
}

// ============================================================
// REAL-TIME SUBSCRIPTIONS
// ============================================================

function subscribeAll() {
  onSnapshot(barbeirosCol, snap => {
    barbeirosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderBarbeirosList();
    renderServicesChecks(
      editingId ? (barbeirosCache.find(b => b.id === editingId)?.services || []) : [],
      Boolean(editingId)
    );
  });

  onSnapshot(servicesCol, snap => {
    servicesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderServicesChecks(
      editingId ? (barbeirosCache.find(b => b.id === editingId)?.services || []) : [],
      Boolean(editingId)
    );
  });

  onSnapshot(horariosCol, snap => {
    horariosCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderBarbeiroHorarios();
  });

  onSnapshot(slotsCol, snap => {
    slotsCache = new Map(snap.docs.map(d => [d.id, d.data()]));
    renderBarbeiroHorarios();
  });
}

// ============================================================
// ADMIN AUTH GUARD
// ============================================================

function initAuth() {
  onAuthStateChanged(auth, async user => {
    if (!user) { window.location.href = "auth.html"; return; }

    const snap = await getDoc(doc(db, "users", user.uid));
    const isAdmin = snap.exists() && snap.data().role === "admin";
    if (!isAdmin) { window.location.href = "index.html"; return; }

    subscribeAll();
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

  $("bh-save")?.addEventListener("click", saveBarbeiroHorario);

  const dataInput = $("bh-data");
  if (dataInput) dataInput.min = getTodayISO();
});
