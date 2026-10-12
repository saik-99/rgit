// src/core/index.js
// [PRO 1 / LEAD ARCHITECT ZONE]
// Central state, API clients, and application wiring.

export const APP_CONFIG = {
  name: "Hackathon App",
  version: "0.1.0",
  apiBaseUrl: "http://localhost:3000/api",
};

console.log("Core initialized:", APP_CONFIG.name);
