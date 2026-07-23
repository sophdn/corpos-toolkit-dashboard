import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it } from 'vitest'
import { AppShell } from '.'

afterEach(() => {
  document.documentElement.removeAttribute('data-theme')
})

function renderShell() {
  return render(
    <MemoryRouter>
      <AppShell />
    </MemoryRouter>,
  )
}

function toggle() {
  return screen.getByTestId('theme-toggle')
}

describe('theme toggle — initial state', () => {
  // @blurb The theme toggle must be present in the shell so users can access
  // @blurb it from any page without it being buried inside a page-specific
  // @blurb component.
  it('button is present in the document', () => {
    renderShell()
    expect(toggle()).toBeInTheDocument()
  })

  // @blurb In dark mode the sun icon signals 'switch to light', using the
  // @blurb iconographic convention that the icon represents the target state
  // @blurb rather than the current one.
  it('shows sun icon in dark mode (default)', () => {
    renderShell()
    expect(toggle()).toHaveTextContent('☀️')
  })

  // @blurb The button's accessible label must describe the action it will
  // @blurb perform, not the current state, so screen reader users know what
  // @blurb clicking the button will do.
  it('aria-label offers to switch to light theme when in dark mode', () => {
    renderShell()
    expect(toggle()).toHaveAttribute('aria-label', 'Switch to light theme')
  })
})

describe('theme toggle — after one click', () => {
  // @blurb Clicking the toggle must immediately update the document root
  // @blurb attribute, triggering the CSS custom property cascade that applies
  // @blurb light mode colours to every component.
  it('switches data-theme to light', () => {
    renderShell()
    fireEvent.click(toggle())
    expect(document.documentElement).toHaveAttribute('data-theme', 'light')
  })

  // @blurb The moon icon in light mode signals 'switch to dark', maintaining
  // @blurb the convention that the icon represents the target state.
  it('shows moon icon after switching to light', () => {
    renderShell()
    fireEvent.click(toggle())
    expect(toggle()).toHaveTextContent('🌙')
  })

  // @blurb The accessible label must update with the state so screen reader
  // @blurb users always see the correct action description after each toggle.
  it('aria-label offers to switch to dark theme after switching to light', () => {
    renderShell()
    fireEvent.click(toggle())
    expect(toggle()).toHaveAttribute('aria-label', 'Switch to dark theme')
  })
})

describe('theme toggle — after two clicks', () => {
  // @blurb Two clicks must return to the original dark state with no residual
  // @blurb light-mode artefacts, confirming the toggle is a clean round-trip.
  it('returns data-theme to dark', () => {
    renderShell()
    fireEvent.click(toggle())
    fireEvent.click(toggle())
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark')
  })

  // @blurb The sun icon must reappear after toggling back to dark, confirming
  // @blurb the icon tracks the current theme through a full round-trip.
  it('sun icon returns after toggling back to dark', () => {
    renderShell()
    fireEvent.click(toggle())
    fireEvent.click(toggle())
    expect(toggle()).toHaveTextContent('☀️')
  })
})
