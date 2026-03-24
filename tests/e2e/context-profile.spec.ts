import { test, expect } from '@playwright/test';
import { setupContextMocks } from './helpers';

test.describe('context profile E2E', () => {
  test('Scenario A: no BYOK & advanced OFF', async ({ page }) => {
    const state = await setupContextMocks(page, {
      name: 'A',
      advanced: false,
      hasByok: false,
      treeId: 'tree-a',
    });

    await page.goto('/app?new=1');

    await page.getByTestId('user-menu-trigger').click();
    await page.getByTestId('open-settings').click();
    await page.getByTestId('settings-tab-models').click();
    const toggle = page.getByTestId('advanced-context-toggle');
    await expect(toggle).toBeDisabled();
    await page.getByRole('button', { name: 'Close' }).click();

    await expect(page.getByTestId('new-tree-context-controls')).toHaveCount(0);

    await page.getByTestId('provider-select-trigger').click();
    await expect(page.getByRole('option', { name: /oMyTree Default/i })).toBeEnabled();
    await page.keyboard.press('Escape');

    await page.getByTestId('chat-input').fill('Lite tree question');
    await page.getByTestId('send-message').click();

    await expect(page.getByText('Lite tree question').first()).toBeVisible({ timeout: 10000 });
    expect(state.lastStartPayload).toBeDefined();
    const badge = page.getByTestId('context-profile-badge').first();
    await expect(badge).toContainText('Lite', { timeout: 10000 });
    await expect(badge).toContainText(/Branch|分支/);
    expect(state.lastStartPayload?.context_profile ?? null).toBeNull();
  });

  test('Scenario B: BYOK present but advanced OFF', async ({ page }) => {
    const state = await setupContextMocks(page, {
      name: 'B',
      advanced: false,
      hasByok: true,
      treeId: 'tree-b',
    });

    await page.goto('/app?new=1');

    await page.getByTestId('user-menu-trigger').click();
    await page.getByTestId('open-settings').click();
    await page.getByTestId('settings-tab-models').click();
    const toggle = page.getByTestId('advanced-context-toggle');
    await expect(toggle).toBeEnabled();
    await expect(toggle).toHaveAttribute('data-state', 'unchecked');
    await page.getByRole('button', { name: 'Close' }).click();

    await expect(page.getByTestId('new-tree-context-controls')).toHaveCount(0);
    await page.getByTestId('chat-input').fill('BYOK off question');
    await page.getByTestId('send-message').click();

    await expect(page.getByText('BYOK off question').first()).toBeVisible({ timeout: 10000 });
    expect(state.lastStartPayload).toBeDefined();
    const badge = page.getByTestId('context-profile-badge').first();
    await expect(badge).toContainText('Lite', { timeout: 10000 });
    await expect(badge).toContainText(/Branch|分支/);
    expect(state.lastStartPayload?.context_profile ?? null).toBeNull();
  });

  test('Scenario C: BYOK + advanced ON + Max Tree', async ({ page }) => {
    const state = await setupContextMocks(page, {
      name: 'C',
      advanced: false,
      hasByok: true,
      treeId: 'tree-c',
    });

    await page.goto('/app');
    await page.getByTestId('user-menu-trigger').click();
    await page.getByTestId('open-settings').click();
    await page.getByTestId('settings-tab-models').click();

    const toggle = page.getByTestId('advanced-context-toggle');
    await expect(toggle).toBeEnabled();
    await toggle.click();
    await expect(toggle).toHaveAttribute('data-state', 'checked');

    // Refresh to let session/UI pick up the updated flag
    await page.reload();
    await page.getByTestId('user-menu-trigger').click();
    await page.getByTestId('open-settings').click();
    await page.getByTestId('settings-tab-models').click();
    await expect(page.getByTestId('advanced-context-toggle')).toHaveAttribute('data-state', 'checked');
    await page.getByRole('button', { name: 'Close' }).click();

    await page.getByTestId('start-new-tree').first().click();
    await expect(page.getByTestId('new-tree-context-controls')).toHaveCount(1);

    // Sending without profile should show error
    await page.getByTestId('chat-input').fill('Need Max context');
    await page.getByTestId('send-message').click();
    await expect(page.getByTestId('context-profile-error')).toContainText('请选择档位');

    await page.getByTestId('profile-option-max').click();
    await page.getByTestId('memory-scope-select').click();
    await page.getByRole('option', { name: /Tree/ }).click();

    // Default provider must be disabled in advanced mode
    await page.getByTestId('provider-select-trigger').click();
    await expect(page.getByRole('option', { name: /oMyTree Default/i })).toBeDisabled();
    await page.keyboard.press('Escape');

    await page.getByTestId('send-message').click();

    await expect(page.getByText('Need Max context').first()).toBeVisible({ timeout: 10000 });
    expect(state.lastStartPayload).toBeDefined();
    const badge = page.getByTestId('context-profile-badge').first();
    await expect(badge).toContainText('Max', { timeout: 10000 });
    await expect(badge).toContainText(/Tree|摘要/);
    expect(state.lastStartPayload?.context_profile).toBe('max');
    expect(state.lastStartPayload?.memory_scope).toBe('tree');
  });
});
