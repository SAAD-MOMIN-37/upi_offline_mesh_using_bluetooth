// Core domain types for UPI Mesh Pay

export type VPA = string & { readonly __brand: unique symbol }

export function createVPA(vpa: string): VPA {
  if (!vpa.includes('@')) {
    throw new Error('Invalid VPA format')
  }
  return vpa as VPA
}

export interface Contact {
  id: string
  name: string
  vpa: VPA
  avatar?: string
  isFavorite: boolean
  lastInteraction?: number
}

export interface Account {
  vpa: VPA
  holderName: string
  balance: string // Decimal as string
  bankName: string
  ifsc: string
  isPrimary: boolean
}

export type TransactionStatus = 'PENDING' | 'SETTLED' | 'REJECTED' | 'EXPIRED' | 'DUPLICATE'

export type TransactionType = 'SEND' | 'REQUEST' | 'SPLIT' | 'RECEIVE'

export interface Transaction {
  id: string
  type: TransactionType
  status: TransactionStatus
  amount: string
  senderVpa: VPA
  receiverVpa: VPA
  counterpartyName: string
  counterpartyVpa: VPA
  note?: string
  createdAt: number
  settledAt?: number
  expiresAt?: number
  meshJourney?: MeshJourneyStep[]
  transactionId?: number // Backend transaction ID
  bridgeNodeId?: string
  hopCount?: number
}

export interface MeshJourneyStep {
  event: 'injected' | 'gossip_hop' | 'bridge_upload' | 'ack_generated' | 'ack_hop' | 'ack_received'
  deviceId: string
  deviceName?: string
  timestampMs: number
  ttl?: number
  result?: 'settled' | 'duplicate' | 'rejected_stale' | 'rejected_decrypt_fail' | 'rejected_insufficient_balance' | 'rejected_future_dated' | 'internal_error'
  isWinner?: boolean
}

export interface PendingPacket {
  id: string
  packetId: string
  ciphertext: Uint8Array
  ttl: number
  createdAt: number
  instruction: PaymentInstruction
  ackKey: Uint8Array
  status: 'outbox' | 'gossiping' | 'bridge_pending' | 'settled' | 'rejected' | 'expired'
  retryCount: number
  lastGossipAt?: number
}

export interface PaymentInstruction {
  senderVpa: VPA
  receiverVpa: VPA
  amount: string
  pinHash: string
  nonce: string
  signedAt: number
  ackKey: Uint8Array
  originalPacketId: string
}

export interface AckPayload {
  transactionId: number
  status: 'SETTLED' | 'REJECTED'
  amount: string
  timestamp: number
  originalPacketId: string
  bridgeNodeId: string
}

export interface MeshDevice {
  id: string
  name: string
  hasInternet: boolean
  isCurrentDevice: boolean
  packetCount: number
  lastSeen: number
  rssi?: number
  isKilled?: boolean
}

export interface MeshEvent {
  event_type: 'gossip_hop' | 'bridge_upload'
  packet_id: string
  from_device?: string
  to_device?: string
  device_id?: string
  ttl?: number
  result?: 'settled' | 'duplicate' | 'rejected_stale' | 'rejected_decrypt_fail' | 'rejected_insufficient_balance' | 'rejected_future_dated' | 'internal_error'
  timestamp_ms: number
}

export interface NetworkStatus {
  isOnline: boolean
  isBluetoothEnabled: boolean
  isBluetoothSupported: boolean
  connectedDevices: number
  pendingPackets: number
  lastSyncAt?: number
}

export interface AppSettings {
  pinEnabled: boolean
  biometricEnabled: boolean
  autoGossip: boolean
  gossipInterval: number // ms
  maxTtl: number
  dataSaverMode: boolean
  notificationsEnabled: boolean
  theme: 'light' | 'dark' | 'system'
  language: 'en' | 'hi'
}

export const DEFAULT_SETTINGS: AppSettings = {
  pinEnabled: true,
  biometricEnabled: false,
  autoGossip: true,
  gossipInterval: 5000,
  maxTtl: 5,
  dataSaverMode: false,
  notificationsEnabled: true,
  theme: 'system',
  language: 'en'
}