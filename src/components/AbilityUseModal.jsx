/**
 * AbilityUseModal — 主动技能多步释放弹窗（状态机版）
 *
 * 步骤流程：
 *   prepare（资源选择）→ confirm（效果预览）→
 *   攻击型: roll_attack（投 d20 → 问 DM 命中/未命中）→ roll_damage（命中后处理效果）→ result
 *   豁免/通用型: 直接执行效果 → result
 *
 * 资源消耗发生在进入第 3 步时（点击"投攻击骰"/"投伤害骰"/"执行"），此前可自由返回修改。
 * 所有掷骰通过 `dnd-external-roll` CustomEvent 触发 3D 骰子动画。
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
  isFreeSlotConsumption,
  isFixedSlotConsumption,
  POKER_SUITS,
  POKER_RANKS,
  POKER_SUIT_LABELS,
  POKER_SUIT_SYMBOLS,
  getDiceMax,
  resolveLevelScaling,
  getMainHandWeaponDamageType,
} from '../lib/chargeItemModel'
import { rollDice, rollCombatDicePool } from '../data/weaponDatabase'
import { proficiencyBonus, abilityModifier, calcMaxHP, getHPBuffSum } from '../lib/formulas'
import { getCharacterClasses, getPrimarySpellcastingAbility, getMaxSpellSlotsByRing } from '../data/classDatabase'
import { getCreatureById, parseCreatureHp, listCreatures } from '../data/creatureLibrary'
import { getEntryChargeMax } from '../lib/chargeRecovery'
import {
  classifyFlowType,
  hasDiceEffects,
  getStepLabels,
  extractDamageFormulas,
  extractSaveInfo,
  generatePreviewLines,
} from '../lib/abilityFlowUtils'
import AbilityStepProgressBar from './AbilityStepProgressBar'

const MODAL_KEYFRAMES = `
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes fadeOut { from { opacity: 1; } to { opacity: 0; } }
`

/**
 * 将 activeAbility 格式转换为 charge item value 格式，
 * 使其可以走 normalizeChargeItemValue 归一化管线。
 */
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

/* ══════════════════════════════════════════════════════════════
 * processAllEffects — 效果处理管线（模块级纯函数）
 *
 * 从旧版 handleConfirm 的效果循环提取，遍历 norm.effects 逐个处理，
 * 累积 patch（角色数据变更）与 lines（结果文字）。
 * 掷骰后立即生效：治疗直接写入 patch.hp，无骰伤害显示文字提示。
 *
 * ctx: {
 *   char, norm, amt, featureName, selectedCreatureId,
 *   isSpellSlot, isFreeSlot, isClassResource, isNone, resLabel,
 *   effectiveChargeValue, computeSpellDC, computeSpellAttack,
 *   skipDamageDice = false,   // true 时伤害骰只记录公式文本，不掷骰
 *   runningHpIn,              // 递归调用时传入的 HP 累积值
 * }
 * 返回 { patch, lines, animParts, animValues, runningHp }
 * ══════════════════════════════════════════════════════════════ */
