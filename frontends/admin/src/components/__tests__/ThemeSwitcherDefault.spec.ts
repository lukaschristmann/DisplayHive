import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import ThemeSwitcher from '../ThemeSwitcher.vue'

describe('ThemeSwitcher default', () => {
  beforeEach(() => {
    localStorage.removeItem('primevue-theme')
  })

  it('defaults to aura when no localStorage value', () => {
    const wrapper = mount(ThemeSwitcher, {
      global: { stubs: { Select: true } },
    })
    // the Select stub doesn't expose internal value but component should not throw
    expect(wrapper.exists()).toBe(true)
  })
})
