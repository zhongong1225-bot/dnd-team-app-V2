# 主动技能分步释放流程 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AbilityUseModal 从单步确认弹窗重写为多步状态机，实现"准备→确认→掷骰→结果"的分步释放流程，攻击型走"投攻击骰→问DM→命中投伤害"的线下跑团流程。

**Architecture:** 提取流程分类和效果预览为纯函数工具模块，新建进度条组件，将 AbilityUseModal 重写为显式 `step` 状态机。资源消耗从确认时推迟到掷骰时（步骤3入口）。移除所有掷骰后确认弹窗（治疗确认、手动伤害输入），改为自动掷骰。

**Tech Stack:** React 18 + Tailwind CSS 3 + ThreeDiceOverlay (3D骰子动画) + dnd-external-roll CustomEvent

**设计文档:** `docs/superpowers/specs/2026-09-04-active-ability-release-flow-design.md`

---

## 文件结构

### 新建文件

| 文件 | 职责 |
|------|------|
| `src/lib/abilityFlowUtils.js` | 流程分类（攻击/豁免/其他）、步骤标签、效果预览文本生成 |
| `src/components/AbilityStepProgressBar.jsx` | 顶部进度条组件（金色/灰色圆点+连线） |

### 重写文件

| 文件 | 改动 |
|------|------|
| `src/components/AbilityUseModal.jsx` | 全面重写为状态机，~800行（从2278行大幅精简） |

### 不改动

| 文件 | 原因 |
|------|------|
| `src/lib/activeAbilityEngine.js` | 资源逻辑不变，只改调用时机 |
| `src/lib/chargeItemModel.js` | normalizeChargeItemValue 不变 |
| ThreeDiceOverlay / dnd-external-roll | 骰子动画协议不变 |

---

### Task 1: 创建 abilityFlowUtils.js — 流程分类与预览

**Files:**
- Create: `src/lib/abilityFlowUtils.js`

这个模块是纯函数，无 React 依赖。根据 effects 数组判断技能类型、步骤数量、进度标签，以及从 norm.effects 中提取预览文本（攻击加值、伤害公式、DC）。

- [ ] **Step 1: 创建 abilityFlowUtils.js**

```js
// src/lib/abilityFlowUtils.js

/**
 * 判断效果数组是否包含攻击骰（spell_attack 或顶层 attack_buff 带命中判定）
 */
function hasAttackRoll(effects) {
  for (const eff of (effects || [])) {
    if (eff.type === 'spell' && eff.value?.hitResolution === 'spell_attack') return true
    if (eff.type === 'attack_buff' && (eff.value?.hitBonus > 0 || eff.value?.damageBonus > 0)) return false
    // spell 子效果中的 attack_buff 不算攻击型
  }
  return false
}

/**
 * 判断效果数组是否包含豁免判定
 */
function hasSavingThrow(effects) {
  for (const eff of (effects || [])) {
    if (eff.type === 'spell') {
      const hr = eff.value?.hitResolution
      if (hr && hr !== 'none' && hr !== 'spell_attack' && hr.endsWith('_save')) return true
    }
  }
  return false
}

/**
 * 判断效果数组是否包含骰子效果（伤害或治疗骰）
 */
function hasDiceEffects(effects) {
  for (const eff of (effects || [])) {
    if (eff.type === 'damage' || eff.type === 'heal') return true
    if (eff.type === 'ability' && (eff.value?.diceCount > 0)) return true
    if (eff.type === 'spell') {
      if ((eff.value?.damageDiceCount || 0) > 0) return true
      const subs = eff.value?.subEffects || []
      for (const se of subs) {
        if (se.type === 'damage' || se.type === 'heal') return true
        if (se.type === 'ability' && (se.value?.diceCount > 0)) return true
      }
    }
  }
  return false
}

/**
 * 分类技能流程类型
 * @returns {'attack' | 'save' | 'general'}
 */
export function classifyFlowType(effects) {
  if (hasAttackRoll(effects)) return 'attack'
  if (hasSavingThrow(effects)) return 'save'
  return 'general'
}

/**
 * 获取总步骤数
 */
export function getTotalSteps(flowType) {
  return flowType === 'attack' ? 4 : 3
}

/**
 * 获取进度条步骤标签
 * @param {'attack' | 'save' | 'general'} flowType
 * @param {boolean} hasDice — 是否包含骰子效果（伤害/治疗骰）
 */
export function getStepLabels(flowType, hasDice) {
  if (flowType === 'attack') {
    return ['准备', '确认', '攻击', '结果']
  }
  return hasDice ? ['准备', '确认', '掷骰', '结果'] : ['准备', '确认', '执行', '结果']
}

/**
 * 从 norm.effects 提取伤害公式文本（用于预览显示，不掷骰）
 * @returns {Array<{label: string, formula: string, damageType: string}>}
 */
export function extractDamageFormulas(effects, amt, isFreeSlot) {
  const formulas = []
  for (const eff of (effects || [])) {
    const ev = eff.value || {}
    if (eff.type === 'spell') {
      const diceCount = ev.damageDiceCount || 0
      if (diceCount > 0) {
        formulas.push({
          label: ev.spellName || '法术',
          formula: `${diceCount}d${ev.damageDiceSides || 6}`,
          damageType: ev.damageType || '',
        })
      }
      const subs = ev.subEffects || []
      for (const se of subs) {
        const sv = se.value || {}
        if (se.type === 'damage' && (sv.diceCount || 1) > 0) {
          formulas.push({
            label: sv.title || '伤害',
            formula: `${sv.diceCount || 1}d${sv.diceSides || 6}${sv.diceBonus ? `+${sv.diceBonus}` : ''}`,
            damageType: sv.damageType || '',
          })
        }
        if (se.type === 'ability' && se.value?.diceCount > 0 && se.value?.resultType === 'damage') {
          formulas.push({
            label: sv.title || '伤害',
            formula: `${sv.diceCount}d${sv.diceSides || 10}`,
            damageType: '',
          })
        }
      }
    }
    if (eff.type === 'damage') {
      const dc = ev.diceCount || 1
      formulas.push({
        label: ev.title || '伤害',
        formula: `${dc}d${ev.diceSides || 6}${ev.diceBonus ? `+${ev.diceBonus}` : ''}`,
        damageType: ev.damageType || '',
      })
    }
    if (eff.type === 'ability' && ev.resultType === 'damage' && ev.diceCount > 0) {
      formulas.push({
        label: ev.title || '伤害',
        formula: `${ev.diceCount}d${ev.diceSides || 10}`,
        damageType: '',
      })
    }
  }
  return formulas
}

/**
 * 从 norm.effects 提取豁免 DC 标签
 */
export function extractSaveInfo(effects) {
  for (const eff of (effects || [])) {
    if (eff.type === 'spell') {
      const hr = eff.value?.hitResolution
      if (hr && hr.endsWith('_save')) {
        return { saveType: hr.replace('_save', ''), spellName: eff.value?.spellName }
      }
    }
  }
  return null
}

/**
 * 生成效果预览行（用于确认步骤展示，不掷骰）
 */
export function generatePreviewLines(effects, featureName) {
  const lines = []
  for (const eff of (effects || [])) {
    const ev = eff.value || {}
    switch (eff.type) {
      case 'spell':
        lines.push(`📜 ${ev.spellName || '(未命名法术)'}`)
        break
      case 'damage':
        lines.push(`⚔️ ${ev.title || '伤害'}`)
        break
      case 'heal':
        lines.push(`💚 ${ev.title || '治疗'}`)
        break
      case 'temp_buff':
        lines.push(`✨ ${ev.buffName || '临时BUFF'}`)
        break
      case 'creature_transform':
        lines.push(`🐾 变身`)
        break
      case 'summon':
        lines.push(`📦 ${ev.preset === 'stellar_double' ? '星辰替身' : '召唤'}`)
        break
      case 'shield':
        lines.push(`🛡️ ${ev.title || '护盾'}`)
        break
      case 'restore_spell_slots':
        lines.push(`🔮 恢复法术位`)
        break
      case 'attack_buff':
        lines.push(`🎯 ${ev.title || '攻击加成'}`)
        break
      case 'custom_logic':
        lines.push(`✨ ${ev.description || ev.title || '自定义效果'}`)
        break
      case 'ability':
        lines.push(`${ev.resultType === 'damage' ? '⚔️' : '💚'} ${ev.title || '效果'}`)
        break
      default:
        lines.push(`✨ ${ev.title || eff.type}`)
    }
  }
  return lines
}
```

