import { evaluateRequest as evaluateProductionRequest } from "../server/rules.mjs";
import { createApp as createProductionApp } from "../server/index.mjs";

// Test-only clock. Production defaults to the real server time in Asia/Shanghai.
export const TEST_NOW = "2026-11-06T04:00:00.000Z";
export const evaluateRequest = (input, options = {}) =>
  evaluateProductionRequest(input, { now: TEST_NOW, ...options });
export const createApp = (options) =>
  createProductionApp({ clock: () => new Date(TEST_NOW), ...options });
