import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createVPA } from '../types'
import { cryptoService } from '../services/cryptoService'

describe('Types', () => {
  it('should create valid VPA', () => {
    const vpa = createVPA('user@bank')
    expect(vpa).toBe('user@bank')
  })

  it('should throw on invalid VPA', () => {
    expect(() => createVPA('invalid')).toThrow('Invalid VPA format')
  })
})

describe('CryptoService', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should generate nonce', () => {
    const nonce1 = cryptoService.generateNonce()
    const nonce2 = cryptoService.generateNonce()
    expect(nonce1).not.toBe(nonce2)
    expect(nonce1).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('should generate ack key', () => {
    const key1 = cryptoService.generateAckKey()
    const key2 = cryptoService.generateAckKey()
    expect(key1).toBeInstanceOf(Uint8Array)
    expect(key1.length).toBe(32)
    expect(key1).not.toEqual(key2)
  })

  it('should hash PIN', async () => {
    const hash = await cryptoService.hashPin('1234')
    expect(hash).toBeTypeOf('string')
    expect(hash.length).toBe(64) // SHA-256 hex
  })
})