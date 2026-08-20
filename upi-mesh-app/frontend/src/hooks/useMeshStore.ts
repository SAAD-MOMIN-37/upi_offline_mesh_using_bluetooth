import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { MeshDevice, MeshEvent, PendingPacket, NetworkStatus } from '@types'
import { useAuthStore } from '@hooks/useAuthStore'
import { cryptoService } from '@services/cryptoService'
import { storageService } from '@services/storageService'
import { bluetoothService } from '@services/bluetoothService'

interface MeshState {
  // Device state
  devices: Map<string, MeshDevice>
  currentDeviceId: string
  currentDeviceName: string
  
  // Packet queues
  outbox: PendingPacket[]
  inbox: PendingPacket[]
  ackQueue: PendingPacket[]
  
  // Network status
  networkStatus: NetworkStatus
  
  // Event stream
  eventSource: EventSource | null
  lastEventTimestamp: number
  
  // Actions
  initialize: () => Promise<void>
  shutdown: () => void
  
  // Device management
  addDevice: (device: MeshDevice) => void
  updateDevice: (id: string, updates: Partial<MeshDevice>) => void
  removeDevice: (id: string) => void
  killDevice: (id: string) => void
  
  // Packet management
  addToOutbox: (packet: PendingPacket) => void
  updateOutboxPacket: (id: string, updates: Partial<PendingPacket>) => void
  removeFromOutbox: (id: string) => void
  moveToInbox: (packet: PendingPacket) => void
  addToAckQueue: (packet: PendingPacket) => void
  
  // Network status
  setNetworkStatus: (status: Partial<NetworkStatus>) => void
  
  // Event handling
  handleMeshEvent: (event: MeshEvent) => void
  connectEventStream: () => void
  disconnectEventStream: () => void
  
  // Gossip
  startGossip: () => void
  stopGossip: () => void
  gossipInterval: ReturnType<typeof setInterval> | null
  
  // Bridge upload
  uploadPendingPackets: () => Promise<void>
  
  // Cleanup
  cleanupExpiredPackets: () => void
}

