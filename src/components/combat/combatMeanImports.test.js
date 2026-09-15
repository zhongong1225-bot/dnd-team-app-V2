// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import * as cmUtils from './combatMeanUtils'

/**
 * 守一类 build 与 lint 都查不出的错：Vite 只转译不解析未定义标识符，本仓 eslint 的 no-undef 是关的，
 * 所以「用了却没 import」要等到那条渲染分支真的跑一帧才炸（组合技卡白屏就是这么来的）。
 * 反向断言同时把「裁 import」变成机械操作，不再靠肉眼 grep 数引用。
 */

// 只覆盖本计划改过且当前无他处在改的文件；WeaponAttackCard 等正在被别的窗口编辑，先不纳入
const TARGETS = [
  ['src/components/CombatStatus.jsx', './combat/combatMeanUtils'],
  ['src/components/combat/AddWeaponStep.jsx', './combatMeanUtils'],
  ['src/components/combat/AddComboStep.jsx', './combatMeanUtils'],
  ['src/components/combat/deriveWieldedWeaponMeans.js', './combatMeanUtils'],
]

/** 取某个 import 块及其余正文：import 块内部不会出现 `}`，据此把每一块各自切出来 */
function splitImportBlock(src, modulePath) {
  const blocks = [...src.matchAll(/^import \{([^}]*)\} from '([^']+)'/gm)]
  const hit = blocks.find(([, , p]) => p === modulePath)
  if (!hit) return null
  const body = src.slice(0, hit.index) + src.slice(hit.index + hit[0].length)
  return {
    imported: new Set(hit[1].split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)),
    // 注释里提到的导出名不算引用；`...fn(` 的三个点会被 (?<!\.) 误判成属性访问
    scanned: body.replace(/^\s*(?:\/\/|\/\*|\*).*$/gm, '').replace(/\.\.\./g, ' '),
  }
}

describe.each(TARGETS)('%s 对 %s 的导入完整性', (rel, modulePath) => {
  const src = readFileSync(join(process.cwd(), rel), 'utf8')
  const parts = splitImportBlock(src, modulePath)

  it('定位到该模块的导入块本身（改写法或换路径时先修这条）', () => {
    expect(parts).not.toBeNull()
    expect(parts.imported.size).toBeGreaterThan(0)
  })

  it('用到的每个导出符号都在导入块里', () => {
    const locallyDeclared = new Set(
      [...parts.scanned.matchAll(/^(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1])
    )
    const missing = Object.keys(cmUtils).filter(
      // 前置 (?<!\.) 排除 ctx.computeLiveGains 这类同名属性
      (name) => !parts.imported.has(name) && !locallyDeclared.has(name) && new RegExp(`(?<!\\.)\\b${name}\\b`).test(parts.scanned)
    )
    expect(missing).toEqual([])
  })

  it('导入块里没有零引用的符号', () => {
    const unused = [...parts.imported].filter(
      (name) => !new RegExp(`(?<!\\.)\\b${name}\\b`).test(parts.scanned)
    )
    expect(unused).toEqual([])
  })
})
