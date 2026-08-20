// IndexedDB Storage Service for UPI Mesh Pay

import { openDB, DBSchema, IDBPDatabase } from 'idb'
import type { PendingPacket, Contact, Transaction, AppSettings } from '@types'

interface MeshDBSchema extends DBSchema {
  outbox: {
    key: string
    value: PendingPacket
    indexes: { 'by-status': string; 'by-created': number }
  }
  inbox: {
    key: string
    value: PendingPacket
    indexes: { 'by-status': string; 'by-created': number }
  }
  ackQueue: {
    key: string
    value: PendingPacket
    indexes: { 'by-created': number }
  }
  contacts: {
    key: string
    value: Contact
    indexes: { 'by-vpa': string; 'by-favorite': boolean }
  }
  transactions: {
    key: string
    value: Transaction
    indexes: { 'by-status': string; 'by-created': number; 'by-counterparty': string }
  }
  settings: {
    key: string
    value: AppSettings
  }
  deviceInfo: {
    key: string
    value: { deviceId: string; deviceName: string; serverPublicKey: string; keyPair: CryptoKeyPair }
  }
}

const DB_NAME = 'upimesh-db'
const DB_VERSION = 1

class StorageService {
  private db: IDBPDatabase<MeshDBSchema> | null = null
  
  async initialize(): Promise<void> {
    this.db = await openDB<MeshDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Outbox store
        const outboxStore = db.createObjectStore('outbox', { keyPath: 'id' })
        outboxStore.createIndex('by-status', 'status')
        outboxStore.createIndex('by-created', 'createdAt')
        
        // Inbox store
        const inboxStore = db.createObjectStore('inbox', { keyPath: 'id' })
        inboxStore.createIndex('by-status', 'status')
        inboxStore.createIndex('by-created', 'createdAt')
        
        // Ack queue store
        const ackStore = db.createObjectStore('ackQueue', { keyPath: 'id' })
        ackStore.createIndex('by-created', 'createdAt')
        
        // Contacts store
        const contactsStore = db.createObjectStore('contacts', { keyPath: 'id' })
        contactsStore.createIndex('by-vpa', 'vpa', { unique: true })
        contactsStore.createIndex('by-favorite', 'isFavorite')
        
        // Transactions store
        const txStore = db.createObjectStore('transactions', { keyPath: 'id' })
        txStore.createIndex('by-status', 'status')
        txStore.createIndex('by-created', 'createdAt')
        txStore.createIndex('by-counterparty', 'counterpartyVpa')
        
        // Settings store
        db.createObjectStore('settings', { keyPath: 'id' })
        
        // Device info store
        db.createObjectStore('deviceInfo', { keyPath: 'id' })
      }
    })
  }
  
  private ensureDb(): IDBPDatabase<MeshDBSchema> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.')
    }
    return this.db
  }
  
  // Outbox operations
  async getOutbox(): Promise<PendingPacket[]> {
    return this.ensureDb().getAll('outbox')
  }
  
  async addToOutbox(packet: PendingPacket): Promise<void> {
    await this.ensureDb().put('outbox', packet)
  }
  
  async updateOutboxPacket(id: string, updates: Partial<PendingPacket>): Promise<void> {
    const db = this.ensureDb()
    const existing = await db.get('outbox', id)
    if (existing) {
      await db.put('outbox', { ...existing, ...updates })
    }
  }
  
  async removeFromOutbox(id: string): Promise<void> {
    await this.ensureDb().delete('outbox', id)
  }
  
  async clearOutbox(): Promise<void> {
    await this.ensureDb().clear('outbox')
  }
  
  // Inbox operations
  async getInbox(): Promise<PendingPacket[]> {
    return this.ensureDb().getAll('inbox')
  }
  
  async addToInbox(packet: PendingPacket): Promise<void> {
    await this.ensureDb().put('inbox', packet)
  }
  
  async updateInboxPacket(id: string, updates: Partial<PendingPacket>): Promise<void> {
    const db = this.ensureDb()
    const existing = await db.get('inbox', id)
    if (existing) {
      await db.put('inbox', { ...existing, ...updates })
    }
  }
  
  // Ack queue operations
  async getAckQueue(): Promise<PendingPacket[]> {
    return this.ensureDb().getAll('ackQueue')
  }
  
  async addToAckQueue(packet: PendingPacket): Promise<void> {
    await this.ensureDb().put('ackQueue', packet)
  }
  
  async removeFromAckQueue(id: string): Promise<void> {
    await this.ensureDb().delete('ackQueue', id)
  }
  
  // Contacts operations
  async getContacts(): Promise<Contact[]> {
    return this.ensureDb().getAll('contacts')
  }
  
  async getContactByVpa(vpa: string): Promise<Contact | undefined> {
    return this.ensureDb().getFromIndex('contacts', 'by-vpa', vpa)
  }
  
  async addContact(contact: Contact): Promise<void> {
    await this.ensureDb().put('contacts', contact)
  }
  
  async updateContact(id: string, updates: Partial<Contact>): Promise<void> {
    const db = this.ensureDb()
    const existing = await db.get('contacts', id)
    if (existing) {
      await db.put('contacts', { ...existing, ...updates })
    }
  }
  
  async removeContact(id: string): Promise<void> {
    await this.ensureDb().delete('contacts', id)
  }
  
  async getFavoriteContacts(): Promise<Contact[]> {
    return this.ensureDb().getAllFromIndex('contacts', 'by-favorite', true)
  }
  
  // Transactions operations
  async getTransactions(): Promise<Transaction[]> {
    return this.ensureDb().getAll('transactions')
  }
  
  async getTransactionById(id: string): Promise<Transaction | undefined> {
    return this.ensureDb().get('transactions', id)
  }
  
  async getTransactionsByStatus(status: Transaction['status']): Promise<Transaction[]> {
    return this.ensureDb().getAllFromIndex('transactions', 'by-status', status)
  }
  
  async addTransaction(tx: Transaction): Promise<void> {
    await this.ensureDb().put('transactions', tx)
  }
  
  async updateTransaction(id: string, updates: Partial<Transaction>): Promise<void> {
    const db = this.ensureDb()
    const existing = await db.get('transactions', id)
    if (existing) {
      await db.put('transactions', { ...existing, ...updates })
    }
  }
  
  async getRecentTransactions(limit: number = 50): Promise<Transaction[]> {
    const all = await this.ensureDb().getAll('transactions')
    return all
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit)
  }
  
  // Settings operations
  async getSettings(): Promise<AppSettings | undefined> {
    return this.ensureDb().get('settings', 'app-settings')
  }
  
  async saveSettings(settings: AppSettings): Promise<void> {
    await this.ensureDb().put('settings', { ...settings, id: 'app-settings' })
  }
  
  // Device info operations
  async getDeviceInfo(): Promise<{ deviceId: string; deviceName: string; serverPublicKey: string } | undefined> {
    return this.ensureDb().get('deviceInfo', 'current-device')
  }
  
  async saveDeviceInfo(info: { deviceId: string; deviceName: string; serverPublicKey: string }): Promise<void> {
    await this.ensureDb().put('deviceInfo', { ...info, id: 'current-device' })
  }
  
  // Cleanup
  async cleanupOldData(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
    const cutoff = Date.now() - maxAge
    const db = this.ensureDb()
    
    // Clean outbox
    const outboxTx = db.transaction('outbox', 'readwrite')
    const outboxIndex = outboxTx.store.index('by-created')
    let cursor = await outboxIndex.openCursor(IDBKeyRange.upperBound(cutoff))
    while (cursor) {
      await cursor.delete()
      cursor = await cursor.continue()
    }
    await outboxTx.done
    
    // Clean inbox
    const inboxTx = db.transaction('inbox', 'readwrite')
    const inboxIndex = inboxTx.store.index('by-created')
    cursor = await inboxIndex.openCursor(IDBKeyRange.upperBound(cutoff))
    while (cursor) {
      await cursor.delete()
      cursor = await cursor.continue()
    }
    await inboxTx.done
    
    // Clean ack queue
    const ackTx = db.transaction('ackQueue', 'readwrite')
    const ackIndex = ackTx.store.index('by-created')
    cursor = await ackIndex.openCursor(IDBKeyRange.upperBound(cutoff))
    while (cursor) {
      await cursor.delete()
      cursor = await cursor.continue()
    }
    await ackTx.done
  }
  
  // Close database
  async close(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}

export const storageService = new StorageService()