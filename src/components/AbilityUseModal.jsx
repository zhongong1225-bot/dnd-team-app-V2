/**
 * AbilityUseModal — 主动卡使用确认弹窗
 *
 * 流程：点击"使用"→ 确认弹窗（资源数量选择 + 效果预览）→ 确认执行 → 显示结果
 * 从 ClassFeatureActions 内联弹窗提取为独立组件。
 */

import { useState, useCallback, useMemo, useRef } from 'react'
import { X } from 'lucide-react'
import {
  normalizeChargeItemValue,
  computeScaledEffect,
  getMaxSpendableAmount,
  resolveAbilityMod,
  RESOURCE_TYPE_OPTIONS,
  scaleStanceModules,
  POKER_SUITS,
  POKER_RANKS,
  POKER_JOKERS,
  POKER_SUIT_LABELS,
  POKER_SUIT_SYMBOLS,
  POKER_SUIT_COLORS,
  getDiceMax,
} from '../lib/chargeItemModel'
import { rollDice } from '../data/weaponDatabase'
import { proficiencyBonus, abilityModifier, calcMaxHP, getHPBuffSum } from '../lib/formulas'
import { getCharacterClasses, getPrimarySpellcastingAbility, getMaxSpellSlotsByRing } from '../data/classDatabase'
import { getCreatureById } from '../data/creatureLibrary'
import CreatureSelectorModal from './CreatureSelectorModal'

/**
 * 评估 HP 公式（支持简单表达式如 "2d8+4" 或角色等级相关公式）
 */
function evalHpFormula(formula, char) {
  if (!formula) return 10
  
  // 如果公式包含 "level" 或 "charLevel"，替换为角色等级
  let expr = formula
  const charLevel = getCharacterClasses(char).reduce((s, c) => s + (c.level || 0), 0) || 1
  
  if (expr.includes('level') || expr.includes('charLevel')) {
    expr = expr.replace(/level|charLevel/gi, String(charLevel))
  }
  
  // 简单掷骰解析（如 "2d8+4"）
  const diceMatch = expr.match(/(\d+)d(\d+)([+-]\d+)?/)
  if (diceMatch) {
    const [, count, sides, mod] = diceMatch
    const diceExpr = `${count}d${sides}${mod || ''}`
    return rollDice(diceExpr).total
  }
  
  // 纯数字
  const num = parseInt(expr, 10)
  return isNaN(num) ? 10 : num
}

/**
 * 将 activeAbility 格式转换为 charge item value 格式，
 * 使其可以走 normalizeChargeItemValue 归一化管线。
 */
function activeAbilityToChargeValue(ability) {
  let resourceType = 'none'
  let charges = 0
  if (ability.cost?.type === 'class_resource') {
    resourceType = ability.cost.resourceKey || 'none'
    charges = ability.cost.amount || 1
  }

  const cooldownMap = {
    short_rest: 'short_rest',
    long_rest: 'long_rest',
  }

  return {
    resourceType,
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
  }
}

