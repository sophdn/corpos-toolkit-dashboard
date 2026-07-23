import { expect, test } from '@playwright/test'

test('app launches and renders the shell', async ({ page }) => {
  const errors: string[] = []
  page.on('console', msg => {
    if (msg.type() === 'error') errors.push(msg.text())
  })

  await page.goto('/')
  await expect(page.locator('#root')).toBeVisible()
  await expect(page.locator('nav[aria-label="Main navigation"]')).toBeVisible()
  expect(errors).toHaveLength(0)
})

test('theme toggle switches data-theme attribute', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

  await page.click('button[aria-label="Switch to light theme"]')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

  await page.click('button[aria-label="Switch to dark theme"]')
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
})