- [ ] **Step 2: 验证模块可导入**

Run: `cd G:/dnd-team-app && node -e "const m = require('./src/lib/abilityFlowUtils.js'); console.log(typeof m.classifyFlowType)"`
Expected: 不报错（注意：ESM 模块可能需要用 import 语法，如果报错则改用 `npx vite` 启动后在浏览器验证）

实际验证方式：启动 dev server 后在浏览器 console 中测试

- [ ] **Step 3: Commit**

```bash
git add src/lib/abilityFlowUtils.js
git commit -m "feat: add abilityFlowUtils for multi-step ability flow classification"
```

---

### Task 2: 创建 AbilityStepProgressBar.jsx — 进度条组件

**Files:**
- Create: `src/components/AbilityStepProgressBar.jsx`

纯展示组件，接收 `steps`（当前步骤索引）和 `labels`（步骤标签数组），渲染金色/灰色圆点+连线。

- [ ] **Step 1: 创建进度条组件**

```jsx
// src/components/AbilityStepProgressBar.jsx

export default function AbilityStepProgressBar({ step, labels }) {
  return (
    <div className="flex items-center justify-center px-4 py-2">
      {labels.map((label, i) => {
        const isCompleted = i < step
        const isCurrent = i === step
        return (
          <div key={i} className="flex items-center">
            {i > 0 && (
              <div
                className="h-[3px] w-8 sm:w-12"
                style={{ backgroundColor: isCompleted ? '#c79a42' : '#34455f' }}
              />
            )}
            <div className="flex flex-col items-center">
              <div
                className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-200"
                style={{
                  backgroundColor: isCompleted || isCurrent ? '#c79a42' : '#34455f',
                  color: isCompleted || isCurrent ? '#1a1f2e' : '#6b7280',
                  boxShadow: isCurrent ? '0 0 8px rgba(199,154,66,0.5)' : 'none',
                }}
              >
                {isCompleted ? '✓' : i + 1}
              </div>
              <span
                className="text-[10px] mt-1.5"
                style={{ color: isCurrent ? '#c79a42' : isCompleted ? '#9ca3af' : '#4b5563' }}
              >
                {label}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/AbilityStepProgressBar.jsx
git commit -m "feat: add AbilityStepProgressBar component for multi-step flow"
```

---

### Task 3: 重写 AbilityUseModal.jsx — 完整状态机实现

**Files:**
- Modify: `src/components/AbilityUseModal.jsx` (全面重写)

这是核心任务。将 2278 行的单步弹窗重写为 ~800 行的状态机。本 Task 包含所有子任务：
- 状态机骨架（step 变量 + 状态转移）
- `processAllEffects()` — 从现有 handleConfirm 提取效果处理逻辑
- `mergePatches()` — 合并资源 patch 和效果 patch
- 准备步骤（资源选择）+ 确认步骤（效果预览）
- 掷骰步骤 JSX（攻击骰结果 + 命中/未命中按钮）
- 结果展示 JSX + 不可撤回提示条
- 资源消耗逻辑（从 handleConfirm 提取到步骤3入口）

**关键架构决策：**
1. 用 `step` 变量替代所有布尔标志（showCreatureSelector、pendingHealing 等）
2. 资源消耗从确认时推迟到步骤3入口
3. 移除掷骰后确认弹窗（治疗确认、伤害输入、自定义逻辑确认）→ 全部自动掷骰
4. 生物选择保留在准备步骤（下拉菜单）
5. 保留 `activeAbilityToChargeValue` 导出函数不变

- [ ] **Step 1: 重写 AbilityUseModal.jsx**

完整重写文件。以下是新文件的完整结构：

