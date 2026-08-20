import { useAuthStore } from '@hooks/useAuthStore'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { 
  Send, HelpCircle, GitBranch, Filter, Calendar, 
  Search, Loader2, ChevronDown, ChevronUp, Eye, EyeOff
} from 'lucide-react'
import type { Transaction, TransactionStatus, TransactionType } from '@types'

const STATUS_COLORS: Record<TransactionStatus, string> = {
  SETTLED: 'badge-success',
  PENDING: 'badge-warning',
  REJECTED: 'badge-danger',
  EXPIRED: 'badge-neutral',
  DUPLICATE: 'badge-neutral'
}

const TYPE_ICONS: Record<TransactionType, React.ReactNode> = {
  SEND: <Send className="w-5 h-5 text-mesh-danger" />,
  REQUEST: <HelpCircle className="w-5 h-5 text-mesh-info" />,
  SPLIT: <GitBranch className="w-5 h-5 text-mesh-warning" />,
  RECEIVE: <Send className="w-5 h-5 text-mesh-success" />
}

export default function HistoryPage() {
  const { transactions } = useAuthStore()
  const [filterStatus, setFilterStatus] = useState<TransactionStatus | 'ALL'>('ALL')
  const [filterType, setFilterType] = useState<TransactionType | 'ALL'>('ALL')
  const [searchQuery, setSearchQuery] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [sortDesc, setSortDesc] = useState(true)
  
  const filteredTransactions = transactions
    .filter(tx => {
      if (filterStatus !== 'ALL' && tx.status !== filterStatus) return false
      if (filterType !== 'ALL' && tx.type !== filterType) return false
      if (searchQuery) {
        const query = searchQuery.toLowerCase()
        return (
          tx.counterpartyName.toLowerCase().includes(query) ||
          tx.counterpartyVpa.toLowerCase().includes(query) ||
          tx.amount.includes(query) ||
          (tx.note?.toLowerCase().includes(query) ?? false)
        )
      }
      return true
    })
    .sort((a, b) => sortDesc ? b.createdAt - a.createdAt : a.createdAt - b.createdAt)
  
  const statusCounts = transactions.reduce((acc, tx) => {
    acc[tx.status] = (acc[tx.status] || 0) + 1
    return acc
  }, {} as Record<TransactionStatus, number>)
  
  return (
    <div className="flex-1 max-w-2xl mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-mesh-text">History</h1>
          <p className="text-mesh-muted">{transactions.length} transactions</p>
        </div>
        <button onClick={() => setShowFilters(!showFilters)} className="btn-secondary">
          <Filter className="w-5 h-5" /> Filters
        </button>
      </div>
      
      {/* Filters */}
      {showFilters && (
        <div className="card mb-6 animate-in">
          <div className="space-y-4">
            <div>
              <label className="label">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-mesh-muted" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by name, VPA, amount..."
                  className="input pl-10"
                />
              </div>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Status</label>
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as TransactionStatus | 'ALL')}
                  className="input"
                >
                  <option value="ALL">All Statuses</option>
                  <option value="SETTLED">Settled ({statusCounts.SETTLED || 0})</option>
                  <option value="PENDING">Pending ({statusCounts.PENDING || 0})</option>
                  <option value="REJECTED">Rejected ({statusCounts.REJECTED || 0})</option>
                  <option value="EXPIRED">Expired ({statusCounts.EXPIRED || 0})</option>
                  <option value="DUPLICATE">Duplicate ({statusCounts.DUPLICATE || 0})</option>
                </select>
              </div>
              
              <div>
                <label className="label">Type</label>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as TransactionType | 'ALL')}
                  className="input"
                >
                  <option value="ALL">All Types</option>
                  <option value="SEND">Sent</option>
                  <option value="RECEIVE">Received</option>
                  <option value="REQUEST">Requested</option>
                  <option value="SPLIT">Split</option>
                </select>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <label className="label mb-0">Sort</label>
              <button
                onClick={() => setSortDesc(!sortDesc)}
                className="btn-secondary text-sm"
              >
                {sortDesc ? (
                  <>
                    <ChevronDown className="w-4 h-4" /> Newest First
                  </>
                ) : (
                  <>
                    <ChevronUp className="w-4 h-4" /> Oldest First
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Transaction List */}
      {filteredTransactions.length === 0 ? (
        <div className="card text-center py-12">
          <Search className="w-16 h-16 text-mesh-muted mx-auto mb-4" />
          <h3 className="font-semibold text-mesh-text mb-2">
            {transactions.length === 0 ? 'No transactions yet' : 'No matching transactions'}
          </h3>
          <p className="text-mesh-muted text-sm">
            {transactions.length === 0 
              ? 'Your payment history will appear here' 
              : 'Try adjusting your filters'}
          </p>
          {transactions.length === 0 && (
            <div className="flex gap-3 justify-center mt-4">
              <Link to="/send" className="btn-primary">
                <Send className="w-4 h-4" /> Send Money
              </Link>
              <Link to="/request" className="btn-secondary">
                <HelpCircle className="w-4 h-4" /> Request
              </Link>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTransactions.map((tx) => (
            <Link key={tx.id} to={`/history/${tx.id}`} className="card-hover flex items-center gap-4 p-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
                tx.type === 'SEND' ? 'bg-mesh-danger/20' : 
                tx.type === 'RECEIVE' ? 'bg-mesh-success/20' : 
                tx.type === 'REQUEST' ? 'bg-mesh-info/20' : 'bg-mesh-warning/20'
              }`}>
                {TYPE_ICONS[tx.type]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-mesh-text truncate">
                    {tx.counterpartyName}
                  </h3>
                  <span className={`badge ${STATUS_COLORS[tx.status]}`}>
                    {tx.status}
                  </span>
                </div>
                <p className="text-sm text-mesh-muted truncate">
                  {tx.counterpartyVpa} • {new Date(tx.createdAt).toLocaleDateString()}
                </p>
                {tx.note && (
                  <p className="text-xs text-mesh-muted truncate mt-1">{tx.note}</p>
                )}
              </div>
              <div className="text-right">
                <p className={`font-semibold ${tx.type === 'SEND' ? 'text-mesh-danger' : 'text-mesh-success'}`}>
                  {tx.type === 'SEND' ? '-' : '+'}₹{parseFloat(tx.amount).toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-mesh-muted mt-1">
                  {tx.settledAt 
                    ? `Settled ${new Date(tx.settledAt).toLocaleTimeString()}`
                    : tx.status === 'PENDING' 
                    ? 'Awaiting mesh sync' 
                    : 'Failed'}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}