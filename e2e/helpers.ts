import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";

export interface TestUser {
  email: string;
  password: string;
}

export const TEST_USER: TestUser = {
  email: "e2e-calendar@chatyourtraining.test",
  password: "CalendarTest!2026",
};

export const CYCLING_SPORT_ID = "00000000-0000-0000-0000-000000000002";
export const RUNNING_SPORT_ID = "00000000-0000-0000-0000-000000000001";

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

export async function getUserIdByEmail(
  admin: SupabaseClient,
  email: string
): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (error) throw error;
  const user = data.users.find((u) => u.email === email);
  if (!user) throw new Error(`Test user ${email} not found`);
  return user.id;
}

export async function login(page: Page, user: TestUser = TEST_USER): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Mot de passe").fill(user.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
}
