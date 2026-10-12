// frontend/src/components/TaskErrorBoundary.jsx
// Pembatas galat untuk halaman task: kalau form gagal dirender, pesan galatnya tampil di layar (dan di Console)
// alih-alih seluruh halaman terpasang ulang terus-menerus.
import { Component } from 'react'
import '../styles/taskpage.css'

export class TaskErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('[TaskErrorBoundary]', error, info?.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="tp-empty" role="alert">
          <b>Form gagal ditampilkan.</b>
          <div style={{ marginTop: 6, wordBreak: 'break-word' }}>{String(this.state.error?.message || this.state.error)}</div>
        </div>
      )
    }
    return this.props.children
  }
}
