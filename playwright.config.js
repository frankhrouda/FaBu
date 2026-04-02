import { defineConfig, devices } from '@playwright/test';
import path from 'path';

const e2eDbPath = path.resolve('backend/data/fabu-e2e.db');
const commonBackendEnv = {
  DB_CLIENT: 'sqlite',
  SQLITE_DB_PATH: e2eDbPath,
  JWT_SECRET: 'e2e-jwt-secret',
  PORT: '3001',
};

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: 'node backend/scripts/seed-e2e.js && npm run start --workspace=backend',
      url: 'http://127.0.0.1:3001/api/vehicles',
      reuseExistingServer: false,
      env: commonBackendEnv,
    },
    {
      command: 'npm run dev --workspace=frontend -- --host 127.0.0.1 --port 4173',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
      env: {
        VITE_API_BASE_URL: '/api',
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});