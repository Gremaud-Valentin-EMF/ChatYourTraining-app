import { adminClient, getTestUserId, TEST_USER } from "./helpers";

/**
 * Global setup for the US-11 (manual sync) E2E suite.
 *
 * Seeds a deterministic baseline using the Supabase service-role key (no running
 * server required):
 *  - ensure the test auth user exists (email-confirmed),
 *  - upsert its `users` row (onboarding_completed so the dashboard renders),
 *  - reset `integrations` to a single *connected* Strava integration with a stale
 *    last_sync_at, so the integrations page shows the "Synchroniser maintenant" UI.
 *
 * The sync API routes themselves are mocked in the spec (page.route), so the dummy
 * tokens here are never used to call Strava.
 */
async function globalSetup() {
  const admin = adminClient();

  const { error: createError } = await admin.auth.admin.createUser({
    email: TEST_USER.email,
    password: TEST_USER.password,
    email_confirm: true,
  });
  if (
    createError &&
    !/already.*registered|already.*exists/i.test(createError.message)
  ) {
    throw new Error(`Failed to create test user: ${createError.message}`);
  }

  const userId = await getTestUserId(admin);

  const { error: usersError } = await admin.from("users").upsert(
    {
      id: userId,
      email: TEST_USER.email,
      full_name: "E2E Sync Test",
      onboarding_completed: true,
    },
    { onConflict: "id" }
  );
  if (usersError) throw new Error(`Seed users failed: ${usersError.message}`);

  // Reset integrations to a single connected Strava integration.
  const { error: delError } = await admin
    .from("integrations")
    .delete()
    .eq("user_id", userId);
  if (delError)
    throw new Error(`Reset integrations failed: ${delError.message}`);

  const { error: insError } = await admin.from("integrations").insert({
    user_id: userId,
    provider: "strava",
    access_token: "dummy-access-token",
    refresh_token: "dummy-refresh-token",
    token_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    is_active: true,
    last_sync_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
  });
  if (insError)
    throw new Error(`Seed Strava integration failed: ${insError.message}`);

  console.log(`[global-setup] sync baseline ready for ${TEST_USER.email}`);
}

export default globalSetup;
