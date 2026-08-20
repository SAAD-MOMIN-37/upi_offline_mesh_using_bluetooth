import { useAuthStore } from '@hooks/useAuthStore'
import { useMeshStore } from '@hooks/useMeshStore'
import { useState } from 'react'
import { cryptoService } from '@services/cryptoService'
import { storageService } from '@services/storageService'
import { bluetoothService } from '@services/bluetoothService'
import { Send, User, Search, X, Loader2, CheckCircle, AlertCircle, Clock } from 'lucide-react'
import { Link } from 'react-router-dom'
import type { Contact, VPA } from '@types'

export default function SendPage() {
  const { primaryAccount, contacts, addTransaction, verifyPin } = useAuthStore()
  const { addToOutbox, networkStatus, currentDeviceId } = useMeshStore()
  const [recipientVpa, setRecipientVpa] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [pin, setPin] = useState('')
  const [showPin, setShowPin] = useState(false)
  const [step, setStep] = useState<'input' | 'pin' | 'confirm' | 'success'>('input')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  
  const filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(recipientVpa.toLowerCase()) ||
    c.vpa.toLowerCase().includes(recipientVpa.toLowerCase())
  )
  
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!primaryAccount) {
      setError('No account linked')
      return
    }
    
    if (!recipientVpa.includes('@')) {
      setError('Enter a valid VPA (e.g., user@bank)')
      return
    }
    
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) {
      setError('Enter a valid amount')
      return
    }
    
    if (amt > parseFloat(primaryAccount.balance)) {
      setError('Insufficient balance')
      return
    }
    
    // Find or create contact
    let contact = contacts.find(c => c.vpa === recipientVpa)
    if (!contact) {
      contact = {
        id: crypto.randomUUID(),
        name: recipientVpa.split('@')[0],
        vpa: recipientVpa as VPA,
        isFavorite: false
      }
    }
    
    setSelectedContact(contact)
    setStep('pin')
  }
  
  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (pin.length !== 4) {
      setError('Enter 4-digit PIN')
      return
    }
    
    const isValid = await verifyPin(pin)
    if (!isValid) {
      setError('Incorrect PIN')
      setPin('')
      return
    }
    
    setStep('confirm')
  }
  
  const handleConfirm = async () => {
    if (!selectedContact) return
    
    setLoading(true)
    setError('')
    
    try {
      // Create payment instruction
      const pinHash = await cryptoService.hashPin(pin)
      const nonce = cryptoService.generateNonce()
      const ackKey = cryptoService.generateAckKey()
      const originalPacketId = crypto.randomUUID()
      
      const instruction = {
        senderVpa: primaryAccount!.vpa,
        receiverVpa: selectedContact.vpa,
        amount: amount,
        pinHash,
        nonce,
        signedAt: Date.now(),
        ackKey: Array.from(ackKey),
        originalPacketId
      }
      
      // Encrypt packet
      const ciphertext = await cryptoService.encrypt(instruction)
      
      // Create pending packet
      const packet = {
        id: crypto.randomUUID(),
        packetId: originalPacketId,
        ciphertext,
        ttl: 5,
        createdAt: Date.now(),
        instruction,
        ackKey,
        status: 'outbox' as const,
        retryCount: 0
      }
      
      // Add to outbox
      await addToOutbox(packet)
      await storageService.addToOutbox(packet)
      
      // Add to local transactions
      addTransaction({
        id: packet.id,
        type: 'SEND',
        status: 'PENDING',
        amount,
        senderVpa: primaryAccount!.vpa,
        receiverVpa: selectedContact.vpa,
        counterpartyName: selectedContact.name,
        counterpartyVpa: selectedContact.vpa,
        note,
        createdAt: Date.now(),
        expiresAt: Date.now() + 24 * 60 * 60 * 1000
      })
      
      setStep('success')
    } catch (err) {
      setError('Failed to create payment. Try again.')
      console.error(err)
    } finally {
      setLoading(false)
    }
  }
  
  const resetForm = () => {
    setRecipientVpa('')
    setAmount('')
    setNote('')
    setPin('')
    setSelectedContact(null)
    setStep('input')
    setError('')
  }
  
  if (!primaryAccount) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <User className="w-16 h-16 text-mesh-muted mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-mesh-text mb-2">No Account Linked</h2>
          <p className="text-mesh-muted mb-6">Add a bank account to send money</p>
          <Link to="/settings" className="btn-primary">Add Account</Link>
        </div>
      </div>
    )
  }
  
  return (
    <div className="flex-1 max-w-md mx-auto py-8">
      <div className="card">
        <h1 className="text-2xl font-bold text-mesh-text mb-6">Send Money</h1>
        
        {step === 'input' && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="label">Recipient VPA</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-mesh-muted" />
                <input
                  type="text"
                  value={recipientVpa}
                  onChange={(e) => setRecipientVpa(e.target.value)}
                  placeholder="user@bank"
                  className="input pl-10"
                  autoComplete="off"
                  autoFocus
                />
              </div>
              {filteredContacts.length > 0 && (
                <div className="absolute z-10 mt-1 bg-mesh-card border border-mesh-border rounded-xl overflow-hidden w-full">
                  {filteredContacts.slice(0, 5).map(contact => (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => {
                        setRecipientVpa(contact.vpa)
                        setSelectedContact(contact)
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-mesh-border transition-colors flex items-center gap-3"
                    >
                      <div className="w-10 h-10 rounded-full bg-mesh-accent/20 flex items-center justify-center">
                        <User className="w-5 h-5 text-mesh-accent" />
                      </div>
                      <div>
                        <p className="font-medium text-mesh-text">{contact.name}</p>
                        <p className="text-sm text-mesh-muted">{contact.vpa}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <div>
              <label className="label">Amount (₹)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="input text-2xl font-mono text-center"
                inputMode="decimal"
                step="0.01"
                min="1"
                max={primaryAccount.balance}
              </p>
              <p className="text-sm text-mesh-muted text-center mt-1">
                Available: ₹{parseFloat(primaryAccount.balance).toLocaleString('en-IN')}
              </p>
            </div>
            
            <div>
              <label className="label">Note (optional)</label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="What's this for?"
                className="input"
              />
            </div>
            
            {error && (
              <div className="flex items-center gap-2 text-sm text-mesh-danger bg-mesh-danger/10 px-4 py-3 rounded-xl">
                <AlertCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
            
            <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Continue'}
            </button>
          </form>
        )}
        
        {step === 'pin' && (
          <div className="space-y-6">
            <div className="text-center">
              <p className="text-mesh-muted mb-2">Enter PIN to authorize</p>
              <p className="font-medium text-mesh-text">
                Sending ₹{parseFloat(amount).toLocaleString('en-IN')} to {selectedContact?.name}
              </p>
              <p className="text-sm text-mesh-muted">{selectedContact?.vpa}</p>
            </div>
            
            <form onSubmit={handlePinSubmit} className="space-y-4">
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
                type={showPin ? 'text' : 'password'}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                className="input text-center text-2xl font-mono tracking-widest"
                inputMode="numeric"
                maxLength={4}
                autoFocus
              />
              
              <button type="button" onClick={() => setShowPin(!showPin)} className="text-sm text-mesh-accent">
                {showPin ? 'Hide' : 'Show'} PIN
              </button>
              
              {error && (
                <div className="text-center text-sm text-mesh-danger">{error}</div>
              )}
            </form>
            
            <button onClick={() => setStep('input')} className="btn-ghost w-full">
              <X className="w-4 h-4" /> Cancel
            </button>
          </div>
        )}
        
        {step === 'confirm' && (
          <div className="space-y-6">
            <div className="text-center">
              <CheckCircle className="w-16 h-16 text-mesh-success mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-mesh-text mb-2">Confirm Payment</h2>
              <p className="text-mesh-muted">Tap to confirm sending</p>
            </div>
            
            <div className="card bg-mesh-border/50 p-4">
              <div className="flex justify-between mb-2">
                <span className="text-mesh-muted">To</span>
                <span className="font-medium">{selectedContact?.name}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-mesh-muted">VPA</span>
                <span className="font-mono text-sm text-mesh-muted">{selectedContact?.vpa}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-mesh-muted">Amount</span>
                <span className="font-bold text-xl text-mesh-text">₹{parseFloat(amount).toLocaleString('en-IN')}</span>
              </div>
              {note && (
                <div className="flex justify-between">
                  <span className="text-mesh-muted">Note</span>
                  <span className="font-medium">{note}</span>
                </div>
              )}
            </div>
            
            <button onClick={handleConfirm} className="btn-primary w-full py-3 text-lg" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm & Send'}
            </button>
            
            <button onClick={() => setStep('pin')} className="btn-ghost w-full">
              <X className="w-4 h-4" /> Go Back
            </button>
          </div>
        )}
        
        {step === 'success' && (
          <div className="text-center space-y-6">
            <div className="w-24 h-24 rounded-full bg-mesh-success/20 flex items-center justify-center mx-auto">
              <CheckCircle className="w-12 h-12 text-mesh-success" />
            </div>
            <h2 className="text-2xl font-bold text-mesh-text">Payment Sent!</h2>
            <p className="text-mesh-muted">
              ₹{parseFloat(amount).toLocaleString('en-IN')} sent to {selectedContact?.name}
            </p>
            <p className="text-sm text-mesh-muted">
              Will settle when a bridge comes online
            </p>
            
            <div className="card bg-mesh-border/50">
              <div className="flex items-center gap-3 text-sm">
                <Clock className="w-5 h-5 text-mesh-warning" />
                <span>Pending mesh sync...</span>
              </div>
            </div>
            
            <button onClick={resetForm} className="btn-primary w-full">
              Done
            </button>
            
            <Link to="/history" className="btn-secondary w-full">
              View History
            </Link>
          </div>
        )}
      </div>
    </div>
  )
}