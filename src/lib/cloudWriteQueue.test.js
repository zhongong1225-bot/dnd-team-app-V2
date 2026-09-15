import { describe, it, expect } from 'vitest'
import { enqueueCloudWrite } from './cloudWriteQueue'

const delay = (ms) => new Promise((r) => setTimeout(r, ms))

describe('enqueueCloudWrite 串行化同一 key 的云端写', () => {
  it('同一 key 的两个任务按入队顺序串行执行，后一个等前一个完成才开始', async () => {
    const events = []
    const k = 'mod-a'
    const p1 = enqueueCloudWrite(k, async () => { events.push('start1'); await delay(30); events.push('end1'); return 1 })
    const p2 = enqueueCloudWrite(k, async () => { events.push('start2'); await delay(5); events.push('end2'); return 2 })
    const [r1, r2] = await Promise.all([p1, p2])
    expect(events).toEqual(['start1', 'end1', 'start2', 'end2'])
    expect(r1).toBe(1)
    expect(r2).toBe(2)
  })

  it('前一个任务失败不阻断后续任务，且失败会向上抛给该次调用方', async () => {
    const k = 'mod-b'
    const events = []
    const p1 = enqueueCloudWrite(k, async () => { events.push('t1'); throw new Error('boom') })
    const p2 = enqueueCloudWrite(k, async () => { events.push('t2'); return 'ok' })
    await expect(p1).rejects.toThrow('boom')
    const r2 = await p2
    expect(r2).toBe('ok')
    expect(events).toEqual(['t1', 't2'])
  })

  it('不同 key 互不阻塞，可并发执行', async () => {
    const events = []
    const p1 = enqueueCloudWrite('k1', async () => { events.push('k1-start'); await delay(30); events.push('k1-end') })
    const p2 = enqueueCloudWrite('k2', async () => { events.push('k2-start'); await delay(5); events.push('k2-end') })
    await Promise.all([p1, p2])
    // k2 更快完成，说明未被 k1 阻塞
    expect(events.indexOf('k2-end')).toBeLessThan(events.indexOf('k1-end'))
  })

  it('后入队的写入携带的是最新内容，最终落地为最后一次（最完整）快照', async () => {
    const k = 'mod-c'
    let server = null
    // 模拟服务端无条件覆盖：最后完成的写决定最终状态
    const write = (snapshot) => enqueueCloudWrite(k, async () => { await delay(10); server = snapshot })
    const w1 = write({ buffs: ['new'], items: ['old'] })
    const w2 = write({ buffs: ['new'], items: ['new'] })
    await Promise.all([w1, w2])
    expect(server).toEqual({ buffs: ['new'], items: ['new'] })
  })
})
