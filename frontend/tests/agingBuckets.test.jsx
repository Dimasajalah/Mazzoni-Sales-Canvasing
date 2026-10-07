import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AgingBuckets } from '../src/components/ui.jsx'

describe('AgingBuckets', () => {
  it('menampilkan semua 4 bucket (termasuk Lancar) secara default — dipakai Home & Laporan Aging AR', () => {
    render(<AgingBuckets buckets={[100, 200, 300, 400]} />)
    expect(screen.getByText('Lancar')).toBeInTheDocument()
    expect(screen.getByText('1-30')).toBeInTheDocument()
    expect(screen.getByText('31-60')).toBeInTheDocument()
    expect(screen.getByText('60+')).toBeInTheDocument()
  })

  it('hideCurrent menyembunyikan HANYA bucket Lancar, 3 bucket lain tetap tampil', () => {
    render(<AgingBuckets buckets={[100, 200, 300, 400]} hideCurrent />)
    expect(screen.queryByText('Lancar')).not.toBeInTheDocument()
    expect(screen.getByText('1-30')).toBeInTheDocument()
    expect(screen.getByText('31-60')).toBeInTheDocument()
    expect(screen.getByText('60+')).toBeInTheDocument()
  })
})