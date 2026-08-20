// Web Bluetooth Mesh Service for UPI Mesh Pay

import type { PendingPacket, MeshDevice } from '@types'

// Custom UUIDs for UPI Mesh service
const UPI_MESH_SERVICE_UUID = '0000ffff-0000-1000-8000-00805f9b34fb'
const UPI_MESH_PACKET_CHAR_UUID = '0000ff01-0000-1000-8000-00805f9b34fb'
const UPI_MESH_DEVICE_CHAR_UUID = '0000ff02-0000-1000-8000-00805f9b34fb'
const UPI_MESH_CONTROL_CHAR_UUID = '0000ff03-0000-1000-8000-00805f9b34fb'

interface BluetoothDeviceInfo {
  device: BluetoothDevice
  server: BluetoothRemoteGATTServer | null
  packetCharacteristic: BluetoothRemoteGATTCharacteristic | null
  deviceCharacteristic: BluetoothRemoteGATTCharacteristic | null
  controlCharacteristic: BluetoothRemoteGATTCharacteristic | null
  isConnected: boolean
  lastSeen: number
  rssi?: number
}

class BluetoothService {
  private devices: Map<string, BluetoothDeviceInfo> = new Map()
  private isScanning = false
  private isAdvertising = false
  private scanInterval: ReturnType<typeof setInterval> | null = null
  private advertiseInterval: ReturnType<typeof setInterval> | null = null
  private packetHandler: ((packet: Uint8Array, fromDeviceId: string) => Promise<void>) | null = null
  private deviceId: string = ''
  private deviceName: string = ''
  
  // Initialize Bluetooth
  async initialize(): Promise<void> {
    if (!('bluetooth' in navigator)) {
      throw new Error('Web Bluetooth API not supported')
    }
    
    // Generate device identity
    this.deviceId = `device-${crypto.randomUUID().slice(0, 8)}`
    this.deviceName = `MeshPay ${this.deviceId.slice(-4)}`
    
    // Request Bluetooth permissions
    try {
      await navigator.bluetooth.requestDevice({
        filters: [{ services: [UPI_MESH_SERVICE_UUID] }],
        optionalServices: [UPI_MESH_SERVICE_UUID]
      })
    } catch (error) {
      // User may have denied - that's okay for peripheral mode
      console.log('Bluetooth device request cancelled or denied')
    }
    
    // Start advertising as peripheral
    await this.startAdvertising()
    
    // Start scanning for centrals
    this.startScanning()
  }
  
  // Start advertising as GATT server (peripheral mode)
  private async startAdvertising(): Promise<void> {
    if (this.isAdvertising) return
    
    try {
      // Note: Web Bluetooth API doesn't fully support peripheral mode in all browsers
      // This is a simplified implementation - in production, use Web Bluetooth
      // peripheral API when available or fallback to scanning only
      this.isAdvertising = true
      console.log('Started advertising as MeshPay device')
    } catch (error) {
      console.warn('Failed to start advertising:', error)
    }
  }
  
  // Stop advertising
  private stopAdvertising(): void {
    if (this.advertiseInterval) {
      clearInterval(this.advertiseInterval)
      this.advertiseInterval = null
    }
    this.isAdvertising = false
  }
  
  // Start scanning for other devices
  private startScanning(): void {
    if (this.isScanning) return
    
    this.isScanning = true
    
    // Scan periodically
    this.scanInterval = setInterval(async () => {
      if (!this.isScanning) return
      
      try {
        const device = await navigator.bluetooth.requestDevice({
          filters: [{ services: [UPI_MESH_SERVICE_UUID] }],
          optionalServices: [UPI_MESH_SERVICE_UUID]
        })
        
        await this.connectToDevice(device)
      } catch (error) {
        // No device found or user cancelled - that's okay
      }
    }, 10000) // Scan every 10 seconds
  }
  
  // Stop scanning
  private stopScanning(): void {
    if (this.scanInterval) {
      clearInterval(this.scanInterval)
      this.scanInterval = null
    }
    this.isScanning = false
  }
  
