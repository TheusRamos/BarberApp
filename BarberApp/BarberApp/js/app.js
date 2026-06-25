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
  getDocs,
  runTransaction,
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
  appId: "1:16693210556:web:3510e53c285b3dc257cfb9",
  measurementId: "G-WXJJ75FC11"
};

const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

const appointmentsCollection = collection(db, "agendamentos");
const servicesCollection = collection(db, "services");
const horariosCollection = collection(db, "horarios");
const slotsCollection = collection(db, "slots");
const commentsCollection = collection(db, "comments");
const usersCollection = collection(db, "users");
const barbeirosCollection = collection(db, "barbeiros");
const waitlistCollection  = collection(db, "waitlist");

const EDIT_KEY = "barber_agendamento_editando";
const STATUS_SEQUENCE = ["Pendente", "Confirmado", "Concluído", "Cancelado"];

const DIAS_SEMANA = [
  { value: 0, label: "Dom" },
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" }
];


let currentUser = null;
let currentUserData = null;
let isAdmin = false;
let pendingPhoto = null;
let editingBarbeiroId = null;
let appointmentsCache = [];
let servicesCache = [];
let horariosCache = [];
let commentsCache = [];
let slotsCache = new Map();
let usersCache = [];
let barbeirosCache = [];
let selectedBarbeiroId = null;
let pendingEditAppointment = null;
let statusPickerEl = null;
let lastFailedPayload = null;

const unsubscribers = {
  appointments: null,
  services: null,
  horarios: null,
  slots: null,
  comments: null,
  users: null,
  barbeiros: null
};

const $ = id => document.getElementById(id);

