import { useAuthStore } from '@hooks/useAuthStore'
import { useMeshStore } from '@hooks/useMeshStore'
import { Send, HelpCircle, GitBranch, RefreshCw, Shield, Clock, Wifi, WifiOff } from 'lucide-react'
import { Link } from 'react-router-dom'

export default function WalletPage() {
  const { primaryAccount, accounts, transactions, isAuthenticated } = useAuthStore()
  const { networkStatus, outbox, uploadPendingPackets } = useMeshStore()
  
  const pendingCount = outbox.filter(p => p.status !== 'settled' && p.status !== 'rejected').length
  const recentTransactions = transactions.slice(0, 5)
  
  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Shield className="w-16 h-16 text-mesh-muted mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-mesh-text mb-2">Enter PIN to continue</h2>
          <p className="text-mesh-muted">Your wallet is locked for security</p>
        </div>
      </div>
    )
  }
  
  if (!primaryAccount) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <WifiOff className="w-16 h-16 text-mesh-muted mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-mesh-text mb-2">No Account Linked</h2>
          <p className="text-mesh-muted mb-6">Add a bank account to get started</p>
          <Link to="/settings" className="btn-primary">
            Add Account
          </Link>
        </div>
      </div>
    )
  }
  
  return (
    <div className="space-y-6 max-w-md mx-auto">
      {/* Balance Card */}
      <div className="card relative overflow-hidden">
        <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-bl from-mesh-accent/20 to-transparent rounded-full blur-2xl" />
        <div className="relative">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-mesh-muted text-sm font-medium">Available Balance</p>
              <h1 className="text-4xl font-bold text-mesh-text mt-1">
                ₹{parseFloat(primaryAccount.balance).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </h1>
            </div>
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${networkStatus.isOnline ? 'bg-mesh-success/20' : 'bg-mesh-warning/20'}`}>
              {networkStatus.isOnline ? (
                <Wifi className="w-5 h-5 text-mesh-success" />
              ) : (
                <WifiOff className="w-5 h-5 text-mesh-warning" />
              )}
            </div>
          </div>
          
          <div className="flex gap-3">
            <Link to="/send" className="btn-primary flex-1">
              <Send className="w-5 h-5" />
              Send Money
            </Link>
            <Link to="/request" className="btn-secondary flex-1">
              <HelpCircle className="w-5 h-5" />
              Request
            </Link>
            <Link to="/split" className="btn-secondary flex-1">
              <GitBranch className="w-5 h-5" />
              Split
            </Link>
          </div>
        </div>
      </div>
      
      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <Link to="/send" className="card-hover text-center py-6">
          <div className="w-14 h-14 rounded-2xl bg-mesh-accent/20 flex items-center justify-center mx-auto mb-3">
            <Send className="w-7 h-7 text-mesh-accent" />
          </div>
          <h3 className="font-semibold text-mesh-text">Send Money</h3>
          <p className="text-mesh-muted text-sm mt-1">Pay anyone offline</p>
        </Link>
        
        <Link to="/request" className="card-hover text-center py-6">
          <div className="w-14 h-14 rounded-2xl bg-mesh-info/20 flex items-center justify-center mx-auto mb-3">
            <HelpCircle className="w-7 h-7 text-mesh-info" />
          </div>
          <h3 className="font-semibold text-mesh-text">Request Money</h3>
          <p className="text-mesh-muted text-sm mt-1">Get paid via mesh</p>
        </Link>
        
        <Link to="/split" className="card-hover text-center py-6">
          <div className="w-14 h-14 rounded-2xl bg-mesh-warning/20 flex items-center justify-center mx-auto mb-3">
            <GitBranch className="w-7 h-7 text-mesh-warning" />
          </div>
          <h3 className="font-semibold text-mesh-text">Split Bill</h3>
          <p className="text-mesh-muted text-sm mt-1">Share expenses</p>
        </Link>
        
        <Link to="/mesh" className="card-hover text-center py-6">
          <div className="w-14 h-14 rounded-2xl bg-mesh-success/20 flex items-center justify-center mx-auto mb-3">
            <Wifi className="w-7 h-7 text-mesh-success" />
          </div>
          <h3 className="font-semibold text-mesh-text">Mesh Network</h3>
          <p className="text-mesh-muted text-sm mt-1">View connections</p>
        </Link>
      </div>
      
      {/* Pending Sync */}
      {pendingCount > 0 && (
        <div className="card bg-mesh-warning/10 border-mesh-warning/50">
          <div className="flex items-center gap-3">
            <Clock className="w-6 h-6 text-mesh-warning" />
            <div className="flex-1">
              <p className="font-medium text-mesh-text">{pendingCount} payment{pendingCount > 1 ? 's' : ''} pending sync</p>
              <p className="text-sm text-mesh-muted">Will settle when a bridge comes online</p>
            </div>
            <button 
              onClick={uploadPendingPackets}
              className="btn-secondary text-sm"
              disabled={!networkStatus.isOnline}
            >
              <RefreshCw className="w-4 h-4" />
              Sync Now
            </button>
          </div>
        </div>
      )}
      
      {/* Recent Transactions */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-mesh-text">Recent Activity</h2>
          <Link to="/history" className="text-sm text-mesh-accent font-medium">View all</Link>
        </div>
        
        {recentTransactions.length === 0 ? (
          <div className="card text-center py-8">
            <Clock className="w-12 h-12 text-mesh-muted mx-auto mb-3" />
            <h3 className="font-medium text-mesh-text mb-1">No transactions yet</h3>
            <p className="text-mesh-muted text-sm">Your payment history will appear here</p>
          </div>
        ) : (
          <div className="space-y-3">
            {recentTransactions.map((tx) => (
              <Link key={tx.id} to={`/history/${tx.id}`} className="card-hover flex items-center gap-4 p-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                  tx.type === 'SEND' ? 'bg-mesh-danger/20' : 
                  tx.type === 'RECEIVE' ? 'bg-mesh-success/20' : 'bg-mesh-accent/20'
                }`}>
                  {tx.type === 'SEND' && <Send className="w-5 h-5 text-mesh-danger" />}
                  {tx.type === 'RECEIVE' && <Wifi className="w-5 h-5 text-mesh-success" />}
                  {tx.type === 'REQUEST' && <HelpCircle className="w-5 h-5 text-mesh-info" />}
                  {tx.type === 'SPLIT' && <GitBranch className="w-5 h-5 text-mesh-warning" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-mesh-text truncate">
                    {tx.counterpartyName} • {tx.counterpartyVpa}
                  </p>
                  <p className="text-sm text-mesh-muted truncate">
                    {new Date(tx.createdAt).toLocaleDateString()} • {tx.status}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${tx.type === 'SEND' ? 'text-mesh-danger' : 'text-mesh-success'}`}>
                    {tx.type === 'SEND' ? '-' : '+'}₹{parseFloat(tx.amount).toLocaleString('en-IN')}
                  </p>
                  <span className={`badge ${tx.status === 'SETTLED' ? 'badge-success' : 
                    tx.status === 'PENDING' ? 'badge-warning' : 'badge-danger'}`}>
                    {tx.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}