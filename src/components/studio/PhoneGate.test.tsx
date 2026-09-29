import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PhoneGate } from './PhoneGate'

// matchMedia falso: `phone` decide si la consulta de teléfono coincide.
function stubMatchMedia(phone: boolean) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: phone && query.includes('pointer: coarse'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }))
}

function renderGate() {
  return render(
    <MemoryRouter>
      <PhoneGate>
        <div>EDITOR</div>
      </PhoneGate>
    </MemoryRouter>
  )
}

describe('PhoneGate', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('en teléfono muestra el aviso y NO monta el editor', () => {
    stubMatchMedia(true)
    renderGate()
    expect(screen.queryByText('EDITOR')).not.toBeInTheDocument()
    expect(screen.getByRole('heading')).toBeInTheDocument()
  })

  it('fuera de teléfono (incluida una ventana angosta con mouse) monta el editor', () => {
    stubMatchMedia(false)
    renderGate()
    expect(screen.getByText('EDITOR')).toBeInTheDocument()
  })
})
