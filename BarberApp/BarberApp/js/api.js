// ============================================================
// API CLIENT — camada de acesso ao backend (REST + PostgreSQL)
// ============================================================
// Este módulo concentra toda a comunicação com o backend. Enquanto a API
// não existir, as chamadas abaixo vão falhar com erro de rede — isso é
// esperado. Quando o backend estiver no ar, basta ajustar API_BASE_URL
// (ou definir window.API_BASE_URL antes de carregar os scripts).
//
// Contrato esperado da API (a ser implementado no backend):
//
//   POST   /auth/register        { name, email, phone, password }        -> { token, user }
//   POST   /auth/login           { email, password }                     -> { token, user }
//   POST   /auth/logout          -                                       -> {}
//   GET    /auth/me              -                                       -> { user }
//
//   GET    /users                                                        -> User[]           (admin)
//   PATCH  /users/:id            Partial<User>                           -> User
//   DELETE /users/:id                                                    -> {}                (admin)
//
//   GET    /services                                                     -> Service[]
//   POST   /services             { name, price, icon }                   -> Service           (admin)
//   PATCH  /services/:id         Partial<Service>                        -> Service           (admin)
//   DELETE /services/:id                                                 -> {}                (admin)
//
//   GET    /barbeiros                                                    -> Barbeiro[]
//   POST   /barbeiros            Barbeiro                                -> Barbeiro          (admin)
//   PATCH  /barbeiros/:id        Partial<Barbeiro>                       -> Barbeiro          (admin)
//   DELETE /barbeiros/:id                                                -> {}                (admin)
//
//   GET    /horarios                                                     -> Horario[]         (legado)
//   POST   /horarios             Horario                                 -> Horario           (admin)
//   PATCH  /horarios/:id         Partial<Horario>                        -> Horario           (admin)
//   DELETE /horarios/:id                                                 -> {}                (admin)
//
//   GET    /slots                                                        -> Slot[]
//
//   GET    /agendamentos                                                 -> Agendamento[]     (próprios ou todos se admin)
//   POST   /agendamentos         Agendamento                             -> Agendamento        (erro SLOT_TAKEN se conflito)
//   PATCH  /agendamentos/:id     Partial<Agendamento>                    -> Agendamento
//   PATCH  /agendamentos/:id/status  { status }                          -> Agendamento
//   POST   /agendamentos/:id/cancel  -                                   -> Agendamento
//   DELETE /agendamentos/:id                                             -> {}
//
//   POST   /waitlist             WaitlistEntry                           -> WaitlistEntry
//
//   GET    /comments                                                     -> Comment[]
//   POST   /comments             { rating, text }                        -> Comment
//   PATCH  /comments/:id         { approved }                            -> Comment           (admin)
//   DELETE /comments/:id                                                 -> {}                (admin ou dono)
//
// Todas as respostas de erro devem retornar JSON no formato:
//   { "message": "Texto legível para o usuário", "code": "SLOT_TAKEN" }

const API_BASE_URL = (typeof window !== "undefined" && window.API_BASE_URL) || "/api";
const TOKEN_KEY = "barber_auth_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

class ApiError extends Error {
  constructor(message, { status, code } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function request(path, { method = "GET", body, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = auth ? getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch (networkError) {
    throw new ApiError("Não foi possível conectar ao servidor.", { code: "NETWORK_ERROR" });
  }

  let data = null;
  try {
    data = await response.json();
  } catch {
    // resposta sem corpo (ex: 204)
  }

  if (!response.ok) {
    throw new ApiError(data?.message || `Erro na requisição (${response.status}).`, {
      status: response.status,
      code: data?.code
    });
  }

  return data;
}

export const api = {
  auth: {
    register: payload => request("/auth/register", { method: "POST", body: payload, auth: false }),
    login: payload => request("/auth/login", { method: "POST", body: payload, auth: false }),
    logout: () => request("/auth/logout", { method: "POST" }),
    me: () => request("/auth/me")
  },

  users: {
    list: () => request("/users"),
    update: (id, payload) => request(`/users/${id}`, { method: "PATCH", body: payload }),
    remove: id => request(`/users/${id}`, { method: "DELETE" })
  },

  services: {
    list: () => request("/services", { auth: false }),
    create: payload => request("/services", { method: "POST", body: payload }),
    update: (id, payload) => request(`/services/${id}`, { method: "PATCH", body: payload }),
    remove: id => request(`/services/${id}`, { method: "DELETE" })
  },

  barbeiros: {
    list: () => request("/barbeiros", { auth: false }),
    create: payload => request("/barbeiros", { method: "POST", body: payload }),
    update: (id, payload) => request(`/barbeiros/${id}`, { method: "PATCH", body: payload }),
    remove: id => request(`/barbeiros/${id}`, { method: "DELETE" })
  },

  horarios: {
    list: () => request("/horarios", { auth: false }),
    create: payload => request("/horarios", { method: "POST", body: payload }),
    update: (id, payload) => request(`/horarios/${id}`, { method: "PATCH", body: payload }),
    remove: id => request(`/horarios/${id}`, { method: "DELETE" })
  },

  slots: {
    list: () => request("/slots", { auth: false })
  },

  agendamentos: {
    list: () => request("/agendamentos"),
    get: id => request(`/agendamentos/${id}`),
    create: payload => request("/agendamentos", { method: "POST", body: payload }),
    update: (id, payload) => request(`/agendamentos/${id}`, { method: "PATCH", body: payload }),
    updateStatus: (id, status) => request(`/agendamentos/${id}/status`, { method: "PATCH", body: { status } }),
    cancel: id => request(`/agendamentos/${id}/cancel`, { method: "POST" }),
    remove: id => request(`/agendamentos/${id}`, { method: "DELETE" })
  },

  waitlist: {
    create: payload => request("/waitlist", { method: "POST", body: payload })
  },

  comments: {
    list: () => request("/comments", { auth: false }),
    create: payload => request("/comments", { method: "POST", body: payload }),
    approve: id => request(`/comments/${id}`, { method: "PATCH", body: { approved: true } }),
    remove: id => request(`/comments/${id}`, { method: "DELETE" })
  }
};
