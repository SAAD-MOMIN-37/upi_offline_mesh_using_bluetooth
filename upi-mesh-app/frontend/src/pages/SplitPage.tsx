import { useAuthStore } from '@hooks/useAuthStore'
import { GitBranch, UserPlus, UserMinus, Loader2, Calculator, Plus, Minus, CheckCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import type { Contact, VPA } from '@types'

export default function SplitPage() {
  const { primaryAccount, contacts, addTransaction } = useAuthStore()
  const [participants, setParticipants] = useState<Array<{contact: Contact; amount: string}>>([])
  const [totalAmount, setTotalAmount] = useState('')
  const [note, setNote] = useState('')
  const [step, setStep] = useState<'input' | 'confirm' | 'success'>('input')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [searchVpa, setSearchVpa] = useState('')
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null)
  
  const filteredContacts = contacts.filter(c => 
    !participants.some(p => p.contact.id === c.id) &&
    (c.name.toLowerCase().includes(searchVpa.toLowerCase()) ||
     c.vpa.toLowerCase().includes(searchVpa.toLowerCase()))
  )
  
  const participantAmount = participants.length > 0 && totalAmount
    ? (parseFloat(totalAmount) / (participants.length + 1)).toFixed(2)
    : '0.00'
  
  const myAmount = participants.length > 0 && totalAmount
    ? parseFloat(participantAmount)
    : 0
  
  const addParticipant = (contact: Contact) => {
    setParticipants(prev => [...prev, { contact, amount: participantAmount }])
    setSearchVpa('')
    setSelectedContact(null)
  }
  
  const removeParticipant = (index: number) => {
    setParticipants(prev => prev.filter((_, i) => i !== index))
  }
  
  const handleEqualSplit = () => {
    if (!totalAmount || participants.length === 0) return
    const perPerson = (parseFloat(totalAmount) / (participants.length + 1)).toFixed(2)
    setParticipants(prev => prev.map(p => ({ ...p, amount: perPerson })))
  }
  
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    
    if (!totalAmount || parseFloat(totalAmount) <= 0) {
      setError('Enter total amount')
      return
    }
    
    if (participants.length === 0) {
      setError('Add at least one participant')
      return
    }
    
    const totalParticipantAmount = participants.reduce((sum, p) => sum + parseFloat(p.amount), 0)
    if (Math.abs(totalParticipantAmount + myAmount - parseFloat(totalAmount)) > 0.01) {
      setError('Amounts don\'t add up to total')
      return
    }
    
    setStep('confirm')
  }
  
  const handleConfirm = async () => {
    if (!primaryAccount) return
    
    setLoading(true)
    setError('')
    
    try {
      // In a real app, create split request packets for each participant
      // For now, just add to history
      for (const { contact, amount } of participants) {
        addTransaction({
          id: crypto.randomUUID(),
          type: 'SPLIT',
          status: 'PENDING',
          amount,
          senderVpa: primaryAccount.vpa,
          receiverVpa: contact.vpa,
          counterpartyName: contact.name,
          counterpartyVpa: contact.vpa,
          note: `Split: ${note || 'Shared expense'}`,
          createdAt: Date.now()
        })
      }
      
      // Also add my share
      addTransaction({
        id: crypto.randomUUID(),
        type: 'SPLIT',
        status: 'PENDING',
        amount: myAmount.toFixed(2),
        senderVpa: primaryAccount.vpa,
        receiverVpa: primaryAccount.vpa,
        counterpartyName: 'Me',
        counterpartyVpa: primaryAccount.vpa,
        note: `My share: ${note || 'Shared expense'}`,
        createdAt: Date.now()
      })
      
      setStep('success')
    } catch (err) {
      setError('Failed to create split. Try again.')
    } finally {
      setLoading(false)
    }
  }
  
  const resetForm = () => {
    setParticipants([])
    setTotalAmount('')
    setNote('')
    setSearchVpa('')
    setStep('input')
    setError('')
  }
  
  if (!primaryAccount) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <UserPlus className="w-16 h-16 text-mesh-muted mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-mesh-text mb-2">No Account Linked</h2>
          <p className="text-mesh-muted mb-6">Add a bank account to split bills</p>
          <Link to="/settings" className="btn-primary">Add Account</Link>
        </div>
      </div>
    )
  }
  
  return (
    <div className="flex-1 max-w-md mx-auto py-8">
      <div className="card">
        <h1 className="text-2xl font-bold text-mesh-text mb-6">Split Bill</h1>
        
        {step === 'input' && (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="label">Total Amount (₹)</label>
              <input
                type="number"
                value={totalAmount}
                onChange={(e) => setTotalAmount(e.target.value)}
                placeholder="0.00"
                className="input text-2xl font-mono text-center"
                inputMode="decimal"
                step="0.01"
                min="1"
              />
            </div>
            
            <div>
              <label className="label">Participants</label>
              
              <div className="relative mb-4">
                <UserPlus className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-mesh-muted" />
                <input
                  type="text"
                  value={searchVpa}
                  onChange={(e) => setSearchVpa(e.target.value)}
                  placeholder="Add participant (name or VPA)"
                  className="input pl-10"
                  autoComplete="off"
                />
                {filteredContacts.length > 0 && (
                  <div className="absolute z-10 mt-1 bg-mesh-card border border-mesh-border rounded-xl overflow-hidden w-full max-h-60 overflow-y-auto">
                    {filteredContacts.map(contact => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => addParticipant(contact)}
                        className="w-full px-4 py-3 text-left hover:bg-mesh-border transition-colors flex items-center gap-3"
                      >
                        <div className="w-10 h-10 rounded-full bg-mesh-accent/20 flex items-center justify-center">
                          <UserPlus className="w-5 h-5 text-mesh-accent" />
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
              
              {participants.length > 0 && (
                <div className="space-y-2">
                  {participants.map((p, i) => (
                    <div key={i} className="flex items-center gap-3 p-3 bg-mesh-bg rounded-xl">
                      <div className="w-10 h-10 rounded-full bg-mesh-accent/20 flex items-center justify-center">
                        <UserPlus className="w-5 h-5 text-mesh-accent" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-mesh-text truncate">{p.contact.name}</p>
                        <p className="text-sm text-mesh-muted truncate">{p.contact.vpa}</p>
                      </div>
                      <input
                        type="number"
                        value={p.amount}
                        onChange={(e) => {
                          const newParticipants = [...participants]
                          newParticipants[i] = { ...p, amount: e.target.value }
                          setParticipants(newParticipants)
                        }}
                        className="input w-24 text-center font-mono"
                        step="0.01"
                        min="0.01"
                      />
                      <button
                        type="button"
                        onClick={() => removeParticipant(i)}
                        className="p-2 text-mesh-danger hover:bg-mesh-danger/10 rounded-lg"
                      >
                        <Minus className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                  
                  <div className="flex gap-2 mt-3">
                    <button type="button" onClick={handleEqualSplit} className="btn-secondary flex-1 text-sm">
                      <Calculator className="w-4 h-4" /> Equal Split
                    </button>
                  </div>
                </div>
              )}
              
              {participants.length === 0 && (
                <p className="text-sm text-mesh-muted text-center py-4">
                  Add participants to split the bill
                </p>
              )}
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
                <GitBranch className="w-4 h-4" />
                <span>{error}</span>
              </div>
            )}
            
            <button type="submit" className="btn-primary w-full py-3" disabled={loading || participants.length === 0}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Split Bill'}
            </button>
          </form>
        )}
        
        {step === 'confirm' && (
          <div className="space-y-6">
            <div className="text-center">
              <CheckCircle className="w-16 h-16 text-mesh-success mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-mesh-text mb-2">Confirm Split</h2>
            </div>
            
            <div className="card bg-mesh-border/50 p-4">
              <div className="flex justify-between mb-2">
                <span className="text-mesh-muted">Total</span>
                <span className="font-bold text-xl text-mesh-text">₹{parseFloat(totalAmount).toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-mesh-muted">Participants</span>
                <span className="font-medium">{participants.length + 1} people</span>
              </div>
              <div className="flex justify-between">
                <span className="text-mesh-muted">Your Share</span>
                <span className="font-bold text-mesh-success">₹{myAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
            
            <div className="space-y-2">
              {participants.map((p, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-mesh-bg rounded-xl">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-mesh-accent/20 flex items-center justify-center">
                      <UserPlus className="w-4 h-4 text-mesh-accent" />
                    </div>
                    <div>
                      <p className="font-medium text-sm text-mesh-text">{p.contact.name}</p>
                      <p className="text-xs text-mesh-muted">{p.contact.vpa}</p>
                    </div>
                  </div>
                  <span className="font-semibold text-mesh-text">₹{parseFloat(p.amount).toLocaleString('en-IN')}</span>
                </div>
              ))}
              
              <div className="flex items-center justify-between p-3 bg-mesh-success/10 rounded-xl border border-mesh-success/20">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-mesh-success/20 flex items-center justify-center">
                    <UserPlus className="w-4 h-4 text-mesh-success" />
                  </div>
                  <div>
                    <p className="font-medium text-sm text-mesh-text">You</p>
                    <p className="text-xs text-mesh-muted">Your share</p>
                  </div>
                </div>
                <span className="font-bold text-mesh-success text-lg">₹{myAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
            
            <button onClick={handleConfirm} className="btn-primary w-full py-3" disabled={loading}>
              {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirm & Send Requests'}
            </button>
            
            <button onClick={() => setStep('input')} className="btn-ghost w-full">
              Go Back
            </button>
          </div>
        )}
        
        {step === 'success' && (
          <div className="text-center space-y-6">
            <div className="w-24 h-24 rounded-full bg-mesh-success/20 flex items-center justify-center mx-auto">
              <CheckCircle className="w-12 h-12 text-mesh-success" />
            </div>
            <h2 className="text-2xl font-bold text-mesh-text">Split Requests Sent!</h2>
            <p className="text-mesh-muted">
              {participants.length} request{participants.length > 1 ? 's' : ''} sent for ₹{parseFloat(totalAmount).toLocaleString('en-IN')}
            </p>
            
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