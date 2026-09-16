// frontend/src/App.jsx
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { UiProvider } from './context/UiContext'
import { BottomNav, Fab } from './components/BottomNav'
import { PhoneFrame } from './components/PhoneFrame'
import './styles/prototype.css'
import './index.css'

import Login from './pages/Login'
import Home from './pages/Home'
import Leads from './pages/Leads'
import NewLead from './pages/NewLead'
import Canvassing from './pages/Canvassing'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import Stock from './pages/Stock'
import Promo from './pages/Promo'
import Visits from './pages/Visits'
import Checkin from './pages/Checkin'
import VisitMode from './pages/VisitMode'
import Orders from './pages/Orders'
import NewOrder from './pages/NewOrder'
import Tracker from './pages/Tracker'
import ArReport from './pages/ArReport'
import Payment from './pages/Payment'
import Expenses from './pages/Expenses'
import NewExpense from './pages/NewExpense'
import Returns from './pages/Returns'
import NewReturn from './pages/NewReturn'

function Protected({ children }) {
  const { isAuthenticated, booting } = useAuth()
  const loc = useLocation()
  if (booting) {
    return (
      <div className="screen active-react" style={{ display: 'grid', placeItems: 'center' }}>
        <div className="muted">Memuat…</div>
      </div>
    )
  }
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: loc }} />
  return children
}

function AppRoutes() {
  const { isAuthenticated } = useAuth()

  return (
    <>
      <div className="screens" id="screens">
        <Routes>
          <Route path="/login" element={isAuthenticated ? <Navigate to="/home" replace /> : <Login />} />
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<Protected><Home /></Protected>} />
          <Route path="/leads" element={<Protected><Leads /></Protected>} />
          <Route path="/leads/new" element={<Protected><NewLead /></Protected>} />
          <Route path="/canvassing" element={<Protected><Canvassing /></Protected>} />
          <Route path="/customers" element={<Protected><Customers /></Protected>} />
          <Route path="/customers/:id" element={<Protected><CustomerDetail /></Protected>} />
          <Route path="/stock" element={<Protected><Stock /></Protected>} />
          <Route path="/promo" element={<Protected><Promo /></Protected>} />
          <Route path="/visits" element={<Protected><Visits /></Protected>} />
          <Route path="/checkin" element={<Protected><Checkin /></Protected>} />
          <Route path="/checkin/:customerId" element={<Protected><Checkin /></Protected>} />
          <Route path="/visit-mode/:id" element={<Protected><VisitMode /></Protected>} />
          <Route path="/orders" element={<Protected><Orders /></Protected>} />
          <Route path="/orders/new" element={<Protected><NewOrder /></Protected>} />
          <Route path="/track" element={<Protected><Tracker /></Protected>} />
          <Route path="/track/:id" element={<Protected><Tracker /></Protected>} />
          <Route path="/ar" element={<Protected><ArReport /></Protected>} />
          <Route path="/payment" element={<Protected><Payment /></Protected>} />
          <Route path="/expenses" element={<Protected><Expenses /></Protected>} />
          <Route path="/expenses/new" element={<Protected><NewExpense /></Protected>} />
          <Route path="/returns" element={<Protected><Returns /></Protected>} />
          <Route path="/returns/new" element={<Protected><NewReturn /></Protected>} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </div>
      <BottomNav />
      <Fab />
    </>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <UiProvider>
        <PhoneFrame>
          <AppRoutes />
        </PhoneFrame>
      </UiProvider>
    </AuthProvider>
  )
}
