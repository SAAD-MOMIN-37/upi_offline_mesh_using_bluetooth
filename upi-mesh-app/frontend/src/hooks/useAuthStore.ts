import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Account, AppSettings, Contact, Transaction } from '@types'

interface AuthState {
  // Authentication
  isAuthenticated: boolean
  isOnboarded: boolean
  pinHash?: string
  biometricEnabled: boolean
  
  // User data
  primaryAccount?: Account
  accounts: Account[]
  contacts: Contact[]
  transactions: Transaction[]
  settings: AppSettings
  
  // Actions
  setAuthenticated: (authenticated: boolean) => void
  setOnboarded: (onboarded: boolean) => void
  setPinHash: (hash: string) => void
  verifyPin: (pin: string) => Promise<boolean>
  enableBiometric: () => Promise<void>
  disableBiometric: () => void
  
  // Account management
  setPrimaryAccount: (account: Account) => void
  addAccount: (account: Account) => void
  updateAccountBalance: (vpa: string, balance: string) => void
  
  // Contacts
  addContact: (contact: Contact) => void
  updateContact: (id: string, updates: Partial<Contact>) => void
  removeContact: (id: string) => void
  
  // Transactions
  addTransaction: (tx: Transaction) => void
  updateTransaction: (id: string, updates: Partial<Transaction>) => void
  
  // Settings
  updateSettings: (settings: Partial<AppSettings>) => void
  resetSettings: () => void
  
  // Data persistence
  hydrate: () => void
}

import { DEFAULT_SETTINGS } from '@types'
import { createVPA } from '@types'

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      // Initial state
      isAuthenticated: false,
      isOnboarded: false,
      pinHash: undefined,
      biometricEnabled: false,
      primaryAccount: undefined,
      accounts: [],
      contacts: [],
      transactions: [],
      settings: DEFAULT_SETTINGS,
      
      // Authentication actions
      setAuthenticated: (authenticated) => set({ isAuthenticated: authenticated }),
      
      setOnboarded: (onboarded) => set({ isOnboarded: onboarded }),
      
      setPinHash: (hash) => set({ pinHash: hash }),
      
      verifyPin: async (pin: string) => {
        const { pinHash } = get()
        if (!pinHash) return false
        
        // In production, use Web Crypto API for proper hashing
        const encoder = new TextEncoder()
        const data = encoder.encode(pin)
        const hashBuffer = await crypto.subtle.digest('SHA-256', data)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
        
        return hashHex === pinHash
      },
      
      enableBiometric: async () => {
        // Check if WebAuthn is available
        if (!window.PublicKeyCredential) return
        
        try {
          const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
          if (available) {
            set({ biometricEnabled: true })
          }
        } catch {
          // Biometric not available
        }
      },
      
      disableBiometric: () => set({ biometricEnabled: false }),
      
      // Account management
      setPrimaryAccount: (account) => set({ primaryAccount: account }),
      
      addAccount: (account) => set((state) => ({
        accounts: [...state.accounts, account]
      })),
      
      updateAccountBalance: (vpa, balance) => set((state) => ({
        accounts: state.accounts.map(acc => 
          acc.vpa === vpa ? { ...acc, balance } : acc
        ),
        primaryAccount: state.primaryAccount?.vpa === vpa 
          ? { ...state.primaryAccount, balance } 
          : state.primaryAccount
      })),
      
      // Contacts
      addContact: (contact) => set((state) => ({
        contacts: [...state.contacts, contact]
      })),
      
      updateContact: (id, updates) => set((state) => ({
        contacts: state.contacts.map(c => 
          c.id === id ? { ...c, ...updates } : c
        )
      })),
      
      removeContact: (id) => set((state) => ({
        contacts: state.contacts.filter(c => c.id !== id)
      })),
      
      // Transactions
      addTransaction: (tx) => set((state) => ({
        transactions: [tx, ...state.transactions].slice(0, 100)
      })),
      
      updateTransaction: (id, updates) => set((state) => ({
        transactions: state.transactions.map(tx => 
          tx.id === id ? { ...tx, ...updates } : tx
        )
      })),
      
      // Settings
      updateSettings: (settings) => set((state) => ({
        settings: { ...state.settings, ...settings }
      })),
      
      resetSettings: () => set({ settings: DEFAULT_SETTINGS }),
      
      // Hydration
      hydrate: () => {
        // Called on app start to ensure data is loaded
      }
    }),
    {
      name: 'upimesh-auth',
      partialize: (state) => ({
        isOnboarded: state.isOnboarded,
        pinHash: state.pinHash,
        biometricEnabled: state.biometricEnabled,
        primaryAccount: state.primaryAccount,
        accounts: state.accounts,
        contacts: state.contacts,
        transactions: state.transactions,
        settings: state.settings
      }),
      version: 1,
      migrate: (persistedState: unknown, version: number) => {
        if (version === 0) {
          // Migration from v0
          return { ...persistedState as Record<string, unknown>, settings: DEFAULT_SETTINGS }
        }
        return persistedState as AuthState
      }
    }
  )
)