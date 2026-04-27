import { describe, expect, it } from 'vitest'
import manifest from '../app.json'

describe('app.json', () => {
  it('uses the current Even Hub manifest schema', () => {
    expect(manifest.package_id).toMatch(/^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)+$/)
    expect(manifest.edition).toBe('202601')
    expect(manifest.name.length).toBeLessThanOrEqual(20)
    expect(manifest.version).toMatch(/^\d+\.\d+\.\d+$/)
    expect(manifest.min_app_version).toBeTypeOf('string')
    expect(manifest.min_sdk_version).toBe('0.0.10')
    expect(manifest.entrypoint).toBe('index.html')
    expect(Array.isArray(manifest.permissions)).toBe(true)
    expect(manifest.supported_languages).toEqual(['en'])
  })

  it('declares microphone and explicit network permissions', () => {
    const network = manifest.permissions.find((permission) => permission.name === 'network')
    expect(network?.whitelist).toEqual(['http://192.168.2.44:8787'])
    expect(network?.whitelist).not.toEqual(expect.arrayContaining([
      'https://stt-rt.soniox.com',
      'https://api.openai.com',
    ]))
    expect(manifest.permissions.some((permission) => permission.name === 'g2-microphone')).toBe(true)
  })
})
