import { expect, test } from '@playwright/test'

test('theme toggle button exists and is accessible', async ({ page }) => {
  await page.goto('/')
  const btn = page.getByRole('button', { name: /switch to light theme/i })
  await expect(btn).toBeVisible()
})

test('clicking the button sets data-theme="light"', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.getByRole('button', { name: /switch to light theme/i }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
})

test('clicking again resets to data-theme="dark"', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: /switch to light theme/i }).click()
  await page.getByRole('button', { name: /switch to dark theme/i }).click()
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})

test('button label flips between light and dark after each click', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /switch to light theme/i })).toBeVisible()

  await page.getByRole('button', { name: /switch to light theme/i }).click()
  await expect(page.getByRole('button', { name: /switch to dark theme/i })).toBeVisible()

  await page.getByRole('button', { name: /switch to dark theme/i }).click()
  await expect(page.getByRole('button', { name: /switch to light theme/i })).toBeVisible()
})

test('toggling theme changes the background CSS variable', async ({ page }) => {
  await page.goto('/')

  const darkBg = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
  )

  await page.getByRole('button', { name: /switch to light theme/i }).click()

  const lightBg = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
  )

  expect(darkBg).not.toBe('')
  expect(lightBg).not.toBe('')
  expect(darkBg).not.toBe(lightBg)
})
