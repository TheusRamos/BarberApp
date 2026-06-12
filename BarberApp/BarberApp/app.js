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

const EDIT_KEY = "barber_agendamento_editando";
const STATUS_SEQUENCE = ["Pendente", "Confirmado", "Concluído", "Cancelado"];

const DEFAULT_SERVICES = [
  { id: "corte-simples", name: "Corte Simples", price: 30, icon: "content_cut" },
  { id: "corte-barba", name: "Corte e Barba", price: 45, icon: "face" },
  { id: "premium", name: "Experiência Premium", price: 70, icon: "workspace_premium" }
];

let currentUser = null;
let currentUserData = null;
let isAdmin = false;
let appointmentsCache = [];
let servicesCache = [];
let horariosCache = [];
let slotsCache = new Map();
let usersCache = [];
let pendingEditAppointment = null;

const unsubscribers = {
  appointments: null,
  services: null,
  horarios: null,
  slots: null,
  comments: null,
  users: null
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
  return servicesCache.length > 0 ? servicesCache : DEFAULT_SERVICES;
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
  const adminSection = $("admin-section");
  if (adminSection) adminSection.classList.toggle("hidden", !isAdmin);

  const description = $("appointments-description");
  if (description) {
    description.textContent = isAdmin
      ? "Acompanhe todos os horários marcados, visualize clientes e organize a rotina da barbearia."
      : "Acompanhe seus horários marcados e consulte o andamento dos seus serviços.";
  }
}

