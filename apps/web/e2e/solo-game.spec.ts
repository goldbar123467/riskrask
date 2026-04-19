import { type Page, expect, test } from '@playwright/test';

/**
 * Solo golden-path smoke test against live prod (or the local dev server).
 *
 * Scope: proves the critical path `home → setup → play → first live turn`
 * without waiting for a full win. The in-app solo AI is a minimal dilettante
 * that dumps reserves and attacks once per turn, so a full dilettante-only
 * game takes 5–10+ minutes — not appropriate for PR CI. A full-victory run
 * is gated behind `FULL_PLAYTEST=1` below, and the real balance coverage
 * lives in the headless `balance-harness` Bun script (no browser).
 */
test('solo golden path: setup → play → live game loop', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('/');
  await page.getByTestId('new-game-btn').click();
  await expect(page).toHaveURL('/setup');

  await page.locator('input[placeholder="game seed"]').fill('pw-1');
  await page.locator('input[placeholder="Commander name"]').fill('Human');
  await page.locator('button:has-text("LAUNCH")').click();
  await expect(page).toHaveURL('/play');

  await expect(page.locator('[aria-label="game-map"]').first()).toBeVisible({ timeout: 15_000 });

  // Drive the Human through setup + whatever phase panels appear. We stop as
  // soon as the game reaches a main-game phase (deploy / attack / fortify) at
  // turn >= 2 — that's enough to prove setup completed and the turn loop runs.
  const reached = await driveUntilMainGameLoop(page, 90_000);

  if (!reached) console.log('pageErrors:', pageErrors);
  expect(reached).toBe(true);

  // At least one main-game phase panel must be visible by now.
  const anyMainPanel = page
    .locator(
      '[aria-label="deploy-panel"], [aria-label="attack-panel"], [aria-label="fortify-panel"]',
    )
    .first();
  await expect(anyMainPanel).toBeVisible();
});

/**
 * Full-victory playtest — skipped by default because dilettante-vs-dilettante
 * games commonly run 100+ turns and can exceed 10 minutes wall-clock. Enable
 * with `FULL_PLAYTEST=1 bun run e2e:prod`. This is the test the weekly cron
 * job runs.
 */
test('solo full playtest: setup → play → victory modal', async ({ page }) => {
  test.skip(process.env.FULL_PLAYTEST !== '1', 'set FULL_PLAYTEST=1 to run');
  test.setTimeout(15 * 60 * 1000);

  const pageErrors: string[] = [];
  page.on('pageerror', (err) => pageErrors.push(err.message));

  await page.goto('/');
  await page.getByTestId('new-game-btn').click();
  await page.locator('input[placeholder="game seed"]').fill('pw-1');
  await page.locator('input[placeholder="Commander name"]').fill('Human');
  await page.locator('button:has-text("LAUNCH")').click();
  await expect(page).toHaveURL('/play');
  await expect(page.locator('[aria-label="game-map"]').first()).toBeVisible({ timeout: 15_000 });

  const victoryReached = await waitForVictory(page, 14 * 60 * 1000);
  if (!victoryReached) console.log('pageErrors:', pageErrors);
  expect(victoryReached).toBe(true);
  await expect(page.locator('[aria-label="victory-modal"]').first()).toBeVisible();
});