```jsx
// src/components/AbilityUseModal.jsx

import { useState, useCallback, useMemo } from 'react'
import { X } from 'lucide-react'
import {
  normalizeChargeItemValue,
  computeScaledEffect,
  getMaxSpendableAmount,
  resolveAbilityMod,
  RESOURCE_TYPE_OPTIONS,
  scaleStanceModules,
  isFreeSlotConsumption,
  isFixedSlotConsumption,
  getDiceMax,
} from '../lib/chargeItemModel'
import { rollDice } from '../data/weaponDatabase'
import { proficiencyBonus, abilityModifier, calcMaxHP, getHPBuffSum } from '../lib/formulas'
import { getCharacterClasses, getPrimarySpellcastingAbility, getMaxSpellSlotsByRing } from '../data/classDatabase'
import { getCreatureById, parseCreatureHp, listCreatures } from '../data/creatureLibrary'
import { getEntryChargeMax } from '../lib/chargeRecovery'
import { classifyFlowType, getTotalSteps, getStepLabels, extractDamageFormulas, extractSaveInfo, generatePreviewLines } from '../lib/abilityFlowUtils'
import AbilityStepProgressBar from './AbilityStepProgressBar'

// activeAbilityToChargeValue 从现有文件完整复制（lines 38-86），不做任何修改
export function activeAbilityToChargeValue(ability) {
  let resourceType = 'none'
  let charges = 0
  let consumptionMode = 'fixed'
  let slotLevel = 1
  let maxSlotLevel = 1

  if (ability.cost?.type === 'class_resource') {
    resourceType = ability.cost.resourceKey || 'none'
    charges = ability.cost.amount || 1
  } else if (ability.cost?.type === 'spell_slot') {
    resourceType = 'spell_slot'
    consumptionMode = ability.cost.consumptionMode || 'fixed'
    if (consumptionMode === 'fixed') {
      slotLevel = ability.cost.slotLevel || 1
    } else {
      maxSlotLevel = ability.cost.maxSlotLevel || 1
    }
  }

  const cooldownMap = {
    short_rest: 'short_rest',
    long_rest: 'long_rest',
  }

  return {
    resourceType,
    consumptionMode,
    slotLevel,
    maxSlotLevel,
    charges,
    actionCost: ability.actionType || 'action',
    movementFeet: 0,
    recovery: {
      method: cooldownMap[ability.cooldown] || 'none',
      kind: 'full',
      fixed: 0,
      diceCount: 1,
      diceSides: 6,
      diceBonus: 0,
    },
    effects: Array.isArray(ability.effects) ? ability.effects.map(e => ({
      type: e.type,
      value: e.value || {},
    })) : [],
    isStance: !!ability.isStance,
    itemInventoryId: ability.sourceKey || '',
  }
}

export default function AbilityUseModal({ chargeValue, activeAbility, char, featureName, onConfirm, onClose }) {
  const effectiveChargeValue = chargeValue || (activeAbility ? activeAbilityToChargeValue(activeAbility) : null)
  const norm = useMemo(() => normalizeChargeItemValue(effectiveChargeValue), [effectiveChargeValue])

  // ── 状态机 ──
  const [step, setStep] = useState('prepare')  // prepare | confirm | roll_attack | roll_damage | result
  const [resultLines, setResultLines] = useState(null)
  const [resultFailed, setResultFailed] = useState(false)

  // ── 准备步骤状态 ──
  const [amt, setAmt] = useState(1)
  const maxAmount = useMemo(() => getMaxSpendableAmount(norm, char), [norm, char])
  const [freeSlotLevel, setFreeSlotLevel] = useState(norm.slotLevel || 1)
  const [selectedCreatureId, setSelectedCreatureId] = useState(null)

  // ── 掷骰结果 ──
  const [attackResult, setAttackResult] = useState(null)  // { natural, bonus, total, isCrit, isFumble }
  const [damageData, setDamageData] = useState(null)      // { lines, animParts, animValues }

  // ── 不可撤回提示 ──
  const [showIrreversible, setShowIrreversible] = useState(false)

  // ── 派生值 ──
  const flowType = useMemo(() => classifyFlowType(norm.effects), [norm.effects])
  const totalSteps = getTotalSteps(flowType)
  const stepLabels = useMemo(() => {
    if (flowType === 'attack') return ['准备', '确认', '攻击', '结果']
    const hasDice = norm.effects.some(e =>
      e.type === 'damage' || e.type === 'heal' ||
      (e.type === 'ability' && e.value?.diceCount > 0) ||
      (e.type === 'spell' && ((e.value?.damageDiceCount || 0) > 0 || (e.value?.subEffects || []).some(se => se.type === 'damage' || se.type === 'heal' || (se.type === 'ability' && se.value?.diceCount > 0))))
    )
    return hasDice ? ['准备', '确认', '掷骰', '结果'] : ['准备', '确认', '执行', '结果']
  }, [flowType, norm.effects])

  const isSpellSlot = isFixedSlotConsumption(norm)
  const isFreeSlot = isFreeSlotConsumption(norm)
  const isNone = norm.resourceType === 'none'
  const isClassResource = norm.resourceType !== 'charges' && !isSpellSlot && !isFreeSlot && !isNone
  const resLabel = RESOURCE_TYPE_OPTIONS.find(o => o.value === norm.resourceType)?.label ?? norm.resourceType

  // ── 生物选择 ──
  const needsCreatureSelection = useMemo(() => {
    // 与现有代码相同的逻辑，检查 effects 中是否有需要选择生物的 creature_transform/summon
    const checkEffects = (effs) => effs.some(eff =>
      (eff.type === 'creature_transform' && !eff.value?.creatureId) ||
      (eff.type === 'summon' && eff.value?.preset !== 'stellar_double' && !eff.value?.creatureId)
    )
    if (checkEffects(norm.effects)) return true
    for (const eff of norm.effects) {
      if (eff.type === 'spell' && Array.isArray(eff.value?.subEffects) && checkEffects(eff.value.subEffects)) return true
      if (eff.type === 'random_table') {
        for (const entry of (eff.value?.entries || [])) {
          if (checkEffects(entry.effects || [])) return true
        }
      }
    }
    return false
  }, [norm.effects])

  const availableCreatures = useMemo(() => {
    // 荒野变形：按等级限制 CR
    const hasWildShape = norm.effects.some(eff =>
      (eff.type === 'creature_transform' && eff.value?.wildShapeMode) ||
      (eff.type === 'spell' && (eff.value?.subEffects || []).some(se => se.type === 'creature_transform' && se.value?.wildShapeMode))
    )
    if (hasWildShape) {
      const classes = getCharacterClasses(char)
      const druidLevel = classes.find(c => c.classId === 'druid')?.level || 1
      const maxCR = druidLevel >= 10 ? 3 : druidLevel >= 6 ? 2 : druidLevel >= 4 ? 1 : 0.5
      const allowedTypes = druidLevel >= 10 ? ['beast', 'elemental'] : ['beast']
      return listCreatures().filter(c => {
        const cr = typeof c.cr === 'number' ? c.cr : (c.cr === '1/2' ? 0.5 : 0)
        return cr <= maxCR && allowedTypes.includes(c.type?.toLowerCase())
      })
    }
    return listCreatures()
  }, [norm.effects, char])

  // ── 法术 DC / 攻击加值 ──
  const computeSpellDC = useCallback(() => {
    if (!char) return null
    const totalLevel = getCharacterClasses(char).reduce((s, c) => s + (c.level || 0), 0) || 1
    const L = Math.max(1, Math.min(20, Math.floor(totalLevel)))
    const prof = proficiencyBonus(L)
    const spellAbility = getPrimarySpellcastingAbility(char)
    if (!spellAbility) return null
    const mod = abilityModifier(char.abilities?.[spellAbility] ?? 10)
    return 8 + prof + mod
  }, [char])

  const computeSpellAttack = useCallback(() => {
    if (!char) return null
    const totalLevel = getCharacterClasses(char).reduce((s, c) => s + (c.level || 0), 0) || 1
    const L = Math.max(1, Math.min(20, Math.floor(totalLevel)))
    const prof = proficiencyBonus(L)
    const spellAbility = getPrimarySpellcastingAbility(char)
    if (!spellAbility) return null
    const mod = abilityModifier(char.abilities?.[spellAbility] ?? 10)
    return prof + mod
  }, [char])

  // ── 自由消耗法术位 ──
  const consumeFreeSpellSlot = useCallback((spellSlots, slotLevel) => {
    const currentSlots = { ...(spellSlots || {}) }
    const level = Math.max(1, Math.min(9, Number(slotLevel) || 1))
    for (let r = level; r <= 9; r++) {
      if ((currentSlots[r] || 0) > 0) {
        currentSlots[r] -= 1
        return { newSlots: currentSlots, consumedRing: r, consumed: true, line: `消耗 1 个${r}环法术位（×${level} 倍）` }
      }
    }
    return { newSlots: spellSlots || {}, consumedRing: 0, consumed: false, line: `自由消耗 ${level} 环（无法术位可用）` }
  }, [])

  // ── 资源充足性检查（用于准备步骤禁用按钮） ──
  const resourceError = useMemo(() => {
    if (isSpellSlot) {
      const ring = norm.slotLevel || 1
      if ((char.spellSlots?.[ring] || 0) < amt) return `${ring}环法术位不足`
    } else if (isFreeSlot) {
      const hasSlot = (() => { for (let r = (freeSlotLevel || 1); r <= 9; r++) { if ((char.spellSlots?.[r] || 0) > 0) return true } return false })()
      if (!hasSlot) return '无法术位可用'
    } else if (isClassResource) {
      const res = (char.classResources || []).find(r => r.resourceKey === norm.resourceType)
      if (res && (res.current || 0) < amt) return `${resLabel}不足`
    } else if (!isNone && norm.resourceType === 'charges') {
      const invId = effectiveChargeValue?.itemInventoryId || ''
      const invIdx = invId ? (char.inventory || []).findIndex(e => e.id === invId) : -1
      if (invIdx >= 0) {
        const curCharge = Math.max(0, Number(char.inventory[invIdx].charge) || 0)
        if (curCharge < amt) return '充能不足'
      }
    }
    if (needsCreatureSelection && !selectedCreatureId) return '请选择目标生物'
    return null
  }, [isSpellSlot, isFreeSlot, isClassResource, isNone, norm, char, amt, freeSlotLevel, effectiveChargeValue, needsCreatureSelection, selectedCreatureId, resLabel])

  // ── 步骤导航 ──
  const stepIndex = { prepare: 0, confirm: 1, roll_attack: 2, roll_damage: 3, result: totalSteps - 1 }[step] || 0

  const goNext = () => {
    if (step === 'prepare') setStep('confirm')
    else if (step === 'confirm') {
      if (flowType === 'attack') {
        executeAttackStep()
      } else {
        executeFinalStep()
      }
    }
  }

  const goBack = () => {
    if (step === 'confirm') setStep('prepare')
  }

  // ── 资源消耗（在步骤3入口调用） ──
  const consumeResources = useCallback(() => {
    const patch = {}
    const lines = []

    if (isSpellSlot) {
      const ring = norm.slotLevel || 1
      const currentSlots = { ...(char.spellSlots || {}) }
      const current = currentSlots[ring] || 0
      const newCurrent = Math.max(0, current - amt)
      if (newCurrent !== current) {
        currentSlots[ring] = newCurrent
        patch.spellSlots = currentSlots
      }
      lines.push(`消耗 ${amt} 个${ring}环法术位（剩余 ${newCurrent}）`)
    } else if (isFreeSlot) {
      const { newSlots, consumed, line } = consumeFreeSpellSlot(char.spellSlots, freeSlotLevel || amt)
      if (consumed) patch.spellSlots = newSlots
      lines.push(line)
    } else if (isClassResource) {
      const res = (char.classResources || []).find(r => r.resourceKey === norm.resourceType)
      if (res) {
        patch.classResources = (char.classResources || []).map(r =>
          r.resourceKey !== norm.resourceType ? r : { ...r, current: Math.max(0, r.current - amt) }
        )
      }
      lines.push(`消耗 ${amt} ${resLabel}`)
    } else if (isNone) {
      lines.push('无资源消耗')
    } else {
      // charges
      const invId = effectiveChargeValue?.itemInventoryId || ''
      const invIdx = invId ? (char.inventory || []).findIndex(e => e.id === invId) : -1
      if (invIdx >= 0) {
        const entry = char.inventory[invIdx]
        const currentCharge = Math.max(0, Number(entry.charge) || 0)
        const newCharge = Math.max(0, currentCharge - amt)
        patch.inventory = (char.inventory || []).map((e, i) => i === invIdx ? { ...e, charge: newCharge } : e)
        lines.push(`消耗 ${amt} 充能（剩余 ${newCharge}/${getEntryChargeMax(entry) ?? norm.charges}）`)
      } else {
        lines.push(`消耗 ${amt} 充能（共 ${norm.charges}）`)
      }
    }

    // 荒野变形额外扣减
    const effectsArr = norm.effects || []
    const hasWildShapeTransform = effectsArr.some(eff => {
      if (eff.type === 'creature_transform') return !!eff.value?.wildShapeMode
      if (eff.type === 'spell' && Array.isArray(eff.value?.subEffects)) {
        return eff.value.subEffects.some(s => s.type === 'creature_transform' && !!s.value?.wildShapeMode)
      }
      return false
    })
    if (hasWildShapeTransform) {
      const wsRes = (char.classResources || []).find(r => r.resourceKey === 'wild_shape')
      const costIsWildShape = isClassResource && norm.resourceType === 'wild_shape'
      if (wsRes && !costIsWildShape) {
        patch.classResources = (patch.classResources || char.classResources || []).map(r =>
          r.resourceKey === 'wild_shape' ? { ...r, current: Math.max(0, r.current - 1) } : r
        )
        lines.push('🐾 荒野变形次数 -1')
      }
    }

    return { patch, lines }
  }, [char, norm, amt, isSpellSlot, isFreeSlot, isClassResource, isNone, effectiveChargeValue, freeSlotLevel, resLabel, consumeFreeSpellSlot])

  // ── 攻击步骤（步骤3 for attack flow） ──
  const executeAttackStep = useCallback(() => {
    // 资源消耗
    const { patch: resourcePatch, lines: resourceLines } = consumeResources()

    // 不可撤回提示
    setShowIrreversible(true)
    setTimeout(() => setShowIrreversible(false), 2000)

    // 投 d20
    const d20Roll = rollDice('1d20')
    const atkBonus = computeSpellAttack()
    const natural = d20Roll.total
    const bonus = atkBonus || 0
    const total = natural + bonus
    const isCrit = natural === 20
    const isFumble = natural === 1

    setAttackResult({ natural, bonus, total, isCrit, isFumble, resourcePatch, resourceLines })

    // 骰子动画
    window.dispatchEvent(new CustomEvent('dnd-external-roll', {
      detail: { animate: true, formula: '1d20', diceValues: [natural] }
    }))

    setStep('roll_attack')
  }, [consumeResources, computeSpellAttack])

  // ── 最终执行步骤（步骤3 for save/general flow, 步骤4 for attack flow on hit） ──
  const executeFinalStep = useCallback((attackInfo = null) => {
    let resourcePatch, resourceLines

    if (attackInfo) {
      // 攻击型命中后投伤害：资源已在攻击步骤消耗
      resourcePatch = attackInfo.resourcePatch
      resourceLines = attackInfo.resourceLines
    } else {
      // 豁免型/通用型：在此消耗资源
      const consumed = consumeResources()
      resourcePatch = consumed.patch
      resourceLines = consumed.lines
      setShowIrreversible(true)
      setTimeout(() => setShowIrreversible(false), 2000)
    }

    // 处理所有效果
    const { patch: effectPatch, lines: effectLines, animParts, animValues } = processAllEffects({
      char, norm, amt, featureName, selectedCreatureId, isSpellSlot, isFreeSlot, isClassResource, isNone,
      resLabel, effectiveChargeValue, computeSpellDC, computeSpellAttack,
      skipDamageDice: false,
    })

    // 合并 patch
    const mergedPatch = mergePatches(resourcePatch, effectPatch, char)

    // 架势互斥
    if (norm.isStance && char.activeStance?.buffId) {
      const buffs = Array.isArray(mergedPatch.buffs) ? mergedPatch.buffs : (Array.isArray(char.buffs) ? char.buffs : [])
      mergedPatch.buffs = buffs.filter(b => b.id !== char.activeStance.buffId)
      if (!mergedPatch.activeStance) mergedPatch.activeStance = null
    }

    const allLines = [...resourceLines, ...effectLines]
    if (allLines.length === 0) allLines.push('(未配置效果)')

    // 骰子动画
    if (animParts.length > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dnd-external-roll', {
        detail: { animate: true, formula: animParts.join(','), diceValues: animValues }
      }))
    }

    setResultLines(allLines)
    setStep('result')
    onConfirm(mergedPatch, allLines)
  }, [char, norm, amt, featureName, selectedCreatureId, isSpellSlot, isFreeSlot, isClassResource, isNone, resLabel, effectiveChargeValue, consumeResources, computeSpellDC, computeSpellAttack, onConfirm])

  // ── 攻击型：命中后投伤害 ──
  const handleHitAndRollDamage = useCallback(() => {
    executeFinalStep(attackResult)
  }, [executeFinalStep, attackResult])

  // ── 攻击型：未命中 ──
  const handleMiss = useCallback(() => {
    const { patch: resourcePatch, lines: resourceLines } = attackResult
    const allLines = [...resourceLines, '💨 攻击未命中']

    // 骰子动画已经播放过了（d20），不需要再播

    setResultLines(allLines)
    setStep('result')
    onConfirm(resourcePatch, allLines)
  }, [attackResult, onConfirm])

  // ── JSX 渲染 — 见下方 Step 3/4/5 ──
}
```

