/**
 * 法术攻击卡片
 * 接收原始数据 + 共享上下文，内部计算并渲染法术攻击的命中/DC、伤害、射程等
 */
import React from 'react'
import { Pencil, Trash2, Dices } from 'lucide-react'
import { getDamageTypeLabel } from '../../data/buffTypes'
import { parseCombatDiceExpression } from '../../data/weaponDatabase'
import { parseSpellDamageFromDescription, applyUpcastToDamageList, getEffectiveCastLevel } from './combatMeanUtils'

const COMBAT_MEAN_ROW_GRID =
  'grid grid-cols-[5fr_3fr_3fr_12fr_1fr] items-center gap-x-1 w-full min-w-0 overflow-hidden'
const COMBAT_LIST_ROW_SHADOW = 'shadow-[0_2px_10px_rgba(0,0,0,0.42)]'
const CM_MEAN_LABEL = 'text-xs'
const CM_MEAN_HI = 'text-sm'
const CM_BTN_GOLD =
  'w-6 h-6 shrink-0 flex items-center justify-center rounded-md border border-transparent bg-transparent text-dnd-gold-light transition-colors hover:text-dnd-gold'
const CM_DICE_IC_GOLD = 'w-[2.246rem] h-[2.246rem] opacity-95'
function QuickRollIcon({ className = CM_DICE_IC_GOLD }) {
  return <Dices className={className} aria-hidden />
}
function quickRollTitle(detail) {
  return detail ? `快捷投掷按钮：${detail}` : '快捷投掷按钮'
}
function ActionLabelBadge({ source, className = '' }) {
  const label = source || '动作'
  return (
    <span className={`shrink-0 text-[10px] leading-none px-1 py-[1px] rounded border bg-gray-700 text-gray-300 border-gray-600 ${className}`} title={`动作类型：${label}`}>
      {label}
    </span>
  )
}

const HIT_RESOLUTION_LABELS = {
  dex_save: '敏捷豁免', str_save: '力量豁免', con_save: '体质豁免',
  wis_save: '感知豁免', int_save: '智力豁免', cha_save: '魅力豁免',
  spell_attack: '法术攻击',
}

function compactDiceExpression(expr) {
  return String(expr || '').trim().replace(/\s+/g, ' ')
}

function formatSignedModifier(n) {
  if (!n || n === 0) return ''
  return n > 0 ? `+${n}` : String(n)
}