export default function AbilityUseModal({ chargeValue, activeAbility, char, featureName, onConfirm, onClose }) {
  // 支持两种输入：chargeValue（充能物品）或 activeAbility（主动技能）
  const effectiveChargeValue = chargeValue || (activeAbility ? activeAbilityToChargeValue(activeAbility) : null)
  const norm = normalizeChargeItemValue(effectiveChargeValue)
  const [amt, setAmt] = useState(1)
  const [maxAmount] = useState(() => getMaxSpendableAmount(norm, char))
  const [resultLines, setResultLines] = useState(null)
  
  // 检查是否需要选择生物（creature_transform 或 summon 效果但没有预置 creatureId）
  const needsCreatureSelection = useMemo(() => {
    const topLevel = norm.effects.some(eff => 
      (eff.type === 'creature_transform' && !eff.value?.creatureId) ||
      (eff.type === 'summon' && eff.value?.preset !== 'stellar_double' && !eff.value?.creatureId)
    )
    if (topLevel) return true
    // Check inside random_table entries
    return norm.effects.some(eff => {
      if (eff.type !== 'random_table') return false
      const entries = eff.value?.entries || []
      return entries.some(entry => 
        (entry.effects || []).some(se => 
          (se.type === 'creature_transform' && !se.value?.creatureId) ||
          (se.type === 'summon' && se.value?.preset !== 'stellar_double' && !se.value?.creatureId)
        )
      )
    })
  }, [norm.effects])
  
  const [showCreatureSelector, setShowCreatureSelector] = useState(false)
  const [selectedCreatureId, setSelectedCreatureId] = useState(null)
  const [showSummonConfirm, setShowSummonConfirm] = useState(false)
  const [pendingSummonData, setPendingSummonData] = useState(null)
  
  // custom_logic 效果二次确认（如慈悲关怀询问是否对自己回满血）
  const [showCustomLogicConfirm, setShowCustomLogicConfirm] = useState(false)
  const [pendingCustomLogic, setPendingCustomLogic] = useState(null)
  
  // custom_logic 伤害效果确认（询问用户造成了多少伤害）
  const [showDamageInput, setShowDamageInput] = useState(false)
  const [pendingDamage, setPendingDamage] = useState(null)
  const damageInputRef = useRef('')
  
  // ability 治疗效果确认（掷骰后询问是否恢复HP）
  const [showHealingConfirm, setShowHealingConfirm] = useState(false)
  const [pendingHealing, setPendingHealing] = useState(null)
  
  // 检查是否有星辰替身效果
  const hasStellarDouble = useMemo(() => {
    const topLevel = norm.effects.some(eff => eff.type === 'summon' && eff.value?.preset === 'stellar_double')
    if (topLevel) return true
    return norm.effects.some(eff => {
      if (eff.type !== 'random_table') return false
      return (eff.value?.entries || []).some(entry =>
        (entry.effects || []).some(se => se.type === 'summon' && se.value?.preset === 'stellar_double')
      )
    })
  }, [norm.effects])
  
  // 计算德鲁伊等级用于 CR 限制
  const druidLevel = useMemo(() => {
    if (!char) return 0
    const classes = getCharacterClasses(char)
    const druidClass = classes.find(c => c.classKey === 'druid')
    return druidClass?.level || 0
  }, [char])
  
  const maxCR = useMemo(() => {
    // 德鲁伊变身 CR 限制：等级/3（向下取整），最低 CR 1/4
    if (druidLevel <= 0) return null
    const cr = Math.max(0.25, Math.floor(druidLevel / 3))
    return cr >= 1 ? cr : 0.25
  }, [druidLevel])
  
  // 处理生物选择
  const handleCreatureSelect = (creature) => {
    setSelectedCreatureId(creature.id)
    setShowCreatureSelector(false)
  }
  
  // 处理召唤确认
  const handleSummonConfirm = () => {
    setShowSummonConfirm(false)
    handleConfirm()
  }

  // 处理 custom_logic 确认（回血）
  const handleCustomLogicConfirm = () => {
    setShowCustomLogicConfirm(false)
    if (!pendingCustomLogic) return
    const patch = { ...(pendingCustomLogic.resourcePatch || {}) }
    const lines = [pendingCustomLogic.resourceLine || '']

    // 应用治疗
    if (pendingCustomLogic.healToFull) {
      const maxHp = pendingCustomLogic.maxHp
      patch.hp = { ...char.hp, current: maxHp }
      lines.push(`💚 生命值恢复至上限 ${maxHp}（+${pendingCustomLogic.healedAmount}）`)
    }

    // 架势互斥
    if (norm.isStance && char.activeStance?.buffId) {
      const buffs = Array.isArray(char.buffs) ? char.buffs : []
      patch.buffs = buffs.filter((b) => b.id !== char.activeStance.buffId)
    }

    setResultLines(lines.filter(Boolean))
    onConfirm(patch, lines.filter(Boolean))
    setPendingCustomLogic(null)
  }

  // 处理 custom_logic 取消（不回血，只消耗资源并显示数值）
  const handleCustomLogicCancel = () => {
    setShowCustomLogicConfirm(false)
    if (!pendingCustomLogic) return
    const patch = { ...(pendingCustomLogic.resourcePatch || {}) }
    const lines = [pendingCustomLogic.resourceLine || '']
    lines.push(`💚 可恢复 ${pendingCustomLogic.healedAmount} 点生命值（未恢复）`)

    if (norm.isStance && char.activeStance?.buffId) {
      const buffs = Array.isArray(char.buffs) ? char.buffs : []
      patch.buffs = buffs.filter((b) => b.id !== char.activeStance.buffId)
    }

    setResultLines(lines.filter(Boolean))
    onConfirm(patch, lines.filter(Boolean))
    setPendingCustomLogic(null)
  }

  // 处理伤害确认（记录伤害数值，消耗资源）
  const handleDamageConfirm = () => {
    setShowDamageInput(false)
    if (!pendingDamage) return
    const dmgVal = parseInt(damageInputRef.current, 10) || 0
    // 支持通用伤害效果：合并已计算的资源消耗 patch 和日志
    const savedPatch = pendingDamage.resourcePatch || {}
    const savedLines = Array.isArray(pendingDamage.resourceLines)
      ? pendingDamage.resourceLines
      : [pendingDamage.resourceLine || '']
    const patch = { ...savedPatch }
    const lines = [...savedLines]
    if (dmgVal > 0) {
      // 应用 HP 扣减
      const currentHp = Number(patch.hp?.current ?? char.hp?.current) || 0
      const newHp = Math.max(0, currentHp - dmgVal)
      patch.hp = { ...(patch.hp || char.hp || {}), current: newHp }
      lines.push(`⚔️ 造成伤害: ${dmgVal}`)
    } else {
      lines.push(`⚔️ 未记录伤害数值`)
    }

    if (norm.isStance && char.activeStance?.buffId) {
      const buffs = Array.isArray(char.buffs) ? char.buffs : []
      patch.buffs = buffs.filter((b) => b.id !== char.activeStance.buffId)
    }

    setResultLines(lines.filter(Boolean))
    onConfirm(patch, lines.filter(Boolean))
    setPendingDamage(null)
    damageInputRef.current = ''
  }

  // 处理伤害取消（不记录伤害，只消耗资源）
  const handleDamageCancel = () => {
    setShowDamageInput(false)
    if (!pendingDamage) return
    const savedPatch = pendingDamage.resourcePatch || {}
    const savedLines = Array.isArray(pendingDamage.resourceLines)
      ? pendingDamage.resourceLines
      : [pendingDamage.resourceLine || '']
    const patch = { ...savedPatch }
    const lines = [...savedLines]

    if (norm.isStance && char.activeStance?.buffId) {
      const buffs = Array.isArray(char.buffs) ? char.buffs : []
      patch.buffs = buffs.filter((b) => b.id !== char.activeStance.buffId)
    }

    setResultLines(lines.filter(Boolean))
    onConfirm(patch, lines.filter(Boolean))
    setPendingDamage(null)
    damageInputRef.current = ''
  }

  // 处理 ability 治疗确认（恢复HP）
  const handleHealingConfirm = () => {
    setShowHealingConfirm(false)
    if (!pendingHealing) return
    const patch = { ...pendingHealing.resourcePatch }
    patch.hp = { ...char.hp, current: pendingHealing.newHp }
    const lines = [...pendingHealing.resultLines]
    lines.push(`💚 治疗: ${pendingHealing.diceExpr} = ${pendingHealing.healAmount}`)

    if (norm.isStance && char.activeStance?.buffId) {
      const buffs = Array.isArray(patch.buffs) ? patch.buffs : (Array.isArray(char.buffs) ? char.buffs : [])
      patch.buffs = buffs.filter((b) => b.id !== char.activeStance.buffId)
    }

    setResultLines(lines.filter(Boolean))
    onConfirm(patch, lines.filter(Boolean))
    setPendingHealing(null)
  }

  // 处理 ability 治疗取消（不恢复HP，只消耗资源）
  const handleHealingCancel = () => {
    setShowHealingConfirm(false)
    if (!pendingHealing) return
    const patch = { ...pendingHealing.resourcePatch }
    const lines = [...pendingHealing.resultLines]
    lines.push(`💚 可治疗 ${pendingHealing.healAmount} 点（未恢复）`)

    if (norm.isStance && char.activeStance?.buffId) {
      const buffs = Array.isArray(patch.buffs) ? patch.buffs : (Array.isArray(char.buffs) ? char.buffs : [])
      patch.buffs = buffs.filter((b) => b.id !== char.activeStance.buffId)
    }

    setResultLines(lines.filter(Boolean))
    onConfirm(patch, lines.filter(Boolean))
    setPendingHealing(null)
  }

  const isSpellSlot = /^spell_slot_[1-9]$/.test(norm.resourceType)
  const isFreeSlot = norm.resourceType === 'spell_slot_free'
  const isNone = norm.resourceType === 'none'
  const isClassResource = norm.resourceType !== 'charges' && !isSpellSlot && !isFreeSlot && !isNone
  const resLabel = RESOURCE_TYPE_OPTIONS.find((o) => o.value === norm.resourceType)?.label ?? norm.resourceType
  const hasScaling = norm.effects.some((e) => e.value?.scalingEnabled)

  /* ── 辅助函数 ── */
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

  /* ── 通用效果处理辅助函数 ── */
  // 处理效果数组，返回 { lines, hpChange, buffAdditions, spellSlotPatch, summonAdditions, stellarData }
  const processEffects = useCallback((effectsArr, ctx) => {
    const {
      char, amt, featureName, selectedCreatureId,
      spellDC, spellAttack,
      isSpellSlot, isClassResource, isNone, isFreeSlot,
      resLabel, norm, runningHpIn,
    } = ctx
    const out = {
      lines: [],
      hpChange: 0,
      buffAdditions: [],
      spellSlotPatch: null,
      summonAdditions: [],
      stellarData: null,
      needsHealConfirm: null,
      needsDamageConfirm: null,
    }
    let runningHp = runningHpIn
    const patch = {}

    for (const eff of effectsArr) {
      const ev = eff.value || {}
      const scaled = computeScaledEffect(ev, amt, isFreeSlot && eff.applyMultiplier !== false)

      if (eff.type === 'spell') {
        const spellName = ev.spellName || '(未命名法术)'
        const scaledDice = scaled.damageDiceCount ?? (ev.damageDiceCount || 0)
        if (ev.hitResolution === 'spell_attack') {
          const atkBonus = spellAttack
          const d20 = rollDice('1d20')
          out.lines.push(`${spellName} 攻击: d20=${d20.total}${atkBonus != null ? `${atkBonus >= 0 ? '+' : ''}${atkBonus}` : ''} = ${d20.total + (atkBonus || 0)}`)
        } else if (ev.hitResolution && ev.hitResolution !== 'none') {
          const dc = spellDC
          const saveLabel = ev.hitResolution.replace('_save', '')
          out.lines.push(`${spellName} 豁免DC ${dc ?? '?'} (${saveLabel})`)
        } else {
          out.lines.push(spellName)
        }
        if (scaledDice > 0) {
          const diceExpr = `${scaledDice}d${ev.damageDiceSides || 6}`
          const { total, rolls } = rollDice(diceExpr)
          out.lines.push(`  伤害: ${rolls.join('+')} = ${total}${ev.damageType ? ` ${ev.damageType}` : ''}`)
        }
        const subEffects = Array.isArray(ev.subEffects) ? ev.subEffects : []
        for (const subEff of subEffects) {
          const sv = subEff.value || {}
          const sScaled = computeScaledEffect(sv, amt, isFreeSlot && subEff.applyMultiplier !== false)
          if (subEff.type === 'ability') {
            const sDice = sScaled.diceCount ?? (sv.diceCount || 0)
            const sFlat = sScaled.flatBonus ?? 0
            const sSides = sv.diceSides || 10
            const sMod = resolveAbilityMod(sv.abilityMod, char)
            const sTotalMod = sMod + sFlat
            if (sDice > 0) {
              let sDiceExpr = `${sDice}d${sSides}`
              if (sTotalMod > 0) sDiceExpr += `+${sTotalMod}`
              else if (sTotalMod < 0) sDiceExpr += `${sTotalMod}`
              const { total: sTotal, rolls: sRolls } = rollDice(sDiceExpr)
              const sIsHeal = sv.resultType !== 'damage'
              out.lines.push(`  ${sIsHeal ? '治疗' : '伤害'}: ${sRolls.join('+')} = ${sTotal}`)
              if (sIsHeal && sTotal > 0) {
                const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
                const newHp = Math.min(maxHp, runningHp + sTotal)
                patch.hp = { ...char.hp, current: newHp }
                runningHp = newHp
                out.hpChange += (newHp - (char.hp?.current || 0))
              }
            } else if (sTotalMod !== 0) {
              const sIsHeal = sv.resultType !== 'damage'
              out.lines.push(`  ${sIsHeal ? '治疗' : '伤害'}: ${sTotalMod > 0 ? '+' : ''}${sTotalMod}`)
              if (sIsHeal && sTotalMod > 0) {
                const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
                const newHp = Math.min(maxHp, runningHp + sTotalMod)
                patch.hp = { ...char.hp, current: newHp }
                runningHp = newHp
              }
            }
          } else if (subEff.type === 'temp_buff') {
            const buffName = (sv.buffName || '临时BUFF').trim()
            const modules = Array.isArray(sv.modules) ? sv.modules : []
            if (modules.length > 0) {
              const newBuff = { id: String(Date.now()) + '_' + Math.random().toString(36).slice(2, 7), source: featureName || buffName, effects: modules.map(m => ({ ...m })), enabled: true, sourceKind: 'temporary' }
              out.buffAdditions.push(newBuff)
              out.lines.push(`  ✨ 临时BUFF: ${buffName}`)
            }
          } else if (subEff.type === 'creature_transform') {
            const cId = selectedCreatureId || sv.creatureId
            const creature = cId ? getCreatureById(cId) : null
            const tb = { id: String(Date.now()) + '_' + Math.random().toString(36).slice(2, 7), source: `变身: ${creature?.name || '未知'}`, effects: [{ effectType: 'creature_transform', value: { creatureId: cId, acMode: sv.acMode || 'replace', acFormulaBase: sv.acFormulaBase || 13, acFormulaAbility: sv.acFormulaAbility || '', hpMode: sv.hpMode || 'replace', hpFormula: sv.hpFormula || null, keepAbilities: Array.isArray(sv.keepAbilities) ? sv.keepAbilities : [], resourceCostType: sv.resourceCostType || '', resourceCostValue: Number(sv.resourceCostValue) || 1, wildShapeMode: !!sv.wildShapeMode, wildShapeSubclass: sv.wildShapeSubclass || 'regular' } }], enabled: true, sourceKind: 'temporary', duration: sv.duration || { type: 'hours', value: 1 } }
            out.buffAdditions.push(tb)
            out.lines.push(`  🐾 变身: ${creature?.name || '(未选择)'}`)
          } else if (subEff.type === 'summon') {
            if (sv.preset === 'stellar_double') {
              const tempHp = Number(char.hp?.temp) || 0
              const realHp = Math.max(0, runningHp - tempHp)
              const hpCost = Math.floor(realHp / 2)
              const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
              const cloneHp = Math.floor(maxHp / 2)
              runningHp = Math.max(0, runningHp - hpCost)
              out.stellarData = { hpCost, cloneHp, maxHp }
              out.lines.push(`  ⭐ 星辰替身：消耗 ${hpCost} HP`)
            } else {
              const cId = selectedCreatureId || sv.creatureId
              const creature = cId ? getCreatureById(cId) : null
              if (creature) {
                const sHp = creature.hp?.formula ? evalHpFormula(creature.hp.formula, char) : (creature.hp?.max || 10)
                out.summonAdditions.push({ id: 'summon_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), name: creature.name, type: 'summon', creatureId: cId, hp: { current: sHp, max: sHp }, ac: creature.ac || 10, createdAt: Date.now() })
                out.lines.push(`  📦 召唤: ${creature.name}`)
              }
            }
          } else if (subEff.type === 'restore_spell_slots') {
            const maxSlots = getMaxSpellSlotsByRing(char)
            const curSlots = { ...(char.spellSlots || {}) }
            const newSlots = { ...curSlots }
            if (sv.mode === 'multi') {
              const maxRing = sv.maxRing || 3
              for (let r = 1; r <= maxRing; r++) { const m = maxSlots[r] || 0; if (m > 0) newSlots[r] = m }
            } else {
              const tRing = sv.ringLevel || 1
              let cnt = sScaled.slotsCount || 1
              for (let r = tRing; r >= 1 && cnt > 0; r--) { const m = maxSlots[r] || 0; const c = curSlots[r] || 0; const can = Math.min(cnt, m - c); if (can > 0) { newSlots[r] = c + can; cnt -= can } }
            }
            if (JSON.stringify(newSlots) !== JSON.stringify(curSlots)) {
              out.spellSlotPatch = newSlots
              const restored = []; for (let r = 1; r <= 9; r++) { const d = (newSlots[r] || 0) - (curSlots[r] || 0); if (d > 0) restored.push(`${r}环+${d}`) }
              out.lines.push(`  🔮 恢复法术位: ${restored.join(', ')}`)
            }
          }
        }
      } else if (eff.type === 'ability') {
        const dice = scaled.diceCount ?? (ev.diceCount || 0)
        const flat = scaled.flatBonus ?? 0
        const sides = ev.diceSides || 10
        const mod = resolveAbilityMod(ev.abilityMod, char)
        const totalMod = mod + flat
        let expr = ''
        if (dice > 0) {
          expr = `${dice}d${sides}`
          if (totalMod > 0) expr += `+${totalMod}`
          else if (totalMod < 0) expr += `${totalMod}`
        }
        const isHeal = ev.resultType !== 'damage'
        if (dice > 0) {
          const { total, rolls } = rollDice(expr)
          out.lines.push(`${ev.text || '(能力)'}: ${rolls.join('+')} = ${total} ${isHeal ? '治疗' : '伤害'}`)
          if (isHeal && total > 0) {
            const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
            const newHp = Math.min(maxHp, runningHp + total)
            patch.hp = { ...char.hp, current: newHp }
            runningHp = newHp
          } else if (!isHeal && total > 0) {
            runningHp = Math.max(0, runningHp - total)
          }
        } else if (totalMod !== 0) {
          out.lines.push(`${ev.text || '(能力)'}: ${totalMod > 0 ? '+' : ''}${totalMod} ${isHeal ? '治疗' : '伤害'}`)
          if (isHeal && totalMod > 0) {
            const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
            const newHp = Math.min(maxHp, runningHp + totalMod)
            patch.hp = { ...char.hp, current: newHp }
            runningHp = newHp
          }
        }
      } else if (eff.type === 'temp_buff') {
        const buffName = (ev.buffName || '临时BUFF').trim()
        const modules = Array.isArray(ev.modules) ? ev.modules : []
        if (modules.length > 0) {
          const newBuff = { id: String(Date.now()) + '_' + Math.random().toString(36).slice(2, 7), source: featureName || buffName, effects: modules.map(m => ({ ...m })), enabled: true, sourceKind: 'temporary' }
          out.buffAdditions.push(newBuff)
          out.lines.push(`✨ 安装临时BUFF: ${buffName}（${modules.length}个效果）`)
        } else {
          out.lines.push(`⚠️ ${buffName}：无效果模块`)
        }
      } else if (eff.type === 'creature_transform') {
        const finalCreatureId = selectedCreatureId || ev.creatureId
        const creature = finalCreatureId ? getCreatureById(finalCreatureId) : null
        const transformBuff = { id: String(Date.now()) + '_' + Math.random().toString(36).slice(2, 7), source: `变身: ${creature?.name || '未知生物'}`, effects: [{ effectType: 'creature_transform', value: { creatureId: finalCreatureId, acMode: ev.acMode || 'replace', acFormulaBase: ev.acFormulaBase || 13, acFormulaAbility: ev.acFormulaAbility || '', hpMode: ev.hpMode || 'replace', hpFormula: ev.hpFormula || null, keepAbilities: Array.isArray(ev.keepAbilities) ? ev.keepAbilities : [], resourceCostType: ev.resourceCostType || '', resourceCostValue: Number(ev.resourceCostValue) || 1, wildShapeMode: !!ev.wildShapeMode, wildShapeSubclass: ev.wildShapeSubclass || 'regular' } }], enabled: true, sourceKind: 'temporary', duration: ev.duration || { type: 'hours', value: 1 } }
        out.buffAdditions.push(transformBuff)
        const durType = typeof transformBuff.duration === 'object' ? transformBuff.duration.type : 'custom'
        let durHint = '短休后结束'
        if (durType === 'until_long_rest') durHint = '长休后结束'
        else if (durType === 'until_dawn') durHint = '黎明后结束'
        else if (durType === 'hours' && transformBuff.duration.value >= 8) durHint = '长休后结束'
        out.lines.push(`🐾 变身: ${creature?.name || '(未选择生物)'}（${durHint}）`)
      } else if (eff.type === 'restore_spell_slots') {
        const maxSlots = getMaxSpellSlotsByRing(char)
        const currentSlots = { ...(char.spellSlots || {}) }
        const newSlots = { ...currentSlots }
        if (ev.mode === 'multi') {
          const maxRing = ev.maxRing || 3
          const effectiveMaxRing = (amt === 1) ? (ev.singleCostRing || maxRing) : maxRing
          for (let ring = 1; ring <= effectiveMaxRing; ring++) { const m = maxSlots[ring] || 0; if (m > 0) newSlots[ring] = m }
        } else {
          const targetRing = ev.ringLevel || 1
          let slotsToRestore = scaled.slotsCount || 1
          for (let ring = targetRing; ring >= 1 && slotsToRestore > 0; ring--) { const m = maxSlots[ring] || 0; const c = currentSlots[ring] || 0; const can = Math.min(slotsToRestore, m - c); if (can > 0) { newSlots[ring] = c + can; slotsToRestore -= can } }
        }
        if (JSON.stringify(newSlots) !== JSON.stringify(currentSlots)) {
          out.spellSlotPatch = newSlots
          const restored = []; for (let r = 1; r <= 9; r++) { const d = (newSlots[r] || 0) - (currentSlots[r] || 0); if (d > 0) restored.push(`${r}环+${d}`) }
          out.lines.push(`🔮 恢复法术位: ${restored.join(', ')}`)
        } else {
          out.lines.push(`🔮 法术位已满，无需恢复`)
        }
      } else if (eff.type === 'summon') {
        if (ev.preset === 'stellar_double') {
          const tempHp = Number(char.hp?.temp) || 0
          const realCurrentHp = Math.max(0, runningHp - tempHp)
          const hpCost = Math.floor(realCurrentHp / 2)
          const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
          const cloneHp = Math.floor(maxHp / 2)
          runningHp = Math.max(0, runningHp - hpCost)
          out.stellarData = { hpCost, cloneHp, maxHp }
          out.lines.push(`⭐ 星辰替身：消耗 ${hpCost} HP，创建分身（${cloneHp}/${cloneHp}）`)
        } else {
          const finalCreatureId = selectedCreatureId || ev.creatureId
          const creature = finalCreatureId ? getCreatureById(finalCreatureId) : null
          if (!creature) { out.lines.push('⚠️ 召唤失败：未选择生物'); continue }
          const summonHp = creature.hp?.formula ? evalHpFormula(creature.hp.formula, char) : (creature.hp?.max || 10)
          out.summonAdditions.push({ id: 'summon_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), name: creature.name, type: 'summon', creatureId: finalCreatureId, hp: { current: summonHp, max: summonHp }, ac: creature.ac || 10, createdAt: Date.now() })
          out.lines.push(`📦 召唤: ${creature.name}（${summonHp}/${summonHp} HP, AC ${creature.ac || 10}）`)
        }
      } else if (eff.type === 'custom_logic') {
        const desc = ev.description || ev.title || ''
        const isHealing = (desc.includes('恢复') && (desc.includes('HP') || desc.includes('生命') || desc.includes('血'))) || desc.includes('治疗') || desc.includes('回血') || desc.includes('回满')
        if (isHealing) {
          const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
          const healedAmount = maxHp - runningHp
          if (healedAmount > 0) {
            out.needsHealConfirm = { title: ev.title || '自定义效果', description: desc, maxHp, healedAmount, runningHp }
            return out
          } else {
            out.lines.push(`💚 已满血，无需治疗`)
          }
        } else {
          // 检测伤害效果并自动掷骰
          const isDamage = desc.includes('伤害') || desc.includes('damage')
            || (desc.includes('造成') && (desc.includes('点') || desc.includes('HP')))
          const diceCount = ev.damageDiceCount || 0
          const diceSides = ev.damageDiceSides || 6
          if (isDamage && diceCount > 0) {
            const diceExpr = `${diceCount}d${diceSides}`
            const { total, rolls } = rollDice(diceExpr)
            out.lines.push(`⚔️ ${ev.title || '伤害'}: ${rolls.join('+')} = ${total}`)
          } else {
            out.lines.push(`✨ ${desc}`)
          }
        }
      }
    }

    // Merge accumulated data
    if (patch.hp) out.hpChange = (patch.hp.current || 0) - (char.hp?.current || 0)
    return out
  }, [char])

  /* ── 执行效果 ── */
  const handleConfirm = () => {
    const patch = {}
    const lines = []

    // 1. 资源消耗
    if (isSpellSlot) {
      const ring = parseInt(norm.resourceType.replace('spell_slot_', ''), 10)
      const currentSlots = { ...(char.spellSlots || {}) }
      const current = currentSlots[ring] || 0
      const newCurrent = Math.max(0, current - amt)
      if (newCurrent !== current) {
        currentSlots[ring] = newCurrent
        patch.spellSlots = currentSlots
      }
      lines.push(`消耗 ${amt} 个${ring}环法术位（剩余 ${newCurrent}）`)
    } else if (isFreeSlot) {
      // 自由消耗：消耗 1 个 amt 环位的法术位
      const currentSlots = { ...(char.spellSlots || {}) }
      let consumed = false
      // 优先消耗精确环位，否则从最低可用环位开始
      for (let r = amt; r <= 9; r++) {
        if (currentSlots[r] > 0) {
          currentSlots[r] -= 1
          consumed = true
          lines.push(`消耗 1 个${r}环法术位（×${amt} 倍）`)
          break
        }
      }
      if (!consumed) lines.push(`自由消耗 ${amt} 环（无法术位可用）`)
      patch.spellSlots = currentSlots
    } else if (isClassResource) {
      const res = (char.classResources || []).find((r) => r.resourceKey === norm.resourceType)
      if (res) {
        const newResources = (char.classResources || []).map((r) => {
          if (r.resourceKey !== norm.resourceType) return r
          return { ...r, current: Math.max(0, r.current - amt) }
        })
        patch.classResources = newResources
      }
      lines.push(`消耗 ${amt} ${resLabel}`)
    } else if (isNone) {
      lines.push('无资源消耗')
    } else {
      lines.push(`消耗 ${amt} 充能（共 ${norm.charges}）`)
    }

    // 2. 逐个处理效果
    let runningHp = Number(char.hp?.current) || 0  // 累积 HP 变化，防止多效果互相覆盖
    for (const eff of (norm.effects || [])) {
      const ev = eff.value || {}
      const scaled = computeScaledEffect(ev, amt, isFreeSlot && eff.applyMultiplier !== false)

      if (eff.type === 'spell') {
        const spellName = ev.spellName || '(未命名法术)'
        const scaledDice = scaled.damageDiceCount ?? (ev.damageDiceCount || 0)

        if (ev.hitResolution === 'spell_attack') {
          const atkBonus = computeSpellAttack()
          const d20 = rollDice('1d20')
          lines.push(
            `${spellName} 攻击: d20=${d20.total}${atkBonus != null ? `${atkBonus >= 0 ? '+' : ''}${atkBonus}` : ''} = ${d20.total + (atkBonus || 0)}`,
          )
        } else if (ev.hitResolution && ev.hitResolution !== 'none') {
          const dc = computeSpellDC()
          const saveLabel = ev.hitResolution.replace('_save', '')
          lines.push(`${spellName} 豁免DC ${dc ?? '?'} (${saveLabel})`)
        } else {
          lines.push(`${spellName}`)
        }

        if (scaledDice > 0) {
          const diceExpr = `${scaledDice}d${ev.damageDiceSides || 6}`
          const { total, rolls } = rollDice(diceExpr)
          const damageType = ev.damageType || ''
          lines.push(`  伤害: ${rolls.join('+')} = ${total}${damageType ? ` ${damageType}` : ''}`)
        }

        // 处理法术子效果
        const subEffects = Array.isArray(ev.subEffects) ? ev.subEffects : []
        for (const subEff of subEffects) {
          const sv = subEff.value || {}
          const sScaled = computeScaledEffect(sv, amt, isFreeSlot && subEff.applyMultiplier !== false)

          if (subEff.type === 'ability') {
            const sDice = sScaled.diceCount ?? (sv.diceCount || 0)
            const sFlat = sScaled.flatBonus ?? 0
            const sSides = sv.diceSides || 10
            const sMod = resolveAbilityMod(sv.abilityMod, char)
            const sTotalMod = sMod + sFlat
            if (sDice > 0) {
              let sDiceExpr = `${sDice}d${sSides}`
              if (sTotalMod > 0) sDiceExpr += `+${sTotalMod}`
              else if (sTotalMod < 0) sDiceExpr += `${sTotalMod}`
              const { total: sTotal, rolls: sRolls } = rollDice(sDiceExpr)
              const sIsHeal = sv.resultType !== 'damage'
              const sModLabel = sTotalMod !== 0 ? (sTotalMod > 0 ? `+${sTotalMod}` : `${sTotalMod}`) : ''
              const sDiceStr = sRolls.length > 0 ? sRolls.join('+') : `${sDice}d${sSides}`

              if (sIsHeal) {
                const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
                const sNewHp = Math.min(maxHp, runningHp + sTotal)
                const healAmt = sNewHp - runningHp
                const resourcePatch = {}
                if (isSpellSlot) {
                  const ring = parseInt(norm.resourceType.replace('spell_slot_', ''), 10)
                  const cs = { ...(char.spellSlots || {}) }
                  const c = cs[ring] || 0; const nc = Math.max(0, c - amt)
                  if (nc !== c) { cs[ring] = nc; resourcePatch.spellSlots = cs }
                } else if (isFreeSlot) {
                  const cs = { ...(char.spellSlots || {}) }
                  for (let r = amt; r <= 9; r++) {
                    if (cs[r] > 0) { cs[r] -= 1; break }
                  }
                  resourcePatch.spellSlots = cs
                } else if (isClassResource) {
                  resourcePatch.classResources = (char.classResources || []).map((r) => {
                    if (r.resourceKey !== norm.resourceType) return r
                    return { ...r, current: Math.max(0, r.current - amt) }
                  })
                }
                if (healAmt > 0) {
                  setPendingHealing({
                    healAmount: sTotal, newHp: sNewHp, maxHp, currentHp: runningHp,
                    diceExpr: `${sDiceStr}${sModLabel}`, resourcePatch, resultLines: [...lines],
                  })
                  setShowHealingConfirm(true)
                  return
                } else {
                  lines.push(`  💚 治疗: ${sDiceStr}${sModLabel} = ${sTotal}（已满血）`)
                }
              } else {
                lines.push(`  ⚔️ 伤害: ${sDiceStr}${sModLabel} = ${sTotal}`)
              }
            }
          } else if (subEff.type === 'temp_buff') {
            const buffName = (sv.buffName || '临时BUFF').trim()
            const modules = Array.isArray(sv.modules) ? sv.modules : []
            if (modules.length > 0) {
              const newBuff = {
                id: String(Date.now()) + '_' + Math.random().toString(36).slice(2, 7),
                source: featureName || buffName,
                effects: modules.map((m) => ({ ...m })),
                enabled: true, sourceKind: 'temporary',
              }
              const currentBuffs = Array.isArray(char.buffs) ? char.buffs : []
              patch.buffs = [...(patch.buffs || currentBuffs), newBuff]
              lines.push(`  ✨ 安装临时BUFF: ${buffName}（${modules.length}个效果）`)
            }
          } else if (subEff.type === 'creature_transform') {
            const finalCreatureId = selectedCreatureId || sv.creatureId
            const creature = finalCreatureId ? getCreatureById(finalCreatureId) : null
            const transformBuff = {
              id: String(Date.now()) + '_' + Math.random().toString(36).slice(2, 7),
              source: `变身: ${creature?.name || '未知生物'}`,
              effects: [{ effectType: 'creature_transform', value: {
                creatureId: finalCreatureId, acMode: sv.acMode || 'replace',
                acFormulaBase: sv.acFormulaBase || 13, acFormulaAbility: sv.acFormulaAbility || '',
                hpMode: sv.hpMode || 'replace', hpFormula: sv.hpFormula || null,
                keepAbilities: Array.isArray(sv.keepAbilities) ? sv.keepAbilities : [],
                resourceCostType: sv.resourceCostType || '', resourceCostValue: Number(sv.resourceCostValue) || 1,
                wildShapeMode: !!sv.wildShapeMode, wildShapeSubclass: sv.wildShapeSubclass || 'regular',
              }}],
              enabled: true, sourceKind: 'temporary',
              duration: sv.duration || { type: 'hours', value: 1 },
            }
            const currentBuffs = Array.isArray(char.buffs) ? char.buffs : []
            patch.buffs = [...(patch.buffs || currentBuffs), transformBuff]
            lines.push(`  🐾 变身: ${creature?.name || '(未选择生物)'}`)
          } else if (subEff.type === 'summon' && sv.preset === 'stellar_double') {
            const tempHp = Number(char.hp?.temp) || 0
            const realHp = Math.max(0, runningHp - tempHp)
            const hpCost = Math.floor(realHp / 2)
            const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
            const cloneHp = Math.floor(maxHp / 2)
            const newHp = Math.max(0, runningHp - hpCost)
            patch.hp = { ...char.hp, current: newHp }
            runningHp = newHp
            const cloneId = 'stellar_' + Date.now()
            const cloneData = { id: 'stellar_double_' + Date.now(), name: `${char.name}的分身`, type: 'stellar_double', hp: { current: cloneHp, max: cloneHp }, createdAt: Date.now() }
            patch.summonedCreatures = [...(char.summonedCreatures || []), cloneData]
            patch.stellarClones = [...(char.stellarClones || []), { id: cloneId, name: '星辰分身', hp: { current: cloneHp, max: cloneHp } }]
            const cs2 = Array.isArray(char.summonSlots) ? char.summonSlots : [null, null, null, null]
            const slotsCopy = cs2.slice(0, 4); const ei = slotsCopy.findIndex((s) => s == null)
            if (ei >= 0) slotsCopy[ei] = { type: 'stellar', id: cloneId }
            patch.summonSlots = slotsCopy
            lines.push(`  ⭐ 星辰替身：消耗 ${hpCost} HP，创建分身（${cloneHp}/${cloneHp} HP）`)
          } else if (subEff.type === 'summon') {
            const fcId = selectedCreatureId || sv.creatureId
            const creature = fcId ? getCreatureById(fcId) : null
            if (creature) {
              const sHp = creature.hp?.formula ? evalHpFormula(creature.hp.formula, char) : creature.hp?.max || 10
              const summonData = { id: 'summon_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), name: creature.name, type: 'summon', creatureId: fcId, hp: { current: sHp, max: sHp }, ac: creature.ac || 10, createdAt: Date.now() }
              patch.summonedCreatures = [...(char.summonedCreatures || []), summonData]
              lines.push(`  📦 召唤: ${creature.name}（${sHp}/${sHp} HP, AC ${creature.ac || 10}）`)
            }
          } else if (subEff.type === 'restore_spell_slots') {
            const maxSlots2 = getMaxSpellSlotsByRing(char)
            const currentSlots2 = { ...(char.spellSlots || {}) }
            const newSlots = { ...currentSlots2 }
            if (sv.mode === 'multi') {
              const maxRing = sv.maxRing || 3
              for (let ring = 1; ring <= maxRing; ring++) { const max = maxSlots2[ring] || 0; if (max > 0) newSlots[ring] = max }
            } else {
              const targetRing = sv.ringLevel || 1
              let toRestore = sScaled.slotsCount || 1
              for (let ring = targetRing; ring >= 1 && toRestore > 0; ring--) {
                const max = maxSlots2[ring] || 0; const cur = currentSlots2[ring] || 0
                const can = Math.min(toRestore, max - cur)
                if (can > 0) { newSlots[ring] = cur + can; toRestore -= can }
              }
            }
            if (JSON.stringify(newSlots) !== JSON.stringify(currentSlots2)) {
              patch.spellSlots = newSlots
              const restored = []
              for (let r = 1; r <= 9; r++) { const d = (newSlots[r] || 0) - (currentSlots2[r] || 0); if (d > 0) restored.push(`${r}环+${d}`) }
              lines.push(`  🔮 恢复法术位: ${restored.join(', ')}`)
            }
          }
        }
      } else if (eff.type === 'ability') {
        const scaledDice = scaled.diceCount ?? (ev.diceCount || 0)
        const scaledFlat = scaled.flatBonus ?? 0
        const sides = ev.diceSides || 10
        const mod = resolveAbilityMod(ev.abilityMod, char)
        const totalMod = mod + scaledFlat

        if (scaledDice > 0) {
          let diceExpr = `${scaledDice}d${sides}`
          if (totalMod > 0) diceExpr += `+${totalMod}`
          else if (totalMod < 0) diceExpr += `${totalMod}`
          const { total, rolls } = rollDice(diceExpr)
          const isHeal = ev.resultType !== 'damage'
          const modLabel = totalMod !== 0 ? (totalMod > 0 ? `+${totalMod}` : `${totalMod}`) : ''
          const diceStr = rolls.length > 0 ? rolls.join('+') : `${scaledDice}d${sides}`

          if (isHeal) {
            const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
            const newHp = Math.min(maxHp, runningHp + total)
            const modLabel2 = totalMod !== 0 ? (totalMod > 0 ? `+${totalMod}` : `${totalMod}`) : ''
            const diceStr2 = rolls.length > 0 ? rolls.join('+') : `${scaledDice}d${sides}`
            const healAmount = newHp - runningHp

            // 预计算资源消耗
            const resourcePatch = {}
            if (isSpellSlot) {
              const ring = parseInt(norm.resourceType.replace('spell_slot_', ''), 10)
              const currentSlots = { ...(char.spellSlots || {}) }
              const current = currentSlots[ring] || 0
              const newCurrent = Math.max(0, current - amt)
              if (newCurrent !== current) { currentSlots[ring] = newCurrent; resourcePatch.spellSlots = currentSlots }
            } else if (isFreeSlot) {
              const cs = { ...(char.spellSlots || {}) }
              for (let r = amt; r <= 9; r++) { if (cs[r] > 0) { cs[r] -= 1; break } }
              resourcePatch.spellSlots = cs
            } else if (isClassResource) {
              resourcePatch.classResources = (char.classResources || []).map((r) => {
                if (r.resourceKey !== norm.resourceType) return r
                return { ...r, current: Math.max(0, r.current - amt) }
              })
            }
            const resultLinesSoFar = [...lines]

            if (healAmount > 0) {
              setPendingHealing({
                healAmount: total,
                newHp,
                maxHp,
                currentHp: runningHp,
                diceExpr: `${diceStr2}${modLabel2}`,
                resourcePatch,
                resultLines: resultLinesSoFar,
              })
              setShowHealingConfirm(true)
              return
            } else {
              lines.push(`💚 治疗: ${diceStr2}${modLabel2} = ${total}（已满血）`)
            }
          } else {
            const newHp = Math.max(0, runningHp - total)
            patch.hp = { ...char.hp, current: newHp }
            runningHp = newHp
            lines.push(`⚔️ 伤害: ${diceStr}${modLabel} = ${total}`)
          }
        } else if (ev.text) {
          lines.push(ev.text)
        }
      } else if (eff.type === 'temp_buff') {
        const buffName = (ev.buffName || '临时BUFF').trim()
        const modules = Array.isArray(ev.modules) ? ev.modules : []
        if (modules.length > 0) {
          if (norm.isStance) {
            // ── 架势模式：替换旧架势，缩放模块 ──
            const stanceFactor = isSpellSlot
              ? parseInt(norm.resourceType.replace('spell_slot_', ''), 10)
              : amt
            const scaledModules = scaleStanceModules(modules, stanceFactor)
            const buffId = 'stance_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
            const newBuff = {
              id: buffId,
              source: featureName || buffName,
              effects: scaledModules.map((m) => ({ ...m })),
              enabled: true,
              sourceKind: 'stance',
            }
            const currentBuffs = Array.isArray(char.buffs) ? char.buffs : []
            patch.buffs = [...(patch.buffs || currentBuffs), newBuff]
            patch.activeStance = { buffId, name: buffName, slotLevel: stanceFactor }
            lines.push(`🏋️ 架势激活: ${buffName}（${scaledModules.length}个效果，×${stanceFactor}缩放）`)
          } else {
            const newBuff = {
              id: String(Date.now()) + '_' + Math.random().toString(36).slice(2, 7),
              source: featureName || buffName,
              effects: modules.map((m) => ({ ...m })),
              enabled: true,
              sourceKind: 'temporary',
            }
            const currentBuffs = Array.isArray(char.buffs) ? char.buffs : []
            patch.buffs = [...(patch.buffs || currentBuffs), newBuff]
            lines.push(`✨ 安装临时BUFF: ${buffName}（${modules.length}个效果）`)
          }
        } else {
          lines.push(`⚠️ ${buffName}：无效果模块`)
        }
      } else if (eff.type === 'creature_transform') {
        const finalCreatureId = selectedCreatureId || ev.creatureId
        const creature = finalCreatureId ? getCreatureById(finalCreatureId) : null
        
        // 创建变身临时BUFF：用户可通过删除该BUFF来取消变身
        // duration使用结构化格式，支持休息时自动清理
        const transformBuff = {
          id: String(Date.now()) + '_' + Math.random().toString(36).slice(2, 7),
          source: `变身: ${creature?.name || '未知生物'}`,
          effects: [
            {
              effectType: 'creature_transform',
              value: {
                creatureId: finalCreatureId,
                acMode: ev.acMode || 'replace',
                acFormulaBase: ev.acFormulaBase || 13,
                acFormulaAbility: ev.acFormulaAbility || '',
                hpMode: ev.hpMode || 'replace',
                hpFormula: ev.hpFormula || null,
                keepAbilities: Array.isArray(ev.keepAbilities) ? ev.keepAbilities : [],
                resourceCostType: ev.resourceCostType || '',
                resourceCostValue: Number(ev.resourceCostValue) || 1,
                wildShapeMode: !!ev.wildShapeMode,
                wildShapeSubclass: ev.wildShapeSubclass || 'regular',
              },
            },
          ],
          enabled: true,
          sourceKind: 'temporary',
          // 结构化duration：默认1小时（短休清除），可配置为until_long_rest或until_dawn
          duration: ev.duration || { type: 'hours', value: 1 },
        }
        const currentBuffs = Array.isArray(char.buffs) ? char.buffs : []
        patch.buffs = [...(patch.buffs || currentBuffs), transformBuff]
        
        // 根据duration类型生成提示文本
        const durType = typeof transformBuff.duration === 'object' ? transformBuff.duration.type : 'custom'
        let durHint = '短休后结束'
        if (durType === 'until_long_rest') durHint = '长休后结束'
        else if (durType === 'until_dawn') durHint = '黎明后结束'
        else if (durType === 'hours' && transformBuff.duration.value >= 8) durHint = '长休后结束'
        
        lines.push(`🐾 变身: ${creature?.name || '(未选择生物)'}（${durHint}，或删除临时BUFF手动取消）`)
      } else if (eff.type === 'restore_spell_slots') {
        const maxSlots = getMaxSpellSlotsByRing(char)
        const currentSlots = { ...(char.spellSlots || {}) }
        const newSlots = { ...currentSlots }

        if (ev.mode === 'multi') {
          const maxRing = ev.maxRing || 3
          const effectiveMaxRing = (amt === 1) ? (ev.singleCostRing || maxRing) : maxRing
          for (let ring = 1; ring <= effectiveMaxRing; ring++) {
            const max = maxSlots[ring] || 0
            if (max > 0) newSlots[ring] = max
          }
        } else {
          const targetRing = ev.ringLevel || 1
          let slotsToRestore = scaled.slotsCount || 1
          for (let ring = targetRing; ring >= 1 && slotsToRestore > 0; ring--) {
            const max = maxSlots[ring] || 0
            const current = currentSlots[ring] || 0
            const canRestore = Math.min(slotsToRestore, max - current)
            if (canRestore > 0) {
              newSlots[ring] = current + canRestore
              slotsToRestore -= canRestore
            }
          }
        }

        if (JSON.stringify(newSlots) !== JSON.stringify(currentSlots)) {
          patch.spellSlots = newSlots
          const restored = []
          for (let r = 1; r <= 9; r++) {
            const diff = (newSlots[r] || 0) - (currentSlots[r] || 0)
            if (diff > 0) restored.push(`${r}环+${diff}`)
          }
          lines.push(`🔮 恢复法术位: ${restored.join(', ')}`)
        } else {
          lines.push(`🔮 法术位已满，无需恢复`)
        }
      } else if (eff.type === 'summon') {
        if (ev.preset === 'stellar_double') {
          const tempHp = Number(char.hp?.temp) || 0
          const realCurrentHp = Math.max(0, runningHp - tempHp)
          const hpCost = Math.floor(realCurrentHp / 2)
          const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
          const cloneHp = Math.floor(maxHp / 2)
          const newHp = Math.max(0, runningHp - hpCost)
          patch.hp = { ...char.hp, current: newHp }
          runningHp = newHp

          const cloneId = 'stellar_' + Date.now()
          const cloneData = {
            id: 'stellar_double_' + Date.now(),
            name: `${char.name}的分身`,
            type: 'stellar_double',
            hp: { current: cloneHp, max: cloneHp },
            createdAt: Date.now(),
          }
          const currentSummons = Array.isArray(char.summonedCreatures) ? char.summonedCreatures : []
          patch.summonedCreatures = [...currentSummons, cloneData]

          // 同步到顶栏召唤槽（stellarClones + summonSlots）
          const stellarCloneEntry = {
            id: cloneId,
            name: '星辰分身',
            hp: { current: cloneHp, max: cloneHp },
          }
          const currentStellar = Array.isArray(char.stellarClones) ? char.stellarClones : []
          patch.stellarClones = [...currentStellar, stellarCloneEntry]
          const currentSlots = Array.isArray(char.summonSlots) ? char.summonSlots : [null, null, null, null]
          const slotsCopy = currentSlots.slice(0, 4)
          const emptyIdx = slotsCopy.findIndex((s) => s == null)
          if (emptyIdx >= 0) slotsCopy[emptyIdx] = { type: 'stellar', id: cloneId }
          patch.summonSlots = slotsCopy

          lines.push(`⭐ 星辰替身：消耗 ${hpCost} 点生命值，创建分身（${cloneHp}/${cloneHp} HP）`)
        } else {
          // 普通召唤：从生物库选择或预置 creatureId
          const finalCreatureId = selectedCreatureId || ev.creatureId
          const creature = finalCreatureId ? getCreatureById(finalCreatureId) : null
          
          if (!creature) {
            lines.push(`⚠️ 召唤失败：未选择生物`)
            continue
          }
          
          // 计算召唤物 HP（使用生物库数据或公式）
          const summonHp = creature.hp?.formula 
            ? evalHpFormula(creature.hp.formula, char) 
            : creature.hp?.max || 10
          
          const summonData = {
            id: 'summon_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
            name: creature.name,
            type: 'summon',
            creatureId: finalCreatureId,
            hp: { current: summonHp, max: summonHp },
            ac: creature.ac || 10,
            createdAt: Date.now(),
          }
          const currentSummons = Array.isArray(char.summonedCreatures) ? char.summonedCreatures : []
          patch.summonedCreatures = [...currentSummons, summonData]
          lines.push(`📦 召唤: ${creature.name}（${summonHp}/${summonHp} HP, AC ${creature.ac || 10}）`)
        }
      } else if (eff.type === 'custom_logic') {
        const desc = ev.description || ev.title || ''
        const isHealing = (desc.includes('恢复') && (desc.includes('HP') || desc.includes('生命') || desc.includes('血')))
          || desc.includes('治疗') || desc.includes('回血') || desc.includes('回满')
        if (isHealing) {
          const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
          const healedAmount = maxHp - runningHp
          // 预计算资源消耗（确认和取消都需要）
          const resourcePatch = {}
          let resourceLine = ''
          if (isSpellSlot) {
            const ring = parseInt(norm.resourceType.replace('spell_slot_', ''), 10)
            const currentSlots = { ...(char.spellSlots || {}) }
            const current = currentSlots[ring] || 0
            const newCurrent = Math.max(0, current - amt)
            if (newCurrent !== current) {
              currentSlots[ring] = newCurrent
              resourcePatch.spellSlots = currentSlots
            }
            resourceLine = `消耗 ${amt} 个${ring}环法术位（剩余 ${newCurrent}）`
          } else if (isFreeSlot) {
            const cs = { ...(char.spellSlots || {}) }
            for (let r = amt; r <= 9; r++) { if (cs[r] > 0) { cs[r] -= 1; break } }
            resourcePatch.spellSlots = cs
            resourceLine = `自由消耗 ${amt} 环`
          } else if (isClassResource) {
            const res = (char.classResources || []).find((r) => r.resourceKey === norm.resourceType)
            if (res) {
              resourcePatch.classResources = (char.classResources || []).map((r) => {
                if (r.resourceKey !== norm.resourceType) return r
                return { ...r, current: Math.max(0, r.current - amt) }
              })
            }
            resourceLine = `消耗 ${amt} ${resLabel}`
          } else if (isNone) {
            resourceLine = '无资源消耗'
          } else {
            resourceLine = `消耗 ${amt} 充能（共 ${norm.charges}）`
          }
          if (healedAmount > 0) {
            setPendingCustomLogic({
              title: ev.title || '自定义效果',
              description: desc,
              healToFull: true,
              maxHp,
              currentHp: runningHp,
              healedAmount,
              resourcePatch,
              resourceLine,
            })
            setShowCustomLogicConfirm(true)
            return
          } else {
            lines.push(`💚 已满血，无需治疗`)
          }
        } else {
          // 检测伤害效果
          const isDamage = desc.includes('伤害') || desc.includes('damage')
            || (desc.includes('造成') && (desc.includes('点') || desc.includes('HP')))
          if (isDamage) {
            // 检查是否配置了骰子参数，有则自动掷骰
            const diceCount = ev.damageDiceCount || 0
            const diceSides = ev.damageDiceSides || 6
            if (diceCount > 0) {
              const diceExpr = `${diceCount}d${diceSides}`
              const { total, rolls } = rollDice(diceExpr)
              lines.push(`⚔️ ${ev.title || '伤害'}: ${rolls.join('+')} = ${total}`)
              // 继续处理后续效果，不弹手动输入框
            } else {
            const resourcePatch = {}
            let resourceLine = ''
            if (isSpellSlot) {
              const ring = parseInt(norm.resourceType.replace('spell_slot_', ''), 10)
              const currentSlots = { ...(char.spellSlots || {}) }
              const current = currentSlots[ring] || 0
              const newCurrent = Math.max(0, current - amt)
              if (newCurrent !== current) {
                currentSlots[ring] = newCurrent
                resourcePatch.spellSlots = currentSlots
              }
              resourceLine = `消耗 ${amt} 个${ring}环法术位（剩余 ${newCurrent}）`
            } else if (isFreeSlot) {
              const cs = { ...(char.spellSlots || {}) }
              for (let r = amt; r <= 9; r++) { if (cs[r] > 0) { cs[r] -= 1; break } }
              resourcePatch.spellSlots = cs
              resourceLine = `自由消耗 ${amt} 环`
            } else if (isClassResource) {
              const res = (char.classResources || []).find((r) => r.resourceKey === norm.resourceType)
              if (res) {
                resourcePatch.classResources = (char.classResources || []).map((r) => {
                  if (r.resourceKey !== norm.resourceType) return r
                  return { ...r, current: Math.max(0, r.current - amt) }
                })
              }
              resourceLine = `消耗 ${amt} ${resLabel}`
            } else if (isNone) {
              resourceLine = '无资源消耗'
            } else {
              resourceLine = `消耗 ${amt} 充能（共 ${norm.charges}）`
            }
            setPendingDamage({
              title: ev.title || '自定义效果',
              description: desc,
              resourcePatch,
              resourceLine,
            })
            setShowDamageInput(true)
            return
            }
          } else {
            lines.push(`✨ ${desc}`)
          }
        }
      } else if (eff.type === 'random_table') {
        const rv = ev
        const entries = rv.entries || []
        let matchedEntry = null
        let resultDesc = ''

        if (rv.mode === 'poker') {
          // 扑克牌模式：随机抽一张牌
          const useJokers = rv.includeJokers
          const allCards = []
          for (const suit of POKER_SUITS) {
            for (const rank of POKER_RANKS) {
              allCards.push({ suit, rank })
            }
          }
          if (useJokers) {
            allCards.push({ suit: 'joker', rank: 'big_joker' })
            allCards.push({ suit: 'joker', rank: 'small_joker' })
          }
          const drawn = allCards[Math.floor(Math.random() * allCards.length)]
          const isJoker = drawn.suit === 'joker'
          resultDesc = isJoker
            ? `🃏 抽到 ${drawn.rank === 'big_joker' ? '大' : '小'} Joker`
            : `🃏 抽到 ${POKER_SUIT_SYMBOLS[drawn.suit]} ${drawn.rank}（${POKER_SUIT_LABELS[drawn.suit]} ${drawn.rank}）`

          // 按条目顺序匹配（first-match-wins）
          for (const entry of entries) {
            if (entry.matchType === 'any') { matchedEntry = entry; break }
            if (isJoker) continue // Joker 只能被 'any' 匹配
            if (entry.matchType === 'suit' && entry.suits?.includes(drawn.suit)) { matchedEntry = entry; break }
            if (entry.matchType === 'rank' && entry.ranks?.includes(drawn.rank)) { matchedEntry = entry; break }
            if (entry.matchType === 'both' && entry.suits?.includes(drawn.suit) && entry.ranks?.includes(drawn.rank)) { matchedEntry = entry; break }
          }
        } else {
          // 骰子模式
          const diceType = rv.diceType || 'd6'
          const maxVal = getDiceMax(diceType)
          const roll = Math.floor(Math.random() * maxVal) + 1
          resultDesc = `🎲 ${diceType.toUpperCase()} 掷出 ${roll}`

          for (const entry of entries) {
            if (roll >= (entry.min || 1) && roll <= (entry.max || maxVal)) {
              matchedEntry = entry
              break
            }
          }
        }

        lines.push(resultDesc)

        if (matchedEntry && matchedEntry.effects?.length > 0) {
          const subResult = processEffects(matchedEntry.effects, {
            char, amt, featureName, selectedCreatureId,
            spellDC: computeSpellDC(), spellAttack: computeSpellAttack(),
            isSpellSlot, isClassResource, isNone, isFreeSlot, resLabel, norm,
            runningHpIn: runningHp,
          })
          lines.push(...subResult.lines)
          // 合并子效果结果到 patch
          if (subResult.spellSlotPatch) patch.spellSlots = subResult.spellSlotPatch
          if (subResult.buffAdditions.length > 0) {
            const currentBuffs = Array.isArray(patch.buffs) ? patch.buffs : (Array.isArray(char.buffs) ? char.buffs : [])
            patch.buffs = [...currentBuffs, ...subResult.buffAdditions]
          }
          if (subResult.summonAdditions.length > 0) {
            const currentSummons = Array.isArray(char.summonedCreatures) ? char.summonedCreatures : []
            patch.summonedCreatures = [...currentSummons, ...subResult.summonAdditions]
          }
          if (subResult.stellarData) {
            const { hpCost, cloneHp } = subResult.stellarData
            const cloneId = 'stellar_' + Date.now()
            const cloneData = { id: 'stellar_double_' + Date.now(), name: `${char.name}的分身`, type: 'stellar_double', hp: { current: cloneHp, max: cloneHp }, createdAt: Date.now() }
            const currentSummons2 = Array.isArray(patch.summonedCreatures) ? patch.summonedCreatures : (Array.isArray(char.summonedCreatures) ? char.summonedCreatures : [])
            patch.summonedCreatures = [...currentSummons2, cloneData]
            const stellarEntry = { id: cloneId, name: '星辰分身', hp: { current: cloneHp, max: cloneHp } }
            const currentStellar = Array.isArray(char.stellarClones) ? char.stellarClones : []
            patch.stellarClones = [...currentStellar, stellarEntry]
            const currentSlots2 = Array.isArray(char.summonSlots) ? char.summonSlots : [null, null, null, null]
            const slotsCopy = currentSlots2.slice(0, 4)
            const emptyIdx = slotsCopy.findIndex(s => s == null)
            if (emptyIdx >= 0) slotsCopy[emptyIdx] = { type: 'stellar', id: cloneId }
            patch.summonSlots = slotsCopy
            patch.hp = { ...char.hp, current: Math.max(0, (Number(char.hp?.current) || 0) - hpCost) }
          }
          if (subResult.hpChange !== 0 && !subResult.stellarData) {
            const newHp = Math.max(0, (Number(char.hp?.current) || 0) + subResult.hpChange)
            patch.hp = { ...char.hp, current: newHp }
          }
          runningHp = patch.hp?.current ?? runningHp
        } else {
          lines.push('（未命中任何条目）')
        }
      }
    }

    // 3. 架势互斥：清除旧架势BUFF
    if (norm.isStance && char.activeStance?.buffId) {
      const buffs = Array.isArray(patch.buffs) ? patch.buffs : (Array.isArray(char.buffs) ? char.buffs : [])
      patch.buffs = buffs.filter((b) => b.id !== char.activeStance.buffId)
    }

    if (lines.length === 0) lines.push('(未配置效果)')

    setResultLines(lines)
    onConfirm(patch, lines)
  }

  /* ── 结果展示 ── */
  if (resultLines) {
    return (
      <>
        <div className="fixed inset-0 z-[400] bg-black/60" onClick={onClose} aria-hidden />
        <div className="fixed inset-0 z-[401] flex items-center justify-center p-4" onClick={onClose}>
          <div
            className="bg-[#1a1f2e] border border-dnd-gold/30 rounded-lg p-4 max-w-sm w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-dnd-gold-light">使用结果</h3>
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">
                <X size={14} />
              </button>
            </div>
            <div className="space-y-1 text-xs text-gray-300">
              {resultLines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
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

  /* ── 确认弹窗 ── */
  return (
    <>
      <div className="fixed inset-0 z-[400] bg-black/60" onClick={onClose} aria-hidden />
      <div className="fixed inset-0 z-[401] flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="bg-[#1a1f2e] border border-dnd-gold/30 rounded-lg p-4 max-w-sm w-full shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-bold text-dnd-gold-light">使用 {featureName}</h3>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">
              <X size={14} />
            </button>
          </div>

          {/* 消耗数量选择 */}
          <div className="flex items-center gap-x-2 mb-3">
            <span className="text-xs text-gray-300">消耗数量</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => setAmt(Math.max(1, amt - 1))}
                className="w-6 h-6 rounded bg-gray-700/60 text-gray-300 hover:bg-gray-600/80 flex items-center justify-center text-sm font-bold transition-colors"
              >−</button>
              <span className="w-8 text-center text-sm font-bold text-dnd-gold-light tabular-nums">{amt}</span>
              <button type="button" onClick={() => setAmt(Math.min(maxAmount, amt + 1))}
                className="w-6 h-6 rounded bg-gray-700/60 text-gray-300 hover:bg-gray-600/80 flex items-center justify-center text-sm font-bold transition-colors"
              >+</button>
            </div>
            <span className="text-[10px] text-gray-500">
              {isNone
                ? '无消耗'
                : isFreeSlot
                ? `${amt}环法术位（剩余 ${(() => { const slots = char.spellSlots || {}; let total = 0; for (let r = 1; r <= 9; r++) total += (slots[r] || 0); return total })()}）`
                : isSpellSlot
                ? `${resLabel}（剩余 ${(() => { const ring = parseInt(norm.resourceType.replace('spell_slot_', ''), 10); return char.spellSlots?.[ring] ?? 0 })()}）`
                : isClassResource
                ? `${resLabel}（剩余 ${(() => { const res = (char.classResources || []).find((r) => r.resourceKey === norm.resourceType); return res ? `${res.current}/${res.max}` : '?' })()}）`
                : `充能（总 ${norm.charges}）`
              }
            </span>
          </div>

          {/* 效果列表（显示缩放后的数值） */}
          {(norm.effects || []).length > 0 && (
            <div className="space-y-1.5 mb-4">
              <div className="text-[10px] text-gray-500 uppercase tracking-wide">效果</div>
              {norm.effects.map((eff, i) => {
                const ev = eff.value || {}
                const scaled = computeScaledEffect(ev, amt, isFreeSlot && eff.applyMultiplier !== false)
                if (eff.type === 'spell') {
                  const scaledDice = scaled.damageDiceCount ?? (ev.damageDiceCount || 0)
                  const diceExpr = scaledDice > 0 ? `${scaledDice}d${ev.damageDiceSides || 6}` : ''
                  return (
                    <div key={i} className="text-xs text-gray-300 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400/60 shrink-0" />
                      <span className="text-cyan-300">{ev.spellName || '(未命名法术)'}</span>
                      {ev.hitResolution && ev.hitResolution !== 'none' && (
                        <span className="text-[10px] text-gray-500">
                          {ev.hitResolution === 'spell_attack' ? '法术攻击' : `${ev.hitResolution.replace('_save', '')}豁免`}
                        </span>
                      )}
                      {diceExpr && (
                        <span className="text-[10px] text-red-400/80">{diceExpr}{ev.damageType ? ` ${ev.damageType}` : ''}</span>
                      )}
                      {hasScaling && amt > 1 && ev.scalingEnabled && (
                        <span className="text-[9px] text-amber-400/60">×{amt}</span>
                      )}
                      {isFreeSlot && amt > 1 && eff.applyMultiplier !== false && (
                        <span className="text-[9px] text-amber-400/80">×{amt}环</span>
                      )}
                    </div>
                  )
                }
                if (eff.type === 'ability') {
                  const scaledDice = scaled.diceCount ?? (ev.diceCount || 0)
                  const scaledFlat = scaled.flatBonus ?? 0
                  const sides = ev.diceSides || 10
                  const mod = resolveAbilityMod(ev.abilityMod, char)
                  const totalMod = mod + scaledFlat
                  let expr = ''
                  if (scaledDice > 0) {
                    expr = `${scaledDice}d${sides}`
                    if (totalMod > 0) expr += `+${totalMod}`
                    else if (totalMod < 0) expr += `${totalMod}`
                  }
                  return (
                    <div key={i} className="text-xs text-gray-300 flex items-center gap-1.5">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${ev.resultType === 'damage' ? 'bg-red-400/60' : 'bg-green-400/60'}`} />
                      <span>{ev.text || '(能力)'}</span>
                      {expr && (
                        <span className={`text-[10px] ${ev.resultType === 'damage' ? 'text-red-400/80' : 'text-green-400/80'}`}>
                          {expr} {ev.resultType === 'damage' ? '伤害' : '治疗'}
                        </span>
                      )}
                      {hasScaling && amt > 1 && ev.scalingEnabled && (
                        <span className="text-[9px] text-amber-400/60">×{amt}</span>
                      )}
                      {isFreeSlot && amt > 1 && eff.applyMultiplier !== false && (
                        <span className="text-[9px] text-amber-400/80">×{amt}环</span>
                      )}
                    </div>
                  )
                }
                if (eff.type === 'creature_transform') {
                  const finalCreatureId = selectedCreatureId || ev.creatureId
                  const creature = finalCreatureId ? getCreatureById(finalCreatureId) : null
                  return (
                    <div key={i} className="text-xs text-gray-300 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rose-400/60 shrink-0" />
                      <span className="text-rose-300">变身: {creature?.name || (needsCreatureSelection ? '(点击确认后选择)' : '(未选择生物)')}</span>
                    </div>
                  )
                }
                if (eff.type === 'restore_spell_slots') {
                  const label = ev.mode === 'multi'
                    ? (amt === 1
                      ? `恢复 ${ev.singleCostRing || ev.maxRing || 3} 环及以下法术位`
                      : `恢复 ${ev.maxRing || 3} 环及以下法术位`)
                    : `恢复 ${ev.ringLevel || 1} 环法术位`
                  return (
                    <div key={i} className="text-xs text-gray-300 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-sky-400/60 shrink-0" />
                      <span className="text-sky-300">{label}</span>
                    </div>
                  )
                }
                if (eff.type === 'summon') {
                  if (ev.preset === 'stellar_double') {
                    return (
                      <div key={i} className="text-xs text-gray-300 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400/60 shrink-0" />
                        <span className="text-purple-300">召唤: 星辰替身</span>
                      </div>
                    )
                  } else {
                    const finalCreatureId = selectedCreatureId || ev.creatureId
                    const creature = finalCreatureId ? getCreatureById(finalCreatureId) : null
                    return (
                      <div key={i} className="text-xs text-gray-300 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400/60 shrink-0" />
                        <span className="text-purple-300">召唤: {creature?.name || (needsCreatureSelection ? '(点击确认后选择)' : '(未选择生物)')}</span>
                      </div>
                    )
                  }
                }
                if (eff.type === 'random_table') {
                  const rv = ev
                  const entryCount = rv.entries?.length || 0
                  if (rv.mode === 'poker') {
                    return (
                      <div key={i} className="text-xs text-gray-300 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 shrink-0" />
                        <span className="text-amber-300">扑克牌随机库 ({entryCount} 条)</span>
                      </div>
                    )
                  }
                  return (
                    <div key={i} className="text-xs text-gray-300 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400/60 shrink-0" />
                      <span className="text-amber-300">{(rv.diceType || 'd6').toUpperCase()} 随机库 ({entryCount} 条)</span>
                    </div>
                  )
                }
                return null
              })}
            </div>
          )}

          {/* 确认 / 取消 */}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={onClose}
              className="px-3 py-1.5 rounded-md text-xs bg-gray-700/50 text-gray-300 border border-gray-600/50 hover:bg-gray-600/50 transition-colors"
            >取消</button>
            <button type="button" 
              onClick={() => {
                if (hasStellarDouble) {
                  // 计算 HP 消耗和替身血量用于预览
                  const currentHp = Number(char.hp?.current) || 0
                  const tempHp = Number(char.hp?.temp) || 0
                  const realCurrentHp = Math.max(0, currentHp - tempHp)
                  const hpCost = Math.floor(realCurrentHp / 2)
                  const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
                  const cloneHp = Math.floor(maxHp / 2)
                  
                  setPendingSummonData({
                    hpCost,
                    cloneHp,
                    maxHp,
                    charName: char.name
                  })
                  setShowSummonConfirm(true)
                } else if (needsCreatureSelection && !selectedCreatureId) {
                  setShowCreatureSelector(true)
                } else {
                  handleConfirm()
                }
              }}
              disabled={amt < 1 || amt > maxAmount}
              className="px-3 py-1.5 rounded-md text-xs font-medium bg-dnd-gold/20 text-dnd-gold-light border border-dnd-gold/40 hover:bg-dnd-gold/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >{hasStellarDouble ? '召唤替身' : needsCreatureSelection && !selectedCreatureId ? '选择生物' : `确认使用${amt > 1 ? ` (${amt})` : ''}`}</button>
          </div>
        </div>
      </div>
      
      {/* 生物选择器 */}
      {showCreatureSelector && (
        <CreatureSelectorModal
          onSelect={handleCreatureSelect}
          onClose={() => setShowCreatureSelector(false)}
          filterCR={maxCR}
        />
      )}
      
      {/* 星辰替身召唤确认弹窗 */}
      {showSummonConfirm && pendingSummonData && (
        <>
          <div className="fixed inset-0 z-[400] bg-black/60" onClick={() => setShowSummonConfirm(false)} aria-hidden />
          <div className="fixed inset-0 z-[401] flex items-center justify-center p-4" onClick={() => setShowSummonConfirm(false)}>
            <div
              className="bg-[#1a1f2e] border border-purple-500/30 rounded-lg p-4 max-w-sm w-full shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-purple-300">⭐ 召唤星辰替身</h3>
                <button type="button" onClick={() => setShowSummonConfirm(false)} className="text-gray-400 hover:text-white">
                  <X size={14} />
                </button>
              </div>
              
              <div className="space-y-3 text-xs text-gray-300">
                <div className="p-2.5 bg-purple-900/20 rounded-md border border-purple-500/20">
                  <div className="mb-2 text-purple-300 font-medium">{pendingSummonData.charName}的分身</div>
                  <div className="space-y-1.5 text-gray-400">
                    <div className="flex justify-between">
                      <span>消耗生命值:</span>
                      <span className="text-red-400">-{pendingSummonData.hpCost} HP</span>
                    </div>
                    <div className="flex justify-between">
                      <span>替身最大HP:</span>
                      <span className="text-purple-300">{pendingSummonData.cloneHp}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>当前角色HP:</span>
                      <span>{Number(char.hp?.current) || 0} → {Math.max(0, (Number(char.hp?.current) || 0) - pendingSummonData.hpCost)}</span>
                    </div>
                  </div>
                </div>
                
                <div className="text-[10px] text-gray-500 leading-relaxed">
                  替身将拥有独立的行动回合，HP为角色最大HP的一半。替身被摧毁时不会对本体造成额外伤害。
                </div>
              </div>
              
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={() => setShowSummonConfirm(false)}
                  className="px-3 py-1.5 rounded-md text-xs bg-gray-700/50 text-gray-300 border border-gray-600/50 hover:bg-gray-600/50 transition-colors"
                >取消</button>
                <button type="button" onClick={handleSummonConfirm}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-purple-500/20 text-purple-300 border border-purple-500/40 hover:bg-purple-500/30 transition-colors"
                >确认召唤</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 治疗效果 custom_logic 确认弹窗 */}
      {showCustomLogicConfirm && pendingCustomLogic && (
        <>
          <div className="fixed inset-0 z-[400] bg-black/60" onClick={() => handleCustomLogicCancel()} aria-hidden />
          <div className="fixed inset-0 z-[401] flex items-center justify-center p-4">
            <div className="bg-[#1a1f2e] border border-green-500/30 rounded-lg p-4 max-w-sm w-full shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-green-300">⭐ {pendingCustomLogic.title}</h3>
                <button type="button" onClick={() => handleCustomLogicCancel()} className="text-gray-400 hover:text-white"><X size={14} /></button>
              </div>
              <div className="space-y-3 text-xs text-gray-300">
                <div className="p-2.5 bg-green-900/20 rounded-md border border-green-500/20">
                  <div className="mb-2 text-gray-400 text-[11px] leading-relaxed">{pendingCustomLogic.description}</div>
                  <div className="space-y-1.5 text-gray-400">
                    <div className="flex justify-between">
                      <span>当前HP:</span>
                      <span>{pendingCustomLogic.currentHp} → {pendingCustomLogic.maxHp}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>恢复量:</span>
                      <span className="text-green-400">+{pendingCustomLogic.healedAmount} HP</span>
                    </div>
                  </div>
                </div>
                <div className="text-[10px] text-gray-500">是否对自己恢复至生命上限？</div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={handleCustomLogicCancel} className="px-3 py-1.5 rounded-md text-xs bg-gray-700/50 text-gray-300 border border-gray-600/50 hover:bg-gray-600/50 transition-colors">否</button>
                <button type="button" onClick={handleCustomLogicConfirm} className="px-3 py-1.5 rounded-md text-xs font-medium bg-green-500/20 text-green-300 border border-green-500/40 hover:bg-green-500/30 transition-colors">是</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* 伤害效果 custom_logic 确认弹窗 */}
      {showDamageInput && pendingDamage && (
        <>
          <div className="fixed inset-0 z-[400] bg-black/60" onClick={() => handleDamageCancel()} aria-hidden />
          <div className="fixed inset-0 z-[401] flex items-center justify-center p-4">
            <div className="bg-[#1a1f2e] border border-red-500/30 rounded-lg p-4 max-w-sm w-full shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-red-300">⚔️ {pendingDamage.title}</h3>
                <button type="button" onClick={() => handleDamageCancel()} className="text-gray-400 hover:text-white"><X size={14} /></button>
              </div>
              <div className="space-y-3 text-xs text-gray-300">
                <div className="p-2.5 bg-red-900/20 rounded-md border border-red-500/20">
                  <div className="mb-2 text-gray-400 text-[11px] leading-relaxed">{pendingDamage.description}</div>
                </div>
                <div>
                  <label className="text-[10px] text-gray-500 block mb-1">造成了多少伤害？</label>
                  <input
                    type="number"
                    min="0"
                    defaultValue=""
                    ref={damageInputRef}
                    className="w-full h-8 px-2 rounded bg-[#1b2738] border border-[#34455f] text-sm text-white focus:outline-none focus:border-[#c79a42] focus:ring-1 focus:ring-[#c79a42]/40"
                    placeholder="输入伤害数值"
                    autoFocus
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={handleDamageCancel} className="px-3 py-1.5 rounded-md text-xs bg-gray-700/50 text-gray-300 border border-gray-600/50 hover:bg-gray-600/50 transition-colors">取消</button>
                <button type="button" onClick={handleDamageConfirm} className="px-3 py-1.5 rounded-md text-xs font-medium bg-red-500/20 text-red-300 border border-red-500/40 hover:bg-red-500/30 transition-colors">确认</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ability 治疗确认弹窗 */}
      {showHealingConfirm && pendingHealing && (
        <>
          <div className="fixed inset-0 z-[400] bg-black/60" onClick={() => handleHealingCancel()} aria-hidden />
          <div className="fixed inset-0 z-[401] flex items-center justify-center p-4">
            <div className="bg-[#1a1f2e] border border-green-500/30 rounded-lg p-4 max-w-sm w-full shadow-xl">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-green-300">💚 治疗效果</h3>
                <button type="button" onClick={() => handleHealingCancel()} className="text-gray-400 hover:text-white"><X size={14} /></button>
              </div>
              <div className="space-y-3 text-xs text-gray-300">
                <div className="p-2.5 bg-green-900/20 rounded-md border border-green-500/20">
                  <div className="space-y-1.5 text-gray-400">
                    <div className="flex justify-between">
                      <span>掷骰结果:</span>
                      <span className="text-green-300">{pendingHealing.diceExpr} = {pendingHealing.healAmount}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>当前HP:</span>
                      <span>{pendingHealing.currentHp} → {pendingHealing.newHp}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>实际恢复:</span>
                      <span className="text-green-400">+{Math.min(pendingHealing.healAmount, pendingHealing.newHp - pendingHealing.currentHp)} HP</span>
                    </div>
                  </div>
                </div>
                <div className="text-[10px] text-gray-500">是否恢复生命值？</div>
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button type="button" onClick={handleHealingCancel} className="px-3 py-1.5 rounded-md text-xs bg-gray-700/50 text-gray-300 border border-gray-600/50 hover:bg-gray-600/50 transition-colors">否</button>
                <button type="button" onClick={handleHealingConfirm} className="px-3 py-1.5 rounded-md text-xs font-medium bg-green-500/20 text-green-300 border border-green-500/40 hover:bg-green-500/30 transition-colors">是</button>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  )
}
