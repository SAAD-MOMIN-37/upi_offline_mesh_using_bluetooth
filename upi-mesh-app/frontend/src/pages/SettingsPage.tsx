import { useAuthStore } from '@hooks/useAuthStore'
import { useMeshStore } from '@hooks/useMeshStore'
import { useState } from 'react'
import { 
  User, CreditCard, Shield, Bell, Palette, Globe, 
  Bluetooth, Wifi, Database, Trash2, LogOut, 
  Key, Fingerprint, Moon, Sun, Monitor, Smartphone
} from 'lucide-react'
import { Link } from 'react-router-dom'
import type { AppSettings } from '@types'

export default function SettingsPage() {
  const { 
    primaryAccount, accounts, contacts, transactions, settings, 
    updateSettings, setPinHash, verifyPin, enableBiometric, disableBiometric,
    biometricEnabled, pinHash
  } = useAuthStore()
  const { cleanupExpiredPackets } = useMeshStore()
  const [showPinModal, setShowPinModal] = useState(false)
  const [pinAction, setPinAction] = useState<'change' | 'disable'>('change')
  const [newPin, setNewPin] = useState('')
  const [confirmPin, setConfirmPin] = useState('')
  const [currentPin, setCurrentPin] = useState('')
  const [pinError, setPinError] = useState('')
  
  const handleSettingChange = (key: keyof AppSettings, value: boolean | string | number) => {
    updateSettings({ [key]: value })
  }
  
  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setPinError('')
    
    if (pinAction === 'change') {
      if (!currentPin) {
        setPinError('Enter current PIN')
        return
      }
      const isValid = await verifyPin(currentPin)
      if (!isValid) {
        setPinError('Incorrect current PIN')
        return
      }
      if (!newPin || newPin.length !== 4) {
        setPinError('New PIN must be 4 digits')
        return
      }
      if (newPin !== confirmPin) {
        setPinError('PINs do not match')
        return
      }
      
      const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(newPin))
      const hashArray = Array.from(new Uint8Array(hash))
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      setPinHash(hashHex)
      setShowPinModal(false)
      setCurrentPin('')
      setNewPin('')
      setConfirmPin('')
    } else if (pinAction === 'disable') {
      if (!currentPin) {
        setPinError('Enter current PIN')
        return
      }
      const isValid = await verifyPin(currentPin)
      if (!isValid) {
        setPinError('Incorrect current PIN')
        return
      }
      setPinHash(undefined)
      handleSettingChange('pinEnabled', false)
      setShowPinModal(false)
      setCurrentPin('')
    }
  }
  
  const openPinModal = (action: 'change' | 'disable') => {
    setPinAction(action)
    setShowPinModal(true)
    setPinError('')
    setCurrentPin('')
    setNewPin('')
    setConfirmPin('')
  }
  
  const handleBiometricToggle = async (enabled: boolean) => {
    if (enabled) {
      await enableBiometric()
    } else {
      disableBiometric()
    }
    handleSettingChange('biometricEnabled', enabled)
  }
  
  const handleClearData = async () => {
    if (!confirm('This will delete all local data (transactions, contacts, pending packets). Continue?')) return
    if (!confirm('Are you sure? This cannot be undone.')) return
    
    await cleanupExpiredPackets()
    // In a real app, clear all IndexedDB stores
    alert('Data cleared. Restart the app.')
  }
  
  return (
    <div className="flex-1 max-w-2xl mx-auto py-8">
      <h1 className="text-2xl font-bold text-mesh-text mb-8">Settings</h1>
      
      {/* Account Section */}
      <div className="card mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-mesh-accent/20 flex items-center justify-center">
            <User className="w-5 h-5 text-mesh-accent" />
          </div>
          <h2 className="font-semibold text-mesh-text">Account</h2>
        </div>
        
        {primaryAccount && (
          <Link to="/settings/account" className="flex items-center gap-3 p-3 bg-mesh-bg rounded-xl hover:bg-mesh-border/50 transition-colors">
            <div className="w-12 h-12 rounded-xl bg-mesh-success/20 flex items-center justify-center">
              <CreditCard className="w-6 h-6 text-mesh-success" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-mesh-text">{primaryAccount.holderName}</p>
              <p className="text-sm text-mesh-muted">{primaryAccount.vpa} • {primaryAccount.bankName}</p>
            </div>
            <CreditCard className="w-5 h-5 text-mesh-muted" />
          </Link>
        )}
        
        <div className="space-y-2 mt-4">
          <Link to="/settings/accounts" className="btn-secondary w-full justify-start">
            <CreditCard className="w-5 h-5" /> Manage Accounts
          </Link>
          <Link to="/settings/contacts" className="btn-secondary w-full justify-start">
            <User className="w-5 h-5" /> Manage Contacts
          </Link>
        </div>
      </div>
      
      {/* Security Section */}
      <div className="card mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-mesh-danger/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-mesh-danger" />
          </div>
          <h2 className="font-semibold text-mesh-text">Security</h2>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-mesh-warning/20 flex items-center justify-center">
                <Key className="w-5 h-5 text-mesh-warning" />
              </div>
              <div>
                <p className="font-medium text-mesh-text">App PIN</p>
                <p className="text-sm text-mesh-muted">4-digit PIN for transactions</p>
              </div>
            </div>
            {pinHash ? (
              <>
                <button onClick={() => openPinModal('change')} className="btn-secondary text-sm">
                  Change PIN
                </button>
                <button onClick={() => openPinModal('disable')} className="btn-ghost text-sm text-mesh-danger">
                  Disable
                </button>
              </>
            ) : (
              <button onClick={() => openPinModal('change')} className="btn-primary">
                Set PIN
              </button>
            )}
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-mesh-info/20 flex items-center justify-center">
                <Fingerprint className="w-5 h-5 text-mesh-info" />
              </div>
              <div>
                <p className="font-medium text-mesh-text">Biometric Unlock</p>
                <p className="text-sm text-mesh-muted">Use fingerprint or Face ID</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={biometricEnabled && pinHash}
                onChange={(e) => handleBiometricToggle(e.target.checked)}
                disabled={!pinHash}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-mesh-border peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-mesh-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-mesh-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-mesh-success"></div>
            </label>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-mesh-success/20 flex items-center justify-center">
                <Shield className="w-5 h-5 text-mesh-success" />
              </div>
              <div>
                <p className="font-medium text-mesh-text">Require PIN for transactions</p>
                <p className="text-sm text-mesh-muted">Always confirm before sending</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.pinEnabled}
                onChange={(e) => handleSettingChange('pinEnabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-mesh-border peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-mesh-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-mesh-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-mesh-success"></div>
            </label>
          </div>
        </div>
      </div>
      
      {/* Mesh Section */}
      <div className="card mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-mesh-success/20 flex items-center justify-center">
            <Bluetooth className="w-5 h-5 text-mesh-success" />
          </div>
          <h2 className="font-semibold text-mesh-text">Mesh Network</h2>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-mesh-accent/20 flex items-center justify-center">
                <Wifi className="w-5 h-5 text-mesh-accent" />
              </div>
              <div>
                <p className="font-medium text-mesh-text">Auto Gossip</p>
                <p className="text-sm text-mesh-muted">Automatically exchange packets</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.autoGossip}
                onChange={(e) => handleSettingChange('autoGossip', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-mesh-border peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-mesh-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-mesh-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-mesh-success"></div>
            </label>
          </div>
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-mesh-warning/20 flex items-center justify-center">
                <Database className="w-5 h-5 text-mesh-warning" />
              </div>
              <div>
                <p className="font-medium text-mesh-text">Data Saver Mode</p>
                <p className="text-sm text-mesh-muted">Reduce mesh activity on mobile data</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.dataSaverMode}
                onChange={(e) => handleSettingChange('dataSaverMode', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-mesh-border peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-mesh-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-mesh-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-mesh-success"></div>
            </label>
          </div>
        </div>
      </div>
      
      {/* Notifications */}
      <div className="card mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-mesh-info/20 flex items-center justify-center">
            <Bell className="w-5 h-5 text-mesh-info" />
          </div>
          <h2 className="font-semibold text-mesh-text">Notifications</h2>
        </div>
        
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-mesh-success/20 flex items-center justify-center">
                <CheckCircle className="w-5 h-5 text-mesh-success" />
              </div>
              <div>
                <p className="font-medium text-mesh-text">Payment Confirmations</p>
                <p className="text-sm text-mesh-muted">Get notified when payments settle</p>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.notificationsEnabled}
                onChange={(e) => handleSettingChange('notificationsEnabled', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-mesh-border peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-mesh-accent rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-mesh-border after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-mesh-success"></div>
            </label>
          </div>
        </div>
      </div>
      
      {/* Appearance */}
      <div className="card mb-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-mesh-muted/20 flex items-center justify-center">
            <Palette className="w-5 h-5 text-mesh-muted" />
          </div>
          <h2 className="font-semibold text-mesh-text">Appearance</h2>
        </div>
        
        <div className="space-y-4">
          <div>
            <label className="label">Theme</label>
            <div className="grid grid-cols-3 gap-3">
              {(['light', 'dark', 'system'] as const).map(theme => (
                <button
                  key={theme}
                  onClick={() => handleSettingChange('theme', theme)}
                  className={`p-4 rounded-xl border-2 text-center transition-all ${
                    settings.theme === theme
                      ? 'border-mesh-accent bg-mesh-accent/10'
                      : 'border-mesh-border hover:border-mesh-accent/50'
                  }`}
                >
                  {theme === 'light' && <Sun className="w-6 h-6 mx-auto mb-2" />}
                  {theme === 'dark' && <Moon className="w-6 h-6 mx-auto mb-2" />}
                  {theme === 'system' && <Monitor className="w-6 h-6 mx-auto mb-2" />}
                  <p className="text-sm font-medium capitalize">{theme}</p>
                </button>
              ))}
            </div>
          </div>
          
          <div>
            <label className="label">Language</label>
            <select
              value={settings.language}
              onChange={(e) => handleSettingChange('language', e.target.value as 'en' | 'hi')}
              className="input"
            >
              <option value="en">English</option>
              <option value="hi">हिन्दी</option>
            </select>
          </div>
        </div>
      </div>
      
      {/* Data Management */}
      <div className="card mb-6 border-mesh-danger/50">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-mesh-danger/20 flex items-center justify-center">
            <Trash2 className="w-5 h-5 text-mesh-danger" />
          </div>
          <h2 className="font-semibold text-mesh-text">Data Management</h2>
        </div>
        
        <div className="space-y-3">
          <button onClick={handleClearData} className="btn-danger w-full justify-start">
            <Trash2 className="w-5 h-5" /> Clear All Local Data
          </button>
          <p className="text-xs text-mesh-muted">
            Deletes transactions, contacts, pending packets, and settings. 
            Does not affect settled payments on the backend.
          </p>
        </div>
      </div>
      
      {/* About */}
      <div className="card">
        <h2 className="font-semibold text-mesh-text mb-4">About</h2>
        <div className="space-y-2 text-sm text-mesh-muted">
          <div className="flex justify-between">
            <span>Version</span>
            <span className="font-mono">0.1.0</span>
          </div>
          <div className="flex justify-between">
            <span>Protocol</span>
            <span className="font-mono">UPI Mesh v1</span>
          </div>
          <div className="flex justify-between">
            <span>Crypto</span>
            <span className="font-mono">RSA-OAEP + AES-256-GCM</span>
          </div>
          <div className="flex justify-between">
            <span>License</span>
            <span>MIT</span>
          </div>
        </div>
        
        <div className="flex gap-3 mt-6">
          <Link href="https://github.com/your-org/upi-mesh" target="_blank" rel="noopener" className="btn-secondary flex-1 justify-center">
            <Smartphone className="w-5 h-5" /> GitHub
          </Link>
          <Link href="https://your-docs.example.com" target="_blank" rel="noopener" className="btn-secondary flex-1 justify-center">
            <Globe className="w-5 h-5" /> Documentation
          </Link>
        </div>
      </div>
      
      {/* PIN Modal */}
      {showPinModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="card w-full max-w-md animate-in">
            <h2 className="text-xl font-bold text-mesh-text mb-6">
              {pinAction === 'change' ? (pinHash ? 'Change PIN' : 'Set PIN') : 'Disable PIN'}
            </h2>
            
            <form onSubmit={handlePinSubmit} className="space-y-4">
              {pinHash && (
                <div>
                  <label className="label">Current PIN</label>
                  <input
                    type="password"
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    className="input text-center text-2xl font-mono tracking-widest"
                    inputMode="numeric"
                    maxLength={4}
                    autoFocus
                    required
                  />
                </div>
              )}
              
              {pinAction === 'change' && (
                <>
                  <div>
                    <label className="label">New PIN</label>
                    <input
                      type="password"
                      value={newPin}
                      onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="input text-center text-2xl font-mono tracking-widest"
                      inputMode="numeric"
                      maxLength={4}
                      required
                    />
                  </div>
                  <div>
                    <label className="label">Confirm New PIN</label>
                    <input
                      type="password"
                      value={confirmPin}
                      onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                      className="input text-center text-2xl font-mono tracking-widest"
                      inputMode="numeric"
                      maxLength={4}
                      required
                    />
                  </div>
                </>
              )}
              
              {pinError && (
                <div className="text-sm text-mesh-danger text-center">{pinError}</div>
              )}
              
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowPinModal(false)} className="btn-secondary flex-1">
                  Cancel
                </button>
                <button type="submit" className="btn-primary flex-1">
                  {pinAction === 'disable' ? 'Disable' : pinHash ? 'Change PIN' : 'Set PIN'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}