function processAllEffects(ctx) {
  const {
    char, norm, amt, featureName, selectedCreatureId,
    isFreeSlot,
    effectiveChargeValue, computeSpellDC, computeSpellAttack,
    skipDamageDice = false, runningHpIn,
  } = ctx

  const patch = {}
  const lines = []
  const animParts = []
  const animValues = []
  let runningHp = runningHpIn != null ? runningHpIn : (Number(char.hp?.current) || 0)

  for (const eff of (norm.effects || [])) {
    const ev = eff.value || {}
    const scaled = computeScaledEffect(ev, amt, isFreeSlot && eff.applyMultiplier !== false, char)

    /* ── attack_buff：命中/伤害加成 + 额外骰 ── */
    if (eff.type === 'attack_buff') {
      const hitBonus = scaled.hitBonus || 0
      const damageBonus = scaled.damageBonus || 0
      const extraDiceCount = scaled.extraDiceCount || 0
      const diceSides = scaled.diceSides || 10
      const damageType = scaled.damageType || 'fire'

      if (hitBonus > 0 || damageBonus > 0) {
        const parts = []
        if (hitBonus > 0) parts.push(`命中+${hitBonus}`)
        if (damageBonus > 0) parts.push(`伤害+${damageBonus}`)
        if (extraDiceCount > 0) parts.push(`${extraDiceCount}d${diceSides}${damageType}`)
        lines.push(`🎯 ${ev.title || '攻击加成'}: ${parts.join(', ')}`)

        const buffId = 'atkbuf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
        const atkEffects = []
        if (hitBonus > 0) atkEffects.push({ effectType: 'attack_bonus', category: 'offense', scope: 'global', value: hitBonus })
        if (damageBonus > 0) atkEffects.push({ effectType: 'damage_bonus', category: 'offense', scope: 'global', value: damageBonus })
        const atkBuff = { id: buffId, source: featureName || ev.title || '攻击加成', effects: atkEffects, enabled: true, sourceKind: 'temporary', duration: { type: 'until_next_turn' } }
        const currentBuffs = Array.isArray(char.buffs) ? char.buffs : []
        patch.buffs = [...(patch.buffs || currentBuffs), atkBuff]
      }

      // 如果有额外骰子，立即掷出并记录
      if (extraDiceCount > 0) {
        const diceExpr = `${extraDiceCount}d${diceSides}`
        const { total, rolls } = rollDice(diceExpr)
        lines.push(`  额外伤害: ${rolls.join('+')} = ${total} ${damageType}`)
        animParts.push(diceExpr)
        animValues.push(...rolls.map(Number))
      }

    /* ── spell：内含法术（攻击/豁免 + 伤害骰 + 子效果） ── */
    } else if (eff.type === 'spell') {
      const spellName = ev.spellName || '(未命名法术)'
      const scaledDice = scaled.damageDiceCount ?? (ev.damageDiceCount || 0)

      if (ev.hitResolution === 'spell_attack') {
        // 攻击骰（d20）已在攻击步骤（executeAttackStep）投出并展示，此处不再重复投
        lines.push(`${spellName}（攻击骰已投出）`)
      } else if (ev.hitResolution && ev.hitResolution !== 'none') {
        const dc = computeSpellDC()
        const saveLabel = ev.hitResolution.replace('_save', '')
        lines.push(`${spellName} 豁免DC ${dc ?? '?'} (${saveLabel})`)
      } else {
        lines.push(`${spellName}`)
      }

      if (scaledDice > 0) {
        const diceExpr = `${scaledDice}d${ev.damageDiceSides || 6}`
        const damageType = ev.damageType || ''
        if (skipDamageDice) {
          lines.push(`  伤害: ${diceExpr}${damageType ? ` ${damageType}` : ''}`)
        } else {
          const { total, rolls } = rollDice(diceExpr)
          lines.push(`  伤害: ${rolls.join('+')} = ${total}${damageType ? ` ${damageType}` : ''}`)
          animParts.push(diceExpr)
          animValues.push(...rolls.map(Number))
        }
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
            animParts.push(`${sDice}d${sSides}`)
            animValues.push(...sRolls.map(Number))

            if (sIsHeal) {
              const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
              const sNewHp = Math.min(maxHp, runningHp + sTotal)
              const healAmt = sNewHp - runningHp
              if (healAmt > 0) {
                patch.hp = { ...(patch.hp || char.hp), current: sNewHp }
                runningHp = sNewHp
                lines.push(`  💚 ${sv.title || '治疗'}: ${sDiceStr}${sModLabel} = ${sTotal}`)
              } else {
                lines.push(`  💚 ${sv.title || '治疗'}: ${sDiceStr}${sModLabel} = ${sTotal}（已满血）`)
              }
            } else {
              lines.push(`  ⚔️ ${sv.title || '伤害'}: ${sDiceStr}${sModLabel} = ${sTotal}`)
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
              duration: sv.duration || { type: 'until_short_rest' },
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
          patch.hp = { ...(patch.hp || char.hp), current: newHp }
          runningHp = newHp
          const cloneId = 'stellar_' + Date.now()
          const cloneData = { id: 'stellar_double_' + Date.now(), name: `${char.name}的分身`, type: 'stellar_double', hp: { current: cloneHp, max: cloneHp }, createdAt: Date.now() }
          patch.summonedCreatures = [...(patch.summonedCreatures || char.summonedCreatures || []), cloneData]
          patch.stellarClones = [...(patch.stellarClones || char.stellarClones || []), { id: cloneId, name: '星辰分身', hp: { current: cloneHp, max: cloneHp } }]
          const cs2 = Array.isArray(patch.summonSlots) ? patch.summonSlots : (Array.isArray(char.summonSlots) ? char.summonSlots : [null, null, null, null])
          const slotsCopy = cs2.slice(0, 4); const ei = slotsCopy.findIndex((s) => s == null)
          if (ei >= 0) slotsCopy[ei] = { type: 'stellar', id: cloneId }
          patch.summonSlots = slotsCopy
          lines.push(`  ⭐ 星辰替身：消耗 ${hpCost} HP，创建分身（${cloneHp}/${cloneHp} HP）`)
        } else if (subEff.type === 'summon') {
          const fcId = selectedCreatureId || sv.creatureId
          const creature = fcId ? getCreatureById(fcId) : null
          if (creature) {
            const sHp = parseCreatureHp(creature.hp)
            const summonData = { id: 'summon_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), name: creature.name, type: 'summon', creatureId: fcId, hp: { current: sHp, max: sHp }, ac: creature.ac || 10, createdAt: Date.now() }
            patch.summonedCreatures = [...(patch.summonedCreatures || char.summonedCreatures || []), summonData]
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
        } else if (subEff.type === 'shield') {
          const shieldAmount = sScaled.amount ?? (sv.amount || 0)
          if (shieldAmount > 0) {
            const currentTemp = Number(patch.hp?.temp ?? char.hp?.temp) || 0
            const newTemp = Math.max(currentTemp, shieldAmount)
            patch.hp = { ...(patch.hp || char.hp || {}), temp: newTemp }
            lines.push(`  🛡️ ${sv.title || '护盾'}: 获得 ${shieldAmount} 点临时生命`)
          }
        } else if (subEff.type === 'damage') {
          const sDiceCount = sScaled.diceCount ?? (sv.diceCount || 1)
          const sDiceSides = sv.diceSides || 6
          const sDiceBonus = sScaled.flatBonus ?? (sv.diceBonus || 0)
          const sDamageType = sv.damageType || 'fire'
          if (sDiceCount > 0) {
            const sDiceExpr = `${sDiceCount}d${sDiceSides}`
            const bonusStr = sDiceBonus > 0 ? `+${sDiceBonus}` : ''
            if (skipDamageDice) {
              lines.push(`  ⚔️ ${sv.title || '伤害'}: ${sDiceExpr}${bonusStr} ${sDamageType}`)
            } else {
              const { total: sTotal, rolls: sRolls } = rollDice(sDiceExpr)
              const totalWithBonus = sTotal + sDiceBonus
              lines.push(`  ⚔️ ${sv.title || '伤害'}: ${sRolls.join('+')}${bonusStr} = ${totalWithBonus} ${sDamageType}`)
              animParts.push(sDiceExpr)
              animValues.push(...sRolls.map(Number))
            }
          }
        } else if (subEff.type === 'heal') {
          const sDiceCount = sScaled.diceCount ?? (sv.diceCount || 1)
          const sDiceSides = sv.diceSides || 8
          const sDiceBonus = sScaled.flatBonus ?? (sv.diceBonus || 0)
          if (sDiceCount > 0) {
            const sDiceExpr = `${sDiceCount}d${sDiceSides}`
            const { total: sTotal, rolls: sRolls } = rollDice(sDiceExpr)
            const totalWithBonus = sTotal + sDiceBonus
            const bonusStr = sDiceBonus > 0 ? `+${sDiceBonus}` : ''
            const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
            const newHp = Math.min(maxHp, runningHp + totalWithBonus)
            const healed = newHp - runningHp
            if (healed > 0) {
              patch.hp = { ...(patch.hp || char.hp), current: newHp }
              runningHp = newHp
            }
            lines.push(`  💚 ${sv.title || '治疗'}: ${sRolls.join('+')}${bonusStr} = ${totalWithBonus}${healed > 0 ? `（实际恢复 ${healed}）` : '（已满血）'}`)
            animParts.push(sDiceExpr)
            animValues.push(...sRolls.map(Number))
          }
        } else if (subEff.type === 'attack_buff') {
          const hitB = sScaled.hitBonus || 0
          const dmgB = sScaled.damageBonus || 0
          const parts = []
          if (hitB > 0) parts.push(`命中+${hitB}`)
          if (dmgB > 0) parts.push(`伤害+${dmgB}`)
          if (parts.length > 0) {
            const buffId = 'atkbuf_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7)
            const atkEffects = []
            if (hitB > 0) atkEffects.push({ effectType: 'attack_bonus', category: 'offense', scope: 'global', value: hitB })
            if (dmgB > 0) atkEffects.push({ effectType: 'damage_bonus', category: 'offense', scope: 'global', value: dmgB })
            const atkBuff = { id: buffId, source: featureName || '攻击加成', effects: atkEffects, enabled: true, sourceKind: 'temporary', duration: { type: 'until_next_turn' } }
            const currentBuffs = Array.isArray(char.buffs) ? char.buffs : []
            patch.buffs = [...(patch.buffs || currentBuffs), atkBuff]
            lines.push(`  🎯 ${sv.title || '攻击加成'}: ${parts.join(', ')}（临时BUFF）`)
          }
        } else if (subEff.type === 'consume_spell_slot_to_restore_charges') {
          const slotLv = sv.slotLevel || 2
          const restoreAmt = sv.restoreAmount || 1
          const curSlots = { ...(char.spellSlots || {}) }
          const avail = curSlots[slotLv] || 0
          if (avail > 0) {
            const newSlots = { ...curSlots, [slotLv]: avail - 1 }
            patch.spellSlots = newSlots
            if (effectiveChargeValue?.itemInventoryId) {
              const invId = effectiveChargeValue.itemInventoryId
              const invIdx = (char.inventory || []).findIndex(e => e.id === invId)
              if (invIdx >= 0) {
                const entry = char.inventory[invIdx]
                const chargeMax = getEntryChargeMax(entry, char) ?? 0
                const curCharge = Math.max(0, Number(entry.charge) || 0)
                const newCharge = chargeMax > 0 ? Math.min(chargeMax, curCharge + restoreAmt) : curCharge + restoreAmt
                const baseInv = Array.isArray(patch.inventory) ? patch.inventory : (char.inventory || [])
                patch.inventory = baseInv.map((e, i) => i === invIdx ? { ...e, charge: newCharge } : e)
                lines.push(`  ⚡ 消耗${slotLv}环法术位，恢复 ${restoreAmt} 点充能`)
              }
            }
          }
        } else if (subEff.type === 'custom_logic') {
          const desc = sv.description || sv.title || ''
          const isHealing = (desc.includes('恢复') && (desc.includes('HP') || desc.includes('生命') || desc.includes('血'))) || desc.includes('治疗') || desc.includes('回血') || desc.includes('回满')
          if (isHealing) {
            // 治疗直接生效，不再弹窗确认
            const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
            const healedAmt = maxHp - runningHp
            if (healedAmt > 0) {
              patch.hp = { ...(patch.hp || char.hp), current: maxHp }
              runningHp = maxHp
              lines.push(`  💚 ${sv.title || '自定义效果'}: 恢复至满血`)
            } else {
              lines.push(`  💚 ${sv.title || '自定义效果'}: 已满血`)
            }
          } else {
            const isDmg = desc.includes('伤害') || desc.includes('damage') || (desc.includes('造成') && (desc.includes('点') || desc.includes('HP')))
            const dc = sv.damageDiceCount || 0
            const ds = sv.damageDiceSides || 6
            if (isDmg && dc > 0) {
              const dExpr = `${dc}d${ds}`
              const { total: dTotal, rolls: dRolls } = rollDice(dExpr)
              lines.push(`  ⚔️ ${sv.title || '伤害'}: ${dRolls.join('+')} = ${dTotal}`)
              animParts.push(dExpr)
              animValues.push(...dRolls.map(Number))
            } else if (isDmg) {
              lines.push(`  ⚔️ ${desc || sv.title || '伤害'}（请手动确定伤害值）`)
            } else {
              lines.push(`  ✨ ${desc}`)
            }
          }
        }
      }

    /* ── ability：奇能（掷骰治疗/伤害） ── */
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
        animParts.push(`${scaledDice}d${sides}`)
        animValues.push(...rolls.map(Number))

        if (isHeal) {
          // 治疗直接生效，不再弹窗确认
          const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
          const newHp = Math.min(maxHp, runningHp + total)
          const healAmount = newHp - runningHp
          if (healAmount > 0) {
            patch.hp = { ...(patch.hp || char.hp), current: newHp }
            runningHp = newHp
            lines.push(`💚 ${ev.title || '治疗'}: ${diceStr}${modLabel} = ${total}`)
          } else {
            lines.push(`💚 ${ev.title || '治疗'}: ${diceStr}${modLabel} = ${total}（已满血）`)
          }
        } else {
          lines.push(`⚔️ ${ev.title || '伤害'}: ${diceStr}${modLabel} = ${total}`)
        }
      } else if (ev.text) {
        lines.push(ev.text)
      }

    /* ── temp_buff：临时 BUFF / 架势 ── */
    } else if (eff.type === 'temp_buff') {
      const buffName = (ev.buffName || '临时BUFF').trim()
      const modules = Array.isArray(ev.modules) ? ev.modules : []
      if (modules.length > 0) {
        if (norm.isStance) {
          // ── 架势模式：替换旧架势，缩放模块 ──
          const stanceFactor = ctx.isSpellSlot ? (norm.slotLevel || 1) : amt
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
          const slotFactor = isFreeSlot ? Math.max(1, Math.floor(Number(amt) || 1)) : 1
          const installedModules = modules.map((m) => {
            if (slotFactor <= 1 || m.applyMultiplier === false) return { ...m }
            const v = m.value && typeof m.value === 'object' && !Array.isArray(m.value) ? { ...m.value } : m.value
            if (v && typeof v === 'object') {
              for (const key of Object.keys(v)) {
                if (typeof v[key] === 'number' && key !== 'diceSides') v[key] = v[key] * slotFactor
              }
            }
            return { ...m, value: v }
          })
          const newBuff = {
            id: String(Date.now()) + '_' + Math.random().toString(36).slice(2, 7),
            source: featureName || buffName,
            effects: installedModules,
            enabled: true,
            sourceKind: 'temporary',
            duration: ev.duration || { type: 'until_short_rest' },
          }
          const currentBuffs = Array.isArray(char.buffs) ? char.buffs : []
          patch.buffs = [...(patch.buffs || currentBuffs), newBuff]
          lines.push(`✨ 安装临时BUFF: ${buffName}（${modules.length}个效果${slotFactor > 1 ? `，勾选细项×${slotFactor}` : ''}）`)
        }
      } else {
        lines.push(`⚠️ ${buffName}：无效果模块`)
      }

    /* ── creature_transform：变身 ── */
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

    /* ── restore_spell_slots：恢复法术位 ── */
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

    /* ── consume_spell_slot_to_restore_charges：消耗法术位恢复充能 ── */
    } else if (eff.type === 'consume_spell_slot_to_restore_charges') {
      const slotLevel = ev.slotLevel || 2
      const restoreAmount = ev.restoreAmount || 1
      const currentSlots = { ...(char.spellSlots || {}) }
      const availableInSlot = currentSlots[slotLevel] || 0

      if (availableInSlot > 0) {
        const newSlots = { ...currentSlots, [slotLevel]: availableInSlot - 1 }
        patch.spellSlots = newSlots

        const invId = effectiveChargeValue?.itemInventoryId || ''
        const invIdx = invId ? (char.inventory || []).findIndex(e => e.id === invId) : -1
        if (invIdx >= 0) {
          const entry = char.inventory[invIdx]
          const chargeMax = getEntryChargeMax(entry, char) ?? 0
          const curCharge = Math.max(0, Number(entry.charge) || 0)
          const newCharge = chargeMax > 0 ? Math.min(chargeMax, curCharge + restoreAmount) : curCharge + restoreAmount
          const baseInv = Array.isArray(patch.inventory) ? patch.inventory : (char.inventory || [])
          patch.inventory = baseInv.map((e, i) =>
            i === invIdx ? { ...e, charge: newCharge } : e
          )
          lines.push(`⚡ 消耗${slotLevel}环法术位，恢复 ${restoreAmount} 点充能（剩余 ${newCharge}/${chargeMax}）`)
        } else {
          lines.push(`⚡ 消耗${slotLevel}环法术位（未找到关联物品）`)
        }
      } else {
        lines.push(`⚠️ ${slotLevel}环法术位不足，无法恢复充能`)
      }

    /* ── summon：召唤（含星辰替身） ── */
    } else if (eff.type === 'summon') {
      if (ev.preset === 'stellar_double') {
        const tempHp = Number(char.hp?.temp) || 0
        const realCurrentHp = Math.max(0, runningHp - tempHp)
        const hpCost = Math.floor(realCurrentHp / 2)
        const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
        const cloneHp = Math.floor(maxHp / 2)
        const newHp = Math.max(0, runningHp - hpCost)
        patch.hp = { ...(patch.hp || char.hp), current: newHp }
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
        patch.summonedCreatures = [...(patch.summonedCreatures || currentSummons), cloneData]

        // 同步到顶栏召唤槽（stellarClones + summonSlots）
        const stellarCloneEntry = {
          id: cloneId,
          name: '星辰分身',
          hp: { current: cloneHp, max: cloneHp },
        }
        const currentStellar = Array.isArray(char.stellarClones) ? char.stellarClones : []
        patch.stellarClones = [...(patch.stellarClones || currentStellar), stellarCloneEntry]
        const curSlots = Array.isArray(patch.summonSlots) ? patch.summonSlots : (Array.isArray(char.summonSlots) ? char.summonSlots : [null, null, null, null])
        const slotsCopy = curSlots.slice(0, 4)
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

        // 计算召唤物 HP（兼容 数字 / 公式字符串 / 对象 三种格式）
        const summonHp = parseCreatureHp(creature.hp)

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
        patch.summonedCreatures = [...(patch.summonedCreatures || currentSummons), summonData]
        lines.push(`📦 召唤: ${creature.name}（${summonHp}/${summonHp} HP, AC ${creature.ac || 10}）`)

        // 处理召唤成本
        if (ev.costType && ev.costAmount > 0 || ev.costDice) {
          let costVal = ev.costAmount || 0
          let costExpr = ''
          if (ev.costDice) {
            const { total: diceTotal, rolls } = rollDice(ev.costDice)
            costVal = diceTotal
            costExpr = `${ev.costDice}=${diceTotal}`
            animParts.push(ev.costDice)
            animValues.push(...rolls.map(Number))
          }
          if (ev.costType === 'hp' && costVal > 0) {
            const newHp = Math.max(0, runningHp - costVal)
            patch.hp = { ...(patch.hp || char.hp), current: newHp }
            runningHp = newHp
            lines.push(`  💔 召唤消耗: ${costExpr || costVal} HP（剩余 ${newHp}）`)
          } else if (ev.costType === 'gold' && costVal > 0) {
            lines.push(`  💰 召唤消耗: ${costExpr || costVal} gp（请手动扣除）`)
          }
        }
      }

    /* ── custom_logic：自定义逻辑 ── */
    } else if (eff.type === 'custom_logic') {
      const desc = ev.description || ev.title || ''
      const isHealing = (desc.includes('恢复') && (desc.includes('HP') || desc.includes('生命') || desc.includes('血')))
        || desc.includes('治疗') || desc.includes('回血') || desc.includes('回满')
      if (isHealing) {
        // 治疗直接生效，不再弹窗确认
        const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
        const healedAmount = maxHp - runningHp
        if (healedAmount > 0) {
          patch.hp = { ...(patch.hp || char.hp), current: maxHp }
          runningHp = maxHp
          lines.push(`💚 生命值恢复至上限 ${maxHp}（+${healedAmount}）`)
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
            animParts.push(diceExpr)
            animValues.push(...rolls.map(Number))
          } else {
            // 无骰子配置：显示文字提示，由玩家手动确定伤害值
            lines.push(`⚔️ ${desc || ev.title || '伤害'}（请手动确定伤害值）`)
          }
        } else {
          lines.push(`✨ ${desc}`)
        }
      }

    /* ── add_roll_dice：增加投掷数（额外骰加到目标掷骰上） ── */
    } else if (eff.type === 'add_roll_dice') {
      const diceCount = ev.diceCount || 1
      const diceSides = ev.diceSides || 10
      const diceBonus = ev.diceBonus || 0
      const diceExpr = `${diceCount}d${diceSides}`
      const { total, rolls } = rollDice(diceExpr)
      const totalWithBonus = total + diceBonus
      const bonusStr = diceBonus > 0 ? `+${diceBonus}` : (diceBonus < 0 ? `${diceBonus}` : '')
      const note = ev.note ? `（${ev.note}）` : ''
      lines.push(`🎲 增加投掷数${note}: ${rolls.join('+')}${bonusStr} = ${totalWithBonus}（加到目标掷骰上）`)
      animParts.push(diceBonus !== 0 ? `${diceExpr}${diceBonus > 0 ? '+' : ''}${diceBonus}` : diceExpr)
      animValues.push(...rolls.map(Number))

    /* ── damage：直接伤害 ── */
    } else if (eff.type === 'damage') {
      let dv = { ...ev }
      // 等级缩放
      if (dv.levelScaling?.length) {
        dv = resolveLevelScaling(dv, dv.levelScaling, char, ['diceCount', 'diceSides', 'diceBonus'])
      }
      // 武器同步
      let damageType = dv.damageType || 'fire'
      if (dv.syncWithWeapon) {
        const weaponType = getMainHandWeaponDamageType(char)
        if (weaponType) damageType = weaponType
      }
      const diceCount = scaled.diceCount ?? (dv.diceCount || 1)
      const diceSides = dv.diceSides || 6
      const diceBonus = scaled.flatBonus ?? (dv.diceBonus || 0)

      if (diceCount > 0) {
        const diceExpr = `${diceCount}d${diceSides}`
        const bonusStr = diceBonus > 0 ? `+${diceBonus}` : ''
        if (skipDamageDice) {
          lines.push(`⚔️ ${ev.title || '伤害'}: ${diceExpr}${bonusStr} ${damageType}`)
        } else {
          const { total, rolls } = rollDice(diceExpr)
          const totalWithBonus = total + diceBonus
          lines.push(`⚔️ ${ev.title || '伤害'}: ${rolls.join('+')}${bonusStr} = ${totalWithBonus} ${damageType}`)
          animParts.push(diceBonus > 0 ? `${diceExpr}+${diceBonus}` : diceExpr)
          animValues.push(...rolls.map(Number))
        }
      }

    /* ── heal：直接治疗 ── */
    } else if (eff.type === 'heal') {
      // 直接治疗效果：掷骰并恢复HP
      const diceCount = scaled.diceCount ?? (ev.diceCount || 1)
      const diceSides = ev.diceSides || 8
      const diceBonus = scaled.flatBonus ?? (ev.diceBonus || 0)
      const healMode = ev.mode || 'dice'

      if (healMode === 'max') {
        // 恢复到满血
        const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
        const healedAmount = maxHp - runningHp
        if (healedAmount > 0) {
          patch.hp = { ...(patch.hp || char.hp), current: maxHp }
          runningHp = maxHp
          lines.push(`💚 ${ev.title || '治疗'}: 恢复至满血 (${maxHp})`)
        } else {
          lines.push(`💚 ${ev.title || '治疗'}: 已满血`)
        }
      } else if (diceCount > 0) {
        const diceExpr = `${diceCount}d${diceSides}`
        const { total, rolls } = rollDice(diceExpr)
        const bonusStr = diceBonus > 0 ? `+${diceBonus}` : ''
        const totalWithBonus = total + diceBonus
        animParts.push(diceBonus > 0 ? `${diceExpr}+${diceBonus}` : diceExpr)
        animValues.push(...rolls.map(Number))
        const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
        const newHp = Math.min(maxHp, runningHp + totalWithBonus)
        const healedAmount = newHp - runningHp

        if (healedAmount > 0) {
          patch.hp = { ...(patch.hp || char.hp), current: newHp }
          runningHp = newHp
          lines.push(`💚 ${ev.title || '治疗'}: ${rolls.join('+')}${bonusStr} = ${totalWithBonus}（实际恢复 ${healedAmount}）`)
        } else {
          lines.push(`💚 ${ev.title || '治疗'}: ${rolls.join('+')}${bonusStr} = ${totalWithBonus}（已满血）`)
        }
      }

    /* ── shield：临时生命 ── */
    } else if (eff.type === 'shield') {
      const shieldAmount = scaled.amount ?? (ev.amount || 0)
      if (shieldAmount > 0) {
        const currentTemp = Number(patch.hp?.temp ?? char.hp?.temp) || 0
        const newTemp = Math.max(currentTemp, shieldAmount)
        patch.hp = { ...(patch.hp || char.hp || {}), temp: newTemp }
        lines.push(`🛡️ ${ev.title || '护盾'}: 获得 ${shieldAmount} 点临时生命${newTemp > currentTemp ? '' : '（未超过现有临时生命）'}`)
      }

    /* ── random_table：随机库（骰子/扑克），命中条目递归处理 ── */
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
        // 递归处理命中条目的子效果（isStance 置 false：表内 BUFF 一律为临时 BUFF）
        const subResult = processAllEffects({
          ...ctx,
          norm: { ...norm, isStance: false, effects: matchedEntry.effects },
          runningHpIn: runningHp,
        })
        lines.push(...subResult.lines)
        if (subResult.animParts.length > 0) {
          animParts.push(...subResult.animParts)
          animValues.push(...subResult.animValues)
        }
        runningHp = subResult.runningHp
        mergeSubEffectPatch(patch, subResult.patch, char)
      } else {
        lines.push('（未命中任何条目）')
      }
    }
  }

  return { patch, lines, animParts, animValues, runningHp }
}