function showToast(message) {
  const toast = $("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.classList.add("show");

  clearTimeout(showToast._timer);
  showToast._timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function slugify(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "principal";
}

function buildHorarioId(data, hora, barbeiro = "") {
  return `${data}_${hora}_${slugify(barbeiro)}`;
}

function formatDateBR(dateString) {
  if (!dateString) return "";
  const [year, month, day] = dateString.split("-");
  if (!year || !month || !day) return dateString;
  return `${day}/${month}/${year}`;
}

function formatMoney(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(Number(value) || 0);
}

function getInitial(name) {
  return name ? name.trim().charAt(0).toUpperCase() : "?";
}

function getStatusClass(status) {
  const map = {
    Confirmado: "confirmed",
    Pendente: "pending",
    Concluído: "completed",
    Cancelado: "cancelled"
  };
  return map[status] || "pending";
}

function clearError(fieldName) {
  const errorEl = $(`error-${fieldName}`);
  if (errorEl) errorEl.textContent = "";
}

function setError(fieldName, message) {
  const errorEl = $(`error-${fieldName}`);
  if (errorEl) errorEl.textContent = message;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getServicesForUI() {
  return servicesCache;
}

function getServicePrice(serviceName) {
  const service = getServicesForUI().find(item => item.name === serviceName);
  return Number(service?.price) || 0;
}

function sortByDateTime(items) {
  return [...items].sort((a, b) => {
    const aDateTime = `${a.data || ""}T${a.hora || "00:00"}`;
    const bDateTime = `${b.data || ""}T${b.hora || "00:00"}`;
    return aDateTime.localeCompare(bDateTime);
  });
}

function getTodayISO() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - offset).toISOString().split("T")[0];
}

function getSelectedServiceName() {
  return document.querySelector('input[name="servico"]:checked')?.value || "";
}

function getSelectedHorario() {
  const select = $("hora");
  if (!select || !select.value) return null;
  return horariosCache.find(item => item.id === select.value) || null;
}

function generateBarberSlots(barbeiro, selectedDate, selectedService, editId) {
  const inicio = barbeiro.horarioInicio || "09:00";
  const fim    = barbeiro.horarioFim    || "20:00";

  // Duration of the service being booked
  const svcMap    = (typeof barbeiro.services === "object" && !Array.isArray(barbeiro.services))
    ? barbeiro.services : {};
  const svcDur    = selectedService ? (Number(svcMap[selectedService]) || 60) : 60;

  // Step = minimum duration among all barber services (slot granularity)
  const durations = Object.values(svcMap).map(Number).filter(v => v > 0);
  const step      = durations.length ? Math.min(...durations) : svcDur;

  const [fh, fm]  = fim.split(":").map(Number);
  const fimMin    = fh * 60 + fm;
  let [ih, im]    = inicio.split(":").map(Number);
  let cur         = ih * 60 + im;

  // Collect booked intervals for this barber+date (excluding the appointment being edited)
  const booked = [];
  for (const [id, slot] of slotsCache) {
    const slotDate    = slot.data || id.split("_")[0];
    const slotBarbId  = slot.barbeiroId || (id.split("_")[2] || "");
    if (slotDate !== selectedDate) continue;
    if (slotBarbId && slotBarbId !== barbeiro.id) continue;
    if (editId && slot.appointmentId === editId) continue;

    const slotHora = slot.hora || id.split("_").slice(1, 3).join(":");
    if (!slotHora) continue;
    const [sh, sm] = slotHora.split(":").map(Number);
    const startMin = sh * 60 + sm;
    const dur      = Number(slot.duracao) || svcDur;
    booked.push({ s: startMin, e: startMin + dur });
  }

  const slots = [];
  while (cur + svcDur <= fimMin) {
    const end = cur + svcDur;
    const blocked = booked.some(b => cur < b.e && end > b.s);
    if (!blocked) {
      const hh = Math.floor(cur / 60);
      const mm = cur % 60;
      slots.push(`${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
    }
    cur += step;
  }

  return slots;
}

function updateAuthLink() {
  const link = $("auth-link");
  if (!link) return;

  if (currentUser) {
    link.href = "auth.html";
    link.innerHTML = `<span class="material-symbols-outlined">person</span>${escapeHTML(currentUser.displayName || currentUser.email || "Perfil")}`;
  } else {
    link.href = "auth.html";
    link.innerHTML = `<span class="material-symbols-outlined">person</span>Entrar`;
  }
}

function updateAdminVisibility() {
  const adminNavLink = $("admin-nav-link");
  if (adminNavLink) adminNavLink.classList.toggle("hidden", !isAdmin);

  const description = $("appointments-description");
  if (description) {
    description.textContent = isAdmin
      ? "Acompanhe todos os horários marcados, visualize clientes e organize a rotina da barbearia."
      : "Acompanhe seus horários marcados e consulte o andamento dos seus serviços.";
  }
}

function updateAdminStats() {
  const clients   = $("admin-stat-clients");
  const barbeiros = $("admin-stat-barbeiros");
  const services  = $("admin-stat-services");
  const pending   = $("admin-stat-pending");
  if (clients)   clients.textContent   = usersCache.length;
  if (barbeiros) barbeiros.textContent = barbeirosCache.length;
  if (services)  services.textContent  = servicesCache.length;
  if (pending)   pending.textContent   = appointmentsCache.filter(a => a.status === "Pendente").length;
}

function populateBarbeiroSelect() {
  const select = $("barbeiro");
  if (!select) return;

  const current = select.value;
  const group = $("barbeiro-group");

  if (!barbeirosCache.length) {
    if (group) group.style.display = "none";
    return;
  }

  if (group) group.style.display = "";
  select.innerHTML = `<option value="">Selecione um barbeiro</option>` +
    barbeirosCache
      .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
      .map(b => `<option value="${escapeHTML(b.id)}">${escapeHTML(b.name)}</option>`)
      .join("");

  if (barbeirosCache.some(b => b.id === current)) select.value = current;
}

function onBarbeiroChange() {
  selectedBarbeiroId = $("barbeiro")?.value || null;
  clearError("barbeiro");
  renderServiceOptions();
  updateAvailableTimes();
}

function renderServiceOptions() {
  const grid = $("services-grid");
  if (!grid) return;

  let services = getServicesForUI();

  if (selectedBarbeiroId) {
    const barbeiro = barbeirosCache.find(b => b.id === selectedBarbeiroId);
    if (barbeiro?.services) {
      const names = Array.isArray(barbeiro.services)
        ? barbeiro.services
        : Object.keys(barbeiro.services);
      if (names.length) services = services.filter(s => names.includes(s.name));
    }
  }

  const currentValue = getSelectedServiceName();

  grid.innerHTML = services.map((service, index) => {
    const id = `servico-${slugify(service.id || service.name || String(index))}`;
    const checked = currentValue
      ? currentValue === service.name
      : index === Math.min(1, services.length - 1);

    return `
      <input type="radio" name="servico" id="${escapeHTML(id)}" value="${escapeHTML(service.name)}" ${checked ? "checked" : ""} />
      <label for="${escapeHTML(id)}" class="service-card">
        <span class="material-symbols-outlined service-icon">${escapeHTML(service.icon || "content_cut")}</span>
        <span class="service-title">${escapeHTML(service.name)}</span>
        <span class="service-price">${formatMoney(service.price)}</span>
      </label>
    `;
  }).join("");

  grid.querySelectorAll('input[name="servico"]').forEach(input => {
    input.addEventListener("change", () => {
      clearError("servico");
      updateAvailableTimes();
    });
  });
}

function renderServiceFilter() {
  const select = $("filter-service");
  if (!select) return;

  const current = select.value || "Todos os serviços";
  const options = getServicesForUI()
    .map(service => `<option value="${escapeHTML(service.name)}">${escapeHTML(service.name)}</option>`)
    .join("");

  select.innerHTML = `<option value="Todos os serviços">Todos os serviços</option>${options}`;
  select.value = [...select.options].some(option => option.value === current) ? current : "Todos os serviços";
}

function renderServicesList() {
  const container = $("services-list");
  if (!container) return;

  const services = servicesCache.length > 0 ? servicesCache : [];

  if (!services.length) {
    container.innerHTML = `<div class="empty-row">Nenhum serviço cadastrado.</div>`;
    return;
  }

  container.innerHTML = services.map(service => `
    <div class="service-row">
      <div><strong>${escapeHTML(service.name)}</strong><span>${formatMoney(service.price)}</span></div>
      <div class="row-actions">
        ${isAdmin ? `
          <button class="action-btn edit-service" type="button" data-id="${escapeHTML(service.id)}">Editar</button>
          <button class="action-btn delete-service" type="button" data-id="${escapeHTML(service.id)}">Remover</button>
        ` : ""}
      </div>
    </div>
  `).join("");

  container.querySelectorAll(".edit-service").forEach(button => {
    button.addEventListener("click", () => {
      const service = servicesCache.find(item => item.id === button.dataset.id);
      if (!service) return;
      $("service-name").value = service.name || "";
      $("service-price").value = Number(service.price) || 0;
      $("service-save").dataset.editId = service.id;
      $("service-save").textContent = "Atualizar serviço";
    });
  });

  container.querySelectorAll(".delete-service").forEach(button => {
    button.addEventListener("click", async () => {
      if (!isAdmin) return showToast("Acesso negado.");
      if (!confirm("Remover este serviço?")) return;

      try {
        await deleteDoc(doc(db, "services", button.dataset.id));
        showToast("Serviço removido.");
      } catch (error) {
        console.error(error);
        showToast("Erro ao remover serviço.");
      }
    });
  });
}

function updateAvailableTimes() {
  const dateInput = $("data");
  const select    = $("hora");
  if (!dateInput || !select) return;

  const selectedDate = dateInput.value;
  const editId       = localStorage.getItem(EDIT_KEY);

  select.innerHTML = "";

  if (!selectedDate) {
    select.disabled = true;
    select.innerHTML = `<option value="">Selecione uma data primeiro</option>`;
    return;
  }

  const barbeiro = selectedBarbeiroId
    ? barbeirosCache.find(b => b.id === selectedBarbeiroId)
    : null;

  if (barbeiro) {
    // ── Auto-generated slots based on barber config ──────────────
    const dayOfWeek = new Date(selectedDate + "T12:00:00").getDay();
    const diasDisponiveis = Array.isArray(barbeiro.diasDisponiveis)
      ? barbeiro.diasDisponiveis
      : [1, 2, 3, 4, 5, 6];

    if (!diasDisponiveis.includes(dayOfWeek)) {
      select.disabled = true;
      select.innerHTML = `<option value="">Barbeiro não atende neste dia</option>`;
      return;
    }

    const selectedSvc = getSelectedServiceName();
    const slots = generateBarberSlots(barbeiro, selectedDate, selectedSvc, editId);

    if (!slots.length) {
      select.disabled = true;
      select.innerHTML = `<option value="">Nenhum horário disponível nessa data</option>`;
      return;
    }

    select.disabled = false;
    select.innerHTML = `<option value="">Selecione um horário</option>` +
      slots.map(hora => `<option value="${escapeHTML(hora)}">${escapeHTML(hora)}</option>`).join("");

    const currentHora = pendingEditAppointment?.hora || "";
    if (currentHora && [...select.options].some(o => o.value === currentHora)) {
      select.value = currentHora;
    }
    return;
  }

  // ── Fallback: manual horarios (legacy) ───────────────────────
  const horarios = sortByDateTime(
    horariosCache.filter(horario => {
      if (horario.data !== selectedDate) return false;
      const slot = slotsCache.get(horario.id);
      return !slot || (editId && slot.appointmentId === editId);
    })
  );

  if (!horarios.length) {
    select.disabled = true;
    select.innerHTML = `<option value="">Nenhum horário disponível nessa data</option>`;
    return;
  }

  select.disabled = false;
  select.innerHTML = `<option value="">Selecione um horário</option>` +
    horarios.map(h => {
      const barb = h.barbeiro ? ` • ${h.barbeiro}` : "";
      return `<option value="${escapeHTML(h.id)}">${escapeHTML(h.hora)}${escapeHTML(barb)}</option>`;
    }).join("");

  const currentHorarioId = pendingEditAppointment?.horarioId || "";
  if (currentHorarioId && horarios.some(h => h.id === currentHorarioId)) {
    select.value = currentHorarioId;
  }
}

function validateForm() {
  let isValid = true;

  const nome = $("nome")?.value.trim() || "";
  const email = $("email")?.value.trim() || "";
  const data = $("data")?.value || "";
  const horarioId = $("hora")?.value || "";
  const servico = getSelectedServiceName();

  ["nome", "email", "data", "hora", "servico", "barbeiro"].forEach(clearError);

  if (barbeirosCache.length > 0 && !selectedBarbeiroId) {
    setError("barbeiro", "Selecione um barbeiro.");
    isValid = false;
  }

  if (nome.length < 3) {
    setError("nome", "Informe um nome válido.");
    isValid = false;
  }

  if (!isValidEmail(email)) {
    setError("email", "Informe um email válido.");
    isValid = false;
  }

  if (!servico) {
    setError("servico", "Selecione um serviço.");
    isValid = false;
  }

  if (!data) {
    setError("data", "Selecione uma data.");
    isValid = false;
  } else if (data < getTodayISO()) {
    setError("data", "A data não pode ser anterior ao dia atual.");
    isValid = false;
  }

  if (!horarioId) {
    setError("hora", "Selecione um horário disponível.");
    isValid = false;
  }

  return isValid;
}

function resetFormState() {
  localStorage.removeItem(EDIT_KEY);
  pendingEditAppointment = null;
  selectedBarbeiroId = null;

  const form = $("booking-form");
  if (form) form.reset();

  const dataInput = $("data");
  if (dataInput) dataInput.min = getTodayISO();

  renderServiceOptions();
  updateAvailableTimes();

  const formTitle = $("form-title");
  const formSubtitle = $("form-subtitle");
  const submitBtn = $("submit-btn");
  const cancelEditBtn = $("cancel-edit-btn");

  if (formTitle) formTitle.textContent = "Novo agendamento";
  if (formSubtitle) formSubtitle.textContent = "Preencha os dados para reservar um horário.";
  if (submitBtn) {
    submitBtn.innerHTML = `<span class="material-symbols-outlined">check_circle</span>Confirmar agendamento`;
  }
  if (cancelEditBtn) cancelEditBtn.classList.add("hidden");

  ["nome", "email", "data", "hora", "servico"].forEach(clearError);
  clearError("barbeiro");
}

function prefillUserData() {
  if (!currentUser) return;

  const nameInput = $("nome");
  const emailInput = $("email");

  if (nameInput && !nameInput.value) {
    nameInput.value = currentUserData?.name || currentUser.displayName || "";
  }

  if (emailInput && !emailInput.value) {
    emailInput.value = currentUser.email || currentUserData?.email || "";
  }
}

async function fillFormForEdit(docId) {
  try {
    const docRef = doc(db, "agendamentos", docId);
    const snap = await getDoc(docRef);

    if (!snap.exists()) {
      localStorage.removeItem(EDIT_KEY);
      return;
    }

    const appointment = { id: snap.id, ...snap.data() };
    pendingEditAppointment = appointment;

    if ($("nome")) $("nome").value = appointment.nome || "";
    if ($("email")) $("email").value = appointment.email || "";
    if ($("data")) $("data").value = appointment.data || "";
    if ($("observacoes")) $("observacoes").value = appointment.observacoes || "";

    if ($("barbeiro") && appointment.barbeiroId) {
      $("barbeiro").value = appointment.barbeiroId;
      selectedBarbeiroId = appointment.barbeiroId;
    }

    renderServiceOptions();
    const selectedService = Array.from(document.querySelectorAll('input[name="servico"]'))
      .find(input => input.value === (appointment.servico || ""));
    if (selectedService) selectedService.checked = true;

    updateAvailableTimes();
    // For auto-generated slots the select value is the hora string; for legacy it's the horarioId
    if ($("hora")) {
      $("hora").value = selectedBarbeiroId
        ? (appointment.hora || "")
        : (appointment.horarioId || "");
    }

    const formTitle = $("form-title");
    const formSubtitle = $("form-subtitle");
    const submitBtn = $("submit-btn");
    const cancelEditBtn = $("cancel-edit-btn");

    if (formTitle) formTitle.textContent = "Editar agendamento";
    if (formSubtitle) formSubtitle.textContent = "Atualize as informações do cliente e salve novamente.";
    if (submitBtn) submitBtn.innerHTML = `<span class="material-symbols-outlined">save</span>Atualizar agendamento`;
    if (cancelEditBtn) cancelEditBtn.classList.remove("hidden");
  } catch (error) {
    console.error("Erro ao carregar agendamento para edição:", error);
    showToast("Não foi possível carregar o agendamento.");
  }
}

function buildAppointmentPayload() {
  const servico      = getSelectedServiceName();
  const selectValue  = $("hora")?.value || "";
  const data         = $("data")?.value || "";
  const barbeiroData = barbeirosCache.find(b => b.id === selectedBarbeiroId);

  let hora, horarioId, barbeiro, duracao;

  if (barbeiroData) {
    hora      = selectValue;
    horarioId = hora ? `${data}_${hora}_${selectedBarbeiroId}` : "";
    barbeiro  = barbeiroData.name;
    const svcMap = barbeiroData.services || {};
    duracao = typeof svcMap === "object" && !Array.isArray(svcMap)
      ? (Number(svcMap[servico]) || 0)
      : 0;
  } else {
    const horario = getSelectedHorario();
    hora      = horario?.hora || "";
    horarioId = horario?.id   || "";
    barbeiro  = horario?.barbeiro || "";
    duracao   = 0;
  }

  return {
    nome:        $("nome").value.trim(),
    email:       $("email").value.trim(),
    servico,
    data,
    hora,
    horarioId,
    barbeiroId:  selectedBarbeiroId || "",
    barbeiro,
    duracao,
    observacoes: $("observacoes").value.trim(),
    valor:       getServicePrice(servico)
  };
}

async function createAppointment(payload) {
  const appointmentRef = doc(collection(db, "agendamentos"));
  const slotRef        = doc(db, "slots", payload.horarioId);

  await runTransaction(db, async transaction => {
    const slotSnap = await transaction.get(slotRef);
    if (slotSnap.exists()) throw new Error("Horário já reservado.");

    const appointmentData = {
      ...payload,
      status: "Pendente",
      userId: currentUser.uid,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    transaction.set(appointmentRef, appointmentData);
    transaction.set(slotRef, {
      appointmentId: appointmentRef.id,
      userId:       currentUser.uid,
      data:         payload.data,
      hora:         payload.hora,
      horarioId:    payload.horarioId,
      barbeiroId:   payload.barbeiroId || "",
      servico:      payload.servico,
      duracao:      payload.duracao || 0,
      createdAt:    serverTimestamp(),
      updatedAt:    serverTimestamp()
    });
  });
}

async function updateAppointment(appointmentId, payload) {
  const appointmentRef = doc(db, "agendamentos", appointmentId);
  const newSlotRef     = doc(db, "slots", payload.horarioId);

  await runTransaction(db, async transaction => {
    const appointmentSnap = await transaction.get(appointmentRef);
    if (!appointmentSnap.exists()) throw new Error("Agendamento não encontrado.");

    const oldAppointment = appointmentSnap.data();
    const oldHorarioId   = oldAppointment.horarioId || `${oldAppointment.data}_${oldAppointment.hora}`;
    const ownerId        = oldAppointment.userId || currentUser.uid;

    const newSlotSnap = await transaction.get(newSlotRef);
    if (newSlotSnap.exists() && newSlotSnap.data().appointmentId !== appointmentId) {
      throw new Error("Horário já reservado.");
    }

    if (oldHorarioId && oldHorarioId !== payload.horarioId) {
      const oldSlotRef = doc(db, "slots", oldHorarioId);
      const oldSlotSnap = await transaction.get(oldSlotRef);
      if (oldSlotSnap.exists() && oldSlotSnap.data().appointmentId === appointmentId) {
        transaction.delete(oldSlotRef);
      }
    }

    transaction.update(appointmentRef, {
      ...payload,
      userId: ownerId,
      updatedAt: serverTimestamp()
    });

    transaction.set(newSlotRef, {
      appointmentId,
      userId:     ownerId,
      data:       payload.data,
      hora:       payload.hora,
      horarioId:  payload.horarioId,
      barbeiroId: payload.barbeiroId || "",
      servico:    payload.servico,
      duracao:    payload.duracao || 0,
      updatedAt:  serverTimestamp()
    }, { merge: true });
  });
}

function loadFormPage() {
  const form = $("booking-form");
  if (!form) return;

  const dataInput = $("data");
  if (dataInput) {
    dataInput.min = getTodayISO();
    dataInput.addEventListener("change", () => {
      clearError("data");
      clearError("hora");
      updateAvailableTimes();
    });
  }

  const timeSelect = $("hora");
  if (timeSelect) timeSelect.addEventListener("change", () => clearError("hora"));

  const openAppointmentsBtn = $("open-appointments");
  if (openAppointmentsBtn) {
    openAppointmentsBtn.addEventListener("click", () => {
      window.location.href = currentUser ? "agendamentos.html" : "auth.html";
    });
  }

  const cancelEditBtn = $("cancel-edit-btn");
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener("click", () => {
      resetFormState();
      showToast("Edição cancelada.");
    });
  }

  ["nome", "email", "observacoes"].forEach(fieldId => {
    const field = $(fieldId);
    if (!field) return;
    field.addEventListener("input", () => clearError(fieldId));
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();

    if (!currentUser) {
      showToast("Faça login para realizar um agendamento.");
      setTimeout(() => (window.location.href = "auth.html"), 700);
      return;
    }

    if (!validateForm()) return;

    const submitBtn = $("submit-btn");
    if (submitBtn) submitBtn.disabled = true;

    const payload = buildAppointmentPayload();
    const currentEditId = localStorage.getItem(EDIT_KEY);

    try {
      if (currentEditId) {
        await updateAppointment(currentEditId, payload);
        localStorage.removeItem(EDIT_KEY);
        showToast("Agendamento atualizado com sucesso.");
      } else {
        await createAppointment(payload);
        showToast("Agendamento solicitado com sucesso.");
      }

      setTimeout(() => {
        window.location.href = "agendamentos.html";
      }, 650);
    } catch (error) {
      console.error("Erro ao salvar agendamento:", error);
      if (error.message === "Horário já reservado." && currentUser && !currentEditId) {
        lastFailedPayload = buildAppointmentPayload();
        showToast("Horário já reservado. Você pode entrar na fila de espera.");
        $("waitlist-offer")?.classList.remove("hidden");
      } else {
        showToast(error.message || "Erro ao salvar no Firebase.");
      }
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function updateStats(appointments) {
  const totalElement     = $("stat-total");
  const confirmedElement = $("stat-confirmed");
  const pendingElement   = $("stat-pending");
  const revenueElement   = $("stat-revenue");
  const billedElement    = $("stat-billed");

  if (!totalElement || !confirmedElement || !pendingElement || !revenueElement) return;

  const confirmed = appointments.filter(item => item.status === "Confirmado").length;
  const pending   = appointments.filter(item => item.status === "Pendente").length;

  const forecast = appointments
    .filter(item => ["Pendente", "Confirmado"].includes(item.status))
    .reduce((sum, item) => sum + (Number(item.valor) || getServicePrice(item.servico)), 0);

  const billed = appointments
    .filter(item => item.status === "Concluído")
    .reduce((sum, item) => sum + (Number(item.valor) || getServicePrice(item.servico)), 0);

  totalElement.textContent     = String(appointments.length);
  confirmedElement.textContent = String(confirmed);
  pendingElement.textContent   = String(pending);
  revenueElement.textContent   = formatMoney(forecast);
  if (billedElement) billedElement.textContent = formatMoney(billed);
}

function createAppointmentCard(appointment) {
  const article = document.createElement("article");
  article.className = "appointment-card";

  const observationsText = appointment.observacoes?.trim() ? appointment.observacoes : "Sem observações.";
  const canClientCancel = currentUser && appointment.userId === currentUser.uid && !isAdmin && !["Cancelado", "Concluído"].includes(appointment.status);

  article.innerHTML = `
    <div class="card-top">
      <div class="client-avatar">${escapeHTML(getInitial(appointment.nome))}</div>
      <div class="client-info">
        <h3>${escapeHTML(appointment.nome)}</h3>
        <p>${escapeHTML(appointment.servico)}</p>
      </div>
      <span class="status-badge ${getStatusClass(appointment.status)}">${escapeHTML(appointment.status || "Pendente")}</span>
    </div>

    <div class="card-details">
      <div class="detail-item"><span class="material-symbols-outlined">calendar_today</span><span>${escapeHTML(formatDateBR(appointment.data))}</span></div>
      <div class="detail-item"><span class="material-symbols-outlined">schedule</span><span>${escapeHTML(appointment.hora || "")}</span></div>
      <div class="detail-item"><span class="material-symbols-outlined">content_cut</span><span>${escapeHTML(appointment.barbeiro || "Barbeiro não informado")}</span></div>
      <div class="detail-item"><span class="material-symbols-outlined">mail</span><span>${escapeHTML(appointment.email || "")}</span></div>
      <div class="detail-item"><span class="material-symbols-outlined">notes</span><span>${escapeHTML(observationsText)}</span></div>
      <div class="detail-item"><span class="material-symbols-outlined">payments</span><span>${formatMoney(appointment.valor || getServicePrice(appointment.servico))}</span></div>
    </div>

    <div class="card-actions">
      ${isAdmin ? `
        <button class="action-btn edit-btn" type="button" data-id="${escapeHTML(appointment.id)}"><span class="material-symbols-outlined">edit</span>Editar</button>
        <button class="action-btn status-btn" type="button" data-id="${escapeHTML(appointment.id)}"><span class="material-symbols-outlined">edit_note</span>Status</button>
        <button class="action-btn delete-btn" type="button" data-id="${escapeHTML(appointment.id)}"><span class="material-symbols-outlined">delete</span>Excluir</button>
      ` : ""}
      ${canClientCancel ? `
        <button class="action-btn cancel-btn" type="button" data-id="${escapeHTML(appointment.id)}"><span class="material-symbols-outlined">event_busy</span>Cancelar</button>
      ` : ""}
    </div>
  `;

  return article;
}

async function releaseSlotForAppointment(transaction, appointmentId, appointmentData) {
  const horarioId = appointmentData.horarioId || `${appointmentData.data}_${appointmentData.hora}`;
  if (!horarioId) return;

  const slotRef = doc(db, "slots", horarioId);
  const slotSnap = await transaction.get(slotRef);
  if (slotSnap.exists() && slotSnap.data().appointmentId === appointmentId) {
    transaction.delete(slotRef);
  }
}

async function cancelAppointment(id) {
  const cached = appointmentsCache.find(a => a.id === id);
  const appointmentRef = doc(db, "agendamentos", id);

  await runTransaction(db, async transaction => {
    const appointmentSnap = await transaction.get(appointmentRef);
    if (!appointmentSnap.exists()) throw new Error("Agendamento não encontrado.");

    const appointment = appointmentSnap.data();
    await releaseSlotForAppointment(transaction, id, appointment);

    transaction.update(appointmentRef, {
      status: "Cancelado",
      updatedAt: serverTimestamp()
    });
  });

  if (cached) await processWaitlistForSlot(cached);
}

async function handleDelete(id) {
  if (!confirm("Deseja realmente excluir este agendamento?")) return;

  const appointmentRef = doc(db, "agendamentos", id);

  try {
    await runTransaction(db, async transaction => {
      const appointmentSnap = await transaction.get(appointmentRef);
      if (!appointmentSnap.exists()) return;

      const appointment = appointmentSnap.data();
      await releaseSlotForAppointment(transaction, id, appointment);
      transaction.delete(appointmentRef);
    });

    showToast("Agendamento excluído.");
  } catch (error) {
    console.error("Erro ao excluir agendamento:", error);
    showToast("Erro ao excluir no Firebase.");
  }
}

function handleEdit(id) {
  localStorage.setItem(EDIT_KEY, id);
  window.location.href = "index.html";
}

async function setAppointmentStatus(id, targetStatus) {
  const appointment = appointmentsCache.find(item => item.id === id);
  if (!appointment) return;

  const appointmentRef = doc(db, "agendamentos", id);

  try {
    await runTransaction(db, async transaction => {
      const appointmentSnap = await transaction.get(appointmentRef);
      if (!appointmentSnap.exists()) throw new Error("Agendamento não encontrado.");

      const current = appointmentSnap.data();

      if (targetStatus === "Cancelado" || targetStatus === "Concluído") {
        await releaseSlotForAppointment(transaction, id, current);
      } else if ((current.status || "") === "Cancelado") {
        const horarioId = current.horarioId || `${current.data}_${current.hora}`;
        const slotRef   = doc(db, "slots", horarioId);
        const slotSnap  = await transaction.get(slotRef);

        if (slotSnap.exists() && slotSnap.data().appointmentId !== id) {
          throw new Error("Horário já reservado por outro cliente.");
        }

        if (!current.barbeiroId) {
          const horarioSnap = await transaction.get(doc(db, "horarios", horarioId));
          if (!horarioSnap.exists()) throw new Error("Horário não existe mais.");
        }

        transaction.set(slotRef, {
          appointmentId: id,
          userId:        current.userId,
          data:          current.data,
          hora:          current.hora,
          horarioId,
          barbeiroId:    current.barbeiroId || "",
          servico:       current.servico,
          duracao:       current.duracao || 0,
          updatedAt:     serverTimestamp()
        }, { merge: true });
      }

      transaction.update(appointmentRef, {
        status: targetStatus,
        updatedAt: serverTimestamp()
      });
    });

    showToast(`Status alterado para ${targetStatus}.`);

    if (targetStatus === "Cancelado") {
      await processWaitlistForSlot(appointment);
    }
  } catch (error) {
    console.error("Erro ao alterar status:", error);
    showToast(error.message || "Erro ao atualizar status.");
  }
}

function closeStatusPicker() {
  if (statusPickerEl) {
    statusPickerEl.remove();
    statusPickerEl = null;
  }
  document.removeEventListener("click", onOutsidePickerClick, true);
}

function onOutsidePickerClick(e) {
  if (statusPickerEl && !statusPickerEl.contains(e.target)) {
    closeStatusPicker();
  }
}

function showStatusPicker(id, currentStatus, anchorEl) {
  closeStatusPicker();

  const OPTIONS = [
    { value: "Pendente",   icon: "schedule",    cls: "pending"   },
    { value: "Confirmado", icon: "check_circle", cls: "confirmed" },
    { value: "Concluído",  icon: "task_alt",     cls: "completed" },
    { value: "Cancelado",  icon: "cancel",       cls: "cancelled" }
  ];

  statusPickerEl = document.createElement("div");
  statusPickerEl.className = "status-picker-dropdown";
  statusPickerEl.innerHTML = OPTIONS.map(opt => `
    <button class="status-picker-item ${opt.cls}${opt.value === currentStatus ? " current" : ""}"
            type="button"
            data-status="${escapeHTML(opt.value)}"
            ${opt.value === currentStatus ? "disabled" : ""}>
      <span class="material-symbols-outlined">${opt.icon}</span>
      ${escapeHTML(opt.value)}
    </button>
  `).join("");

  document.body.appendChild(statusPickerEl);

  const rect = anchorEl.getBoundingClientRect();
  const pw   = statusPickerEl.offsetWidth;
  const ph   = statusPickerEl.offsetHeight;

  let left = rect.left;
  let top  = rect.bottom + 8;

  // Horizontal overflow: empurra para esquerda se necessário
  if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
  if (left < 8) left = 8;

  // Vertical overflow: abre acima do botão se não couber abaixo
  if (top + ph > window.innerHeight - 8) top = rect.top - ph - 8;

  statusPickerEl.style.top  = `${top}px`;
  statusPickerEl.style.left = `${left}px`;

  statusPickerEl.querySelectorAll(".status-picker-item:not(:disabled)").forEach(btn => {
    btn.addEventListener("click", async e => {
      e.stopPropagation();
      closeStatusPicker();
      await setAppointmentStatus(id, btn.dataset.status);
    });
  });

  setTimeout(() => document.addEventListener("click", onOutsidePickerClick, true), 0);
}

async function processWaitlistForSlot(appointment) {
  const horarioId = appointment.horarioId || `${appointment.data}_${appointment.hora}`;
  if (!horarioId) return;

  try {
    const snap = await getDocs(query(waitlistCollection, where("horarioId", "==", horarioId)));
    if (snap.empty) return;

    const entries = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));

    const first  = entries[0];
    const newRef = doc(collection(db, "agendamentos"));
    const slotRef = doc(db, "slots", first.horarioId);

    await runTransaction(db, async transaction => {
      const slotSnap = await transaction.get(slotRef);
      if (slotSnap.exists()) return;

      transaction.set(newRef, {
        nome:        first.nome,
        email:       first.email,
        servico:     first.servico,
        data:        first.data,
        hora:        first.hora,
        horarioId:   first.horarioId,
        barbeiroId:  first.barbeiroId  || "",
        barbeiro:    first.barbeiro    || "",
        duracao:     first.duracao     || 0,
        valor:       first.valor       || 0,
        observacoes: first.observacoes || "",
        status:      "Pendente",
        userId:      first.userId,
        fromWaitlist: true,
        createdAt:   serverTimestamp(),
        updatedAt:   serverTimestamp()
      });

      transaction.set(slotRef, {
        appointmentId: newRef.id,
        userId:     first.userId,
        data:       first.data,
        hora:       first.hora,
        horarioId:  first.horarioId,
        barbeiroId: first.barbeiroId || "",
        servico:    first.servico,
        duracao:    first.duracao || 0,
        createdAt:  serverTimestamp(),
        updatedAt:  serverTimestamp()
      });

      transaction.delete(doc(db, "waitlist", first.id));
    });

    showToast(`Horário liberado! ${first.nome} da fila foi reagendado automaticamente.`);
  } catch (error) {
    console.error("Erro ao processar fila de espera:", error);
  }
}

async function joinWaitlist() {
  if (!currentUser) return showToast("Faça login para entrar na fila de espera.");
  if (!lastFailedPayload) return;

  const payload = lastFailedPayload;

  try {
    const existing = await getDocs(
      query(waitlistCollection,
        where("horarioId", "==", payload.horarioId),
        where("userId",    "==", currentUser.uid))
    );

    if (!existing.empty) {
      showToast("Você já está na fila para este horário.");
      $("waitlist-offer")?.classList.add("hidden");
      return;
    }

    await addDoc(waitlistCollection, {
      ...payload,
      userId:    currentUser.uid,
      createdAt: serverTimestamp()
    });

    lastFailedPayload = null;
    $("waitlist-offer")?.classList.add("hidden");
    showToast("Você entrou na fila! Será reagendado automaticamente se o horário abrir.");
  } catch (error) {
    console.error(error);
    showToast("Erro ao entrar na fila de espera.");
  }
}

function bindCardActions() {
  document.querySelectorAll(".delete-btn").forEach(button => {
    button.addEventListener("click", () => handleDelete(button.dataset.id));
  });

  document.querySelectorAll(".edit-btn").forEach(button => {
    button.addEventListener("click", () => handleEdit(button.dataset.id));
  });

  document.querySelectorAll(".status-btn").forEach(button => {
    button.addEventListener("click", e => {
      e.stopPropagation();
      const appt = appointmentsCache.find(a => a.id === button.dataset.id);
      showStatusPicker(button.dataset.id, appt?.status || "Pendente", button);
    });
  });

  document.querySelectorAll(".cancel-btn").forEach(button => {
    button.addEventListener("click", async () => {
      if (!confirm("Cancelar este agendamento?")) return;
      try {
        await cancelAppointment(button.dataset.id);
        showToast("Agendamento cancelado.");
      } catch (error) {
        console.error(error);
        showToast("Erro ao cancelar agendamento.");
      }
    });
  });
}

function renderAppointments(filteredAppointments = null) {
  const container = $("appointments-list");
  if (!container) return;

  const appointments = filteredAppointments || appointmentsCache;
  container.innerHTML = "";

  if (!appointments.length) {
    container.innerHTML = `
      <div class="empty-state">
        <span class="material-symbols-outlined">event_busy</span>
        <h3>Nenhum agendamento encontrado</h3>
        <p>${isAdmin ? "Cadastre horários e aguarde novos agendamentos." : "Faça um novo agendamento para começar."}</p>
      </div>
    `;
    updateStats([]);
    return;
  }

  appointments.forEach(appointment => container.appendChild(createAppointmentCard(appointment)));
  updateStats(appointments);
  bindCardActions();
}

function applyFilters() {
  const searchValue = ($("search-client")?.value || "").trim().toLowerCase();
  const serviceValue = $("filter-service")?.value || "Todos os serviços";
  const dateValue = $("filter-date")?.value || "";

  const filtered = appointmentsCache.filter(item => {
    const matchName = (item.nome || "").toLowerCase().includes(searchValue);
    const matchService = serviceValue === "Todos os serviços" || item.servico === serviceValue;
    const matchDate = !dateValue || item.data === dateValue;
    return matchName && matchService && matchDate;
  });

  renderAppointments(filtered);
}

function loadAppointmentsPage() {
  const container = $("appointments-list");
  if (!container) return;

  const searchInput = $("search-client");
  const serviceFilter = $("filter-service");
  const dateFilter = $("filter-date");

  if (searchInput) searchInput.addEventListener("input", applyFilters);
  if (serviceFilter) serviceFilter.addEventListener("change", applyFilters);
  if (dateFilter) dateFilter.addEventListener("change", applyFilters);
}

function subscribeAppointments() {
  if (!$('appointments-list') || !currentUser) return;
  if (typeof unsubscribers.appointments === "function") unsubscribers.appointments();

  const sourceQuery = isAdmin
    ? appointmentsCollection
    : query(appointmentsCollection, where("userId", "==", currentUser.uid));

  unsubscribers.appointments = onSnapshot(
    sourceQuery,
    snapshot => {
      appointmentsCache = sortByDateTime(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
      applyFilters();
      renderCommentsEligibility();
      updateAdminStats();
    },
    error => {
      console.error("Erro ao carregar agendamentos:", error);
      showToast("Erro ao carregar agendamentos.");
    }
  );
}

function subscribeServices() {
  if (typeof unsubscribers.services === "function") return;

  unsubscribers.services = onSnapshot(
    servicesCollection,
    snapshot => {
      servicesCache = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      renderServiceOptions();
      renderServiceFilter();
      renderServicesList();
      applyFilters();
      updateAdminStats();
      // Re-render barbeiro service checks when services list changes
      if ($("barbeiro-services-checks")) {
        const current = editingBarbeiroId ? barbeirosCache.find(b => b.id === editingBarbeiroId) : null;
        const sel = current
          ? (Array.isArray(current.services)
              ? Object.fromEntries(current.services.map(n => [n, 0]))
              : (current.services || {}))
          : {};
        renderBarbeiroServiceChecks(sel);
      }
    },
    error => {
      console.error("Erro ao carregar serviços:", error);
      renderServiceOptions();
      renderServiceFilter();
      renderServicesList();
    }
  );
}

function subscribeHorarios() {
  if (typeof unsubscribers.horarios !== "function") {
    unsubscribers.horarios = onSnapshot(
      horariosCollection,
      snapshot => {
        horariosCache = sortByDateTime(snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() })));
        renderHorariosList();
        updateAvailableTimes();
        updateAdminStats();
      },
      error => {
        console.error("Erro ao carregar horários:", error);
        showToast("Erro ao carregar horários disponíveis.");
      }
    );
  }

  if (typeof unsubscribers.slots !== "function") {
    unsubscribers.slots = onSnapshot(
      slotsCollection,
      snapshot => {
        slotsCache = new Map(snapshot.docs.map(docSnap => [docSnap.id, { id: docSnap.id, ...docSnap.data() }]));
        renderHorariosList();
        updateAvailableTimes();
        updateAdminStats();
      },
      error => {
        console.error("Erro ao carregar reservas:", error);
      }
    );
  }
}

function renderHorariosList() {
  const container = $("horarios-list");
  if (!container) return;

  if (!horariosCache.length) {
    container.innerHTML = `<div class="empty-row">Nenhum horário cadastrado.</div>`;
    return;
  }

  container.innerHTML = horariosCache.map(horario => {
    const slot = slotsCache.get(horario.id);
    const reservado = Boolean(slot);
    return `
      <div class="service-row ${reservado ? "reserved-row" : ""}">
        <div>
          <strong>${escapeHTML(formatDateBR(horario.data))} às ${escapeHTML(horario.hora)}</strong>
          <span>${escapeHTML(horario.barbeiro || "Barbeiro não informado")} — ${reservado ? "Reservado" : "Disponível"}</span>
        </div>
      </div>
    `;
  }).join("");
}

async function saveService() {
  if (!isAdmin) return showToast("Acesso negado.");

  const name = ($("service-name")?.value || "").trim();
  const price = Number(String($("service-price")?.value || "0").replace(",", "."));
  const editId = $("service-save")?.dataset.editId;

  if (name.length < 3) return showToast("Informe o nome do serviço.");
  if (Number.isNaN(price) || price < 0) return showToast("Informe um valor válido.");

  try {
    if (editId) {
      await updateDoc(doc(db, "services", editId), { name, price, updatedAt: serverTimestamp() });
      delete $("service-save").dataset.editId;
      $("service-save").textContent = "Salvar serviço";
      showToast("Serviço atualizado.");
    } else {
      await addDoc(servicesCollection, { name, price, icon: "content_cut", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      showToast("Serviço criado.");
    }

    $("service-form")?.reset();
  } catch (error) {
    console.error(error);
    showToast("Erro ao salvar serviço.");
  }
}

async function saveHorario() {
  if (!isAdmin) return showToast("Acesso negado.");

  const data = ($("horario-data")?.value || "").trim();
  const hora = ($("horario-hora")?.value || "").trim();
  const barbeiro = ($("horario-barber")?.value || "").trim();
  const editId = $("horario-save")?.dataset.editId;

  if (!data || !hora) return showToast("Informe data e hora.");
  if (data < getTodayISO()) return showToast("A data não pode ser anterior ao dia atual.");

  const newId = buildHorarioId(data, hora, barbeiro);

  try {
    if (editId) {
      if (editId !== newId) {
        if (slotsCache.has(editId)) return showToast("Não é possível alterar um horário reservado.");
        await setDoc(doc(db, "horarios", newId), { data, hora, barbeiro, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
        await deleteDoc(doc(db, "horarios", editId));
      } else {
        await updateDoc(doc(db, "horarios", editId), { data, hora, barbeiro, updatedAt: serverTimestamp() });
      }
      delete $("horario-save").dataset.editId;
      $("horario-save").textContent = "Salvar horário";
      showToast("Horário atualizado.");
    } else {
      await setDoc(doc(db, "horarios", newId), { data, hora, barbeiro, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
      showToast("Horário criado.");
    }

    $("horario-form")?.reset();
  } catch (error) {
    console.error(error);
    showToast("Erro ao salvar horário.");
  }
}

function renderCommentsEligibility() {
  const form = $("comment-form");
  const saveBtn = $("comment-save");
  const banner = $("eligibility-banner");

  if (!form || !saveBtn) return;

  form.classList.remove("hidden");

  if (!currentUser) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<span class="material-symbols-outlined">lock</span>Faça login para avaliar`;
    if (banner) banner.style.display = "";
    return;
  }

  saveBtn.disabled = false;
  saveBtn.innerHTML = `<span class="material-symbols-outlined">send</span>Enviar avaliação`;
  if (banner) banner.style.display = "none";
}

function renderCommentsList(items = []) {
  const container = $("comments-list");
  if (!container) return;

  // Apenas comentários aprovados (ou antigos sem o campo, tratados como aprovados)
  const visible = items.filter(c => c.approved !== false);

  if (!visible.length) {
    container.innerHTML = `
      <div class="empty-comments">
        <span class="material-symbols-outlined">reviews</span>
        <h3>Nenhuma avaliação ainda</h3>
        <p>Seja o primeiro a compartilhar sua experiência.</p>
      </div>`;
    return;
  }

  const starsHTML = rating => "★".repeat(Number(rating) || 5) + "☆".repeat(5 - (Number(rating) || 5));
  const initial = name => (name || "C").charAt(0).toUpperCase();

  container.innerHTML = visible.map(comment => `
    <div class="comment-card">
      <div class="comment-header">
        <div class="comment-avatar">${escapeHTML(initial(comment.authorName))}</div>
        <div class="comment-meta">
          <strong>${escapeHTML(comment.authorName || "Cliente")}</strong>
          <div class="comment-stars">${starsHTML(comment.rating)}</div>
        </div>
      </div>
      <p class="comment-body">${escapeHTML(comment.text || "")}</p>
      ${isAdmin ? `<div class="comment-actions"><button class="action-btn delete-btn delete-comment" type="button" data-id="${escapeHTML(comment.id)}"><span class="material-symbols-outlined" style="font-size:16px">delete</span> Remover</button></div>` : ""}
    </div>
  `).join("");

  container.querySelectorAll(".delete-comment").forEach(button => {
    button.addEventListener("click", async () => {
      if (!isAdmin) return showToast("Acesso negado.");
      if (!confirm("Remover comentário?")) return;

      try {
        await deleteDoc(doc(db, "comments", button.dataset.id));
        showToast("Comentário removido.");
      } catch (error) {
        console.error(error);
        showToast("Erro ao remover comentário.");
      }
    });
  });
}

function renderAdminCommentReview() {
  const section = $("admin-comment-review-section");
  const list = $("admin-review-list");
  const badge = $("pending-count-badge");

  if (!section || !list) return;

  if (!isAdmin) {
    section.style.display = "none";
    return;
  }

  section.style.display = "";

  const pending = commentsCache.filter(c => c.approved === false);

  if (badge) badge.textContent = pending.length ? `${pending.length} pendente${pending.length > 1 ? "s" : ""}` : "";

  if (!pending.length) {
    list.innerHTML = `
      <div class="empty-review">
        <span class="material-symbols-outlined">check_circle</span>
        <p>Nenhuma avaliação pendente de revisão.</p>
      </div>`;
    return;
  }

  const starsHTML = rating => "★".repeat(Number(rating) || 5) + "☆".repeat(5 - (Number(rating) || 5));
  const initial = name => (name || "C").charAt(0).toUpperCase();

  list.innerHTML = pending.map(comment => `
    <div class="review-item">
      <div class="review-item-header">
        <div class="comment-avatar">${escapeHTML(initial(comment.authorName))}</div>
        <div class="comment-meta">
          <strong>${escapeHTML(comment.authorName || "Cliente")}</strong>
          <div class="comment-stars">${starsHTML(comment.rating)}</div>
        </div>
      </div>
      <p class="comment-body">${escapeHTML(comment.text || "")}</p>
      <div class="review-item-actions">
        <button class="action-btn reject-btn reject-comment" type="button" data-id="${escapeHTML(comment.id)}">
          <span class="material-symbols-outlined" style="font-size:16px">close</span> Reprovar
        </button>
        <button class="action-btn approve-btn approve-comment" type="button" data-id="${escapeHTML(comment.id)}">
          <span class="material-symbols-outlined" style="font-size:16px">check</span> Aprovar
        </button>
      </div>
    </div>
  `).join("");

  list.querySelectorAll(".approve-comment").forEach(button => {
    button.addEventListener("click", async () => {
      try {
        await updateDoc(doc(db, "comments", button.dataset.id), { approved: true });
        showToast("Avaliação aprovada.");
      } catch (error) {
        console.error(error);
        showToast("Erro ao aprovar avaliação.");
      }
    });
  });

  list.querySelectorAll(".reject-comment").forEach(button => {
    button.addEventListener("click", async () => {
      if (!confirm("Reprovar e remover esta avaliação?")) return;
      try {
        await deleteDoc(doc(db, "comments", button.dataset.id));
        showToast("Avaliação reprovada.");
      } catch (error) {
        console.error(error);
        showToast("Erro ao reprovar avaliação.");
      }
    });
  });
}

function subscribeBarbeiros() {
  if (typeof unsubscribers.barbeiros === "function") return;

  unsubscribers.barbeiros = onSnapshot(
    barbeirosCollection,
    snapshot => {
      barbeirosCache = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      populateBarbeiroSelect();
      renderServiceOptions();
      renderBarberAdminList();
      updateAdminStats();

      // Re-render service checks when a barber being edited gets an update
      if (editingBarbeiroId && $("barbeiro-services-checks")) {
        const current = barbeirosCache.find(b => b.id === editingBarbeiroId);
        if (current) {
          const sel = Array.isArray(current.services)
            ? Object.fromEntries(current.services.map(n => [n, 0]))
            : (current.services || {});
          renderBarbeiroServiceChecks(sel);
        }
      }
    },
    error => console.error("Erro ao carregar barbeiros:", error)
  );
}

function subscribeComments() {
  if (!$("comments-list") || typeof unsubscribers.comments === "function") return;

  unsubscribers.comments = onSnapshot(
    commentsCollection,
    snapshot => {
      commentsCache = snapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      renderCommentsList(commentsCache);
      renderAdminCommentReview();
    },
    error => {
      console.error("Erro ao carregar comentários:", error);
      showToast("Erro ao carregar comentários.");
    }
  );
}

async function saveComment() {
  if (!currentUser) return showToast("Faça login para comentar.");

  const rating = Number($("comment-rating")?.value || 5);
  const text = ($("comment-text")?.value || "").trim();
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  if (!text) return showToast("Escreva um comentário.");
  if (wordCount > 50) return showToast("Comentário excede 50 palavras.");
  if (rating < 1 || rating > 5) return showToast("Selecione uma nota válida.");

  try {
    await addDoc(commentsCollection, {
      userId: currentUser.uid,
      authorName: currentUserData?.name || currentUser.displayName || "Cliente",
      rating,
      text,
      approved: false,
      createdAt: serverTimestamp()
    });

    $("comment-form")?.reset();
    const picker = $("star-picker");
    if (picker) picker.dataset.selected = "5";
    showToast("Obrigado pelo feedback!");
  } catch (error) {
    console.error(error);
    showToast("Erro ao enviar comentário.");
  }
}

function subscribeUsers() {
  const container = $("clients-list");
  if (!container) return;

  if (!isAdmin) {
    usersCache = [];
    container.innerHTML = "";
    if (typeof unsubscribers.users === "function") {
      unsubscribers.users();
      unsubscribers.users = null;
    }
    return;
  }

  if (typeof unsubscribers.users === "function") return;

  unsubscribers.users = onSnapshot(
    usersCollection,
    snapshot => {
      usersCache = snapshot.docs.map(docSnap => ({ id: docSnap.id, ...docSnap.data() }));
      renderUsersList();
      updateAdminStats();
    },
    error => {
      console.error("Erro ao carregar clientes:", error);
      showToast("Erro ao carregar clientes.");
    }
  );
}

async function deleteClient(userId) {
  if (!isAdmin) return showToast("Acesso negado.");
  if (!confirm("Remover este cliente? O perfil será excluído permanentemente.")) return;

  try {
    await deleteDoc(doc(db, "users", userId));
    showToast("Cliente removido.");
  } catch (error) {
    console.error(error);
    showToast("Erro ao remover cliente.");
  }
}

function renderUsersList() {
  const container = $("clients-list");
  if (!container) return;

  if (!usersCache.length) {
    container.innerHTML = `<div class="empty-row">Nenhum cliente encontrado.</div>`;
    return;
  }

  container.innerHTML = usersCache.map(user => `
    <div class="service-row">
      <div>
        <strong>${escapeHTML(user.name || "Sem nome")}</strong>
        <span>${escapeHTML(user.email || "")} ${user.phone ? "• " + escapeHTML(user.phone) : ""} • ${escapeHTML(user.role || "client")}</span>
      </div>
      ${user.role !== "admin" ? `
      <div class="row-actions">
        <button class="action-btn delete-client" type="button" data-id="${escapeHTML(user.id)}">Remover</button>
      </div>
      ` : ""}
    </div>
  `).join("");

  container.querySelectorAll(".delete-client").forEach(button => {
    button.addEventListener("click", () => deleteClient(button.dataset.id));
  });
}

async function initAuth() {
  onAuthStateChanged(auth, async user => {
    currentUser = user;
    currentUserData = null;
    isAdmin = false;

    if (user) {
      try {
        const userSnap = await getDoc(doc(db, "users", user.uid));
        if (userSnap.exists()) {
          currentUserData = userSnap.data();
          isAdmin = currentUserData.role === "admin";
        }
      } catch (error) {
        console.error("Erro ao obter dados do usuário:", error);
      }
    }

    updateAuthLink();
    updateAdminVisibility();
    prefillUserData();
    renderCommentsList(commentsCache);
    renderAdminCommentReview();

    const currentPage = window.location.pathname.split("/").pop() || "index.html";
    if (currentPage === "agendamentos.html" && !currentUser) {
      window.location.href = "auth.html";
      return;
    }

    if (currentPage === "admin.html" && (!currentUser || !isAdmin)) {
      window.location.href = currentUser ? "index.html" : "auth.html";
      return;
    }

    if (currentUser) {
      subscribeAppointments();
      subscribeUsers();
    }

    renderCommentsEligibility();

    const editId = localStorage.getItem(EDIT_KEY);
    if (editId && $("booking-form")) {
      await fillFormForEdit(editId);
    }
  });
}

// ============================================================
// BARBEIROS ADMIN (embedded in admin page)
// ============================================================

function handleBarbeiroPhotoUpload(event) {
  const file = event.target.files[0];
  if (!file || !file.type.startsWith("image/")) return showToast("Selecione uma imagem válida.");

  const reader = new FileReader();
  reader.onload = e => {
    const img = new Image();
    img.onload = () => {
      const SIZE   = 200;
      const canvas = document.createElement("canvas");
      canvas.width = SIZE; canvas.height = SIZE;
      const ctx    = canvas.getContext("2d");
      const side   = Math.min(img.width, img.height);
      const sx     = (img.width  - side) / 2;
      const sy     = (img.height - side) / 2;
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

function renderBarberAdminList() {
  const container = $("barbeiros-admin-list");
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
    const servicesList = svcNames.slice(0, 3).join(", ") || "Sem serviços";
    const inicio       = b.horarioInicio || "09:00";
    const fim          = b.horarioFim    || "20:00";
    const hasPhoto     = Boolean(b.photo);

    return `
      <div class="barbeiro-card" data-id="${escapeHTML(b.id)}">
        <div class="barbeiro-card-avatar">
          ${hasPhoto
            ? `<img src="${escapeHTML(b.photo)}" alt="${escapeHTML(b.name)}" class="visible" />`
            : escapeHTML((b.name || "B").charAt(0).toUpperCase())}
        </div>
        <div class="barbeiro-card-info">
          <strong>${escapeHTML(b.name || "Barbeiro")}</strong>
          <span class="barbeiro-card-services">${escapeHTML(servicesList)}</span>
          <span class="barbeiro-card-horario">${escapeHTML(inicio)} – ${escapeHTML(fim)}</span>
        </div>
        <div class="barbeiro-card-actions">
          <button class="action-btn edit-barbeiro-btn" type="button" data-id="${escapeHTML(b.id)}" title="Editar">
            <span class="material-symbols-outlined" style="font-size:16px">edit</span>
          </button>
          <button class="action-btn delete-btn delete-barbeiro-btn" type="button" data-id="${escapeHTML(b.id)}" title="Remover">
            <span class="material-symbols-outlined" style="font-size:16px">delete</span>
          </button>
        </div>
      </div>`;
  }).join("");

  container.querySelectorAll(".edit-barbeiro-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const b = barbeirosCache.find(x => x.id === btn.dataset.id);
      if (b) openEditBarbeiroForm(b);
    });
  });

  container.querySelectorAll(".delete-barbeiro-btn").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      deleteBarbeiroAdmin(btn.dataset.id);
    });
  });
}

