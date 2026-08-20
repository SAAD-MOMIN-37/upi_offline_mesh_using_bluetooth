import { useMeshStore } from '@hooks/useMeshStore'
import { useAuthStore } from '@hooks/useAuthStore'
import { useState, useEffect } from 'react'
import { 
  Wifi, WifiOff, Bluetooth, BluetoothOff, Search, 
  Zap, Circle, Loader2, Trash2, AlertTriangle, 
  RefreshCw, Shield, Eye, EyeOff
} from 'lucide-react'
import type { MeshDevice } from '@types'

export default function MeshPage() {
  const { devices, networkStatus, currentDeviceId, killDevice, addDevice, startGossip, stopGossip, gossipInterval } = useMeshStore()
  const { settings } = useAuthStore()
  const [showKilled, setShowKilled] = useState(false)
  const [scanning, setScanning] = useState(false)
  
  const deviceArray = Array.from(devices.values())
  const onlineDevices = deviceArray.filter(d => d.hasInternet && !d.isKilled)
  const offlineDevices = deviceArray.filter(d => !d.hasInternet && !d.isKilled)
  const killedDevices = deviceArray.filter(d => d.isKilled)
  
  useEffect(() => {
    if (settings.autoGossip && !gossipInterval) {
      startGossip()
    } else if (!settings.autoGossip && gossipInterval) {
      stopGossip()
    }
  }, [settings.autoGossip, gossipInterval, startGossip, stopGossip])
  
  const handleScan = async () => {
    setScanning(true)
    try {
      // Simulate discovering new devices
      await new Promise(resolve => setTimeout(resolve, 2000))
      
      // Add a mock discovered device
      const newDeviceId = `device-${crypto.randomUUID().slice(0, 8)}`
      if (!devices.has(newDeviceId)) {
        addDevice({
          id: newDeviceId,
          name: `Device ${newDeviceId.slice(-4)}`,
          hasInternet: Math.random() > 0.7,
          isCurrentDevice: false,
          packetCount: 0,
          lastSeen: Date.now(),
          rssi: -50 - Math.random() * 40
        })
      }
    } finally {
      setScanning(false)
    }
  }
  
  const handleKillDevice = async (deviceId: string) => {
    if (!confirm('Kill this bridge? It will drop out of the mesh instantly.')) return
    await killDevice(deviceId)
  }
  
  const renderDeviceCard = (device: MeshDevice) => (
    <div key={device.id} className={`card-hover flex items-center gap-4 p-4 ${device.isKilled ? 'opacity-50 border-mesh-danger/50' : ''}`}>
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${
        device.hasInternet ? 'bg-mesh-success/20' : 'bg-mesh-accent/20'
      }`}>
        {device.hasInternet ? (
          <Wifi className="w-6 h-6 text-mesh-success" />
        ) : (
          <Bluetooth className="w-6 h-6 text-mesh-accent" />
        )}
      </div>
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-mesh-text truncate">
            {device.name}
            {device.isCurrentDevice && <span className="badge badge-info text-xs ml-2">You</span>}
          </h3>
          {device.isKilled && <AlertTriangle className="w-4 h-4 text-mesh-danger" />}
        </div>
        <p className="text-sm text-mesh-muted truncate">{device.id}</p>
        <div className="flex items-center gap-4 mt-1 text-xs text-mesh-muted">
          <span className="flex items-center gap-1">
            <Circle className={`w-1.5 h-1.5 ${device.hasInternet ? 'text-mesh-success' : 'text-mesh-accent'}`} />
            {device.hasInternet ? 'Bridge (4G)' : 'Offline'}
          </span>
          {device.rssi && (
            <span className="flex items-center gap-1">
              <Zap className="w-3 h-3" />
              {device.rssi.toFixed(0)} dBm
            </span>
          )}
          <span className="flex items-center gap-1">
            <Shield className="w-3 h-3" />
            {device.packetCount} packets
          </span>
        </div>
      </div>
      
      <div className="flex items-center gap-2">
        {device.hasInternet && !device.isCurrentDevice && !device.isKilled && (
          <button
            onClick={() => handleKillDevice(device.id)}
            className="p-2 text-mesh-danger hover:bg-mesh-danger/10 rounded-lg"
            title="Kill bridge"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        )}
        {device.isKilled && (
          <span className="badge badge-danger text-xs">Killed</span>
        )}
      </div>
    </div>
  )
  
  return (
    <div className="flex-1 max-w-2xl mx-auto py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-mesh-text mb-2">Mesh Network</h1>
        <p className="text-mesh-muted">
          View and manage your Bluetooth mesh connections
        </p>
      </div>
      
      {/* Network Status Card */}
      <div className="card mb-6">
        <div className="flex items-center gap-4">
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center ${
            networkStatus.isOnline ? 'bg-mesh-success/20' : 'bg-mesh-danger/20'
          }`}>
            {networkStatus.isOnline ? (
              <Wifi className="w-8 h-8 text-mesh-success" />
            ) : (
              <WifiOff className="w-8 h-8 text-mesh-danger" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-mesh-text">
              {networkStatus.isOnline ? 'Online' : 'Offline'}
            </h3>
            <p className="text-sm text-mesh-muted">
              {networkStatus.connectedDevices} devices connected • {deviceArray.size} total
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleScan} disabled={scanning} className="btn-secondary">
              <Search className="w-5 h-5" /> {scanning ? 'Scanning...' : 'Scan'}
            </button>
            <button className="btn-primary" onClick={() => {}}>
              <RefreshCw className="w-5 h-5" /> Refresh
            </button>
          </div>
        </div>
      </div>
      
      {/* Current Device */}
      <div className="card mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-mesh-text">This Device</h2>
          <span className="badge badge-info">Current</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-mesh-accent/20 flex items-center justify-center">
            <Bluetooth className="w-8 h-8 text-mesh-accent" />
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-mesh-text">MeshPay Device</h3>
            <p className="text-sm text-mesh-muted font-mono">{currentDeviceId}</p>
            <div className="flex items-center gap-4 mt-2 text-xs text-mesh-muted">
              <span>Bluetooth: {networkStatus.isBluetoothEnabled ? 'Enabled' : 'Disabled'}</span>
              <span>Auto-gossip: {settings.autoGossip ? 'On' : 'Off'}</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Online Bridges */}
      {onlineDevices.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-mesh-text">Online Bridges ({onlineDevices.length})</h2>
            <Eye className="w-5 h-5 text-mesh-muted" />
          </div>
          <div className="space-y-3">
            {onlineDevices.map(renderDeviceCard)}
          </div>
        </div>
      )}
      
      {/* Offline Devices */}
      {offlineDevices.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-mesh-text">Offline Devices ({offlineDevices.length})</h2>
            <EyeOff className="w-5 h-5 text-mesh-muted" />
          </div>
          <div className="space-y-3">
            {offlineDevices.map(renderDeviceCard)}
          </div>
        </div>
      )}
      
      {/* Killed Devices */}
      {killedDevices.length > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-mesh-text">Killed Bridges ({killedDevices.length})</h2>
            <AlertTriangle className="w-5 h-5 text-mesh-danger" />
          </div>
          <div className="space-y-3">
            {killedDevices.map(renderDeviceCard)}
          </div>
        </div>
      )}
      
      {deviceArray.size === 1 && (
        <div className="card text-center py-8">
          <Bluetooth className="w-16 h-16 text-mesh-muted mx-auto mb-4" />
          <h3 className="font-semibold text-mesh-text mb-2">No other devices found</h3>
          <p className="text-mesh-muted mb-6">
            Scan for nearby devices to build your mesh network
          </p>
          <button onClick={handleScan} disabled={scanning} className="btn-primary">
            <Search className="w-5 h-5" /> {scanning ? 'Scanning...' : 'Scan for Devices'}
          </button>
        </div>
      )}
      
      {/* Mesh Explanation */}
      <div className="card bg-mesh-border/50 mt-6">
        <h3 className="font-semibold text-mesh-text mb-3 flex items-center gap-2">
          <Shield className="w-5 h-5 text-mesh-accent" />
          How Mesh Works
        </h3>
        <div className="space-y-2 text-sm text-mesh-muted">
          <p>• Payments are encrypted packets that hop between nearby phones via Bluetooth</p>
          <p>• Only devices with internet (bridges) can upload to the settlement backend</p>
          <p>• Atomic idempotency ensures each payment settles exactly once</p>
          <p>• Kill a bridge to test resilience - remaining bridges still complete the payment</p>
        </div>
      </div>
    </div>
  )
}