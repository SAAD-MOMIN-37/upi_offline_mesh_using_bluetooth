// Hybrid Crypto Service for UPI Mesh Pay
// Port of the backend HybridCryptoService using Web Crypto API

export interface ServerPublicKey {
  key: CryptoKey
  exported: string // Base64 DER
}

export interface EncryptedPacket {
  encryptedAesKey: Uint8Array // 256 bytes RSA-OAEP encrypted AES key
  iv: Uint8Array // 12 bytes GCM IV
  ciphertext: Uint8Array // AES-GCM ciphertext + auth tag
}

const RSA_ENCRYPTED_KEY_BYTES = 256
const GCM_IV_BYTES = 12
const GCM_TAG_BYTES = 16
const AES_KEY_BYTES = 32

class CryptoService {
  private serverPublicKey: CryptoKey | null = null
  private keyPair: CryptoKeyPair | null = null
  
  // Generate RSA-OAEP key pair for the device (for ack decryption)
  async generateKeyPair(): Promise<CryptoKeyPair> {
    if (this.keyPair) return this.keyPair
    
    this.keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]), // 65537
        hash: 'SHA-256'
      },
      true, // extractable
      ['encrypt', 'decrypt']
    )
    
    return this.keyPair
  }
  
  // Set server public key (fetched from backend)
  async setServerPublicKey(base64Der: string): Promise<void> {
    const der = this.base64ToArrayBuffer(base64Der)
    this.serverPublicKey = await crypto.subtle.importKey(
      'spki',
      der,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256'
      },
      false,
      ['encrypt']
    )
  }
  
  // Get server public key as base64 DER
  async getServerPublicKeyBase64(): Promise<string> {
    if (!this.serverPublicKey) {
      throw new Error('Server public key not set')
    }
    const der = await crypto.subtle.exportKey('spki', this.serverPublicKey)
    return this.arrayBufferToBase64(der)
  }
  
  // Encrypt payment instruction with server's public key (hybrid)
  async encrypt(instruction: object): Promise<Uint8Array> {
    if (!this.serverPublicKey) {
      throw new Error('Server public key not set')
    }
    
    const plaintext = new TextEncoder().encode(JSON.stringify(instruction))
    
    // Generate random AES-256 key
    const aesKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt']
    )
    
    // Export AES key
    const aesKeyRaw = await crypto.subtle.exportKey('raw', aesKey)
    
    // Generate random IV
    const iv = crypto.getRandomValues(new Uint8Array(GCM_IV_BYTES))
    
    // Encrypt plaintext with AES-GCM
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      plaintext
    )
    
    // Encrypt AES key with server's RSA public key
    const encryptedAesKey = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      this.serverPublicKey,
      aesKeyRaw
    )
    
    // Pack: encryptedAesKey (256) + iv (12) + ciphertext
    const encryptedAesKeyArr = new Uint8Array(encryptedAesKey)
    const ivArr = new Uint8Array(iv)
    const ciphertextArr = new Uint8Array(ciphertext)
    
    const packed = new Uint8Array(
      encryptedAesKeyArr.length + ivArr.length + ciphertextArr.length
    )
    packed.set(encryptedAesKeyArr, 0)
    packed.set(ivArr, encryptedAesKeyArr.length)
    packed.set(ciphertextArr, encryptedAesKeyArr.length + ivArr.length)
    
    return packed
  }
  
  // Decrypt with device's private key (for ack packets)
  async decryptAck(packed: Uint8Array, ackKey: Uint8Array): Promise<object> {
    if (packed.length < GCM_IV_BYTES + GCM_TAG_BYTES) {
      throw new Error('Invalid ack packet: too short')
    }
    
    // Ack packets are symmetric: iv + ciphertext (no RSA layer)
    const iv = packed.slice(0, GCM_IV_BYTES)
    const ciphertext = packed.slice(GCM_IV_BYTES)
    
    // Import ack key
    const key = await crypto.subtle.importKey(
      'raw',
      ackKey,
      { name: 'AES-GCM' },
      false,
      ['decrypt']
    )
    
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      ciphertext
    )
    
    return JSON.parse(new TextDecoder().decode(plaintext))
  }
  
  // Hash ciphertext for idempotency (SHA-256)
  hashCiphertext(ciphertext: Uint8Array): string {
    const hashBuffer = crypto.subtle.digest('SHA-256', ciphertext)
    // Note: This is async in reality, but we need sync for idempotency key
    // In practice, use a sync hash or await this
    return '' // Placeholder - use async version below
  }
  
  async hashCiphertextAsync(ciphertext: Uint8Array): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', ciphertext)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }
  
  // Generate random PIN hash (SHA-256)
  async hashPin(pin: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(pin)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }
  
  // Generate random nonce
  generateNonce(): string {
    return crypto.randomUUID()
  }
  
  // Generate random ack key (32 bytes)
  generateAckKey(): Uint8Array {
    return crypto.getRandomValues(new Uint8Array(AES_KEY_BYTES))
  }
  
  // Utility functions
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  }
  
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }
  
  // Pack encrypted packet for transmission (base64)
  packForTransport(packed: Uint8Array): string {
    return this.arrayBufferToBase64(packed.buffer)
  }
  
  // Unpack from transport
  unpackFromTransport(base64: string): Uint8Array {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes
  }
}

export const cryptoService = new CryptoService()