function renderServiceOptions() {
  const grid = $("services-grid");
  if (!grid) return;

  const services = getServicesForUI();
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
    input.addEventListener("change", () => clearError("servico"));
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
    container.innerHTML = `<div class="empty-row">Nenhum serviço cadastrado no Firestore. O sistema está usando os serviços padrão.</div>`;
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
  const select = $("hora");
  if (!dateInput || !select) return;

  const selectedDate = dateInput.value;
  const editId = localStorage.getItem(EDIT_KEY);
  const currentHorarioId = pendingEditAppointment?.horarioId || "";

  select.innerHTML = "";

  if (!selectedDate) {
    select.disabled = true;
    select.innerHTML = `<option value="">Selecione uma data primeiro</option>`;
    return;
  }

  const horarios = sortByDateTime(
    horariosCache.filter(horario => {
      if (horario.data !== selectedDate) return false;
      const slot = slotsCache.get(horario.id);
      return !slot || (editId && slot.appointmentId === editId) || horario.id === currentHorarioId;
    })
  );

  if (!horarios.length) {
    select.disabled = true;
    select.innerHTML = `<option value="">Nenhum horário disponível nessa data</option>`;
    return;
  }

  select.disabled = false;
  select.innerHTML = `<option value="">Selecione um horário</option>` + horarios.map(horario => {
    const barbeiro = horario.barbeiro ? ` • ${horario.barbeiro}` : "";
    return `<option value="${escapeHTML(horario.id)}">${escapeHTML(horario.hora)}${escapeHTML(barbeiro)}</option>`;
  }).join("");

  if (currentHorarioId && horarios.some(horario => horario.id === currentHorarioId)) {
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

  ["nome", "email", "data", "hora", "servico"].forEach(clearError);

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

    renderServiceOptions();
    const selectedService = Array.from(document.querySelectorAll('input[name="servico"]'))
      .find(input => input.value === (appointment.servico || ""));
    if (selectedService) selectedService.checked = true;

    updateAvailableTimes();
    if ($("hora")) $("hora").value = appointment.horarioId || "";

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
  const horario = getSelectedHorario();
  const servico = getSelectedServiceName();

  return {
    nome: $("nome").value.trim(),
    email: $("email").value.trim(),
    servico,
    data: $("data").value,
    hora: horario?.hora || "",
    horarioId: horario?.id || "",
    barbeiro: horario?.barbeiro || "",
    observacoes: $("observacoes").value.trim(),
    valor: getServicePrice(servico)
  };
}

async function createAppointment(payload) {
  const appointmentRef = doc(collection(db, "agendamentos"));
  const horarioRef = doc(db, "horarios", payload.horarioId);
  const slotRef = doc(db, "slots", payload.horarioId);

  await runTransaction(db, async transaction => {
    const horarioSnap = await transaction.get(horarioRef);
    if (!horarioSnap.exists()) throw new Error("Horário não disponível.");

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
      userId: currentUser.uid,
      data: payload.data,
      hora: payload.hora,
      horarioId: payload.horarioId,
      servico: payload.servico,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
}

async function updateAppointment(appointmentId, payload) {
  const appointmentRef = doc(db, "agendamentos", appointmentId);
  const newHorarioRef = doc(db, "horarios", payload.horarioId);
  const newSlotRef = doc(db, "slots", payload.horarioId);

  await runTransaction(db, async transaction => {
    const appointmentSnap = await transaction.get(appointmentRef);
    if (!appointmentSnap.exists()) throw new Error("Agendamento não encontrado.");

    const oldAppointment = appointmentSnap.data();
    const oldHorarioId = oldAppointment.horarioId || `${oldAppointment.data}_${oldAppointment.hora}`;
    const ownerId = oldAppointment.userId || currentUser.uid;

    const horarioSnap = await transaction.get(newHorarioRef);
    if (!horarioSnap.exists()) throw new Error("Horário não disponível.");

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
      userId: ownerId,
      data: payload.data,
      hora: payload.hora,
      horarioId: payload.horarioId,
      servico: payload.servico,
      updatedAt: serverTimestamp()
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
      showToast(error.message || "Erro ao salvar no Firebase.");
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });
}

function updateStats(appointments) {
  const totalElement = $("stat-total");
  const confirmedElement = $("stat-confirmed");
  const pendingElement = $("stat-pending");
  const revenueElement = $("stat-revenue");

  if (!totalElement || !confirmedElement || !pendingElement || !revenueElement) return;

  const activeAppointments = appointments.filter(item => item.status !== "Cancelado");
  const confirmed = appointments.filter(item => item.status === "Confirmado").length;
  const pending = appointments.filter(item => item.status === "Pendente").length;
  const revenue = activeAppointments.reduce((sum, item) => sum + (Number(item.valor) || getServicePrice(item.servico)), 0);

  totalElement.textContent = String(appointments.length);
  confirmedElement.textContent = String(confirmed);
  pendingElement.textContent = String(pending);
  revenueElement.textContent = formatMoney(revenue);
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
        <button class="action-btn status-btn" type="button" data-id="${escapeHTML(appointment.id)}"><span class="material-symbols-outlined">sync</span>Status</button>
        <button class="action-btn delete-btn" type="button" data-id="${escapeHTML(appointment.id)}"><span class="material-symbols-outlined">delete</span>Excluir</button>
      ` : ""}
      ${canClientCancel ? `
        <button class="action-btn cancel-btn" type="button" data-id="${escapeHTML(appointment.id)}"><span class="material-symbols-outlined">event_busy</span>Cancelar</button>
      ` : ""}
    </div>
  `;

  return article;
}

function getNextStatus(currentStatus) {
  const currentIndex = STATUS_SEQUENCE.indexOf(currentStatus);
  if (currentIndex === -1) return STATUS_SEQUENCE[0];
  return STATUS_SEQUENCE[(currentIndex + 1) % STATUS_SEQUENCE.length];
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

async function handleStatusChange(id) {
  const appointment = appointmentsCache.find(item => item.id === id);
  if (!appointment) return;

  const nextStatus = getNextStatus(appointment.status || "Pendente");
  const appointmentRef = doc(db, "agendamentos", id);

  try {
    await runTransaction(db, async transaction => {
      const appointmentSnap = await transaction.get(appointmentRef);
      if (!appointmentSnap.exists()) throw new Error("Agendamento não encontrado.");

      const currentAppointment = appointmentSnap.data();

      if (nextStatus === "Cancelado") {
        await releaseSlotForAppointment(transaction, id, currentAppointment);
      } else if ((currentAppointment.status || "") === "Cancelado") {
        const horarioId = currentAppointment.horarioId || `${currentAppointment.data}_${currentAppointment.hora}`;
        const horarioRef = doc(db, "horarios", horarioId);
        const slotRef = doc(db, "slots", horarioId);
        const horarioSnap = await transaction.get(horarioRef);
        const slotSnap = await transaction.get(slotRef);

        if (!horarioSnap.exists()) throw new Error("Horário não existe mais.");
        if (slotSnap.exists() && slotSnap.data().appointmentId !== id) throw new Error("Horário já reservado.");

        transaction.set(slotRef, {
          appointmentId: id,
          userId: currentAppointment.userId,
          data: currentAppointment.data,
          hora: currentAppointment.hora,
          horarioId,
          servico: currentAppointment.servico,
          updatedAt: serverTimestamp()
        }, { merge: true });
      }

      transaction.update(appointmentRef, {
        status: nextStatus,
        updatedAt: serverTimestamp()
      });
    });

    showToast(`Status alterado para ${nextStatus}.`);
  } catch (error) {
    console.error("Erro ao alterar status:", error);
    showToast(error.message || "Erro ao atualizar status.");
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
    button.addEventListener("click", () => handleStatusChange(button.dataset.id));
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
          <span>${escapeHTML(horario.barbeiro || "Barbeiro não informado")} ${reservado ? "• Reservado" : "• Disponível"}</span>
        </div>
        <div class="row-actions">
          ${isAdmin ? `
            <button class="action-btn edit-horario" type="button" data-id="${escapeHTML(horario.id)}">Editar</button>
            <button class="action-btn delete-horario" type="button" data-id="${escapeHTML(horario.id)}">Remover</button>
          ` : ""}
        </div>
      </div>
    `;
  }).join("");

  container.querySelectorAll(".edit-horario").forEach(button => {
    button.addEventListener("click", () => {
      const horario = horariosCache.find(item => item.id === button.dataset.id);
      if (!horario) return;
      $("horario-data").value = horario.data || "";
      $("horario-hora").value = horario.hora || "";
      $("horario-barber").value = horario.barbeiro || "";
      $("horario-save").dataset.editId = horario.id;
      $("horario-save").textContent = "Atualizar horário";
    });
  });

  container.querySelectorAll(".delete-horario").forEach(button => {
    button.addEventListener("click", async () => {
      if (!isAdmin) return showToast("Acesso negado.");
      if (slotsCache.has(button.dataset.id)) return showToast("Não é possível remover um horário reservado.");
      if (!confirm("Remover este horário?")) return;

      try {
        await deleteDoc(doc(db, "horarios", button.dataset.id));
        showToast("Horário removido.");
      } catch (error) {
        console.error(error);
        showToast("Erro ao remover horário.");
      }
    });
  });
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
  if (!form || !saveBtn) return;

  if (isAdmin) {
    form.classList.add("hidden");
    return;
  }

  form.classList.remove("hidden");

  if (!currentUser) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Faça login para comentar";
    return;
  }

  const completed = appointmentsCache.filter(item => item.userId === currentUser.uid && item.status === "Concluído").length;
  const allowed = completed >= 3;

  saveBtn.disabled = !allowed;
  saveBtn.textContent = allowed ? "Enviar comentário" : `Precisa de 3 serviços concluídos (${completed}/3)`;
}

function renderCommentsList(items = []) {
  const container = $("comments-list");
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `<div class="empty-row">Nenhum comentário enviado ainda.</div>`;
    return;
  }

  container.innerHTML = items.map(comment => `
    <div class="comment-row">
      <div><strong>${escapeHTML(comment.authorName || "Cliente")}</strong><span>${escapeHTML(comment.rating || 5)} ★</span></div>
      <p>${escapeHTML(comment.text || "")}</p>
      ${isAdmin ? `<button class="action-btn delete-comment" type="button" data-id="${escapeHTML(comment.id)}">Remover</button>` : ""}
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

function subscribeComments() {
  if (!$("comments-list") || typeof unsubscribers.comments === "function") return;

  unsubscribers.comments = onSnapshot(
    commentsCollection,
    snapshot => {
      const items = snapshot.docs
        .map(docSnap => ({ id: docSnap.id, ...docSnap.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
      renderCommentsList(items);
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
  const completed = appointmentsCache.filter(item => item.userId === currentUser.uid && item.status === "Concluído").length;

  if (completed < 3) return showToast("É necessário ter pelo menos 3 serviços concluídos para comentar.");
  if (!text) return showToast("Escreva um comentário.");
  if (wordCount > 50) return showToast("Comentário excede 50 palavras.");
  if (rating < 1 || rating > 5) return showToast("Selecione uma nota válida.");

  try {
    await addDoc(commentsCollection, {
      userId: currentUser.uid,
      authorName: currentUserData?.name || currentUser.displayName || "Cliente",
      rating,
      text,
      createdAt: serverTimestamp()
    });

    $("comment-form")?.reset();
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

    const currentPage = window.location.pathname.split("/").pop() || "index.html";
    if (currentPage === "agendamentos.html" && !currentUser) {
      window.location.href = "auth.html";
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
  subscribeComments();
  initAuth();

  const serviceSave = $("service-save");
  if (serviceSave) serviceSave.addEventListener("click", saveService);

  const horarioSave = $("horario-save");
  if (horarioSave) horarioSave.addEventListener("click", saveHorario);

  const commentSave = $("comment-save");
  if (commentSave) commentSave.addEventListener("click", saveComment);
});
