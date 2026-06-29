import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

/**
 * Shared helpers for the US-11 (manual sync / integrations) E2E suite.
 */

export const TEST_USER = {
  email: "e2e-sync@chatyourtraining.test",
  password: "SyncTest!2026",
};

/** Service-role admin client — used by global-setup to seed the test user/integration. */
export function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (check .env.local)."
    );
  }
  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Resolve the auth user id for the test account. */
export async function getTestUserId(admin: SupabaseClient): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  const user = data.users.find((u) => u.email === TEST_USER.email);
  if (!user) throw new Error(`Test user ${TEST_USER.email} not found`);
  return user.id;
}

/** UI sign-in. /integrations is middleware-protected, so every spec authenticates first. */
export async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(TEST_USER.email);
  await page.getByLabel("Mot de passe").fill(TEST_USER.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}