/**
 * 将 random_table 递归子结果的 patch 合并进主效果 patch。
 * 子 patch 以 char 为基线构建：数组字段按 id 去重追加，
 * spellSlots/inventory 用差值合并（避免覆盖主 patch 中已变更的值）。
 */
function mergeSubEffectPatch(patch, sp, char) {
  if (!sp) return

  // spellSlots: 差值合并
  if (sp.spellSlots) {
    const base = patch.spellSlots || { ...(char.spellSlots || {}) }
    const orig = char.spellSlots || {}
    const merged = { ...base }
    for (let r = 1; r <= 9; r++) {
      const delta = (sp.spellSlots[r] || 0) - (orig[r] || 0)
      if (delta !== 0) merged[r] = Math.max(0, (base[r] || 0) + delta)
    }
    patch.spellSlots = merged
  }

  // buffs: 按 id 去重合并（子 patch.buffs = char.buffs 基线 + 新增）
  if (Array.isArray(sp.buffs)) {
    const charBuffs = Array.isArray(char.buffs) ? char.buffs : []
    const base = Array.isArray(patch.buffs) ? patch.buffs : charBuffs
    const additions = sp.buffs.filter((b) => !base.some((eb) => eb.id === b.id))
    patch.buffs = [...base, ...additions]
  }

  // hp: current 以子结果为准（runningHp 贯穿累积），temp 取较大值（护盾不叠加）
  if (sp.hp) {
    const baseHp = patch.hp || char.hp || {}
    const mergedHp = { ...baseHp, ...sp.hp }
    mergedHp.temp = Math.max(Number(baseHp.temp) || 0, Number(sp.hp.temp) || 0)
    patch.hp = mergedHp
  }

  // summonedCreatures / stellarClones: 按 id 去重合并
  for (const key of ['summonedCreatures', 'stellarClones']) {
    if (Array.isArray(sp[key])) {
      const charArr = Array.isArray(char[key]) ? char[key] : []
      const base = Array.isArray(patch[key]) ? patch[key] : charArr
      const additions = sp[key].filter((x) => !base.some((bx) => bx.id === x.id))
      patch[key] = [...base, ...additions]
    }
  }

  // inventory: 充能变更差值合并
  if (Array.isArray(sp.inventory)) {
    const charInv = Array.isArray(char.inventory) ? char.inventory : []
    const base = Array.isArray(patch.inventory) ? patch.inventory : charInv
    patch.inventory = base.map((item, i) => {
      const subItem = sp.inventory[i]
      if (!subItem) return item
      const delta = (Number(subItem.charge) || 0) - (Number(charInv[i]?.charge) || 0)
      if (delta === 0) return item
      const cap = getEntryChargeMax(item, char) ?? 0
      const val = (Number(item.charge) || 0) + delta
      return { ...item, charge: cap > 0 ? Math.max(0, Math.min(cap, val)) : Math.max(0, val) }
    })
  }

  // summonSlots / activeStance: 子结果覆盖
  for (const key of ['summonSlots', 'activeStance']) {
    if (key in sp) patch[key] = sp[key]
  }
}