- [ ] **Step 2: 验证准备步骤和确认步骤渲染**

启动 dev server (`npm run dev`)，打开一个有主动技能的角色的角色页，点击主动技能的"使用"按钮，验证：
1. 弹窗显示进度条（准备/确认/掷骰/结果 四步）
2. 准备步骤显示资源选择（法术位/充能数量等）
3. 点"下一步"进入确认步骤，显示效果预览
4. 点"返回"回到准备步骤
5. 资源不足时"下一步"按钮禁用

- [ ] **Step 3: 实现 processAllEffects 函数**

在 AbilityUseModal.jsx 内部（组件外部）添加此函数。核心逻辑从现有 handleConfirm 的 Step 2（898-1721行）提取，关键改动：

1. 移除所有 `setPendingHealing`/`setShowHealingConfirm` 等子弹窗调用 → 改为自动处理
2. 移除 `firstPendingConfirm` 逻辑 → 不再需要暂停等待确认
3. 保留所有掷骰和 patch 生成逻辑不变
4. 添加 `skipDamageDice` 选项（攻击型步骤3跳过伤害骰）

```js
function processAllEffects(ctx) {
  const {
    char, norm, amt, featureName, selectedCreatureId,
    isSpellSlot, isFreeSlot, isClassResource, isNone, resLabel,
    effectiveChargeValue, computeSpellDC, computeSpellAttack,
    skipDamageDice = false,
  } = ctx

  const patch = {}
  const lines = []
  const animParts = []
  const animValues = []
  let runningHp = Number(char.hp?.current) || 0

  for (const eff of (norm.effects || [])) {
    const ev = eff.value || {}
    const scaled = computeScaledEffect(ev, amt, isFreeSlot && eff.applyMultiplier !== false)

    // === attack_buff ===
    if (eff.type === 'attack_buff') {
      // 与现有代码 905-935 行相同
      // ...（完整复制现有逻辑）
    }

    // === spell ===
    else if (eff.type === 'spell') {
      const spellName = ev.spellName || '(未命名法术)'

      // 攻击骰（仅在非 skipDamageDice 时显示，因为攻击骰已在步骤3单独投过）
      if (ev.hitResolution === 'spell_attack' && !skipDamageDice) {
        // 注意：攻击型流程的攻击骰已在 executeAttackStep 中投过
        // 这里只在非攻击型流程（如豁免型）中显示攻击骰结果
      } else if (ev.hitResolution && ev.hitResolution !== 'none' && ev.hitResolution !== 'spell_attack') {
        const dc = computeSpellDC()
        const saveLabel = ev.hitResolution.replace('_save', '')
        lines.push(`${spellName} 豁免DC ${dc ?? '?'} (${saveLabel})`)
      } else {
        lines.push(`${spellName}`)
      }

      // 伤害骰
      const scaledDice = scaled.damageDiceCount ?? (ev.damageDiceCount || 0)
      if (scaledDice > 0 && !skipDamageDice) {
        const diceExpr = `${scaledDice}d${ev.damageDiceSides || 6}`
        const { total, rolls } = rollDice(diceExpr)
        const damageType = ev.damageType || ''
        lines.push(`  伤害: ${rolls.join('+')} = ${total}${damageType ? ` ${damageType}` : ''}`)
        animParts.push(diceExpr)
        animValues.push(...rolls.map(Number))
      } else if (scaledDice > 0 && skipDamageDice) {
        // 攻击型步骤3：只显示公式，不掷骰
        const diceExpr = `${scaledDice}d${ev.damageDiceSides || 6}`
        lines.push(`  伤害: ${diceExpr}${ev.damageType ? ` ${ev.damageType}` : ''}`)
      }

      // 子效果处理（与现有代码 967-1203 行相同）
      // ... 完整复制 subEffects 循环逻辑
      // 关键改动：移除 healing/damage 的 firstPendingConfirm 弹窗
      // 治疗直接应用，伤害直接掷骰
    }

    // === 以下分支从现有 handleConfirm 逐一支线复制 ===
    // 每个分支的源行号和改动规则见下方「提取规则表」

    else if (eff.type === 'ability') { /* 复制 1205-1254 行，改动见下表 */ }
    else if (eff.type === 'temp_buff') { /* 复制 1255-1292 行，无改动 */ }
    else if (eff.type === 'creature_transform') { /* 复制 1293-1335 行，无改动 */ }
    else if (eff.type === 'restore_spell_slots') { /* 复制 1336-1372 行，无改动 */ }
    else if (eff.type === 'consume_spell_slot_to_restore_charges') { /* 复制 1373-1400 行，无改动 */ }
    else if (eff.type === 'summon') { /* 复制 1401-1484 行，无改动 */ }
    else if (eff.type === 'custom_logic') { /* 复制 1485-1540 行，改动见下表 */ }
    else if (eff.type === 'damage') { /* 复制 1541-1555 行，加 skipDamageDice 守卫 */ }
    else if (eff.type === 'heal') { /* 复制 1556-1592 行，无改动 */ }
    else if (eff.type === 'shield') { /* 复制 1593-1600 行，无改动 */ }
    else if (eff.type === 'random_table') { /* 复制 1601-1720 行，改动见下表 */ }
  }

  return { patch, lines, animParts, animValues }
}
```