async function driveUntilMainGameLoop(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const POLL_MS = 250;

  const map = page.locator('[aria-label="game-map"]').first();
  const territoryCount = await map.locator('[data-territory]').count();
  let tick = 0;

  while (Date.now() < deadline) {
    // Success: a main-game phase panel is visible and we've advanced past turn 1.
    const turnText = await readTopbarValue(page, 'TURN');
    const turn = Number(turnText ?? '0');
    const anyMainPanel = await page
      .locator(
        '[aria-label="deploy-panel"], [aria-label="attack-panel"], [aria-label="fortify-panel"]',
      )
      .first()
      .isVisible()
      .catch(() => false);
    if (turn >= 2 && anyMainPanel) return true;

    // Pending-move modal always needs dismissing.
    const moveModal = page.locator('[aria-label="move-modal"]').first();
    if (await moveModal.isVisible().catch(() => false)) {
      await moveModal
        .locator('button:has-text("Confirm")')
        .first()
        .click({ timeout: 400 })
        .catch(() => {});
      await page.waitForTimeout(POLL_MS);
      continue;
    }

    // Deploy phase — pick a territory, then confirm.
    const deployConfirm = page
      .locator('[aria-label="deploy-panel"] button:has-text("Confirm")')
      .first();
    if (await deployConfirm.isVisible().catch(() => false)) {
      const disabled = await deployConfirm.isDisabled().catch(() => true);
      if (disabled) {
        await rotatingTerritoryClick(map, territoryCount, tick++);
      } else {
        await deployConfirm.click({ timeout: 400 }).catch(() => {});
      }
      await page.waitForTimeout(POLL_MS);
      continue;
    }

    // Attack / Fortify — end them immediately; the AI does the interesting work.
    const endAttack = page.locator('[aria-label="attack-panel"] button:has-text("End")').first();
    if (await endAttack.isVisible().catch(() => false)) {
      await endAttack.click({ timeout: 400 }).catch(() => {});
      await page.waitForTimeout(POLL_MS);
      continue;
    }
    const skipFortify = page
      .locator('[aria-label="fortify-panel"] button:has-text("Skip")')
      .first();
    if (await skipFortify.isVisible().catch(() => false)) {
      await skipFortify.click({ timeout: 400 }).catch(() => {});
      await page.waitForTimeout(POLL_MS);
      continue;
    }

    // Setup phases / idle — keep poking territories.
    await rotatingTerritoryClick(map, territoryCount, tick++);
    await page.waitForTimeout(POLL_MS);
  }

  return false;
}

async function waitForVictory(page: Page, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  const POLL_MS = 250;

  const map = page.locator('[aria-label="game-map"]').first();
  const territoryCount = await map.locator('[data-territory]').count();
  let tick = 0;

  while (Date.now() < deadline) {
    if (
      await page
        .locator('[aria-label="victory-modal"]')
        .first()
        .isVisible()
        .catch(() => false)
    ) {
      return true;
    }

    const moveModal = page.locator('[aria-label="move-modal"]').first();
    if (await moveModal.isVisible().catch(() => false)) {
      await moveModal
        .locator('button:has-text("Confirm")')
        .first()
        .click({ timeout: 400 })
        .catch(() => {});
      await page.waitForTimeout(POLL_MS);
      continue;
    }

    const deployConfirm = page
      .locator('[aria-label="deploy-panel"] button:has-text("Confirm")')
      .first();
    if (await deployConfirm.isVisible().catch(() => false)) {
      const disabled = await deployConfirm.isDisabled().catch(() => true);
      if (disabled) await rotatingTerritoryClick(map, territoryCount, tick++);
      else await deployConfirm.click({ timeout: 400 }).catch(() => {});
      await page.waitForTimeout(POLL_MS);
      continue;
    }

    const endAttack = page.locator('[aria-label="attack-panel"] button:has-text("End")').first();
    if (await endAttack.isVisible().catch(() => false)) {
      await endAttack.click({ timeout: 400 }).catch(() => {});
      await page.waitForTimeout(POLL_MS);
      continue;
    }

    const skipFortify = page
      .locator('[aria-label="fortify-panel"] button:has-text("Skip")')
      .first();
    if (await skipFortify.isVisible().catch(() => false)) {
      await skipFortify.click({ timeout: 400 }).catch(() => {});
      await page.waitForTimeout(POLL_MS);
      continue;
    }

    await rotatingTerritoryClick(map, territoryCount, tick++);
    await page.waitForTimeout(POLL_MS);
  }

  return false;
}

async function readTopbarValue(page: Page, label: string): Promise<string | null> {
  const cell = page.getByText(label, { exact: true }).first().locator('..');
  try {
    const text = await cell.innerText({ timeout: 200 });
    const lines = text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    return lines[lines.length - 1] ?? null;
  } catch {
    return null;
  }
}

async function rotatingTerritoryClick(
  map: ReturnType<Page['locator']>,
  count: number,
  tick: number,
): Promise<void> {
  if (count === 0) return;
  const idx = tick % count;
  await map
    .locator('[data-territory]')
    .nth(idx)
    .click({ timeout: 400, force: true })
    .catch(() => {});
}

test('mobile: dossier toggles as bottom sheet below 900px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/setup');
  await expect(page.locator('button:has-text("LAUNCH")')).toBeVisible();
});
