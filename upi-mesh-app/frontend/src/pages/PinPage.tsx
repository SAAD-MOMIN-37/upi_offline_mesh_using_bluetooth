import { useState } from 'react'
import { useAuthStore } from '@hooks/useAuthStore'
import { Shield, Loader2, AlertCircle, CheckCircle } from 'lucide-react'

export default function PinPage() {
  const { isOnboarded, pinHash, verifyPin, setAuthenticated } = useAuthStore()
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  
  if (!isOnboarded || !pinHash) {
    return null // Should redirect to onboarding
  }
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (pin.length !== 4) {
      setError('Enter your 4-digit PIN')
      return
    }
    
    setLoading(true)
    
    try {
      const isValid = await verifyPin(pin)
      if (isValid) {
        setSuccess(true)
        setAuthenticated(true)
        // Give a moment to show success
        await new Promise(resolve => setTimeout(resolve, 500))
        // Navigation will happen via AppRoutes
      } else {
        setError('Incorrect PIN. Try again.')
        setPin('')
      }
    } catch {
      setError('Authentication failed. Try again.')
    } finally {
      setLoading(false)
    }
  }
  
  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-mesh-bg p-6">
        <div className="w-full max-w-md text-center animate-in">
          <div className="w-24 h-24 rounded-full bg-mesh-success/20 flex items-center justify-center mx-auto mb-6">
            <CheckCircle className="w-12 h-12 text-mesh-success" />
          </div>
          <h1 className="text-2xl font-bold text-mesh-text mb-2">Welcome Back</h1>
          <p className="text-mesh-muted">Unlocked successfully</p>
        </div>
      </div>
    )
  }
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-mesh-bg p-6">
      <div className="w-full max-w-md">
        <div className="card animate-in">
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-2xl bg-mesh-accent/20 flex items-center justify-center mx-auto mb-4">
              <Shield className="w-8 h-8 text-mesh-accent" />
            </div>
            <h1 className="text-2xl font-bold text-mesh-text mb-2">Enter PIN</h1>
            <p className="text-mesh-muted">Unlock your wallet to continue</p>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="flex gap-3 justify-center">
              {[1,2,3,4].map(i => (
                <div key={i} className={`w-14 h-14 rounded-xl border-2 flex items-center justify-center font-mono text-2xl ${
                  pin.length >= i ? 'border-mesh-accent bg-mesh-accent/10 text-mesh-accent' : 'border-mesh-border text-mesh-muted'
                }`}>
                  {pin.length >= i ? '●' : ''}
                </div>
              ))}
            </div>
            
            <input
              type="password"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="input text-center text-2xl font-mono tracking-widest opacity-0 pointer-events-none fixed -top-20"
              inputMode="numeric"
              maxLength={4}
              autoFocus
              aria-hidden="true"
            />
            
            {error && (
              <div className="flex items-center gap-2 text-sm text-mesh-danger bg-mesh-danger/10 px-4 py-3 rounded-xl">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
            
            <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Unlock'}
            </button>
          </form>
          
          <div className="mt-6 text-center">
            <p className="text-sm text-mesh-muted">
              Forgot PIN? You'll need to reinstall the app and set up again.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}