**提取规则表** — 每支从现有 handleConfirm 复制时需要做的机械改动：

| 效果类型 | 源行号 | 改动 |
|---------|--------|------|
| `attack_buff` | 905-935 | **无改动**，原样复制 |
| `spell` | 936-1204 | ① 攻击骰部分（940-966）：仅在 `!skipDamageDice` 时执行（攻击型的攻击骰已在 `executeAttackStep` 投过）；② 子效果循环中的 `ability` 治疗分支（~1095-1115）：移除 `if (!firstPendingConfirm)` 包裹，直接 `patch.hp` 应用；③ 子效果中的 `custom_logic` 治疗（~1140-1160）：同上，移除弹窗调用直接应用；④ 子效果中的 `custom_logic` 伤害无骰子（~1160-1175）：移除 `setShowDamageInput`，改为 `lines.push('⚔️ 请手动确定伤害值')`；⑤ `random_table` 子效果递归调用 `processEffects` 时改为递归调用 `processAllEffects` |
| `ability` | 1205-1254 | 治疗分支（1223-1248）：移除 `if (!firstPendingConfirm) { firstPendingConfirm = ...; setPendingHealing(...); setShowHealingConfirm(true) }`，HP 已在上方应用（1232行），保留 `lines.push` 即可。即：掷骰→计算新HP→patch.hp→显示文字，去掉弹窗部分 |
| `temp_buff` | 1255-1292 | **无改动**，原样复制 |
| `creature_transform` | 1293-1335 | **无改动**，原样复制 |
| `restore_spell_slots` | 1336-1372 | **无改动**，原样复制 |
| `consume_spell_slot_to_restore_charges` | 1373-1400 | **无改动**，原样复制 |
| `summon` | 1401-1484 | **无改动**，原样复制 |
| `custom_logic` | 1485-1540 | ① 治疗分支（1489-1511）：移除 `if (!firstPendingConfirm) { ... setPendingCustomLogic ... setShowCustomLogicConfirm }` 块（1497-1508行），HP 已在上方应用（1494行），保留 `lines.push` 即可；② 伤害无骰子分支（1527-1536）：移除 `if (!firstPendingConfirm) { ... setPendingDamage ... setShowDamageInput }` 块，改为 `lines.push('⚔️ 请手动确定伤害值')` |
| `damage` | 1541-1555 | 添加 `skipDamageDice` 守卫：当 `skipDamageDice` 为 true 时，只 `lines.push` 显示公式文本（如 `⚔️ 伤害: 2d6+3`），不 `rollDice`，不 push `animParts` |
| `heal` | 1556-1592 | **无改动**，原样复制 |
| `shield` | 1593-1600 | **无改动**，原样复制 |
| `random_table` | 1601-1720 | 内部递归调用 `processEffects`（1652行）改为递归调用 `processAllEffects`，并传递相同 ctx 参数。返回值结构相同（`{ patch, lines, animParts, animValues }`），后续合并逻辑（1663-1716行）保持不变 |

