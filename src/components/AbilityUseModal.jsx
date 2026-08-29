/**
 * AbilityUseModal — 主动卡使用确认弹窗
 *
 * 流程：点击"使用"→ 确认弹窗（资源数量选择 + 效果预览）→ 确认执行 → 显示结果
 * 从 ClassFeatureActions 内联弹窗提取为独立组件。
 */

import { useState, useCallback, useMemo } from 'react'
import { X } from 'lucide-react'
import {
  normalizeChargeItemValue,
  computeScaledEffect,
  getMaxSpendableAmount,
  resolveAbilityMod,
  RESOURCE_TYPE_OPTIONS,
  scaleStanceModules,
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

export default function AbilityUseModal({ chargeValue, char, featureName, onConfirm, onClose }) {
  const norm = normalizeChargeItemValue(chargeValue)
  const [amt, setAmt] = useState(1)
  const [maxAmount] = useState(() => getMaxSpendableAmount(norm, char))
  const [resultLines, setResultLines] = useState(null)
  
  // 检查是否需要选择生物（creature_transform 或 summon 效果但没有预置 creatureId）
  const needsCreatureSelection = useMemo(() => {
    return norm.effects.some(eff => 
      (eff.type === 'creature_transform' && !eff.value?.creatureId) ||
      (eff.type === 'summon' && eff.value?.preset !== 'stellar_double' && !eff.value?.creatureId)
    )
  }, [norm.effects])
  
  const [showCreatureSelector, setShowCreatureSelector] = useState(false)
  const [selectedCreatureId, setSelectedCreatureId] = useState(null)
  const [showSummonConfirm, setShowSummonConfirm] = useState(false)
  const [pendingSummonData, setPendingSummonData] = useState(null)
  
  // 检查是否有星辰替身效果
  const hasStellarDouble = useMemo(() => {
    return norm.effects.some(eff => eff.type === 'summon' && eff.value?.preset === 'stellar_double')
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

  const isSpellSlot = /^spell_slot_[1-9]$/.test(norm.resourceType)
  const isNone = norm.resourceType === 'none'
  const isClassResource = norm.resourceType !== 'charges' && !isSpellSlot && !isNone
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
    for (const eff of (norm.effects || [])) {
      const ev = eff.value || {}
      const scaled = computeScaledEffect(ev, amt)

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
            const currentHp = Number(char.hp?.current) || 0
            const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
            const newHp = Math.min(maxHp, currentHp + total)
            patch.hp = { ...char.hp, current: newHp }
            lines.push(`💚 治疗: ${diceStr}${modLabel} = ${total}`)
          } else {
            const currentHp = Number(char.hp?.current) || 0
            const newHp = Math.max(0, currentHp - total)
            patch.hp = { ...char.hp, current: newHp }
            lines.push(`⚔️ 伤害: ${diceStr}${modLabel} = ${total}`)
          }
        } else if (ev.text) {
          lines.push(ev.text)
        }
      } else if (eff.type === 'shield') {
        const scaledAmount = scaled.amount ?? (ev.amount || 1)
        lines.push(`🛡️ 护盾: ${scaledAmount}`)
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
              source: buffName,
              effects: scaledModules.map((m) => ({ ...m })),
              enabled: true,
              sourceKind: 'stance',
            }
            const currentBuffs = Array.isArray(char.buffs) ? char.buffs : []
            patch.buffs = [...currentBuffs, newBuff]
            patch.activeStance = { buffId, name: buffName, slotLevel: stanceFactor }
            lines.push(`🏋️ 架势激活: ${buffName}（${scaledModules.length}个效果，×${stanceFactor}缩放）`)
          } else {
            const newBuff = {
              id: String(Date.now()) + '_' + Math.random().toString(36).slice(2, 7),
              source: buffName,
              effects: modules.map((m) => ({ ...m })),
              enabled: true,
              sourceKind: 'temporary',
            }
            const currentBuffs = Array.isArray(char.buffs) ? char.buffs : []
            patch.buffs = [...currentBuffs, newBuff]
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
        patch.buffs = [...currentBuffs, transformBuff]
        
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
          for (let ring = 1; ring <= maxRing; ring++) {
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
          const currentHp = Number(char.hp?.current) || 0
          const tempHp = Number(char.hp?.temp) || 0
          const realCurrentHp = Math.max(0, currentHp - tempHp)
          const hpCost = Math.floor(realCurrentHp / 2)
          const maxHp = Math.max(1, (calcMaxHP(char) || 0) + (getHPBuffSum(char) || 0))
          const cloneHp = Math.floor(maxHp / 2)
          const newHp = Math.max(0, currentHp - hpCost)
          patch.hp = { ...char.hp, current: newHp }

          const cloneData = {
            id: 'stellar_double_' + Date.now(),
            name: `${char.name}的分身`,
            type: 'stellar_double',
            hp: { current: cloneHp, max: cloneHp },
            createdAt: Date.now(),
          }
          const currentSummons = Array.isArray(char.summonedCreatures) ? char.summonedCreatures : []
          patch.summonedCreatures = [...currentSummons, cloneData]
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
                const scaled = computeScaledEffect(ev, amt)
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
                    </div>
                  )
                }
                if (eff.type === 'shield') {
                  const scaledAmount = scaled.amount ?? (ev.amount || 1)
                  return (
                    <div key={i} className="text-xs text-gray-300 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-400/60 shrink-0" />
                      <span>护盾 {scaledAmount}</span>
                      {hasScaling && amt > 1 && ev.scalingEnabled && (
                        <span className="text-[9px] text-amber-400/60">×{amt}</span>
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
                    ? `恢复 ${ev.maxRing || 3} 环及以下法术位`
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
    </>
  )
}
