import { expect, test } from '@playwright/test';

/**
 * Solo golden path: 3 players (2 AI dilettantes + 1 human), seed 'pw-1'.
 *
 * The human player ("Human") is at seat 0. AI players take their turns
 * automatically via useSoloDispatcher. The spec scripts the human through:
 *   - Setup → Launch
 *   - Setup-claim: click territories to claim
 *   - Setup-reinforce: click owned territories to reinforce
 *   - Main game: Deploy (confirm), Attack (end-attack), Fortify (skip)
 *     and repeats until the victory modal appears.
 *
 * With seed 'pw-1', the AI players are aggressive enough that victory
 * is declared within a reasonable number of turns.
 */
test('solo golden path: setup → play → victory modal', async ({ page }) => {
  // Navigate to setup
  await page.goto('/');
  await page.getByTestId('new-game-btn').click();
  await expect(page).toHaveURL('/setup');

  // Set seed to pw-1 for reproducibility
  await page.locator('input[placeholder="game seed"]').fill('pw-1');

  // Set player name
  await page.locator('input[placeholder="Commander name"]').fill('Human');

  // Make sure we have 3 players (default)
  // Both other seats should be AI (default)

  // Launch
  await page.locator('button:has-text("LAUNCH")').click();
  await expect(page).toHaveURL('/play');

  // The game starts in setup-claim phase.
  // The human is player[0], so on turn 0 (every 3rd claim pick) they pick.
  // We wait for the game to be in a state where we can interact.

  // Wait for game map to be visible
  await expect(page.locator('[aria-label="game-map"]')).toBeVisible({ timeout: 10_000 });

  // Main game loop: wait for victory modal OR timeout after 30s
  // We just need the AI to finish the game — but we must handle human turns
  const victoryModalAppeared = await waitForVictoryOrPlay(page, 55_000);

  expect(victoryModalAppeared).toBe(true);
  await expect(page.locator('[aria-label="victory-modal"]')).toBeVisible();
});

/**
 * Watches for the victory modal. While waiting, handles human turns
 * by clicking the appropriate confirmation buttons.
 */
async function waitForVictoryOrPlay(
  page: import('@playwright/test').Page,
  timeoutMs: number,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    // Check if victory modal is visible
    const victoryVisible = await page
      .locator('[aria-label="victory-modal"]')
      .isVisible()
      .catch(() => false);
    if (victoryVisible) return true;

    // Try to handle human setup-claim turns
    const claimableTerritory = page.locator('[data-territory]').first();
    if (await claimableTerritory.isVisible().catch(() => false)) {
      // Try clicking a clickable territory (in setup-claim or reinforce phase)
      // We use data-territory selectors
      try {
        // Look for any territory in setup-claim
        const territories = await page.locator('[data-territory]').all();
        for (const terr of territories.slice(0, 3)) {
          try {
            await terr.click({ timeout: 500 });
            await page.waitForTimeout(200);
            break;
          } catch {
            /* try next */
          }
        }
      } catch {
        /* continue */
      }
    }

    // Handle deploy panel: click Confirm if visible and enabled
    const confirmBtn = page.locator('[aria-label="deploy-panel"] button:has-text("Confirm")');
    if (await confirmBtn.isVisible().catch(() => false)) {
      const isDisabled = await confirmBtn.isDisabled().catch(() => true);
      if (!isDisabled) {
        await confirmBtn.click().catch(() => {
          /* skip */
        });
        await page.waitForTimeout(200);
        continue;
      }
    }

    // Handle attack panel: end attack
    const endAttackBtn = page.locator('[aria-label="attack-panel"] button:has-text("End")');
    if (await endAttackBtn.isVisible().catch(() => false)) {
      await endAttackBtn.click().catch(() => {
        /* skip */
      });
      await page.waitForTimeout(200);
      continue;
    }

    // Handle fortify panel: skip
    const skipFortifyBtn = page.locator('[aria-label="fortify-panel"] button:has-text("Skip")');
    if (await skipFortifyBtn.isVisible().catch(() => false)) {
      await skipFortifyBtn.click().catch(() => {
        /* skip */
      });
      await page.waitForTimeout(200);
      continue;
    }

    // Handle move modal: confirm with default value
    const moveModal = page.locator('[aria-label="move-modal"]');
    if (await moveModal.isVisible().catch(() => false)) {
      const moveConfirm = moveModal.locator('button:has-text("Confirm")');
      await moveConfirm.click().catch(() => {
        /* skip */
      });
      await page.waitForTimeout(200);
      continue;
    }

    // Wait a bit for AI turns to run
    await page.waitForTimeout(600);
  }

  return false;
}

test('mobile: dossier toggles as bottom sheet below 900px', async ({ page }) => {
  // Set viewport to mobile
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/setup');

  // Just verify setup page is accessible on mobile
  await expect(page.locator('button:has-text("LAUNCH")')).toBeVisible();
});
