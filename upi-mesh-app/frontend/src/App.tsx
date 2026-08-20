import { Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '@hooks/useAuthStore'
import { useMeshStore } from '@hooks/useMeshStore'
import Layout from '@components/Layout'
import WalletPage from '@pages/WalletPage'
import SendPage from '@pages/SendPage'
import RequestPage from '@pages/RequestPage'
import SplitPage from '@pages/SplitPage'
import MeshPage from '@pages/MeshPage'
import HistoryPage from '@pages/HistoryPage'
import SettingsPage from '@pages/SettingsPage'
import OnboardingPage from '@pages/OnboardingPage'
import PinPage from '@pages/PinPage'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isOnboarded } = useAuthStore()
  
  if (!isOnboarded) {
    return <Navigate to="/onboarding" replace />
  }
  
  if (!isAuthenticated) {
    return <Navigate to="/pin" replace />
  }
  
  return <>{children}</>
}

function PublicRoute({ children }: { children: React.ReactNode }) {
  const { isOnboarded } = useAuthStore()
  
  if (isOnboarded) {
    return <Navigate to="/" replace />
  }
  
  return <>{children}</>
}

function AppRoutes() {
  const { initialize } = useMeshStore()
  
  // Initialize mesh on app start
  React.useEffect(() => {
    initialize()
  }, [initialize])
  
  return (
    <Routes>
      <Route element={<PublicRoute><OnboardingPage /></PublicRoute>} path="/onboarding" />
      <Route element={<PublicRoute><PinPage /></PublicRoute>} path="/pin" />
      
      <Route element={<Layout />}>
        <Route element={<PrivateRoute><WalletPage /></PrivateRoute>} path="/" />
        <Route element={<PrivateRoute><SendPage /></PrivateRoute>} path="/send" />
        <Route element={<PrivateRoute><RequestPage /></PrivateRoute>} path="/request" />
        <Route element={<PrivateRoute><SplitPage /></PrivateRoute>} path="/split" />
        <Route element={<PrivateRoute><MeshPage /></PrivateRoute>} path="/mesh" />
        <Route element={<PrivateRoute><HistoryPage /></PrivateRoute>} path="/history" />
        <Route element={<PrivateRoute><SettingsPage /></PrivateRoute>} path="/settings" />
      </Route>
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default AppRoutes