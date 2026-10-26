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
import MarketingBudgets from './pages/MarketingBudgets'
import MarketingBudgetForm from './pages/MarketingBudgetForm'
import MarketingEvents from './pages/MarketingEvents'
import MarketingEventForm from './pages/MarketingEventForm'
import MarketingEventDetail from './pages/MarketingEventDetail'
import StarOutlets from './pages/StarOutlets'
import StarOutletForm from './pages/StarOutletForm'
import ClaimPrograms from './pages/ClaimPrograms'
import ClaimProgramForm from './pages/ClaimProgramForm'
import ClaimProgramDetail from './pages/ClaimProgramDetail'
import MarketingApprovals from './pages/MarketingApprovals'
import Claims from './pages/Claims'
import ClaimForm from './pages/ClaimForm'
import ClaimDetail from './pages/ClaimDetail'
import Deductions from './pages/Deductions'
import DeductionDetail from './pages/DeductionDetail'
import CreditMemos from './pages/CreditMemos'
import CreditMemoDetail from './pages/CreditMemoDetail'
import Transfers from './pages/Transfers'
import TransferDetail from './pages/TransferDetail'
import Goods from './pages/Goods'
import GoodsDetail from './pages/GoodsDetail'
import Requisitions from './pages/Requisitions'
import RequisitionForm from './pages/RequisitionForm'
import RequisitionDetail from './pages/RequisitionDetail'
import MoveRequests from './pages/MoveRequests'
import MoveRequestForm from './pages/MoveRequestForm'
import MoveRequestDetail from './pages/MoveRequestDetail'
import IssueMaterials from './pages/IssueMaterials'
import IssueMaterialForm from './pages/IssueMaterialForm'
import IssueMaterialDetail from './pages/IssueMaterialDetail'
import ReturnDetail from './pages/ReturnDetail'
import ExpenseDetail from './pages/ExpenseDetail'
import Achievement from './pages/Achievement'
import CashAdvance from './pages/CashAdvance'
import PettyCashCategoryDetail from './pages/PettyCashCategoryDetail'
import NewPettyCashIssue from './pages/NewPettyCashIssue'

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
        <Route path="/login" element={<Login />} />
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
          <Route path="/marketing/star-outlets" element={<Protected><StarOutlets /></Protected>} />
          <Route path="/marketing/star-outlets/new" element={<Protected><StarOutletForm /></Protected>} />
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
          <Route path="/marketing/events" element={<Protected><MarketingEvents /></Protected>} />
          <Route path="/marketing/events/new" element={<Protected><MarketingEventForm /></Protected>} />
          <Route path="/marketing/events/:id" element={<Protected><MarketingEventDetail /></Protected>} />
          <Route path="/marketing/claim-programs" element={<Protected><ClaimPrograms /></Protected>} />
          <Route path="/marketing/claim-programs/new" element={<Protected><ClaimProgramForm /></Protected>} />
          <Route path="/marketing/claim-programs/:id" element={<Protected><ClaimProgramDetail /></Protected>} />
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
          <Route path="/marketing/budgets" element={<Protected><MarketingBudgets /></Protected>} />
          <Route path="/marketing/budgets/new" element={<Protected><MarketingBudgetForm /></Protected>} />
          <Route path="/marketing/budgets/:id" element={<Protected><MarketingBudgetForm /></Protected>} />
          <Route path="/marketing/approvals" element={<Protected><MarketingApprovals /></Protected>} />
          <Route path="/marketing/events/:id/revise" element={<Protected><MarketingEventForm /></Protected>} />
          <Route path="/marketing/claims" element={<Protected><Claims /></Protected>} />
          <Route path="/marketing/claims/new" element={<Protected><ClaimForm /></Protected>} />
          <Route path="/marketing/claims/:id" element={<Protected><ClaimDetail /></Protected>} />
          <Route path="/marketing/deductions" element={<Protected><Deductions /></Protected>} />
          <Route path="/marketing/deductions/:id" element={<Protected><DeductionDetail /></Protected>} />
          <Route path="/marketing/credit-memos" element={<Protected><CreditMemos /></Protected>} />
          <Route path="/marketing/credit-memos/:id" element={<Protected><CreditMemoDetail /></Protected>} />
          <Route path="/marketing/transfers" element={<Protected><Transfers /></Protected>} />
          <Route path="/marketing/transfers/:id" element={<Protected><TransferDetail /></Protected>} />
          <Route path="/marketing/goods" element={<Protected><Goods /></Protected>} />
          <Route path="/marketing/goods/:id" element={<Protected><GoodsDetail /></Protected>} />
          <Route path="/purchasing/requisitions" element={<Protected><Requisitions /></Protected>} />
          <Route path="/purchasing/requisitions/new" element={<Protected><RequisitionForm /></Protected>} />
          <Route path="/purchasing/requisitions/:id" element={<Protected><RequisitionDetail /></Protected>} />
          <Route path="/purchasing/requisitions/:id/edit" element={<Protected><RequisitionForm /></Protected>} />
          <Route path="/marketing/move-requests" element={<Protected><MoveRequests /></Protected>} />
          <Route path="/marketing/move-requests/new" element={<Protected><MoveRequestForm /></Protected>} />
          <Route path="/marketing/move-requests/:id" element={<Protected><MoveRequestDetail /></Protected>} />
          <Route path="/marketing/move-requests/:id/edit" element={<Protected><MoveRequestForm /></Protected>} />
          <Route path="/marketing/sample-requests" element={<Protected><MoveRequests kind="sample" /></Protected>} />
          <Route path="/marketing/sample-requests/new" element={<Protected><MoveRequestForm kind="sample" /></Protected>} />
          <Route path="/marketing/sample-requests/:id" element={<Protected><MoveRequestDetail kind="sample" /></Protected>} />
          <Route path="/marketing/sample-requests/:id/edit" element={<Protected><MoveRequestForm kind="sample" /></Protected>} />
          <Route path="/marketing/issues" element={<Protected><IssueMaterials /></Protected>} />
          <Route path="/marketing/issues/new" element={<Protected><IssueMaterialForm /></Protected>} />
          <Route path="/marketing/issues/:id" element={<Protected><IssueMaterialDetail /></Protected>} />
          <Route path="/marketing/issues/:id/edit" element={<Protected><IssueMaterialForm /></Protected>} />
          <Route path="/returns/:id" element={<Protected><ReturnDetail /></Protected>} />
          <Route path="/expenses/:id" element={<Protected><ExpenseDetail /></Protected>} />
          <Route path="/marketing/achievement" element={<Protected><Achievement /></Protected>} />
          <Route path="/cash-advance" element={<Protected><CashAdvance /></Protected>} />
          <Route path="/cash-advance/category/:operationType" element={<Protected><PettyCashCategoryDetail /></Protected>} />
          <Route path="/cash-advance/new" element={<Protected><NewPettyCashIssue /></Protected>} />
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