/**
 * 合并资源消耗 patch 与效果处理 patch。
 * - spellSlots: 差值合并（效果侧的恢复/消耗叠加到资源扣除的基础上）
 * - buffs / summonedCreatures / stellarClones: 数组按 id 去重合并
 * - hp: 效果 patch 覆盖（HP 变化已在效果处理中累积）
 * - inventory: 充能差值合并（资源扣除 + 效果恢复叠加）
 * - summonSlots / activeStance / classResources: 直接覆盖
 */
function mergePatches(resourcePatch, effectPatch, char) {
  const merged = { ...resourcePatch }

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

  if (Array.isArray(effectPatch.buffs)) {
    const charBuffs = Array.isArray(char.buffs) ? char.buffs : []
    const base = Array.isArray(merged.buffs) ? merged.buffs : charBuffs
    const additions = effectPatch.buffs.filter((b) => !base.some((eb) => eb.id === b.id))
    merged.buffs = [...base, ...additions]
  }

  if (effectPatch.hp) {
    merged.hp = effectPatch.hp
  }

  for (const key of ['summonedCreatures', 'stellarClones']) {
    if (Array.isArray(effectPatch[key])) {
      const charArr = Array.isArray(char[key]) ? char[key] : []
      const base = Array.isArray(merged[key]) ? merged[key] : charArr
      const additions = effectPatch[key].filter((x) => !base.some((bx) => bx.id === x.id))
      merged[key] = [...base, ...additions]
    }
  }

  if (Array.isArray(effectPatch.inventory)) {
    const charInv = Array.isArray(char.inventory) ? char.inventory : []
    const base = Array.isArray(merged.inventory) ? merged.inventory : charInv
    merged.inventory = base.map((item, i) => {
      const effItem = effectPatch.inventory[i]
      if (!effItem) return item
      const delta = (Number(effItem.charge) || 0) - (Number(charInv[i]?.charge) || 0)
      if (delta === 0) return item
      const cap = getEntryChargeMax(item, char) ?? 0
      const val = (Number(item.charge) || 0) + delta
      return { ...item, charge: cap > 0 ? Math.max(0, Math.min(cap, val)) : Math.max(0, val) }
    })
  }

  for (const key of ['summonSlots', 'activeStance', 'classResources']) {
    if (key in effectPatch) merged[key] = effectPatch[key]
  }

  return merged
}

