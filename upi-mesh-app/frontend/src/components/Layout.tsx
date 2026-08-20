import { Outlet, NavLink, useLocation } from 'react-router-dom'
import { useAuthStore } from '@hooks/useAuthStore'
import { useMeshStore } from '@hooks/useMeshStore'
import { 
  Home, Send, HelpCircle, GitBranch, History, Settings, 
  Wifi, WifiOff, Bluetooth, BluetoothOff, AlertCircle, CheckCircle
} from 'lucide-react'

const NAV_ITEMS = [
  { path: '/', label: 'Wallet', icon: Home },
  { path: '/send', label: 'Send', icon: Send },
  { path: '/request', label: 'Request', icon: HelpCircle },
  { path: '/split', label: 'Split', icon: GitBranch },
  { path: '/mesh', label: 'Mesh', icon: Bluetooth },
  { path: '/history', label: 'History', icon: History },
  { path: '/settings', label: 'Settings', icon: Settings }
] as const

export default function Layout() {
  const location = useLocation()
  const { primaryAccount, settings } = useAuthStore()
  const { networkStatus, devices } = useMeshStore()
  
  const onlineDevices = Array.from(devices.values()).filter(d => d.hasInternet && !d.isKilled).length
  const totalDevices = devices.size
  
  return (
    <div className="min-h-screen bg-mesh-bg flex flex-col">
      {/* Status Bar */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-mesh-bg/95 backdrop-blur-sm border-b border-mesh-border px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-2 h-2 rounded-full ${networkStatus.isOnline ? 'bg-mesh-success' : 'bg-mesh-danger'}`} />
          <span className="text-xs font-medium text-mesh-muted">
            {networkStatus.isOnline ? 'Online' : 'Offline'}
          </span>
          <span className="text-mesh-border mx-1">|</span>
          <div className="flex items-center gap-1">
            <Bluetooth className={`w-3 h-3 ${networkStatus.isBluetoothEnabled ? 'text-mesh-success' : 'text-mesh-muted'}`} />
            <span className="text-xs text-mesh-muted">
              {onlineDevices > 0 ? `${onlineDevices}/${totalDevices} bridges` : 'No bridges'}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          {primaryAccount && (
            <div className="flex items-center gap-2 px-3 py-1 bg-mesh-card/50 rounded-full">
              <span className="text-sm font-mono text-mesh-success">
                ₹{parseFloat(primaryAccount.balance).toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </span>
              <span className="text-xs text-mesh-muted">{primaryAccount.bankName}</span>
            </div>
          )}
        </div>
      </div>
      
      {/* Main Content */}
      <main className="flex-1 pt-16 pb-24 px-4">
        <Outlet />
      </main>
      
      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-mesh-card border-t border-mesh-border z-50 safe-area-bottom">
        <div className="grid grid-cols-4 gap-1 p-2">
          {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
            <NavLink
              key={path}
              to={path}
              className={({ isActive }) => `
                flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all duration-200
                ${isActive 
                  ? 'bg-mesh-accent/10 text-mesh-accent' 
                  : 'text-mesh-muted'
                }
              `}
            >
              <Icon className="w-5 h-5" strokeWidth={2.5} />
              <span className="text-xs font-medium">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}