  // Connect to a discovered device
  private async connectToDevice(device: BluetoothDevice): Promise<void> {
    const deviceId = device.id
    
    if (this.devices.has(deviceId)) {
      return // Already connected
    }
    
    try {
      const server = await device.gatt?.connect()
      if (!server) throw new Error('Failed to connect to GATT server')
      
      const service = await server.getPrimaryService(UPI_MESH_SERVICE_UUID)
      const packetChar = await service.getCharacteristic(UPI_MESH_PACKET_CHAR_UUID)
      const deviceChar = await service.getCharacteristic(UPI_MESH_DEVICE_CHAR_UUID)
      const controlChar = await service.getCharacteristic(UPI_MESH_CONTROL_CHAR_UUID)
      
      // Subscribe to packet notifications
      await packetChar.startNotifications()
      packetChar.addEventListener('characteristicvaluechanged', (event) => {
        const value = event.target as BluetoothRemoteGATTCharacteristic
        if (value.value) {
          const packet = new Uint8Array(value.value.buffer)
          this.handleIncomingPacket(packet, deviceId)
        }
      })
      
      // Send our device info
      const deviceInfo = new TextEncoder().encode(JSON.stringify({
        deviceId: this.deviceId,
        deviceName: this.deviceName,
        hasInternet: navigator.onLine
      }))
      await deviceChar.writeValue(deviceInfo)
      
      this.devices.set(deviceId, {
        device,
        server,
        packetCharacteristic: packetChar,
        deviceCharacteristic: deviceChar,
        controlCharacteristic: controlChar,
        isConnected: true,
        lastSeen: Date.now()
      })
      
      // Handle disconnection
      device.addEventListener('gattserverdisconnected', () => {
        this.handleDisconnect(deviceId)
      })
      
      console.log(`Connected to device: ${deviceId}`)
    } catch (error) {
      console.warn(`Failed to connect to device ${deviceId}:`, error)
    }
  }
  
  // Handle incoming packet
  private async handleIncomingPacket(packet: Uint8Array, fromDeviceId: string): Promise<void> {
    if (this.packetHandler) {
      await this.packetHandler(packet, fromDeviceId)
    }
  }
  
  // Handle device disconnection
  private handleDisconnect(deviceId: string): void {
    const deviceInfo = this.devices.get(deviceId)
    if (deviceInfo) {
      deviceInfo.isConnected = false
      // Keep device info for reconnection attempts
    }
  }
  
  // Gossip packet to all connected devices
  async gossipPacket(packet: PendingPacket): Promise<void> {
    const packetData = new Uint8Array([
      // Packet header: version (1) + type (1) + packetId length (1) + packetId + ttl (1) + ciphertext length (2) + ciphertext
      1, // version
      1, // type: packet
      packet.packetId.length,
      ...new TextEncoder().encode(packet.packetId),
      packet.ttl,
      (packet.ciphertext.length >> 8) & 0xFF,
      packet.ciphertext.length & 0xFF,
      ...packet.ciphertext
    ])
    
    const promises: Promise<void>[] = []
    
    for (const [deviceId, deviceInfo] of this.devices) {
      if (!deviceInfo.isConnected || !deviceInfo.packetCharacteristic) continue
      
      promises.push(
        deviceInfo.packetCharacteristic.writeValue(packetData)
          .then(() => {
            deviceInfo.lastSeen = Date.now()
          })
          .catch((error) => {
            console.warn(`Failed to send packet to ${deviceId}:`, error)
            deviceInfo.isConnected = false
          })
      )
    }
    
    await Promise.allSettled(promises)
  }
  
  // Set packet handler for incoming packets
  setPacketHandler(handler: (packet: Uint8Array, fromDeviceId: string) => Promise<void>): void {
    this.packetHandler = handler
  }
  
  // Get connected devices as MeshDevice array
  getConnectedDevices(): MeshDevice[] {
    const devices: MeshDevice[] = []
    
    for (const [id, info] of this.devices) {
      if (info.isConnected) {
        devices.push({
          id,
          name: info.device.name || `Device ${id.slice(-4)}`,
          hasInternet: navigator.onLine, // Would need to exchange this info
          isCurrentDevice: id === this.deviceId,
          packetCount: 0, // Would need to track
          lastSeen: info.lastSeen,
          rssi: info.rssi
        })
      }
    }
    
    return devices
  }
  
  // Get device info
  getDeviceInfo(): { deviceId: string; deviceName: string } {
    return { deviceId: this.deviceId, deviceName: this.deviceName }
  }
  
  // Check if Bluetooth is available and enabled
  async isBluetoothAvailable(): Promise<boolean> {
    if (!('bluetooth' in navigator)) return false
    
    try {
      const adapter = await (navigator as any).bluetooth?.getAvailability?.()
      return adapter === true
    } catch {
      // Fallback: assume available if API exists
      return true
    }
  }
  
  // Request Bluetooth permissions
  async requestPermissions(): Promise<boolean> {
    try {
      await navigator.bluetooth.requestDevice({
        filters: [{ services: [UPI_MESH_SERVICE_UUID] }],
        optionalServices: [UPI_MESH_SERVICE_UUID]
      })
      return true
    } catch {
      return false
    }
  }
  
  // Shutdown
  shutdown(): void {
    this.stopScanning()
    this.stopAdvertising()
    
    // Disconnect all devices
    for (const [deviceId, deviceInfo] of this.devices) {
      if (deviceInfo.server) {
        deviceInfo.server.disconnect()
      }
    }
    this.devices.clear()
  }
  
  // Get current device ID
  getDeviceId(): string {
    return this.deviceId
  }
  
  // Get current device name
  getDeviceName(): string {
    return this.deviceName
  }
}

export const bluetoothService = new BluetoothService()