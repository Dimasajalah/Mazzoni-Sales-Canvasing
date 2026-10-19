// frontend/src/App.jsx
import { useCallback } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { UiProvider, useUi } from './context/UiContext'
import { BottomNav, Fab } from './components/BottomNav'
import { PhoneFrame } from './components/PhoneFrame'
import { useDraftAutoSync } from './hooks/useDraftAutoSync'
import './styles/prototype.css'
import './index.css'
import NewSample from './pages/NewSample'
import NewSampleFeedback from './pages/NewSampleFeedback'
import Login from './pages/Login'
import Home from './pages/Home'
import Profile from './pages/Profile'
import NewLead from './pages/NewLead'
import Canvassing from './pages/Canvassing'
import Activities from './pages/Activities'
import QuoteForm from './pages/QuoteForm'
import Quotes from './pages/Quotes'
import Delegations from './pages/Delegations'
import MasterData from './pages/MasterData'
import NooReport from './pages/NooReport'
import Customers from './pages/Customers'
import CustomerDetail from './pages/CustomerDetail'
import CustomerActivity from './pages/CustomerActivity'
import ChooseActivity from './pages/ChooseActivity'
import TaskBrand from './pages/TaskBrand'
import TaskSample from './pages/TaskSample'
import TaskFollowUp from './pages/TaskFollowUp'
import TaskComplete from './pages/TaskComplete'
import TaskQuote from './pages/TaskQuote'
import QuoteLines from './pages/QuoteLines'
import QuoteLineDetail from './pages/QuoteLineDetail'
import QuoteAddLine from './pages/QuoteAddLine'
import StorePromo from './pages/StorePromo'
import OrderCheckout from './pages/OrderCheckout'
import { useOrderQueueSync } from './hooks/useOrderQueueSync'
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
import Notifications from './pages/Notifications'

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
  const { showToast } = useUi()
  const onSynced = useCallback((count) => showToast(`${count} data offline berhasil disinkronkan`), [showToast])
  useDraftAutoSync(isAuthenticated, onSynced)
  const onOrdersSynced = useCallback((count) => showToast(`${count} order offline berhasil dikirim`), [showToast])
  useOrderQueueSync(isAuthenticated, onOrdersSynced)

  return (
    <>
      <div className="screens" id="screens">
        <Routes>
          <Route path="/login" element={isAuthenticated ? <Navigate to="/home" replace /> : <Login />} />
          <Route path="/" element={<Navigate to="/home" replace />} />
          <Route path="/home" element={<Protected><Home /></Protected>} />
          <Route path="/profile" element={<Protected><Profile /></Protected>} />
          <Route path="/leads" element={<Navigate to="/customers" replace />} />
          <Route path="/leads/new" element={<Protected><NewLead /></Protected>} />
          <Route path="/canvassing" element={<Protected><Canvassing /></Protected>} />
          <Route path="/activities" element={<Protected><Activities /></Protected>} />
          <Route path="/quotes" element={<Protected><Quotes /></Protected>} />
          <Route path="/delegations" element={<Protected><Delegations /></Protected>} />
          <Route path="/reports/noo" element={<Protected><NooReport /></Protected>} />
          <Route path="/master" element={<Protected><MasterData /></Protected>} />
          <Route path="/quotes/new" element={<Protected><QuoteForm /></Protected>} />
          <Route path="/quotes/:id" element={<Protected><QuoteForm /></Protected>} />
          <Route path="/customers" element={<Protected><Customers /></Protected>} />
          <Route path="/customers/:id" element={<Protected><CustomerDetail /></Protected>} />
          <Route path="/customers/:id/activity" element={<Protected><CustomerActivity /></Protected>} />
          <Route path="/choose-activity/:id" element={<Protected><ChooseActivity /></Protected>} />
          <Route path="/visit/:id/brand" element={<Protected><TaskBrand /></Protected>} />
          <Route path="/visit/:id/sample" element={<Protected><TaskSample /></Protected>} />
          <Route path="/visit/:id/followup" element={<Protected><TaskFollowUp /></Protected>} />
          <Route path="/visit/:id/complete" element={<Protected><TaskComplete /></Protected>} />
          <Route path="/visit/:id/quote" element={<Protected><TaskQuote /></Protected>} />
          <Route path="/quotes/:id/lines" element={<Protected><QuoteLines /></Protected>} />
          <Route path="/quotes/:id/lines/add" element={<Protected><QuoteAddLine /></Protected>} />
          <Route path="/visit/:id/promo" element={<Protected><StorePromo /></Protected>} />
          <Route path="/visit/:id/order" element={<Protected><OrderCheckout /></Protected>} />
          <Route path="/notifications" element={<Protected><Notifications /></Protected>} />
          <Route path="/quotes/:id/lines/new" element={<Protected><QuoteLineDetail /></Protected>} />
          <Route path="/quotes/:id/lines/:lineId" element={<Protected><QuoteLineDetail /></Protected>} />
          <Route path="/stock" element={<Protected><Stock /></Protected>} />
          <Route path="/promo" element={<Protected><Promo /></Protected>} />
          <Route path="/visits" element={<Protected><Visits /></Protected>} />
          <Route path="/checkin" element={<Protected><Checkin /></Protected>} />
          <Route path="/checkin/:customerId" element={<Protected><Checkin /></Protected>} />
          <Route path="/samples/new" element={<Protected><NewSample /></Protected>} />
          <Route path="/sample-feedbacks/new" element={<Protected><NewSampleFeedback /></Protected>} />
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
