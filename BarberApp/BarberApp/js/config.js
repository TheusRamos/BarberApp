// Use /api ao abrir o site pelo servidor Node.js (npm start).
// Para frontend separado, use a URL HTTPS do backend e configure CORS_ORIGIN nele.
export const apiBaseUrl = '/api';

// Fuso da barbearia (igual a APP_TIMEZONE no servidor): define "hoje" e os horários já passados,
// mesmo para quem acessa de outro fuso ou com o relógio do aparelho diferente.
export const appTimeZone = 'America/Sao_Paulo';