/* ══════════════════════════════════════════════════════════════
 * PrepareStepContent — 准备步骤：资源选择 + 生物选择 + 错误提示
 * ══════════════════════════════════════════════════════════════ */
function PrepareStepContent({
  norm, char, amt, setAmt, maxAmount,
  isSpellSlot, isFreeSlot, isNone, isClassResource, resLabel,
  needsCreatureSelection, availableCreatures, selectedCreatureId, setSelectedCreatureId,
  resourceError,
}) {
  const hasTransform = (norm.effects || []).some((e) => e.type === 'creature_transform')
    || (norm.effects || []).some((e) => e.type === 'spell' && Array.isArray(e.value?.subEffects) && e.value.subEffects.some((se) => se.type === 'creature_transform'))
  const totalSlotsLeft = (() => {
    const slots = char?.spellSlots || {}
    let total = 0
    for (let r = 1; r <= 9; r++) total += (slots[r] || 0)
    return total
  })()

  return (
    <div className="space-y-3">
      {/* 资源选择 */}
      <div className="flex items-center gap-x-2 flex-wrap">
        {isSpellSlot || isFreeSlot ? (
          // 法术位：显示环位信息和剩余数量
          <>
            <span className="text-xs text-gray-300">消耗</span>
            {isFreeSlot && (
              <>
                <select
                  value={amt}
                  onChange={(e) => setAmt(Number(e.target.value))}
                  className="h-7 px-1.5 rounded bg-gray-700/60 border border-gray-600 text-xs text-dnd-gold-light cursor-pointer"
                >
                  {Array.from({ length: (norm.maxSlotLevel || 1) }, (_, i) => i + 1).map((level) => (
                    <option key={level} value={level}>{level}环</option>
                  ))}
                </select>
                <span className="text-[10px] text-gray-500">
                  自由消耗（效果 ×{amt}，剩余法术位 {totalSlotsLeft}）
                </span>
              </>
            )}
            {isSpellSlot && (
              <span className="text-[10px] text-gray-500">
                {norm.slotLevel || 1}环法术位（剩余 {char?.spellSlots?.[norm.slotLevel || 1] ?? 0}）
              </span>
            )}
          </>
        ) : isNone ? (
          // 无消耗
          <span className="text-xs text-gray-500">无消耗</span>
        ) : (
          // 充能数/职业资源：显示数量选择器
          <>
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
              {isClassResource
                ? `${resLabel}（剩余 ${(() => { const res = (char?.classResources || []).find((r) => r.resourceKey === norm.resourceType); return res ? `${res.current}/${res.max}` : '?' })()}）`
                : `充能（总 ${norm.charges}）`
              }
            </span>
          </>
        )}
      </div>

      {/* 生物选择下拉菜单（荒野变形/召唤时需要选择目标生物） */}
      {needsCreatureSelection && (
        <div className="pt-3 border-t border-gray-700/50">
          <label className="block text-xs text-gray-400 mb-1.5">
            选择{hasTransform ? '变身' : '召唤'}目标生物：
          </label>
          <select
            value={selectedCreatureId || ''}
            onChange={(e) => setSelectedCreatureId(e.target.value || null)}
            className="w-full px-2 py-1.5 rounded-md text-xs bg-gray-800 text-gray-200 border border-gray-600 focus:border-dnd-gold/50 focus:ring-1 focus:ring-dnd-gold/30 outline-none"
          >
            <option value="">— 请选择生物 —</option>
            {availableCreatures.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}（CR {c.cr || '?'}，{c.size || '中型'}）
              </option>
            ))}
          </select>
          {availableCreatures.length === 0 && (
            <div className="mt-1 text-[10px] text-gray-500">生物库中没有符合条件的生物</div>
          )}
        </div>
      )}

      {/* 资源不足 / 前置条件错误提示 */}
      {resourceError && (
        <div className="px-2.5 py-1.5 rounded bg-red-900/20 border border-red-500/30 text-[11px] text-red-400">
          ⚠️ {resourceError}
        </div>
      )}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
 * ConfirmStepContent — 确认步骤：资源摘要 + 效果预览 + 命中信息
 * ══════════════════════════════════════════════════════════════ */
