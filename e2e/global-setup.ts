import {
  adminClient,
  getUserIdByEmail,
  TEST_USER,
  CYCLING_SPORT_ID,
  RUNNING_SPORT_ID,
} from "./helpers";

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

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

  const userId = await getUserIdByEmail(admin, TEST_USER.email);

  const { error: usersError } = await admin.from("users").upsert(
    {
      id: userId,
      email: TEST_USER.email,
      full_name: "E2E Calendar Test",
      onboarding_completed: true,
    },
    { onConflict: "id" }
  );
  if (usersError) throw new Error(`Seed users failed: ${usersError.message}`);

  await admin.from("activities").delete().eq("user_id", userId);

  const today = todayStr();
  const { error: actErr } = await admin.from("activities").insert([
    {
      user_id: userId,
      sport_id: CYCLING_SPORT_ID,
      title: "Vélo du jour",
      status: "planned",
      source: "manual",
      scheduled_date: today,
      planned_duration_minutes: 60,
    },
    {
      user_id: userId,
      sport_id: RUNNING_SPORT_ID,
      title: "Footing matin",
      status: "completed",
      source: "strava",
      scheduled_date: today,
      completed_date: new Date().toISOString(),
      actual_duration_minutes: 45,
      actual_distance_km: 9,
      tss: 50,
      tss_type: "rtss",
    },
    {
      user_id: userId,
      sport_id: RUNNING_SPORT_ID,
      title: "Fractionné raté",
      status: "skipped",
      source: "manual",
      scheduled_date: today,
      planned_duration_minutes: 40,
    },
  ]);
  if (actErr) throw new Error(`Seed activities failed: ${actErr.message}`);

  console.log(`[global-setup] calendar baseline ready for ${TEST_USER.email}`);
}

export default globalSetup;