- [ ] **Step 4: 实现 mergePatches 辅助函数**

```js
function mergePatches(resourcePatch, effectPatch, char) {
  const merged = { ...resourcePatch }

  // spellSlots: 差值合并（避免覆盖已扣除的值）
  if (effectPatch.spellSlots) {
    const base = merged.spellSlots || { ...(char.spellSlots || {}) }
    const orig = char.spellSlots || {}
    const result = { ...base }
    for (let r = 1; r <= 9; r++) {
      const delta = (effectPatch.spellSlots[r] || 0) - (orig[r] || 0)
      if (delta !== 0) result[r] = Math.max(0, (base[r] || 0) + delta)
    }
    merged.spellSlots = result
  }

  // buffs: 数组合并
  if (effectPatch.buffs) {
    const base = Array.isArray(merged.buffs) ? merged.buffs : (Array.isArray(char.buffs) ? char.buffs : [])
    merged.buffs = [...base, ...effectPatch.buffs.filter(b => !base.some(eb => eb.id === b.id))]
  }

  // hp: 效果 patch 优先（在资源 patch 之后应用）
  if (effectPatch.hp) {
    merged.hp = effectPatch.hp
  }

  // summonedCreatures: 数组合并
  if (effectPatch.summonedCreatures) {
    const base = Array.isArray(merged.summonedCreatures) ? merged.summonedCreatures : (Array.isArray(char.summonedCreatures) ? char.summonedCreatures : [])
    merged.summonedCreatures = [...base, ...effectPatch.summonedCreatures]
  }

  // stellarClones, summonSlots, activeStance, classResources, inventory: 直接覆盖
  for (const key of ['stellarClones', 'summonSlots', 'activeStance', 'classResources', 'inventory']) {
    if (effectPatch[key]) merged[key] = effectPatch[key]
  }
  // resourcePatch 中的 classResources/inventory 也需要合并
  if (resourcePatch.classResources && !effectPatch.classResources) merged.classResources = resourcePatch.classResources
  if (resourcePatch.inventory && !effectPatch.inventory) merged.inventory = resourcePatch.inventory

  return merged
}
```

- [ ] **Step 5: 实现掷骰步骤和结果展示 JSX**

在组件的 return 语句中，根据 step 渲染不同内容：

