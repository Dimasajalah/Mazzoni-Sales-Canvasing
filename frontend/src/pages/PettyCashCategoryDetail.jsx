// frontend/src/pages/PettyCashCategoryDetail.jsx
import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getCashAdvanceDocuments } from '../api'
import { Screen, TopBar } from '../components/ui'
import { fmtIdr } from '../lib/money'
import '../styles/cashadvance.css'

export default function PettyCashCategoryDetail() {
    const { operationType } = useParams()
    const { state } = useLocation()
    const nav = useNavigate()
    const [docs, setDocs] = useState(null)

    useEffect(() => {
        getCashAdvanceDocuments(state?.month, 'issue', operationType).then(setDocs).catch(() => setDocs([]))
    }, [operationType, state?.month])

    const displayName = state?.displayName || operationType
    const isLainLain = displayName === 'Lain-lain'
    const total = (docs || []).reduce((sum, d) => sum + d.amount, 0)

    return (
        <Screen>
            <TopBar title={displayName} />

            <div className="ca-category-total-card">
                <span>Total {displayName} bulan ini</span>
                <strong>{fmtIdr(total)}</strong>
                <span className="ca-count-badge">{docs?.length ?? 0} pengeluaran</span>
            </div>

            {docs === null ? (
                <div className="loading-center">Memuat…</div>
            ) : docs.length === 0 ? (
                <div className="tp-empty">
                    Belum ada pengeluaran {displayName} bulan ini
                    <br /><small>{isLainLain ? 'Kategori ini untuk pengeluaran operasional di luar kategori terdaftar' : 'Belum ada dokumen pada bulan ini'}</small>
                </div>
            ) : (
                <div className="ca-doc-list">
                    {docs.map((d) => (
                        <div key={d.cash_document} className="ca-doc-row">
                            <span>{fmtDate(d.creation_date)}</span>
                            <span><strong>{d.cash_document}</strong>{d.legal_number && <small className="ca-legal">✓ {d.legal_number}</small>}</span>
                            <span className="ca-amount-neg">- {fmtIdr(d.amount)}</span>
                        </div>
                    ))}
                </div>
            )}

            <button className="ca-fab-save" onClick={() => nav('/cash-advance/new', { state: { operationType, displayName } })}>
                + Catat Pengeluaran {displayName}
            </button>
        </Screen>
    )
}

function fmtDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
    const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
    return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : ''
}