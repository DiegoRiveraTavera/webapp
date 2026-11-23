const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:4100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: process.env.CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH }
      : {},
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // Si no se da E2E_BASE_URL (CI local), Playwright levanta el servidor el mismo.
  webServer: process.env.E2E_BASE_URL ? undefined : {
    command: 'node src/server.js',
    url: 'http://127.0.0.1:4100/',
    reuseExistingServer: false,
    timeout: 20000,
    env: {
      PORT: '4100',
      SOCKET_PORT: '4101',
      DB_FILE: ':memory:',
      DATA_DIR: '/tmp/e2e-data',
      ADMIN_USERNAME: 'admin',
      ADMIN_PASSWORD: 'admin123',
      OTEL_EXPORTER_OTLP_ENDPOINT: '', // deshabilita envio real durante E2E local
    },
  },
});