export const useMeshStore = create<MeshState>()(
  subscribeWithSelector((set, get) => ({
    // Initial state
    devices: new Map(),
    currentDeviceId: '',
    currentDeviceName: '',
    outbox: [],
    inbox: [],
    ackQueue: [],
    networkStatus: {
      isOnline: navigator.onLine,
      isBluetoothEnabled: false,
      isBluetoothSupported: 'bluetooth' in navigator,
      connectedDevices: 0,
      pendingPackets: 0
    },
    eventSource: null,
    lastEventTimestamp: 0,
    gossipInterval: null,
    
    // Initialize mesh
    initialize: async () => {
      const { currentDeviceId, currentDeviceName } = get()
      
      if (!currentDeviceId) {
        const deviceId = `device-${crypto.randomUUID().slice(0, 8)}`
        const deviceName = `My Device ${deviceId.slice(-4)}`
        set({ currentDeviceId: deviceId, currentDeviceName: deviceName })
      }
      
      // Initialize Bluetooth
      if ('bluetooth' in navigator) {
        try {
          await bluetoothService.initialize()
          set(state => ({
            networkStatus: { ...state.networkStatus, isBluetoothEnabled: true }
          }))
        } catch (error) {
          console.warn('Bluetooth initialization failed:', error)
        }
      }
      
      // Load pending packets from storage
      const [outbox, inbox, ackQueue] = await Promise.all([
        storageService.getOutbox(),
        storageService.getInbox(),
        storageService.getAckQueue()
      ])
      
      set({ outbox, inbox, ackQueue })
      
      // Connect to event stream
      get().connectEventStream()
      
      // Start gossip if auto-gossip enabled
      const { settings } = useAuthStore.getState()
      if (settings.autoGossip) {
        get().startGossip()
      }
      
      // Set up online/offline listeners
      window.addEventListener('online', () => {
        get().setNetworkStatus({ isOnline: true })
        get().uploadPendingPackets()
      })
      
      window.addEventListener('offline', () => {
        get().setNetworkStatus({ isOnline: false })
      })
      
      // Periodic cleanup
      setInterval(() => get().cleanupExpiredPackets(), 60000)
    },
    
    shutdown: () => {
      get().stopGossip()
      get().disconnectEventStream()
      bluetoothService.shutdown()
    },
    
    // Device management
    addDevice: (device) => set((state) => {
      const newDevices = new Map(state.devices)
      newDevices.set(device.id, device)
      return {
        devices: newDevices,
        networkStatus: {
          ...state.networkStatus,
          connectedDevices: newDevices.size
        }
      }
    }),
    
    updateDevice: (id, updates) => set((state) => {
      const newDevices = new Map(state.devices)
      const existing = newDevices.get(id)
      if (existing) {
        newDevices.set(id, { ...existing, ...updates })
      }
      return { devices: newDevices }
    }),
    
    removeDevice: (id) => set((state) => {
      const newDevices = new Map(state.devices)
      newDevices.delete(id)
      return {
        devices: newDevices,
        networkStatus: {
          ...state.networkStatus,
          connectedDevices: newDevices.size
        }
      }
    }),
    
    killDevice: (id) => set((state) => {
      const newDevices = new Map(state.devices)
      const existing = newDevices.get(id)
      if (existing) {
        newDevices.set(id, { ...existing, isKilled: true })
      }
      return { devices: newDevices }
    }),
    
    // Packet management
    addToOutbox: (packet) => set((state) => ({
      outbox: [...state.outbox, packet],
      networkStatus: {
        ...state.networkStatus,
        pendingPackets: state.outbox.length + 1
      }
    })),
    
    updateOutboxPacket: (id, updates) => set((state) => ({
      outbox: state.outbox.map(p => p.id === id ? { ...p, ...updates } : p)
    })),
    
    removeFromOutbox: (id) => set((state) => ({
      outbox: state.outbox.filter(p => p.id !== id),
      networkStatus: {
        ...state.networkStatus,
        pendingPackets: Math.max(0, state.outbox.length - 1)
      }
    })),
    
    moveToInbox: (packet) => set((state) => ({
      inbox: [...state.inbox, packet],
      outbox: state.outbox.filter(p => p.id !== packet.id)
    })),
    
    addToAckQueue: (packet) => set((state) => ({
      ackQueue: [...state.ackQueue, packet]
    })),
    
    // Network status
    setNetworkStatus: (status) => set((state) => ({
      networkStatus: { ...state.networkStatus, ...status }
    })),
    
    // Event handling
    handleMeshEvent: (event) => {
      const { lastEventTimestamp } = get()
      if (event.timestamp_ms <= lastEventTimestamp) return
      
      set({ lastEventTimestamp: event.timestamp_ms })
      
      // Handle different event types
      switch (event.event_type) {
        case 'gossip_hop':
          // Update device packet counts
          if (event.to_device) {
            get().updateDevice(event.to_device, { 
              packetCount: (get().devices.get(event.to_device)?.packetCount || 0) + 1,
              lastSeen: event.timestamp_ms
            })
          }
          break
          
        case 'bridge_upload':
          // Handle bridge upload results
          if (event.device_id && event.packet_id) {
            const packet = get().outbox.find(p => p.packetId === event.packet_id)
            if (packet) {
              if (event.result === 'settled') {
                get().updateOutboxPacket(packet.id, { status: 'settled' })
                // Move to history via auth store
                useAuthStore.getState().addTransaction({
                  id: crypto.randomUUID(),
                  type: 'SEND',
                  status: 'SETTLED',
                  amount: packet.instruction.amount,
                  senderVpa: packet.instruction.senderVpa,
                  receiverVpa: packet.instruction.receiverVpa,
                  counterpartyName: 'Unknown',
                  counterpartyVpa: packet.instruction.receiverVpa,
                  createdAt: packet.createdAt,
                  settledAt: event.timestamp_ms,
                  transactionId: 0, // Will be updated from backend
                  bridgeNodeId: event.device_id,
                  hopCount: 5 - (event.ttl || 0)
                })
              } else if (event.result === 'duplicate') {
                get().updateOutboxPacket(packet.id, { status: 'rejected' })
              }
            }
          }
          break
      }
    },
    
    connectEventStream: () => {
      const { eventSource, disconnectEventStream } = get()
      if (eventSource) disconnectEventStream()
      
      const es = new EventSource(`${import.meta.env.VITE_API_URL}/api/mesh/events/stream`)
      
      es.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data) as MeshEvent
          get().handleMeshEvent(event)
        } catch (error) {
          console.warn('Failed to parse mesh event:', error)
        }
      }
      
      es.onerror = () => {
        console.warn('Event stream error, will reconnect')
        setTimeout(() => get().connectEventStream(), 5000)
      }
      
      set({ eventSource: es })
    },
    
    disconnectEventStream: () => {
      const { eventSource } = get()
      if (eventSource) {
        eventSource.close()
        set({ eventSource: null })
      }
    },
    
    // Gossip
    startGossip: () => {
      const { gossipInterval } = get()
      if (gossipInterval) return
      
      const interval = setInterval(async () => {
        const { outbox, networkStatus } = get()
        if (outbox.length === 0 || !networkStatus.isBluetoothEnabled) return
        
        // Gossip packets to nearby devices
        for (const packet of outbox.filter(p => p.status === 'outbox' || p.status === 'gossiping')) {
          if (packet.ttl <= 0) continue
          
          try {
            await bluetoothService.gossipPacket(packet)
            get().updateOutboxPacket(packet.id, { 
              status: 'gossiping',
              lastGossipAt: Date.now()
            })
          } catch (error) {
            console.warn('Gossip failed:', error)
          }
        }
      }, useAuthStore.getState().settings.gossipInterval)
      
      set({ gossipInterval: interval })
    },
    
    stopGossip: () => {
      const { gossipInterval } = get()
      if (gossipInterval) {
        clearInterval(gossipInterval)
        set({ gossipInterval: null })
      }
    },
    
    // Bridge upload
    uploadPendingPackets: async () => {
      const { outbox, networkStatus } = get()
      if (!networkStatus.isOnline) return
      
      const bridgePackets = outbox.filter(p => 
        p.status === 'bridge_pending' || 
        (p.status === 'gossiping' && networkStatus.connectedDevices > 0)
      )
      
      for (const packet of bridgePackets) {
        try {
          get().updateOutboxPacket(packet.id, { status: 'bridge_pending' })
          
          const response = await fetch(`${import.meta.env.VITE_API_URL}/api/bridge/ingest`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Bridge-Node-Id': get().currentDeviceId,
              'X-Hop-Count': String(5 - packet.ttl)
            },
            body: JSON.stringify({
              packetId: packet.packetId,
              ttl: packet.ttl,
              createdAt: packet.createdAt,
              ciphertext: Array.from(packet.ciphertext)
            })
          })
          
          const result = await response.json()
          
          if (result.outcome === 'SETTLED') {
            get().updateOutboxPacket(packet.id, { status: 'settled' })
          } else if (result.outcome === 'DUPLICATE_DROPPED') {
            get().updateOutboxPacket(packet.id, { status: 'rejected' })
          }
        } catch (error) {
          console.warn('Bridge upload failed:', error)
        }
      }
    },
    
    // Cleanup
    cleanupExpiredPackets: () => {
      const now = Date.now()
      const MAX_AGE = 24 * 60 * 60 * 1000 // 24 hours
      
      set((state) => ({
        outbox: state.outbox.filter(p => now - p.createdAt < MAX_AGE),
        inbox: state.inbox.filter(p => now - p.createdAt < MAX_AGE),
        ackQueue: state.ackQueue.filter(p => now - p.createdAt < MAX_AGE)
      }))
    }
  }))
)