function renderBarbeiroServiceChecks(selected = {}) {
  const container = $("barbeiro-services-checks");
  if (!container) return;

  if (!servicesCache.length) {
    container.innerHTML = `<p class="svc-empty-hint">Nenhum serviço cadastrado. Adicione serviços acima primeiro.</p>`;
    return;
  }

  const isObj = typeof selected === "object" && !Array.isArray(selected);

  container.innerHTML = servicesCache.map(s => {
    const id        = `svc-adm-${slugify(s.id || s.name)}`;
    const isChecked = isObj && Object.prototype.hasOwnProperty.call(selected, s.name);
    const duration  = isChecked ? (selected[s.name] || "") : "";
    return `
      <div class="service-check-item${isChecked ? " active" : ""}">
        <label class="svc-check-label" for="${escapeHTML(id)}">
          <input type="checkbox" id="${escapeHTML(id)}" value="${escapeHTML(s.name)}" ${isChecked ? "checked" : ""} />
          <span>${escapeHTML(s.name)}</span>
        </label>
        <div class="svc-duration-wrap${isChecked ? "" : " hidden"}">
          <input type="number" class="svc-duration-input"
            placeholder="min" min="5" max="480" step="5"
            value="${escapeHTML(String(duration))}" />
          <span class="svc-duration-unit">min</span>
        </div>
      </div>`;
  }).join("");

  container.querySelectorAll("input[type='checkbox']").forEach(cb => {
    cb.addEventListener("change", () => {
      const row   = cb.closest(".service-check-item");
      const wrap  = row.querySelector(".svc-duration-wrap");
      const input = row.querySelector(".svc-duration-input");
      row.classList.toggle("active", cb.checked);
      wrap.classList.toggle("hidden", !cb.checked);
      if (cb.checked) input.focus();
      else input.value = "";
    });
  });
}