```jsx
  // ── 结果步骤 ──
  if (step === 'result' && resultLines) {
    return (
      <>
        <div className="fixed inset-0 z-[400] bg-black/60" onClick={onClose} aria-hidden />
        <div className="fixed inset-0 z-[401] flex items-center justify-center p-4">
          <div
            className={`bg-[#1a1f2e] border rounded-lg p-4 max-w-sm w-full shadow-xl ${resultFailed ? 'border-red-500/40' : 'border-dnd-gold/30'}`}
          >
            <AbilityStepProgressBar step={totalSteps - 1} labels={stepLabels} />
            <div className="flex items-center justify-between mt-3 mb-3">
              <h3 className={`text-sm font-bold ${resultFailed ? 'text-red-400' : 'text-dnd-gold-light'}`}>
                {resultFailed ? '释放失败' : '使用结果'}
              </h3>
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-1 text-xs text-gray-300 animate-[fadeIn_200ms_ease-in]">
              {resultLines.map((line, i) => <div key={i}>{line}</div>)}
            </div>
            <div className="mt-4 flex justify-end">
              <button type="button" onClick={onClose}
                className="px-3 py-1.5 rounded-md text-xs bg-dnd-gold/20 text-dnd-gold-light border border-dnd-gold/40 hover:bg-dnd-gold/30 transition-colors"
              >关闭</button>
            </div>
          </div>
        </div>
      </>
    )
  }

  // ── 攻击骰步骤（roll_attack） ──
  if (step === 'roll_attack' && attackResult) {
    return (
      <>
        <div className="fixed inset-0 z-[400] bg-black/60" aria-hidden />
        <div className="fixed inset-0 z-[401] flex items-center justify-center p-4">
          <div className="bg-[#1a1f2e] border border-dnd-gold/30 rounded-lg p-4 max-w-sm w-full shadow-xl">
            <AbilityStepProgressBar step={2} labels={stepLabels} />

            {/* 不可撤回提示 */}
            {showIrreversible && (
              <div className="mt-2 px-3 py-1.5 rounded bg-red-900/30 border border-red-500/30 text-[10px] text-red-400 text-center animate-[fadeOut_2s_ease-in_forwards]">
                资源已消耗，无法撤回
              </div>
            )}

            <div className="mt-4 text-center animate-[fadeIn_200ms_ease-in]">
              <div className="text-xs text-gray-400 mb-2">攻击骰结果</div>
              <div className="text-3xl font-bold text-dnd-gold-light mb-1">{attackResult.natural}</div>
              <div className="text-sm text-gray-400">
                {attackResult.bonus >= 0 ? '+' : ''}{attackResult.bonus} = <span className="text-white font-bold">{attackResult.total}</span>
              </div>
              {attackResult.isCrit && <div className="text-xs text-yellow-400 mt-1">重击！</div>}
              {attackResult.isFumble && <div className="text-xs text-red-400 mt-1">大失败！</div>}
            </div>

            <div className="mt-6 flex gap-3">
              <button type="button" onClick={handleMiss}
                className="flex-1 px-3 py-2 rounded-md text-xs border transition-colors"
                style={{ backgroundColor: 'rgba(230,57,70,0.2)', color: '#e63946', borderColor: 'rgba(230,57,70,0.4)' }}
              >未命中</button>
              <button type="button" onClick={handleHitAndRollDamage}
                className="flex-1 px-3 py-2 rounded-md text-xs font-bold transition-colors"
                style={{ backgroundColor: '#c79a42', color: '#1a1f2e' }}
              >命中，投伤害</button>
            </div>
          </div>
        </div>
      </>
    )
  }

  // ── 准备步骤 + 确认步骤 ──
  return (
    <>
      <div className="fixed inset-0 z-[400] bg-black/60" onClick={step === 'prepare' ? onClose : undefined} aria-hidden />
      <div className="fixed inset-0 z-[401] flex items-center justify-center p-4" onClick={step === 'prepare' ? onClose : undefined}>
        <div
          className="bg-[#1a1f2e] border border-dnd-gold/30 rounded-lg p-4 max-w-sm w-full shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <AbilityStepProgressBar step={stepIndex} labels={stepLabels} />

          <div className="flex items-center justify-between mt-3 mb-3">
            <h3 className="text-sm font-bold text-dnd-gold-light">
              {step === 'prepare' ? `使用 ${featureName}` : '确认释放'}
            </h3>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">
              <X size={14} />
            </button>
          </div>

          {/* 步骤内容：淡入动画 */}
          <div className="animate-[fadeIn_200ms_ease-in]">
            {step === 'prepare' && (
              <PrepareStepContent
                norm={norm} amt={amt} setAmt={setAmt} maxAmount={maxAmount}
                isSpellSlot={isSpellSlot} isFreeSlot={isFreeSlot} isNone={isNone}
                isClassResource={isClassResource} resLabel={resLabel}
                freeSlotLevel={freeSlotLevel} setFreeSlotLevel={setFreeSlotLevel}
                needsCreatureSelection={needsCreatureSelection}
                availableCreatures={availableCreatures}
                selectedCreatureId={selectedCreatureId} setSelectedCreatureId={setSelectedCreatureId}
                resourceError={resourceError}
              />
            )}
            {step === 'confirm' && (
              <ConfirmStepContent
                norm={norm} featureName={featureName}
                flowType={flowType} computeSpellDC={computeSpellDC}
                computeSpellAttack={computeSpellAttack}
                selectedCreatureId={selectedCreatureId}
              />
            )}
          </div>

          {/* 按钮区 */}
          <div className="mt-4 flex gap-3">
            {step === 'prepare' && (
              <>
                <button type="button" onClick={onClose}
                  className="flex-1 px-3 py-2 rounded-md text-xs border border-gray-600 text-gray-400 hover:bg-gray-800 transition-colors"
                >取消</button>
                <button type="button" onClick={() => setStep('confirm')} disabled={!!resourceError}
                  className="flex-1 px-3 py-2 rounded-md text-xs font-bold transition-colors disabled:opacity-40"
                  style={{ backgroundColor: '#c79a42', color: '#1a1f2e' }}
                >下一步</button>
              </>
            )}
            {step === 'confirm' && (
              <>
                <button type="button" onClick={() => setStep('prepare')}
                  className="flex-1 px-3 py-2 rounded-md text-xs border border-gray-600 text-gray-400 hover:bg-gray-800 transition-colors"
                >返回</button>
                <button type="button" onClick={goNext}
                  className="flex-1 px-3 py-2 rounded-md text-xs font-bold transition-colors"
                  style={{ backgroundColor: '#c79a42', color: '#1a1f2e' }}
                >
                  {flowType === 'attack' ? '投攻击骰' : (stepLabels[2] === '掷骰' ? '投伤害骰' : '执行')}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
```

- [ ] **Step 6: 实现 PrepareStepContent 和 ConfirmStepContent 子组件**

在同文件中定义为内部组件或内联 JSX：

**PrepareStepContent** — 从现有确认弹窗 JSX（1857-1960行）迁移：
- 资源类型显示（法术位环位/充能数量/职业资源）
- 自由消耗环位选择下拉
- 充能数量步进器
- 生物选择下拉（如需要）
- 资源不足错误提示

**ConfirmStepContent** — 效果预览：
- 调用 `generatePreviewLines(norm.effects, featureName)` 显示效果列表
- 攻击型：显示攻击加值（`computeSpellAttack()`）和伤害公式（`extractDamageFormulas()`）
- 豁免型：显示豁免 DC（`computeSpellDC()`）和伤害公式
- 通用型：显示效果预览列表

- [ ] **Step 7: 添加 fadeIn/fadeOut CSS 动画**

在组件顶部或 Tailwind 配置中添加：

```css
/* 如果 Tailwind 配置不支持任意 animation，在 AbilityUseModal 内部用 style 标签 */
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
```

或者直接用 Tailwind 的 `transition-opacity` + 状态控制。

- [ ] **Step 8: 完整测试所有流程**

在浏览器中测试以下场景：

1. **攻击型流程**（如法术攻击）：
   - 打开弹窗 → 准备步骤 → 点"下一步"
   - 确认步骤 → 看到攻击加值和伤害公式预览 → 点"投攻击骰"
   - 攻击骰步骤 → 看到 d20 结果 → 点"未命中" → 结果页显示"攻击未命中"
   - 重新测试 → 点"命中，投伤害" → 伤害骰动画 → 结果页显示伤害明细

2. **豁免型流程**（如火球术）：
   - 准备 → 确认（显示 DC 和伤害公式）→ 点"投伤害骰"
   - 掷骰动画 → 结果页显示 DC 和伤害明细

3. **治疗型流程**：
   - 准备 → 确认 → 点"执行"
   - 治疗骰动画 → 结果页显示治疗量

4. **BUFF 型流程**（无骰子）：
   - 准备 → 确认 → 点"执行"
   - 无骰子动画 → 结果页显示 BUFF 效果

5. **资源验证**：
   - 准备步骤资源不足 → "下一步"按钮禁用
   - 确认步骤点"返回" → 资源未消耗
   - 掷骰步骤 → 资源已消耗（检查角色法术位/充能减少）

6. **变身/召唤流程**：
   - 准备步骤选择生物 → 确认 → 执行
   - 验证变身 BUFF 正确安装

- [ ] **Step 9: Commit**

```bash
git add src/components/AbilityUseModal.jsx
git commit -m "feat: complete multi-step ability release flow with state machine"
```

---

### Task 4: 验证 BuffManager 集成 + 清理

**Files:**
- Verify: `src/components/BuffManager.jsx` (lines 946-966)
- Cleanup: `src/components/AbilityUseModal.jsx`

- [ ] **Step 1: 验证 BuffManager 传参兼容**

检查 BuffManager.jsx 中 AbilityUseModal 的调用方式：

```jsx
// BuffManager.jsx ~line 946
<AbilityUseModal
  chargeValue={chargeVal}
  activeAbility={...}
  char={char}
  featureName={...}
  onConfirm={(patch, lines) => { ... }}
  onClose={() => setUseAbilityCard(null)}
/>
```

确认：
1. props 接口不变（chargeValue, activeAbility, char, featureName, onConfirm, onClose）
2. onConfirm 回调签名不变 `(patch, lines)` — patch 结构不变
3. onClose 行为不变 — 任何步骤关闭弹窗都调用 onClose

- [ ] **Step 2: 清理旧代码**

确认以下旧代码已被完全移除：
- `suspendedResultRef` — 不再需要
- `showHealingConfirm` / `pendingHealing` — 治疗自动应用
- `showCustomLogicConfirm` / `pendingCustomLogic` — 自定义逻辑自动处理
- `showDamageInput` / `pendingDamage` — 手动伤害输入已移除
- `showSummonConfirm` / `pendingSummonData` — 召唤自动执行
- `processEffects` 函数 — 已被 processAllEffects 替代
- `handleConfirm` 函数 — 已被状态机替代
- `CreatureSelectorModal` import — 改为内联下拉
- `damageInputRef` — 从未声明的 bug，已移除

- [ ] **Step 3: 检查 CreatureSelectorModal import**

如果不再使用 CreatureSelectorModal 组件（改为内联下拉），移除 import 语句。

- [ ] **Step 4: 最终全量测试**

在浏览器中测试所有主动技能类型：
- 种族主动技能（龙裔吐息、龙族飞翼）
- 职业特性主动技能（至圣斩、魔能斩等）
- 装备充能物品主动技能
- 临时 BUFF 主动技能
- 荒野变形

重点验证：
- 进度条正确显示步骤
- 资源消耗时机正确（掷骰时才消耗）
- 3D 骰子动画正常触发
- 攻击型"问DM"交互正常
- 结果页显示完整明细
- onConfirm patch 结构正确（角色数据正确更新）

- [ ] **Step 5: 最终 Commit**

```bash
git add -A
git commit -m "refactor: remove legacy sub-dialogs and clean up AbilityUseModal"
```

---

## 关键实现注意事项

### 1. processAllEffects 必须完整复制现有逻辑

现有 handleConfirm 的 898-1721 行包含 ~820 行效果处理逻辑，覆盖 15+ 种效果类型。重写时必须逐一复制每个 else if 分支，仅做以下机械改动：

- 移除 `firstPendingConfirm` 相关逻辑
- 移除 `setPendingHealing`/`setShowHealingConfirm` 等子弹窗调用
- 治疗类效果直接应用到 `patch.hp`
- 伤害类效果（无骰子的 custom_logic）显示提示文字而非弹出手动输入框
- 在 `skipDamageDice` 为 true 时，伤害骰只记录公式不掷骰

### 2. 骰子动画协议不变

所有掷骰仍通过 `dnd-external-roll` CustomEvent 触发：
- 攻击骰：`{ formula: '1d20', diceValues: [natural] }`
- 伤害骰：`{ formula: animParts.join(','), diceValues: animValues }`
- 攻击型流程分两次派发（步骤3投d20，步骤4投伤害）

### 3. Patch 合并策略

资源 patch（法术位/充能扣除）和效果 patch（BUFF安装/HP变化/召唤等）需要正确合并：
- `spellSlots`: 差值合并（效果 patch 的恢复量叠加到资源 patch 已扣除的基础上）
- `buffs`: 数组合并
- `hp`: 效果 patch 覆盖（因为 HP 变化在效果处理中累积）
- `summonedCreatures`/`stellarClones`/`summonSlots`: 数组合并
- `classResources`/`inventory`: 注意资源扣除和效果恢复的叠加

### 4. 已知 Bug 修复

重写过程中自然修复的已知问题：
- `damageInputRef` 从未声明的 ReferenceError → 移除手动伤害输入
- `maxAmount` 在 mount 时冻结 → 改为 useMemo 动态计算
- `norm` 每次渲染重复计算 → 改为 useMemo
