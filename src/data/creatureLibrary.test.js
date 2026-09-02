import { describe, it, expect, vi, beforeEach } from 'vitest'

// 关键防护：单元测试永远不允许连上真实 Supabase。
// 之前这里没隔离，测试把测试数据写进了生产生物库并覆盖了整库。
// 因此强制 isSupabaseEnabled() 返回 false，让所有读写走内存 localStorage。
vi.mock('../lib/supabase', () => ({
  supabase: null,
  isSupabaseEnabled: () => false,
}))

const store = {}
vi.stubGlobal('localStorage', {
  getItem: (k) => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v) },
  removeItem: (k) => { delete store[k] },
})

const { isSupabaseEnabled } = await import('../lib/supabase')
const {
  addCreature,
  updateCreature,
  subscribeCreatureLibraryVersion,
  getCreatureLibraryVersion,
} = await import('./creatureLibrary')

describe('生物库版本订阅（联网加载完成后计算器须能感知并重算）', () => {
  beforeEach(() => {
    delete store['dnd_creature_library']
  })

  it('测试环境必须处于离线（localStorage）模式', () => {
    expect(isSupabaseEnabled()).toBe(false)
  })

  it('新增生物后版本号递增并通知订阅者', async () => {
    const before = getCreatureLibraryVersion()
    const listener = vi.fn()
    const unsub = subscribeCreatureLibraryVersion(listener)
    await addCreature({ name: '离线测试生物' })
    unsub()
    expect(getCreatureLibraryVersion()).toBeGreaterThan(before)
    expect(listener).toHaveBeenCalled()
  })

  it('更新生物后版本号再次递增', async () => {
    const c = await addCreature({ name: '离线测试生物2' })
    const before = getCreatureLibraryVersion()
    await updateCreature(c.id, { name: '改名' })
    expect(getCreatureLibraryVersion()).toBeGreaterThan(before)
  })
})