function getCheckedBarbeiroServices() {
  const result = {};
  document.querySelectorAll("#barbeiro-services-checks input[type='checkbox']:checked").forEach(cb => {
    const row      = cb.closest(".service-check-item");
    const durInput = row?.querySelector(".svc-duration-input");
    result[cb.value] = Number(durInput?.value || 0);
  });
  return result;
}

function renderBarbeiroDiasChecks(selected = [1, 2, 3, 4, 5, 6]) {
  const container = $("barbeiro-dias-checks");
  if (!container) return;

  container.innerHTML = DIAS_SEMANA.map(d => {
    const isChecked = selected.includes(d.value);
    return `
      <label class="dia-check-item${isChecked ? " active" : ""}" for="dia-adm-${d.value}">
        <input type="checkbox" id="dia-adm-${d.value}" value="${d.value}" ${isChecked ? "checked" : ""} />
        ${escapeHTML(d.label)}
      </label>`;
  }).join("");

  container.querySelectorAll("input").forEach(cb => {
    cb.addEventListener("change", () => {
      cb.closest("label").classList.toggle("active", cb.checked);
    });
  });
}

function getCheckedBarbeiroDias() {
  return [...document.querySelectorAll("#barbeiro-dias-checks input:checked")]
    .map(cb => Number(cb.value));
}

