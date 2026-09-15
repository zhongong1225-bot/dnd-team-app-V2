// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as cmUtils from './combatMeanUtils'

/**
 * 守一类 build 与 lint 都查不出的错：Vite 不解析未定义标识符、eslint 配置里 no-undef 是关的，
 * 所以「用了却没 import」要等到组件真的渲染那一帧才炸（组合技卡白屏就是这么来的）。
 * 只比对「用到的导出符号」与「导入块里的符号」的差集，块按 from 路径精确定位，避免跨块匹配。
 */
describe('CombatStatus 对 combatMeanUtils 的导入完整性', () => {
  const src = readFileSync(join(process.cwd(), 'src/components/CombatStatus.jsx'), 'utf8')
  const lines = src.split('\n')
  const start = lines.findIndex((l) => l === 'import {')
  const end = lines.findIndex((l, i) => i > start && l === "} from './combat/combatMeanUtils'")
  const importBlock = lines.slice(start + 1, end).join(',')
  const body = lines.slice(0, start).concat(lines.slice(end + 1)).join('\n')

  it('定位到导入块本身（改写法或换路径时先修这条）', () => {
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    expect(importBlock).toContain('computeLiveGains')
  })

  it('源码里用到的每个导出符号都在导入块里', () => {
    const imported = new Set(importBlock.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean))
    const locallyDeclared = new Set(
      [...body.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1])
    )
    const missing = Object.keys(cmUtils).filter(
      (name) => !imported.has(name) && !locallyDeclared.has(name) && new RegExp(`\\b${name}\\b`).test(body)
    )
    expect(missing).toEqual([])
  })
})
