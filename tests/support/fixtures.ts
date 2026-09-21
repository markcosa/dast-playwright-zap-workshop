import { test as base, expect, Page } from '@playwright/test';

export const USERS = {
  ana: { username: 'ana', password: 'Patito123!', name: 'Ana López' },
  luis: { username: 'luis', password: 'Quack2026!', name: 'Luis Pérez' },
} as const;

export class LoginPage {
  constructor(private readonly page: Page) {}
  async goto() {
    await this.page.goto('/login');
  }
  async login(username: string, password: string) {
    await this.page.getByLabel('Usuario').fill(username);
    await this.page.getByLabel('Contraseña').fill(password);
    await this.page.getByRole('button', { name: 'Entrar' }).click();
  }
}

export class DashboardPage {
  constructor(private readonly page: Page) {}
  readonly balance = () => this.page.getByTestId('balance');
  async balanceValue(): Promise<number> {
    const text = (await this.balance().textContent()) ?? '';
    return Number(text.replace(/[^0-9.-]/g, ''));
  }
  async search(term: string) {
    await this.page.getByLabel('Concepto').fill(term);
    await this.page.getByRole('button', { name: 'Buscar' }).click();
  }
}

type Fixtures = {
  loginPage: LoginPage;
  dashboard: DashboardPage;
  /** Página ya autenticada como "ana" */
  authedPage: Page;
};

export const test = base.extend<Fixtures>({
  loginPage: async ({ page }, use) => use(new LoginPage(page)),
  dashboard: async ({ page }, use) => use(new DashboardPage(page)),
  authedPage: async ({ page }, use) => {
    const login = new LoginPage(page);
    await login.goto();
    await login.login(USERS.ana.username, USERS.ana.password);
    await expect(page).toHaveURL(/\/dashboard$/);
    await use(page);
  },
});

export { expect };