function openAddBarbeiroForm() {
  editingBarbeiroId = null;
  pendingPhoto      = null;

  if ($("barbeiro-name"))           $("barbeiro-name").value = "";
  if ($("barbeiro-bio"))            $("barbeiro-bio").value  = "";
  if ($("barbeiro-inicio"))         $("barbeiro-inicio").value = "09:00";
  if ($("barbeiro-fim"))            $("barbeiro-fim").value   = "20:00";
  if ($("barbeiro-avatar-img"))     { $("barbeiro-avatar-img").src = ""; $("barbeiro-avatar-img").classList.remove("visible"); }
  if ($("barbeiro-avatar-initial")) { $("barbeiro-avatar-initial").textContent = "B"; $("barbeiro-avatar-initial").style.display = ""; }
  if ($("barbeiro-photo-upload"))   $("barbeiro-photo-upload").value = "";
  if ($("barbeiro-form-title"))     $("barbeiro-form-title").textContent = "Novo barbeiro";
  if ($("barbeiro-cancel-btn"))     $("barbeiro-cancel-btn").classList.add("hidden");

  renderBarbeiroServiceChecks({});
  renderBarbeiroDiasChecks([1, 2, 3, 4, 5, 6]);
}

function openEditBarbeiroForm(b) {
  editingBarbeiroId = b.id;
  pendingPhoto      = null;

  if ($("barbeiro-name"))      $("barbeiro-name").value    = b.name || "";
  if ($("barbeiro-bio"))       $("barbeiro-bio").value     = b.bio  || "";
  if ($("barbeiro-inicio"))    $("barbeiro-inicio").value  = b.horarioInicio || "09:00";
  if ($("barbeiro-fim"))       $("barbeiro-fim").value     = b.horarioFim    || "20:00";
  if ($("barbeiro-form-title")) $("barbeiro-form-title").textContent = "Editar barbeiro";
  if ($("barbeiro-cancel-btn")) $("barbeiro-cancel-btn").classList.remove("hidden");

  const avatarImg  = $("barbeiro-avatar-img");
  const avatarInit = $("barbeiro-avatar-initial");
  if (b.photo && avatarImg) {
    avatarImg.src = b.photo;
    avatarImg.classList.add("visible");
    if (avatarInit) avatarInit.style.display = "none";
  } else {
    if (avatarImg)  { avatarImg.src = ""; avatarImg.classList.remove("visible"); }
    if (avatarInit) { avatarInit.textContent = (b.name || "B").charAt(0).toUpperCase(); avatarInit.style.display = ""; }
  }

  const sel = Array.isArray(b.services)
    ? Object.fromEntries(b.services.map(n => [n, 0]))
    : (b.services || {});
  renderBarbeiroServiceChecks(sel);
  renderBarbeiroDiasChecks(Array.isArray(b.diasDisponiveis) ? b.diasDisponiveis : [1, 2, 3, 4, 5, 6]);

  $("barbeiro-name")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function saveBarbeiroAdmin() {
  if (!isAdmin) return showToast("Acesso negado.");

  const name          = ($("barbeiro-name")?.value || "").trim();
  const horarioInicio = $("barbeiro-inicio")?.value || "09:00";
  const horarioFim    = $("barbeiro-fim")?.value    || "20:00";

  if (name.length < 2) return showToast("Informe um nome válido.");
  if (horarioInicio >= horarioFim) return showToast("O horário de início deve ser anterior ao de fim.");

  const services = getCheckedBarbeiroServices();
  const entries  = Object.entries(services);
  if (!entries.length) return showToast("Selecione ao menos um serviço.");
  for (const [svcName, dur] of entries) {
    if (!dur || dur < 5) return showToast(`Informe o tempo em minutos para "${svcName}".`);
  }

  const diasDisponiveis = getCheckedBarbeiroDias();
  if (!diasDisponiveis.length) return showToast("Selecione ao menos um dia de atendimento.");

  const bio = ($("barbeiro-bio")?.value || "").trim();
  const data = { name, bio, services, diasDisponiveis, horarioInicio, horarioFim };
  if (pendingPhoto) data.photo = pendingPhoto;

  try {
    if (editingBarbeiroId) {
      data.updatedAt = serverTimestamp();
      await updateDoc(doc(db, "barbeiros", editingBarbeiroId), data);
      showToast("Barbeiro atualizado.");
    } else {
      data.photo     = pendingPhoto || "";
      data.createdAt = serverTimestamp();
      await addDoc(barbeirosCollection, data);
      showToast("Barbeiro adicionado.");
    }
    openAddBarbeiroForm();
  } catch (err) {
    console.error(err);
    showToast("Erro ao salvar barbeiro.");
  }
}

async function deleteBarbeiroAdmin(id) {
  if (!isAdmin) return showToast("Acesso negado.");
  if (!confirm("Remover este barbeiro?")) return;
  try {
    await deleteDoc(doc(db, "barbeiros", id));
    showToast("Barbeiro removido.");
  } catch (err) {
    console.error(err);
    showToast("Erro ao remover barbeiro.");
  }
}

function loadBarberAdminSection() {
  if (!$("barbeiros-admin-list")) return;

  $("barbeiro-photo-upload")?.addEventListener("change", handleBarbeiroPhotoUpload);
  $("barbeiro-save-btn")?.addEventListener("click", saveBarbeiroAdmin);
  $("barbeiro-cancel-btn")?.addEventListener("click", () => {
    openAddBarbeiroForm();
  });

  openAddBarbeiroForm();
}

window.addEventListener("beforeunload", () => {
  Object.values(unsubscribers).forEach(unsubscribe => {
    if (typeof unsubscribe === "function") unsubscribe();
  });
});

document.addEventListener("DOMContentLoaded", () => {
  renderServiceOptions();
  loadFormPage();
  loadAppointmentsPage();
  subscribeServices();
  subscribeHorarios();
  subscribeBarbeiros();
  subscribeComments();
  initAuth();

  loadBarberAdminSection();

  const barbeiroSelect = $("barbeiro");
  if (barbeiroSelect) barbeiroSelect.addEventListener("change", onBarbeiroChange);

  const serviceSave = $("service-save");
  if (serviceSave) serviceSave.addEventListener("click", saveService);

  const commentSave = $("comment-save");
  if (commentSave) commentSave.addEventListener("click", saveComment);

  const waitlistJoinBtn = $("waitlist-join-btn");
  if (waitlistJoinBtn) waitlistJoinBtn.addEventListener("click", joinWaitlist);

  const waitlistDismissBtn = $("waitlist-dismiss-btn");
  if (waitlistDismissBtn) waitlistDismissBtn.addEventListener("click", () => {
    $("waitlist-offer")?.classList.add("hidden");
    lastFailedPayload = null;
  });
});
