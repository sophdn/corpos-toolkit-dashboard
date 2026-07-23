import { describe, expect, it } from 'vitest'

describe('test harness', () => {
  // @blurb Guards against misconfigured test runner setup — fails immediately if
  // @blurb Vitest cannot execute any tests at all, surfacing environment problems
  // @blurb before they silently swallow real failures.
  it('is configured', () => {
    expect(true).toBe(true)
  })
})
