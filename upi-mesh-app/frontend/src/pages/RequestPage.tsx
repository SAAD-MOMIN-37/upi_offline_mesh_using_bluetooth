import { useAuthStore } from '@hooks/useAuthStore'
import { HelpCircle, User, Search, Loader2, CheckCircle, Clock, Share2, Copy } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Contact, VPA } from '@types'

export default function RequestPage() {
  const { primaryAccount, contacts, addTransaction } = useAuthStore()
  const [recipientVpa, setRecipientVpa] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [step, setStep] = useState<'input' | 'success'>('input')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  const [requestLink, setRequestLink] = useState('')
  
  const filteredContacts = contacts.filter(c => 
    c.name.toLowerCase().includes(recipientVpa.toLowerCase()) ||
    c.vpa.toLowerCase().includes(recipientVpa.toLowerCase())
  )
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!recipientVpa.includes('@')) {
      setError('Enter a valid VPA (e.g., user@bank)')
      return
    }
    
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) {
      setError('Enter a valid amount')
      return
    }
    
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
    setStep('success')
  }
  
  const handleGenerateLink = () => {
    if (!selectedContact || !primaryAccount) return
    
    const link = `upimesh://request?amount=${amount}&vpa=${primaryAccount.vpa}&note=${encodeURIComponent(note)}`
    setRequestLink(link)
  }
  
  const copyLink = async () => {
    if (requestLink) {
      await navigator.clipboard.writeText(requestLink)
    }
  }
  
  const resetForm = () => {
    setRecipientVpa('')
    setAmount('')
    setNote('')
    setSelectedContact(null)
    setRequestLink('')
    setStep('input')
    setError('')
  }
  
  if (!primaryAccount) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <User className="w-16 h-16 text-mesh-muted mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-mesh-text mb-2">No Account Linked</h2>
          <p className="text-mesh-muted mb-6">Add a bank account to request money</p>
          <Link to="/settings" className="btn-primary">Add Account</Link>
        </div>
      </div>
    )
  }
  
  return (
    <div className="flex-1 max-w-md mx-auto py-8">
      <div className="card">
        <h1 className="text-2xl font-bold text-mesh-text mb-6">Request Money</h1>
        
        {step === 'input' && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="label">From (VPA)</label>
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
                      <div className="w-10 h-10 rounded-full bg-mesh-info/20 flex items-center justify-center">
                        <User className="w-5 h-5 text-mesh-info" />
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
              />
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
                <HelpCircle className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
            
            <button type="submit" className="btn-primary w-full py-3" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Create Request'}
            </button>
          </form>
        )}
        
        {step === 'success' && (
          <div className="space-y-6">
            <div className="text-center">
              <CheckCircle className="w-16 h-16 text-mesh-success mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-mesh-text mb-2">Request Created!</h2>
              <p className="text-mesh-muted">
                Asking {selectedContact?.name} for ₹{parseFloat(amount).toLocaleString('en-IN')}
              </p>
            </div>
            
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-mesh-text">Share Request</h3>
              </div>
              
              {requestLink ? (
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={requestLink}
                      readOnly
                      className="input flex-1 font-mono text-xs"
                    />
                    <button onClick={copyLink} className="btn-secondary">
                      <Copy className="w-5 h-5" />
                    </button>
                  </div>
                  <div className="flex gap-3">
                    <button className="btn-primary flex-1" onClick={() => {
                      navigator.share({
                        title: 'UPI Payment Request',
                        text: `${selectedContact?.name} requested ₹${amount}`,
                        url: requestLink
                      }).catch(() => {})
                    }}>
                      <Share2 className="w-5 h-5" /> Share
                    </button>
                    <button className="btn-secondary flex-1" onClick={() => {}}>
                      <Clock className="w-5 h-5" /> Remind Later
                    </button>
                  </div>
                </div>
              ) : (
                <button onClick={handleGenerateLink} className="btn-primary w-full">
                  <Share2 className="w-5 h-5" /> Generate Share Link
                </button>
              )}
            </div>
            
            <button onClick={resetForm} className="btn-secondary w-full">
              Create Another Request
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