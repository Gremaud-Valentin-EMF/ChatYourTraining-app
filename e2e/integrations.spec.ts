import { test, expect, type Route } from "@playwright/test";
import { login } from "./helpers";

/**
 * US-11 — Synchronisation manuelle des données.
 *
 * The sync routes call Strava/Whoop (non-deterministic external APIs), so we mock
 * `/api/sync/strava` with page.route (the request originates in the browser from the
 * client component) and assert the integrations-page behaviour for each criterion.
 */

const STRAVA_SYNC = "**/api/sync/strava";

async function gotoIntegrations(page: import("@playwright/test").Page) {
  await login(page);
  await page.goto("/integrations");
  // Strava is seeded as connected → the manual sync button is present.
  await expect(
    page.getByRole("button", { name: "Synchroniser maintenant" })
  ).toBeVisible();
}

test.describe("US-11 — Synchronisation manuelle", () => {
  test("CA1 — clic envoie la requête de sync et affiche un spinner", async ({
    page,
  }) => {
    await gotoIntegrations(page);

    // Delay the response so the spinner / disabled state is observable.
    await page.route(STRAVA_SYNC, async (route: Route) => {
      await new Promise((r) => setTimeout(r, 800));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, synced: 3, skipped: 1 }),
      });
    });

    const syncBtn = page.getByRole("button", {
      name: "Synchroniser maintenant",
    });
    const reqPromise = page.waitForRequest(
      (req) => req.url().includes("/api/sync/strava") && req.method() === "POST"
    );

    await syncBtn.click();
    await reqPromise; // a POST was sent to /api/sync/strava (CA1)
    await expect(syncBtn).toBeDisabled(); // spinner / pending state
    // And it resolves to a toast afterwards.
    await expect(page.getByText(/donnée.* importée/)).toBeVisible();
  });

  test("CA2 — succès : toast avec le nombre, icône de validation, dernière synchro mise à jour", async ({
    page,
  }) => {
    await gotoIntegrations(page);

    await page.route(STRAVA_SYNC, (route: Route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, synced: 5, skipped: 0 }),
      })
    );

    await page
      .getByRole("button", { name: "Synchroniser maintenant" })
      .click();

    await expect(page.getByText(/5 nouvelle/)).toBeVisible();
    await expect(page.getByLabel("Synchronisé")).toBeVisible();
    await expect(page.getByText("Dernière synchro: À l'instant")).toBeVisible();
  });

  test("CA3 — token expiré (401) : bandeau de reconnexion", async ({ page }) => {
    await gotoIntegrations(page);

    await page.route(STRAVA_SYNC, (route: Route) =>
      route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({ error: "Token refresh failed" }),
      })
    );

    await page
      .getByRole("button", { name: "Synchroniser maintenant" })
      .click();

    // Banner-specific phrase (the error toast omits "pour synchroniser").
    await expect(
      page.getByText(/reconnecter votre compte pour synchroniser/)
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Reconnecter" })
    ).toBeVisible();
    // No success toast.
    await expect(page.getByText(/nouvelle.* importée/)).toHaveCount(0);
  });

  test("CA4 — 30 nouvelles données : traitées et signalées en moins de 15 s", async ({
    page,
  }) => {
    await gotoIntegrations(page);

    await page.route(STRAVA_SYNC, async (route: Route) => {
      await new Promise((r) => setTimeout(r, 300));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ success: true, synced: 30, skipped: 0 }),
      });
    });

    const start = Date.now();
    await page
      .getByRole("button", { name: "Synchroniser maintenant" })
      .click();
    await expect(page.getByText(/30 nouvelle/)).toBeVisible();
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(15_000);
  });
});
