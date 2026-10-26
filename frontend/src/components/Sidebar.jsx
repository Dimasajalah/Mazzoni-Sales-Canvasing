// frontend/src/components/Sidebar.jsx
import { useEffect, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import '../styles/sidebar.css'

// Grup + urutan + badge persis Section Flow Petty Cash.pdf (panel lebar penuh di bawah ☰, bukan drawer
// sempit). Journey dan Competitor: ikon sudah ada di PDF tapi belum ada halaman -> non-navigasi.
function buildGroups({ badges, canOrder }) {
    return [
        {
            title: 'Sales Journey',
            items: [
                { to: '/home', label: 'Home', icon: 'home', tone: 'blue' },
                { to: '/canvassing', label: 'Canvassing', icon: 'pin', tone: 'red', badge: badges.canvassing },
                { label: 'Journey', icon: 'layers', tone: 'slate' },
                { to: '/activities', label: 'Activities', icon: 'check', tone: 'green', badge: badges.activities },
            ],
        },
        {
            title: 'Transactions',
            items: [
                { to: '/quotes', label: 'Quotation', icon: 'doc', tone: 'violet' },
                ...(canOrder ? [{ to: '/orders/new', label: 'New Order', icon: 'cart', tone: 'gold' }] : []),
                { to: '/returns', label: 'Retur', icon: 'return', tone: 'olive', badge: badges.returns },
                { to: '/track', label: 'Tracking', icon: 'truck', tone: 'orange', badge: badges.tracking },
            ],
        },
        {
            title: 'Customer & Marketing',
            items: [
                { to: '/customers', label: 'Customers', icon: 'users', tone: 'red' },
                { label: 'Competitor', icon: 'swords', tone: 'slate' },
                { to: '/stock', label: 'Cek On Hand', icon: 'box', tone: 'slate' },
                { to: '/promo', label: 'Promo', icon: 'gift', tone: 'orange', badge: badges.promo },
            ],
        },
        {
            title: 'Finance',
            items: [
                { to: '/ar', label: 'AR Invoice', icon: 'chart', tone: 'blue', badge: badges.arInvoice },
                { to: '/cash-advance', label: 'Cash Advance', icon: 'wallet', tone: 'brown' },
            ],
        },
    ]
}

const ICONS = {
    home: <path d="M4 12l8-7 8 7v8H4z" />,
    pin: (<><path d="M12 21s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" /><circle cx="12" cy="10" r="2.5" /></>),
    layers: (<><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></>),
    check: (<><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>),
    doc: (<><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5M10 13h6M10 17h6" /></>),
    cart: (<><path d="M3 4h2l2.4 11h10.2l2-8H6.2" /><circle cx="9" cy="19.5" r="1.3" /><circle cx="18" cy="19.5" r="1.3" /></>),
    return: (<><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 010 12h-3" /></>),
    truck: (<><path d="M3 6h11v10H3zM14 9h4l3 3v4h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17" cy="18" r="1.8" /></>),
    users: (<><circle cx="9" cy="8" r="3.2" /><path d="M3 20a6 6 0 0112 0M16 5.2a3.2 3.2 0 010 5.6M18 14.5a6 6 0 013 5.5" /></>),
    swords: (<><path d="M14 4l6 6-9 9-3-3zM4 4l6 6M20 20l-6-6" /></>),
    box: (<><path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" /><path d="M4 7.5l8 4.5 8-4.5M12 12v9" /></>),
    gift: (<><path d="M4 11h16v9H4zM3 7h18v4H3zM12 7v13" /><path d="M12 7c-2-3-5-3-5-1s3 1 5 1zm0 0c2-3 5-3 5-1s-3 1-5 1z" /></>),
    chart: <path d="M4 20V4M4 20h16M8 15l4-4 3 3 5-6" />,
    wallet: (<><path d="M3 7a2 2 0 012-2h12a2 2 0 012 2v2H3z" /><path d="M3 9h16a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2z" /><circle cx="16.5" cy="14" r="1.2" /></>),
}

export function Sidebar({ open, onClose, badges = {}, canOrder = false, onLogout }) {
    const nav = useNavigate()
    const [topOffset, setTopOffset] = useState(44)
    const groups = buildGroups({ badges, canOrder })

    useEffect(() => {
        if (!open) return
        const screenEl = document.querySelector('.screen.active-react')
        const topbarEl = document.querySelector('.home-topbar')
        if (topbarEl) setTopOffset(topbarEl.getBoundingClientRect().height)
        if (!screenEl) return
        screenEl.scrollTop = 0
        const prevOverflow = screenEl.style.overflowY
        screenEl.style.overflowY = 'hidden'
        return () => { screenEl.style.overflowY = prevOverflow }
    }, [open])

    const go = (to) => { onClose(); nav(to) }

    return (
        <>
            {open && <div className="sb-tap-outside" onClick={onClose} aria-hidden="true" />}
            <nav className={`sb-panel${open ? ' open' : ''}`} style={{ top: topOffset }} aria-label="Menu utama">
                {groups.map((g) => (
                    <div className="sb-group" key={g.title}>
                        <div className="sb-group-title">{g.title}</div>
                        <div className="sb-grid">
                            {g.items.map((it) => it.to ? (
                                <NavLink key={it.label} to={it.to} className="sb-tile" onClick={onClose}>
                                    <span className={`sb-tile-ic tone-${it.tone}`}>
                                        {it.badge != null && it.badge !== '' ? <span className="sb-tile-badge">{it.badge}</span> : null}
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            {ICONS[it.icon]}
                                        </svg>
                                    </span>
                                    <span className="sb-tile-label">{it.label}</span>
                                </NavLink>
                            ) : (
                                <button key={it.label} type="button" className="sb-tile">
                                    <span className={`sb-tile-ic tone-${it.tone}`}>
                                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                            {ICONS[it.icon]}
                                        </svg>
                                    </span>
                                    <span className="sb-tile-label">{it.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                ))}

                <div className="sb-divider" />
                <div className="sb-foot">
                    <button type="button" className="sb-foot-btn" onClick={() => go('/profile')}>Profile</button>
                    <button type="button" className="sb-foot-btn" disabled onClick={() => {}}>Settings</button>
                </div>
                <button type="button" className="sb-logout" onClick={onLogout}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4" /><path d="M16 17l5-5-5-5M21 12H9" />
                    </svg>
                    Log Out
                </button>
            </nav>
        </>
    )
}