function ConfirmStepContent({
  norm, featureName, flowType, amt, executeLabel,
  isSpellSlot, isFreeSlot, isNone, isClassResource, resLabel,
  computeSpellDC, computeSpellAttack, selectedCreatureId, attackPreset,
}) {
  const previewLines = useMemo(() => generatePreviewLines(norm.effects, featureName), [norm.effects, featureName])
  const damageFormulas = useMemo(() => extractDamageFormulas(norm.effects, amt, isFreeSlot), [norm.effects, amt, isFreeSlot])
  const saveInfo = useMemo(() => extractSaveInfo(norm.effects), [norm.effects])
  const selectedCreature = selectedCreatureId ? getCreatureById(selectedCreatureId) : null

  let resourceSummary
  if (isSpellSlot) resourceSummary = `${amt} 个${norm.slotLevel || 1}环法术位`
  else if (isFreeSlot) resourceSummary = `1 个${amt}环及以上法术位（效果 ×${amt}）`
  else if (isNone) resourceSummary = '无资源消耗'
  else if (isClassResource) resourceSummary = `${amt} 点${resLabel}`
  else resourceSummary = `${amt} 点充能`

  const presetAtk = attackPreset?.getAttack ? attackPreset.getAttack() : null
  const presetPlan = attackPreset?.getDamagePlan ? attackPreset.getDamagePlan() : null
  const presetFlatMod = Number(presetPlan?.flatMod) || 0
  const spellAttackBonus = flowType === 'attack' && !attackPreset ? computeSpellAttack() : null
  const spellDC = flowType === 'save' ? computeSpellDC() : null
  const attackBonusShown = attackPreset ? (Number(presetAtk?.bonus) || 0) : spellAttackBonus

  return (
    <div className="space-y-2.5">
      {/* 资源摘要 */}
      <div className="px-2.5 py-1.5 rounded bg-[#232a3b] border border-gray-700/50 text-[11px] text-gray-300">
        消耗：<span className="text-dnd-gold-light">{resourceSummary}</span>
      </div>

      {/* 攻击型：攻击加值 + 问 DM 提示 */}
      {flowType === 'attack' && (
        <div className="px-2.5 py-1.5 rounded bg-[#232a3b] border border-gray-700/50 text-[11px] text-gray-300">
          🎯 {attackPreset ? '攻击加值' : '法术攻击加值'}：<span className="text-dnd-gold-light">{attackBonusShown != null ? `${attackBonusShown >= 0 ? '+' : ''}${attackBonusShown}` : '?'}</span>
          <span className="text-gray-500">（投 d20 后询问 DM 是否命中）</span>
        </div>
      )}

      {/* 豁免型：豁免 DC */}
      {flowType === 'save' && saveInfo && (
        <div className="px-2.5 py-1.5 rounded bg-[#232a3b] border border-gray-700/50 text-[11px] text-gray-300">
          🛡️ {saveInfo.spellName || '法术'} 豁免DC <span className="text-dnd-gold-light">{spellDC ?? '?'}</span>（{saveInfo.saveType} 豁免，由 DM 裁决）
        </div>
      )}

      {/* 效果预览（物理预设改显伤害构成：预设不走效果管线，norm.effects 恒空） */}
      <div>
        <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">{attackPreset ? '伤害构成' : '效果预览'}</div>
        <div className="space-y-1 text-xs text-gray-300">
          {attackPreset ? (
            <>
              {(presetPlan?.diceList || []).length > 0
                ? presetPlan.diceList.map((d, i) => <div key={i}>{d?.dice} {String(d?.type || '').trim() || '—'}</div>)
                : <div className="text-gray-500">(无伤害骰)</div>}
              {presetFlatMod !== 0 && <div>固定加值 {presetFlatMod >= 0 ? '+' : ''}{presetFlatMod}</div>}
            </>
          ) : (
            previewLines.length > 0
              ? previewLines.map((line, i) => <div key={i}>{line}</div>)
              : <div className="text-gray-500">(未配置效果)</div>
          )}
        </div>
      </div>

      {/* 伤害公式 */}
      {damageFormulas.length > 0 && (
        <div>
          <div className="text-[10px] text-gray-500 uppercase tracking-wide mb-1">伤害骰</div>
          <div className="space-y-1 text-xs">
            {damageFormulas.map((f, i) => (
              <div key={i} className="text-gray-300">
                <span className="text-red-300">{f.label}</span>:{' '}
                <span className="text-red-400/90">{f.formula}</span>
                {f.damageType ? <span className="text-gray-500"> {f.damageType}</span> : null}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 已选目标生物 */}
      {selectedCreature && (
        <div className="text-[11px] text-gray-400">
          目标生物：<span className="text-rose-300">{selectedCreature.name}</span>（CR {selectedCreature.cr ?? '?'}，{selectedCreature.size || '中型'}）
        </div>
      )}

      {/* 不可撤回警告 */}
      <div className="text-[10px] text-gray-500 leading-relaxed">
        点击"{executeLabel}"后将立即消耗资源{flowType === 'attack' ? '并投出攻击骰' : '并执行效果'}，无法撤回。
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════
 * AbilityUseModal — 主组件（状态机）
 * ══════════════════════════════════════════════════════════════ */
export default function AbilityUseModal({ chargeValue, activeAbility, char, featureName, onConfirm, onClose, attackPreset }) {
  // 投骰瞬间读最新 preset，避免弹窗打开期间的旧闭包把数值冻成快照
  const presetRef = useRef(attackPreset)
  presetRef.current = attackPreset
  const displayName = attackPreset?.name || featureName || ''

  // 支持两种输入：chargeValue（充能物品）或 activeAbility（主动技能）
  const effectiveChargeValue = useMemo(
    () => chargeValue || (activeAbility ? activeAbilityToChargeValue(activeAbility) : null),
    [chargeValue, activeAbility]
  )
  const norm = useMemo(() => {
    const base = normalizeChargeItemValue(effectiveChargeValue)
    // 预设自带伤害构成与消耗规则，由 getter 在投骰那一刻现算；再走效果管线会重复投一遍、重复扣一次
    return attackPreset ? { ...base, resourceType: 'none', effects: [] } : base
  }, [effectiveChargeValue, attackPreset])

  /* ── 状态机 ── */
  const [step, setStep] = useState('prepare') // prepare | confirm | roll_attack | roll_damage | result
  const [resultLines, setResultLines] = useState(null)
  const [resultFailed, setResultFailed] = useState(false)

  /* ── 准备步骤状态 ── */
  const [amt, setAmt] = useState(1)
  const maxAmount = useMemo(() => getMaxSpendableAmount(norm, char), [norm, char])
  const [selectedCreatureId, setSelectedCreatureId] = useState(null)

  /* ── 攻击骰结果（携带已消耗资源的 patch，命中/未命中时引用） ── */
  const [attackResult, setAttackResult] = useState(null) // { natural, bonus, total, isCrit, critMin, critDiceMultiplier, isFumble, advantage, resourcePatch, resourceLines }

  /* ── 不可撤回提示 ── */
  const [showIrreversible, setShowIrreversible] = useState(false)

  /* ── 派生值 ── */
  const flowType = useMemo(() => (attackPreset ? 'attack' : classifyFlowType(norm.effects)), [norm.effects, attackPreset])
  const hasDice = useMemo(() => hasDiceEffects(norm.effects), [norm.effects])
  const stepLabels = useMemo(() => getStepLabels(flowType, hasDice), [flowType, hasDice])
  const lastStepIndex = stepLabels.length - 1
  const stepIndex = ({ prepare: 0, confirm: 1, roll_attack: 2, roll_damage: lastStepIndex - 1, result: lastStepIndex })[step] ?? 0
  const executeLabel = flowType === 'attack' ? '投攻击骰' : (hasDice ? '投伤害骰' : '执行')

  const isSpellSlot = isFixedSlotConsumption(norm)
  const isFreeSlot = isFreeSlotConsumption(norm)
  const isNone = norm.resourceType === 'none'
  const isClassResource = norm.resourceType !== 'charges' && !isSpellSlot && !isFreeSlot && !isNone
  const resLabel = RESOURCE_TYPE_OPTIONS.find((o) => o.value === norm.resourceType)?.label ?? norm.resourceType

  /* ── 生物选择（creature_transform / summon 无预置 creatureId 时需要） ── */
  const needsCreatureSelection = useMemo(() => {
    const checkEffects = (effs) => (effs || []).some((eff) =>
      (eff.type === 'creature_transform' && !eff.value?.creatureId) ||
      (eff.type === 'summon' && eff.value?.preset !== 'stellar_double' && !eff.value?.creatureId)
    )
    if (checkEffects(norm.effects)) return true
    for (const eff of norm.effects) {
      if (eff.type === 'spell' && checkEffects(eff.value?.subEffects)) return true
      if (eff.type === 'random_table') {
        for (const entry of (eff.value?.entries || [])) {
          if (checkEffects(entry.effects)) return true
        }
      }
    }
    return false
  }, [norm.effects])

  // 计算德鲁伊等级用于 CR 限制（getCharacterClasses 返回 { name, level }，name 为规范中文职业名）
  const druidLevel = useMemo(() => {
    if (!char) return 0
    const classes = getCharacterClasses(char)
    const druidClass = classes.find((c) => c.name === '德鲁伊')
    return druidClass?.level || 0
  }, [char])

  const maxCR = useMemo(() => {
    // 德鲁伊变身 CR 限制：等级/3（向下取整），最低 CR 1/4
    if (druidLevel <= 0) return null
    const cr = Math.max(0.25, Math.floor(druidLevel / 3))
    return cr >= 1 ? cr : 0.25
  }, [druidLevel])

  // 获取可用生物列表（用于下拉选择），德鲁伊变身受 CR 限制
  const availableCreatures = useMemo(() => {
    if (!needsCreatureSelection) return []
    return listCreatures(maxCR != null ? { maxCr: maxCR } : {})
  }, [needsCreatureSelection, maxCR])

  /* ── 荒野变形检测（资源扣减 + 前置校验用） ── */
  const hasWildShapeTransform = useMemo(() => (norm.effects || []).some((eff) => {
    if (eff.type === 'creature_transform') return !!eff.value?.wildShapeMode
    if (eff.type === 'spell' && Array.isArray(eff.value?.subEffects)) {
      return eff.value.subEffects.some((s) => s.type === 'creature_transform' && !!s.value?.wildShapeMode)
    }
    return false
  }), [norm.effects])

  /* ── 法术 DC / 攻击加值 ── */
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

  /**
   * 自由消耗法术位：从指定环位开始向上寻找第一个可用环位，消耗 1 个。
   * 返回 { newSlots, consumedRing, consumed, line }，未消耗时保持原 slots 不变。
   */
  const consumeFreeSpellSlot = useCallback((spellSlots, slotLevel) => {
    const currentSlots = { ...(spellSlots || {}) }
    const level = Math.max(1, Math.min(9, Number(slotLevel) || 1))
    for (let r = level; r <= 9; r++) {
      if ((currentSlots[r] || 0) > 0) {
        currentSlots[r] -= 1
        return {
          newSlots: currentSlots,
          consumedRing: r,
          consumed: true,
          line: `消耗 1 个${r}环法术位（×${level} 倍）`,
        }
      }
    }
    return {
      newSlots: spellSlots || {},
      consumedRing: 0,
      consumed: false,
      line: `自由消耗 ${level} 环（无法术位可用）`,
    }
  }, [])

  /* ── 资源充足性检查（准备步骤禁用按钮 + 错误提示） ── */
  const resourceError = useMemo(() => {
    if (!char) return '缺少角色数据'
    if (isSpellSlot) {
      const ring = norm.slotLevel || 1
      const left = char.spellSlots?.[ring] || 0
      if (left < amt) return `${ring}环法术位不足（需要 ${amt}，剩余 ${left}）`
    } else if (isFreeSlot) {
      let hasSlot = false
      for (let r = (amt || 1); r <= 9; r++) {
        if ((char.spellSlots?.[r] || 0) > 0) { hasSlot = true; break }
      }
      if (!hasSlot) return `无法术位可用（${amt}环及以上）`
    } else if (isClassResource) {
      const res = (char.classResources || []).find((r) => r.resourceKey === norm.resourceType)
      if (res && (res.current || 0) < amt) return `${resLabel}不足（需要 ${amt}，剩余 ${res.current || 0}）`
    } else if (!isNone && norm.resourceType === 'charges') {
      const invId = effectiveChargeValue?.itemInventoryId || ''
      const invIdx = invId ? (char.inventory || []).findIndex((e) => e.id === invId) : -1
      if (invIdx >= 0) {
        const curCharge = Math.max(0, Number(char.inventory[invIdx].charge) || 0)
        if (curCharge < amt) return `充能不足（需要 ${amt}，剩余 ${curCharge}）`
      }
    }
    // 荒野变形预检：次数耗尽或缺少资源条目时阻止变身
    if (hasWildShapeTransform) {
      const costIsWildShape = isClassResource && norm.resourceType === 'wild_shape'
      if (!costIsWildShape) {
        const wsRes = (char.classResources || []).find((r) => r.resourceKey === 'wild_shape')
        if (wsRes) {
          if ((wsRes.current || 0) <= 0) return '荒野变形次数已用尽，无法变身'
        } else {
          return '未找到荒野变形资源条目，无法变身'
        }
      }
    }
    if (needsCreatureSelection && !selectedCreatureId) return '请选择目标生物'
    if (amt < 1 || amt > maxAmount) return '消耗数量无效'
    return null
  }, [char, isSpellSlot, isFreeSlot, isClassResource, isNone, norm, amt, maxAmount, effectiveChargeValue, hasWildShapeTransform, needsCreatureSelection, selectedCreatureId, resLabel])

  /* ── 资源消耗（进入第 3 步时调用） ── */
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
      // 自由消耗：amt 即选择的环位，从该环向上寻找第一个可用法术位
      const { newSlots, consumed, line } = consumeFreeSpellSlot(char.spellSlots, amt)
      if (consumed) patch.spellSlots = newSlots
      lines.push(line)
    } else if (isClassResource) {
      const res = (char.classResources || []).find((r) => r.resourceKey === norm.resourceType)
      if (res) {
        patch.classResources = (char.classResources || []).map((r) => {
          if (r.resourceKey !== norm.resourceType) return r
          return { ...r, current: Math.max(0, (r.current || 0) - amt) }
        })
      }
      lines.push(`消耗 ${amt} ${resLabel}`)
    } else if (isNone) {
      lines.push('无资源消耗')
    } else {
      // charges 类型：从物品库存中扣减充能
      const invId = effectiveChargeValue?.itemInventoryId || ''
      const invIdx = invId ? (char.inventory || []).findIndex((e) => e.id === invId) : -1
      if (invIdx >= 0) {
        const entry = char.inventory[invIdx]
        const currentCharge = Math.max(0, Number(entry.charge) || 0)
        const newCharge = Math.max(0, currentCharge - amt)
        patch.inventory = (char.inventory || []).map((e, i) => (i === invIdx ? { ...e, charge: newCharge } : e))
        lines.push(`消耗 ${amt} 充能（剩余 ${newCharge}/${getEntryChargeMax(entry, char) ?? norm.charges}）`)
      } else {
        lines.push(`消耗 ${amt} 充能（共 ${norm.charges}）`)
      }
    }

    // 荒野变形额外扣减（资源消耗本身不是 wild_shape 时）
    if (hasWildShapeTransform) {
      const costIsWildShape = isClassResource && norm.resourceType === 'wild_shape'
      if (!costIsWildShape) {
        const wsRes = (char.classResources || []).find((r) => r.resourceKey === 'wild_shape')
        if (wsRes) {
          patch.classResources = (patch.classResources || char.classResources || []).map((r) =>
            r.resourceKey === 'wild_shape' ? { ...r, current: Math.max(0, (r.current || 0) - 1) } : r
          )
          lines.push('🐾 荒野变形次数 -1')
        }
      }
    }

    return { patch, lines }
  }, [char, norm, amt, isSpellSlot, isFreeSlot, isClassResource, isNone, effectiveChargeValue, resLabel, consumeFreeSpellSlot, hasWildShapeTransform])

  /* ── 不可撤回提示（2 秒后淡出） ── */
  const flashIrreversible = useCallback(() => {
    setShowIrreversible(true)
    setTimeout(() => setShowIrreversible(false), 2000)
  }, [])

  /* ── 效果处理上下文 ── */
  const buildEffectsCtx = useCallback((overrides = {}) => ({
    char, norm, amt, featureName, selectedCreatureId,
    isSpellSlot, isFreeSlot, isClassResource, isNone, resLabel,
    effectiveChargeValue, computeSpellDC, computeSpellAttack,
    skipDamageDice: false,
    ...overrides,
  }), [char, norm, amt, featureName, selectedCreatureId, isSpellSlot, isFreeSlot, isClassResource, isNone, resLabel, effectiveChargeValue, computeSpellDC, computeSpellAttack])

  /* ── 步骤 3（攻击型）：消耗资源 → 投 d20 → 等待 DM 裁决 ── */
  const executeAttackStep = useCallback(() => {
    const { patch: resourcePatch, lines: resourceLines } = consumeResources()
    flashIrreversible()

    const atk = presetRef.current?.getAttack ? presetRef.current.getAttack() : null
    const isPreset = !!atk
    const atkBonus = isPreset ? (Number(atk.bonus) || 0) : (computeSpellAttack() || 0)
    const adv = atk && (atk.advantage === 'advantage' || atk.advantage === 'disadvantage') ? atk.advantage : null
    const rawCritMin = Number(atk?.critThreatMinNatural)
    const critMin = Number.isFinite(rawCritMin) && rawCritMin >= 1 ? Math.min(20, Math.floor(rawCritMin)) : 20
    const critDiceMultiplier = Math.max(2, Number(atk?.critDiceMultiplier) || 2)

    let natural, diceValues, formula
    if (adv) {
      const a = rollDice('1d20'), b = rollDice('1d20')
      diceValues = [a.total, b.total]
      formula = '2d20'
      natural = adv === 'advantage' ? Math.max(a.total, b.total) : Math.min(a.total, b.total)
    } else {
      const single = rollDice('1d20')
      natural = single.total
      diceValues = [single.total]
      formula = '1d20'
    }
    const total = natural + atkBonus
    const isCrit = isPreset ? natural >= critMin : natural === 20

    setAttackResult({
      natural, bonus: atkBonus, total, isCrit, critMin, critDiceMultiplier,
      isFumble: natural === 1 && !isCrit, advantage: adv, resourcePatch, resourceLines,
    })

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dnd-external-roll', { detail: { animate: true, formula, diceValues } }))
    }

    setStep('roll_attack')
  }, [consumeResources, computeSpellAttack, flashIrreversible])

  /* ── 最终执行步骤：处理所有效果 → 合并 patch → 结果页
   *    attackInfo 非空 = 攻击型命中后（资源已在攻击步骤消耗） ── */
  const executeFinalStep = useCallback((attackInfo = null) => {
    let resourcePatch
    const allLines = []

    if (attackInfo) {
      resourcePatch = attackInfo.resourcePatch
      allLines.push(...attackInfo.resourceLines)
      allLines.push(`🎯 攻击骰: d20=${attackInfo.natural}${attackInfo.bonus >= 0 ? '+' : ''}${attackInfo.bonus} = ${attackInfo.total}（命中${attackInfo.isCrit ? '，暴击' : ''}）`)
    } else {
      // 豁免型/通用型：在此消耗资源
      const consumed = consumeResources()
      resourcePatch = consumed.patch
      allLines.push(...consumed.lines)
      flashIrreversible()
    }

    // 物理攻击预设：伤害在投骰这一刻由调用方的 getDamagePlan() 现算
    if (presetRef.current?.getDamagePlan) {
      const plan = presetRef.current.getDamagePlan() || {}
      const diceList = Array.isArray(plan.diceList) ? plan.diceList : []
      const flatMod = Number(plan.flatMod) || 0
      const mult = attackInfo?.isCrit ? Math.max(2, Number(attackInfo.critDiceMultiplier) || 2) : 1
      const byType = {}
      const animParts = [], animValues = []
      for (const d of diceList) {
        const expr = String(d?.dice || '').trim()
        if (!expr) continue
        const type = String(d?.type || '').trim() || '—'
        const first = rollCombatDicePool(expr)
        if (!first.parsed) continue
        // 重击只翻倍骰面，表达式自带的 ±N 加一次（与 rollCombatDicePool 注释、CombatStatus 投掷口径一致）
        const { count, sides, flatMod: exprFlat } = first.parsed
        let sum = first.diceSum + exprFlat
        animValues.push(...first.rolls)
        for (let k = 1; k < mult; k++) {
          const again = rollCombatDicePool(expr)
          sum += again.diceSum
          animValues.push(...again.rolls)
        }
        byType[type] = (byType[type] || 0) + sum
        animParts.push(`${count * mult}d${sides}${exprFlat ? `${exprFlat > 0 ? '+' : ''}${exprFlat}` : ''}`)
      }
      if (flatMod) {
        const types = Object.keys(byType)
        const bucket = types.length === 1 ? types[0] : '—'
        byType[bucket] = (byType[bucket] || 0) + flatMod
      }
      const linesText = Object.entries(byType).map(([t, v]) => `${v} ${t}`).join(' + ') || '0'
      allLines.push(`🩸 伤害: ${linesText}`)
      if (mult > 1) allLines.push(`⚡ 重击：伤害骰 ×${mult}`)
      if (animParts.length > 0 && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('dnd-external-roll', {
          detail: { animate: true, formula: animParts.join(','), diceValues: animValues },
        }))
      }
      setResultFailed(false)
      setResultLines(allLines)
      setStep('result')
      onConfirm(resourcePatch, allLines)
      return
    }

    const { patch: effectPatch, lines: effectLines, animParts, animValues } = processAllEffects(buildEffectsCtx())
    allLines.push(...effectLines)

    const mergedPatch = mergePatches(resourcePatch, effectPatch, char)

    // 架势互斥：清除旧架势BUFF，若新架势未成功设置则清空引用
    if (norm.isStance && char.activeStance?.buffId) {
      const buffs = Array.isArray(mergedPatch.buffs) ? mergedPatch.buffs : (Array.isArray(char.buffs) ? char.buffs : [])
      mergedPatch.buffs = buffs.filter((b) => b.id !== char.activeStance.buffId)
      if (!mergedPatch.activeStance) {
        mergedPatch.activeStance = null
      }
    }

    if (allLines.length === 0) allLines.push('(未配置效果)')

    // 3D 骰子动画：伤害/治疗等效果骰
    if (animParts.length > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('dnd-external-roll', {
        detail: { animate: true, formula: animParts.join(','), diceValues: animValues },
      }))
    }

    setResultFailed(false)
    setResultLines(allLines)
    setStep('result')
    onConfirm(mergedPatch, allLines)
  }, [char, norm, consumeResources, buildEffectsCtx, flashIrreversible, onConfirm])

  /* ── 攻击型：DM 判定命中 → 投伤害 ── */
  const handleHit = useCallback(() => {
    if (!attackResult) return
    executeFinalStep(attackResult)
  }, [executeFinalStep, attackResult])

  /* ── 攻击型：DM 判定未命中 → 只结算资源消耗 ── */
  const handleMiss = useCallback(() => {
    if (!attackResult) return
    const allLines = [
      ...attackResult.resourceLines,
      `🎯 攻击骰: d20=${attackResult.natural}${attackResult.bonus >= 0 ? '+' : ''}${attackResult.bonus} = ${attackResult.total}${attackResult.isFumble ? '（大失败）' : ''}`,
      '💨 攻击未命中',
    ]
    setResultFailed(false)
    setResultLines(allLines)
    setStep('result')
    onConfirm(attackResult.resourcePatch, allLines)
  }, [attackResult, onConfirm])

  /* ── 步骤导航 ── */
  const goNext = () => {
    if (resourceError) return
    if (step === 'prepare') {
      setStep('confirm')
    } else if (step === 'confirm') {
      if (flowType === 'attack') executeAttackStep()
      else executeFinalStep()
    }
  }

  /* ── 结果步骤 ── */
  if (step === 'result' && resultLines) {
    return (
      <>
        <style>{MODAL_KEYFRAMES}</style>
        <div className="fixed inset-0 z-[400] bg-black/60" onClick={onClose} aria-hidden />
        <div className="fixed inset-0 z-[401] flex items-center justify-center p-4" onClick={onClose}>
          <div
            className={`bg-[#1a1f2e] border rounded-lg p-4 max-w-sm w-full shadow-xl ${resultFailed ? 'border-red-500/40' : 'border-dnd-gold/30'}`}
            onClick={(e) => e.stopPropagation()}
          >
            <AbilityStepProgressBar step={stepIndex} labels={stepLabels} />
            <div className="flex items-center justify-between mt-3 mb-3">
              <h3 className={`text-sm font-bold ${resultFailed ? 'text-red-400' : 'text-dnd-gold-light'}`}>
                {resultFailed ? '释放失败' : '使用结果'}
              </h3>
              <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">
                <X size={14} />
              </button>
            </div>
            {showIrreversible && (
              <div className="mb-2 px-3 py-1.5 rounded bg-red-900/30 border border-red-500/30 text-[10px] text-red-400 text-center animate-[fadeOut_2s_ease-in_forwards]">
                资源已消耗，无法撤回
              </div>
            )}
            <div className="space-y-1 text-xs text-gray-300 max-h-[50vh] overflow-y-auto animate-[fadeIn_200ms_ease-in]">
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

  /* ── 攻击骰步骤（roll_attack）：d20 结果 + 命中/未命中（问 DM） ── */
  if (step === 'roll_attack' && attackResult) {
    return (
      <>
        <style>{MODAL_KEYFRAMES}</style>
        <div className="fixed inset-0 z-[400] bg-black/60" aria-hidden />
        <div className="fixed inset-0 z-[401] flex items-center justify-center p-4">
          <div className="bg-[#1a1f2e] border border-dnd-gold/30 rounded-lg p-4 max-w-sm w-full shadow-xl">
            <AbilityStepProgressBar step={stepIndex} labels={stepLabels} />

            {/* 不可撤回提示 */}
            {showIrreversible && (
              <div className="mt-2 px-3 py-1.5 rounded bg-red-900/30 border border-red-500/30 text-[10px] text-red-400 text-center animate-[fadeOut_2s_ease-in_forwards]">
                资源已消耗，无法撤回
              </div>
            )}

            <div className="mt-4 text-center animate-[fadeIn_200ms_ease-in]">
              <div className="text-xs text-gray-400 mb-2">攻击骰结果（{displayName}）</div>
              <div className="text-4xl font-bold text-dnd-gold-light mb-1">{attackResult.natural}</div>
              <div className="text-sm text-gray-400">
                {attackResult.bonus >= 0 ? '+' : ''}{attackResult.bonus} = <span className="text-white font-bold text-base">{attackResult.total}</span>
              </div>
              {attackResult.isCrit && <div className="text-xs text-yellow-400 mt-1">⚡ 天然 {attackResult.natural} ≥ {attackResult.critMin} — 重击！</div>}
              {attackResult.advantage && <div className="text-[10px] text-gray-500 mt-1">{attackResult.advantage === 'advantage' ? '优势投掷' : '劣势投掷'}（取{attackResult.advantage === 'advantage' ? '高' : '低'}）</div>}
              {attackResult.isFumble && <div className="text-xs text-red-400 mt-1">💀 天然 1 — 大失败！</div>}
              <div className="text-[10px] text-gray-500 mt-2">询问 DM：攻击总值 {attackResult.total} 是否命中？</div>
            </div>

            <div className="mt-6 flex gap-3">
              <button type="button" onClick={handleMiss}
                className="flex-1 px-3 py-2 rounded-md text-xs border transition-colors hover:brightness-125"
                style={{ backgroundColor: 'rgba(230,57,70,0.2)', color: '#e63946', borderColor: 'rgba(230,57,70,0.4)' }}
              >未命中</button>
              <button type="button" onClick={handleHit}
                className="flex-1 px-3 py-2 rounded-md text-xs font-bold transition-colors hover:brightness-110"
                style={{ backgroundColor: '#c79a42', color: '#1a1f2e' }}
              >命中，投伤害</button>
            </div>
          </div>
        </div>
      </>
    )
  }

  /* ── 准备步骤 + 确认步骤 ── */
  return (
    <>
      <style>{MODAL_KEYFRAMES}</style>
      <div className="fixed inset-0 z-[400] bg-black/60" onClick={step === 'prepare' ? onClose : undefined} aria-hidden />
      <div className="fixed inset-0 z-[401] flex items-center justify-center p-4" onClick={step === 'prepare' ? onClose : undefined}>
        <div
          className="bg-[#1a1f2e] border border-dnd-gold/30 rounded-lg p-4 max-w-sm w-full shadow-xl max-h-[90vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <AbilityStepProgressBar step={stepIndex} labels={stepLabels} />

          <div className="flex items-center justify-between mt-3 mb-3">
            <h3 className="text-sm font-bold text-dnd-gold-light">
              {step === 'prepare' ? `使用 ${displayName}` : '确认释放'}
            </h3>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-white">
              <X size={14} />
            </button>
          </div>

          {/* 步骤内容：淡入动画 */}
          <div className="animate-[fadeIn_200ms_ease-in]">
            {step === 'prepare' && (
              <PrepareStepContent
                norm={norm} char={char} amt={amt} setAmt={setAmt} maxAmount={maxAmount}
                isSpellSlot={isSpellSlot} isFreeSlot={isFreeSlot} isNone={isNone}
                isClassResource={isClassResource} resLabel={resLabel}
                needsCreatureSelection={needsCreatureSelection}
                availableCreatures={availableCreatures}
                selectedCreatureId={selectedCreatureId} setSelectedCreatureId={setSelectedCreatureId}
                resourceError={resourceError}
              />
            )}
            {step === 'confirm' && (
              <ConfirmStepContent
                norm={norm} featureName={displayName} flowType={flowType}
                amt={amt} executeLabel={executeLabel}
                isSpellSlot={isSpellSlot} isFreeSlot={isFreeSlot} isNone={isNone}
                isClassResource={isClassResource} resLabel={resLabel}
                computeSpellDC={computeSpellDC} computeSpellAttack={computeSpellAttack}
                selectedCreatureId={selectedCreatureId} attackPreset={attackPreset}
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
                <button type="button" onClick={goNext} disabled={!!resourceError}
                  className="flex-1 px-3 py-2 rounded-md text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
                  style={{ backgroundColor: '#c79a42', color: '#1a1f2e' }}
                >下一步</button>
              </>
            )}
            {step === 'confirm' && (
              <>
                <button type="button" onClick={() => setStep('prepare')}
                  className="flex-1 px-3 py-2 rounded-md text-xs border border-gray-600 text-gray-400 hover:bg-gray-800 transition-colors"
                >返回</button>
                <button type="button" onClick={goNext} disabled={!!resourceError}
                  className="flex-1 px-3 py-2 rounded-md text-xs font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
                  style={{ backgroundColor: '#c79a42', color: '#1a1f2e' }}
                >{executeLabel}</button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
