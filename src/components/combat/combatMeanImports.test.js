// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import * as cmUtils from './combatMeanUtils'

/**
 * 守一类 build 与 lint 都查不出的错：Vite 只转译不解析未定义标识符，本仓 eslint 的 no-undef 是关的，
 * 所以「用了却没 import」要等到那条渲染分支真的跑一帧才炸（组合技卡白屏就是这么来的）。
 * 反向断言同时把「裁 import」变成机械操作，不再靠肉眼 grep 数引用。
 */

// 只覆盖当前无他处在改的文件；正在被别的窗口编辑的写进下方 EXEMPT，不要静默漏掉
const TARGETS = [
  ['src/components/CombatStatus.jsx', './combat/combatMeanUtils'],
  ['src/components/combat/AddWeaponStep.jsx', './combatMeanUtils'],
  ['src/components/combat/AddComboStep.jsx', './combatMeanUtils'],
  ['src/components/combat/AddSpellStep.jsx', './combatMeanUtils'],
  ['src/components/combat/GainEditor.jsx', './combatMeanUtils'],
  ['src/components/combat/SpellAttackCard.jsx', './combatMeanUtils'],
  ['src/components/combat/deriveWieldedWeaponMeans.js', './combatMeanUtils'],
]

/** 别的窗口正在改，纳入会因它们的中间态假红；它们收工后应挪回 TARGETS */
const EXEMPT = [
  'src/components/AbilityUseModal.jsx',
  'src/components/combat/WeaponAttackCard.jsx',
  'src/pages/CreatureLibraryManager.jsx',
]

/** 取某个 import 块及其余正文：import 块内部不会出现 `}`，据此把每一块各自切出来 */
function splitImportBlock(src, modulePath) {
  const blocks = [...src.matchAll(/^import \{([^}]*)\} from '([^']+)'/gm)]
  const hit = blocks.find(([, , p]) => p === modulePath)
  if (!hit) return null
  const body = src.slice(0, hit.index) + src.slice(hit.index + hit[0].length)
  return {
    imported: new Set(hit[1].split(/[,\s]+/).map((s) => s.trim()).filter(Boolean)),
    // 注释里提到的导出名不算引用；`...fn(` 的三个点会被 (?<!\.) 误判成属性访问。
    // 行尾注释也要剥：否则 "const x = 1 // 这里要用 computeLiveGains" 会假红，
    // 而最省事的"修复"是真把符号导进来，反向打掉守卫价值。
    // 只剥前面是空白的 //，所以 http:// 与 /\// 这类不受影响；代价是字符串字面量里
    // 出现「空格 + //」会吃掉该行余下部分——遇到这种假红，把名字挪出行尾即可。
    scanned: body
      .replace(/^\s*(?:\/\/|\/\*|\*).*$/gm, '')
      .replace(/[ \t]\/\/.*$/gm, ' ')
      .replace(/\.\.\./g, ' '),
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
    // 先短路：导入块没定位到时下面两条会抛 TypeError，一次成因报三条红
    expect(parts, '导入块未定位到，先看上一条用例').not.toBeNull()
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
    expect(parts, '导入块未定位到，先看第一条用例').not.toBeNull()
    const unused = [...parts.imported].filter(
      (name) => !new RegExp(`(?<!\\.)\\b${name}\\b`).test(parts.scanned)
    )
    expect(unused).toEqual([])
  })
})

describe('TARGETS 覆盖完整性', () => {
  const importers = readdirSync(join(process.cwd(), 'src'), { recursive: true })
    .filter((p) => /\.(js|jsx)$/.test(p) && !/\.test\.jsx?$/.test(p))
    .map((p) => 'src/' + p.split(/[\\/]/).join('/'))
    .filter((rel) => /from '[^']*combatMeanUtils'/.test(readFileSync(join(process.cwd(), rel), 'utf8')))

  it('每个 import 了 combatMeanUtils 的文件都在 TARGETS 或 EXEMPT 里', () => {
    const covered = new Set([...TARGETS.map(([rel]) => rel), ...EXEMPT])
    // 新文件接进战斗手段管线时这条会红：把它加进 TARGETS（首选）或带理由写进 EXEMPT
    expect(importers.filter((rel) => !covered.has(rel))).toEqual([])
  })

  it('EXEMPT 里没有已经可以收回 TARGETS 的过期豁免', () => {
    expect(EXEMPT.filter((rel) => !importers.includes(rel))).toEqual([])
  })
})