export default function SpellAttackCard({ displayMean, comboSuffix = '', ctx }) {
  const {
    canEdit, isCombo, gains,
    spellAttackBonus, spellDC, buffStats, gainAttackBonus, gainDamageBonus,
    gainPerDieBonus, gainExtraDice, gainDiceFloor2,
    itemFormulaContext,
    openEditSpellAttack, openEditComboMean, removeCombatMean,
    rollDamageDice, consumeSpellSlotForMean,
    renderAutoGainBadges, getMergedSpells, char,
    registerWeaponPlan, openWeaponAttackFlow,
  } = ctx

  /* ─ 查找法术 ── */
  const mergedSpells = getMergedSpells()
  const matchedSpell = mergedSpells.find((s) => s.id === displayMean.spellId || (s.name && s.name.trim() === (displayMean.spellName || '').trim()))

  /* ── 增强施法者等级：自动升环（消耗环位不变，戏法不升环） ── */
  const casterLevelBonus = Number(buffStats?.casterLevelBonus) || 0
  const spellBaseLevel = Number(matchedSpell?.level) || 0
  const effectiveCastLevel = getEffectiveCastLevel(displayMean.slotLevel, matchedSpell?.level, casterLevelBonus)
  const upcastDiff = Math.max(0, effectiveCastLevel - spellBaseLevel)
  const upcastDamages = (upcastDiff > 0 && matchedSpell?.description)
    ? applyUpcastToDamageList(parseSpellDamageFromDescription(matchedSpell.description), matchedSpell.description, upcastDiff)
    : null
  const effectivePrimaryDice = (upcastDamages && upcastDamages.length > 0)
    ? upcastDamages[0].dice
    : (displayMean.damageDice || '').trim()

  /* ── 命中解析 ── */
  const hitRes = displayMean.hitResolution && HIT_RESOLUTION_LABELS[displayMean.hitResolution] ? displayMean.hitResolution : 'spell_attack'
  const hitLabel = HIT_RESOLUTION_LABELS[hitRes]
  const rangeDisplay = computeSpellRangeDisplay(matchedSpell?.range, buffStats?.spellRangeMultiplier, buffStats?.spellRangeBonus)
  const spellAttackForMean = spellAttackBonus != null ? spellAttackBonus + gainAttackBonus : null
  const hitValue = hitRes === 'spell_attack'
    ? (spellAttackForMean != null ? (spellAttackForMean >= 0 ? '+' : '') + spellAttackForMean : null)
    : (spellDC != null ? spellDC : null)
  
  // 构建攻击/豁免显示文本（仅数值，标签由列标题提供）
  const attackText = hitValue != null ? (hitRes === 'spell_attack' ? `+${hitValue}` : String(hitValue)) : '—'

  /* ── 伤害计算 ─ */
  const spellDiceCount = (() => { const p = parseCombatDiceExpression(effectivePrimaryDice); return p ? p.count : 0 })()
  const spellDamageExtras = getSpellDamageBonusExtras(displayMean.damageTypeSpell, buffStats?.spellDamageBonuses, itemFormulaContext)
  const spellDamageMod = gainDamageBonus + gainPerDieBonus * spellDiceCount + spellDamageExtras.flatBonus
  const allSpellExtraDice = [...gainExtraDice, ...spellDamageExtras.extraDice]
  const compactedSpellExtraDice = allSpellExtraDice.map(compactDiceExpression)
  const baseDamageText = effectivePrimaryDice
    ? compactDiceExpression(effectivePrimaryDice.toUpperCase() + (displayMean.damageTypeSpell ? ' ' + getDamageTypeLabel(displayMean.damageTypeSpell) : ''))
    : ''
  const extraDamageText = compactedSpellExtraDice.length ? (' + ' + compactedSpellExtraDice.join(' + ')) : ''
  const modDamageText = (spellDamageMod !== 0 && baseDamageText) ? ` ${formatSignedModifier(spellDamageMod)}` : ''
  const damageText = baseDamageText ? `${baseDamageText}${extraDamageText}${modDamageText}` : (compactedSpellExtraDice.length ? compactedSpellExtraDice.join(' + ') : '—')
  const spellDamageFloor2 = gainDiceFloor2
  const hasDamage = !!effectivePrimaryDice

  // 构建伤害列表（用于多步流程）
  const damageList = []
  if (effectivePrimaryDice) {
    const diceExpr = effectivePrimaryDice
    const diceMatch = diceExpr.match(/(\d+)d(\d+)/)
    if (diceMatch) {
      damageList.push({ dice: diceExpr, type: getDamageTypeLabel(displayMean.damageTypeSpell) || displayMean.damageTypeSpell || '' })
    }
  }
  allSpellExtraDice.forEach((extraDice) => {
    const diceMatch = extraDice.match(/(\d+)d(\d+)/)
    if (diceMatch) {
      const [, , typePart] = extraDice.split(/\s+/)
      damageList.push({ dice: extraDice, type: typePart || getDamageTypeLabel(displayMean.damageTypeSpell) || '' })
    }
  })

  // 法术环位消耗显示（增强施法者等级会提升有效环位）
  const baseRing = Number(displayMean.slotLevel) || Number(matchedSpell?.level) || 0
  const showsRingUpcast = casterLevelBonus > 0 && baseRing > 0 && effectiveCastLevel > baseRing
  const levelLabel = baseRing === 0 ? '戏法' : (showsRingUpcast ? `${baseRing}→${effectiveCastLevel}环` : `${baseRing}环`)
  const ringUpcastTitle = showsRingUpcast ? `消耗 ${baseRing} 环，因增强施法者等级 +${casterLevelBonus} 以 ${effectiveCastLevel} 环生效` : undefined

  const fullName = (displayMean.spellName || '法术攻击') + comboSuffix
  const onEdit = isCombo ? () => openEditComboMean(displayMean) : () => openEditSpellAttack(displayMean)
  const editBadgeClick = () => (isCombo ? openEditComboMean(displayMean) : openEditSpellAttack(displayMean))

  // 每次渲染覆写：投骰瞬间读到的就是当前 BUFF 与升环下的数值
  registerWeaponPlan?.(displayMean.id, {
    name: fullName,
    getAttack: () => ({ bonus: spellAttackForMean, advantage: null, critThreatMinNatural: buffStats?.critThreatMinNatural, critDiceMultiplier: 2 }),
    getDamagePlan: () => ({ diceList: damageList, flatMod: spellDamageMod }),
  })

  // 攻击型算不出法术攻击加值（如非施法者）时不可点：点击会先扣法术位再无事发生
  const canResolve = hitRes === 'spell_attack' ? spellAttackForMean != null : hitValue != null
  const nameColumnClickable = hasDamage && canResolve && !!openWeaponAttackFlow
  
  return (
    <div className={`rounded-lg border border-gray-600 bg-gray-800/80 p-2 ${COMBAT_LIST_ROW_SHADOW}`}>
      <div className={COMBAT_MEAN_ROW_GRID}>
        {/* 名称列 - 可点击触发释放 */}
        <div 
          className={`flex items-center gap-1 min-w-0 pr-2 ${nameColumnClickable ? 'cursor-pointer hover:bg-gray-700/30 transition-colors rounded px-1 -ml-1' : ''}`}
          onClick={nameColumnClickable ? () => {
            if (!consumeSpellSlotForMean(displayMean, displayMean.spellName || '法术')) return
            if (hitRes === 'spell_attack') {
              openWeaponAttackFlow(displayMean.id)
            } else {
              // 豁免型由 DM 裁决，直接投伤害
              rollDamageDice(
                effectivePrimaryDice, 
                (displayMean.spellName || '法术') + ' ' + (getDamageTypeLabel(displayMean.damageTypeSpell) || ''), 
                'spell_attack-' + displayMean.id, 
                spellDamageMod, 
                false, 
                getDamageTypeLabel(displayMean.damageTypeSpell) || '', 
                { extraDice: allSpellExtraDice, floor2: spellDamageFloor2 }
              )
            }
          } : undefined}
          title={nameColumnClickable ? '点击释放' : undefined}
        >
          <ActionLabelBadge source={matchedSpell?.castingTime || ''} />
          <span className={`text-white font-medium ${CM_MEAN_HI} truncate min-w-0`}>{fullName}</span>
          {canEdit && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onEdit() }} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-600 text-gray-400 hover:text-dnd-gold-light shrink-0" title={isCombo ? '编辑组合技' : '编辑法术'}>
              <Pencil size={12} />
            </button>
          )}
        </div>

        {/* 环位列 */}
        <div className="pl-2 border-l border-gray-600 flex items-center gap-x-1 min-w-0 overflow-hidden">
          <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>环位</span>
          <span className={`${showsRingUpcast ? 'text-dnd-gold-light' : 'text-white'} ${CM_MEAN_HI} truncate`} title={ringUpcastTitle}>{levelLabel}</span>
        </div>

        {/* 攻击/豁免列 - 只显示数值 */}
        <div className="pl-2 border-l border-gray-600 flex items-center gap-x-1.5 min-w-0 overflow-hidden">
          <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>
            {hitRes === 'spell_attack' ? '法攻' : hitLabel.replace('豁免', '豁')}
          </span>
          <span className={`text-white font-mono ${CM_MEAN_HI} tabular-nums truncate`}>{attackText}</span>
        </div>

        {/* 伤害列 - 只显示伤害文本 */}
        <div className="pl-2 border-l border-gray-600 flex min-w-0 items-center gap-x-1 overflow-hidden">
          <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>伤害</span>
          <span className={`min-w-0 flex-1 font-mono ${CM_MEAN_HI} tabular-nums text-white whitespace-nowrap sm:truncate`}>{damageText}</span>
          {renderAutoGainBadges(gains, editBadgeClick)}
        </div>

        {/* 删除列 */}
        <div className="pl-1 border-l border-gray-600 flex items-center justify-end gap-0.5 shrink-0 min-w-0">
          {canEdit && (
            <button type="button" onClick={() => removeCombatMean(displayMean.id)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red shrink-0" title="移除">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── 内部工具函数 ── */

function computeSpellRangeDisplay(rawRange, multiplier = 1, bonus = 0) {
  if (!rawRange) return '—'
  const raw = String(rawRange).trim()
  if (!raw || raw === '—') return '—'
  const numMatch = raw.match(/(\d+)/)
  if (!numMatch) return raw
  const base = Number(numMatch[1])
  const adjusted = Math.max(0, Math.round(base * (multiplier || 1)) + (bonus || 0))
  return raw.replace(/\d+/, String(adjusted))
}

function getSpellDamageBonusExtras(damageType, spellDamageBonuses, formulaContext = {}) {
  if (!spellDamageBonuses?.length) return { flatBonus: 0, extraDice: [] }
  let flatBonus = 0
  const extraDice = []
  for (const b of spellDamageBonuses) {
    if (b.type && b.type !== damageType) continue
    if (b.flatBonus) flatBonus += Number(b.flatBonus) || 0
    if (b.extraDice) extraDice.push(b.extraDice)
  }
  return { flatBonus, extraDice }
}
