/**
 * 战斗状态（重写版）
 * 显示：HP、AC、先攻、死亡豁免、状态效果、力竭、其它职业资源、战斗手段
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Plus, Minus, Trash2, Dices } from 'lucide-react'
import { useRoll } from '../contexts/RollContext'
import { useModule } from '../contexts/ModuleContext'
import {
  abilityModifier,
  proficiencyBonus,
  getAC,
  calcMaxHP,
  getHPBuffSum,
  getACModeOptionsForCharacter,
  getEffectiveACCalculationMode,
  evaluateBuffValue,
} from '../lib/formulas'
import {
  useBuffCalculator,
  sumWeaponCategoryAttackDamageBonus,
  getCritDamageDiceMultiplierFromItemEntry,
  getCritThreatMinNaturalFromItemEntry,
} from '../hooks/useBuffCalculator'
import { getMergedBuffsForCalculator, getEffectsFromBuff, getEffectsFromItem } from '../lib/effects/effectMapping'
import { skillProfFactor } from '../data/dndSkills'
import { CONDITION_OPTIONS, CONDITION_DESCRIPTIONS, EXHAUSTION_DESCRIPTIONS, DAMAGE_TYPES, ABILITY_NAMES_ZH, getDamageTypeLabel, getDamageTypeValue, formatDamageForAttack, parseDamageString, scopeMatchesCombatMean, SCOPE_KIND, normalizeScope, CREATURE_TYPE_OPTIONS } from '../data/buffTypes'
import { inputClass, inputClassInline } from '../lib/inputStyles'
import { hpBarMainFillClass, HP_BAR_TEMP_FILL_CLASS } from '../lib/hpBarShared'
import { RESOURCE_RULES, getAutoResources, computeResourceMax, createResourceEntry } from '../data/classResourceRules'
import { restoreChargesForEvent } from '../lib/chargeRecovery'
import { recoverShieldsOnRest } from '../lib/shieldEngine'
import WeaponAttackCard from './combat/WeaponAttackCard'
import SpellAttackCard from './combat/SpellAttackCard'
import ItemUseCard from './combat/ItemUseCard'
import AddMeanTypeStep, { initWeaponPick, initComboPick } from './combat/AddMeanTypeStep'
import AddSpellStep from './combat/AddSpellStep'
import AddItemStep from './combat/AddItemStep'
import AddWeaponStep from './combat/AddWeaponStep'
import AddComboStep from './combat/AddComboStep'
import GainEditor from './combat/GainEditor'
import {
  DAMAGE_TYPE_OPTIONS, DAMAGE_TYPE_SHORT, HIT_RESOLUTION_LABELS, COMBO_ATTACHMENT_SOURCE_TYPES, COMBO_CLASS_FEATURE_OPTIONS,
  inferDamageDiceFromText, isValidComboAttachment, getCombatMeanLabel,
  getSpellAbilityForAttackFromBuffs, resolvePhysicalWeaponAbilityKind, isRangedWeaponProto, weaponUsesDex, inferPhysicalWeaponAbilityFromProto,
  getDefaultWeaponMode, getWeaponModeOptions, getAbilityOptions, getWeaponBaseDamageObjects, stripDiceFlatMod, getWeaponNote, weaponHasTwoHanded, weaponHasThrown, weaponHasVersatile, weaponHasLight, isDualWieldingLightWeapons,
  parseWeaponAttack, formatWeaponAttackDiceDisplay, formatSignedModifier, getWeaponAttackStringForParsing,
  GAIN_TYPES, getEnabledGains, sumGainAttackBonus, sumGainDamageBonus, sumGainPerDieBonus, getGainExtraDice, getGainAdvantage, hasGainDiceFloor2,
  computePhysicalWeaponStats, buildDefaultGainsFromBuffs, mergeAutoGains, gainsContentEqual,
  getWeaponEntrySpellAbility, getWeaponEntryDamageExtras, getMergedWeaponExtraDiceStrings, filterExtraDiceAgainstMain,
  parseSpellDamageFromDescription, spellUsesAttack, inferSaveFromSpellDescription,
} from './combat/combatMeanUtils'

import { getItemById, parseWeaponNoteToTraits } from '../data/itemDatabase'
import { getSpellById, getWandScrollSpellPower, getMergedSpells } from '../data/spellDatabase'
import { getSpellcastingLevel, getMaxSpellSlotsByRing, getHitDice, getPrimarySpellcastingAbility, getCharacterClasses, getPactLevel, getPactSlotsByLevel } from '../data/classDatabase'
import { getSpellcastingCombatStats } from '../lib/spellcastingStats'
import { rollDice, rollCombatDicePool, parseCombatDiceExpression } from '../data/weaponDatabase'
import { buildQuickRollAnimation } from '../lib/quickRollAnimation'
import AbilityUseModal from './AbilityUseModal'
import ActiveAbilityQuickBar from './combat/ActiveAbilityQuickBar'
import SummonedCreaturesPanel from './combat/SummonedCreaturesPanel'
import { isNewContainedSpellValue, normalizeContainedSpellValue, extractContainedSpellValueFromEntry } from '../lib/containedSpellModel'
import { getFlatEffectEntries } from '../lib/effects/effectMapping'
import { recoverShieldPoolsOnRest } from '../lib/shieldPoolUtils'

/**
 * 计算条件范围命中/伤害加值（非 global 的 attack_bonus / damage_bonus / attack_damage_bonus）。
 * 本武器 / 某类生物 / 某类伤害类型 / 某类武器 等条件在此处按具体战斗手段上下文匹配后追加。
 */
function calculateConditionalAttackDamageBonus(cm, flatEffects, ctxExtra = {}, formulaContext = {}) {
  let attack = 0
  let damage = 0
  if (!cm || !Array.isArray(flatEffects)) return { attackBonus: attack, damageBonus: damage }
  const sourceKind = cm.type === 'physical' ? 'physical' : cm.type === 'spell_attack' ? 'spell_attack' : 'item'
  for (const e of flatEffects) {
    const { scope } = normalizeScope(e.scope, e.scopeDetail)
    if (scope === SCOPE_KIND.global || scope === '') continue
    if (!['attack_bonus', 'damage_bonus', 'attack_damage_bonus'].includes(e.effectType)) continue
    const matches = scopeMatchesCombatMean(e, {
      sourceKind,
      weaponProto: ctxExtra.weaponProto,
      damageType: ctxExtra.damageType,
      targetCreatureType: cm.targetCreatureType || '',
      sourceItemInventoryId: ctxExtra.sourceItemInventoryId,
    })
    if (!matches) continue
    const rawVal = (() => {
      if (e.value && typeof e.value === 'object' && !Array.isArray(e.value) && 'val' in e.value) {
        return e.value.val
      }
      return e.value
    })()
    const v = evaluateBuffValue(rawVal, formulaContext)
    if (!Number.isFinite(v)) continue
    if (e.effectType === 'attack_bonus') attack += v
    else if (e.effectType === 'damage_bonus') damage += v
    else if (e.effectType === 'attack_damage_bonus') { attack += v; damage += v }
  }
  return { attackBonus: attack, damageBonus: damage }
}

/** 收集作用于指定伤害类型的 spell_damage_bonus 增益；无 type 视为通用 */
function getSpellDamageBonusExtras(damageType, spellDamageBonuses, formulaContext = {}) {
  const out = { perDieBonus: 0, flatBonus: 0, extraDice: [], diceFloor2: false }
  if (!Array.isArray(spellDamageBonuses) || spellDamageBonuses.length === 0) return out
  const targetValue = damageType ? getDamageTypeValue(damageType) : ''
  for (const b of spellDamageBonuses) {
    const bonusType = b.type ? String(b.type).trim() : ''
    if (bonusType) {
      const bonusValue = getDamageTypeValue(bonusType)
      if (bonusValue !== targetValue) continue
    }
    const pdb = Number(b.perDieBonus) || 0
    if (pdb) out.perDieBonus += pdb
    if (b.flatBonus != null && b.flatBonus !== '') {
      const fv = evaluateBuffValue(b.flatBonus, formulaContext)
      if (Number.isFinite(fv)) out.flatBonus += fv
    }
    if (b.extraDice) out.extraDice.push(String(b.extraDice).trim())
    if (Number(b.diceFloor) > 1) out.diceFloor2 = true
  }
  return out
}

/** 判断物品是否已装备并同调（用于避免法器自身加成与全局 BUFF 重复叠加） */
function isEntryEquippedAndAttuned(entry, char) {
  if (!entry || entry.isAttuned !== true) return false
  const id = entry.id
  if (!id) return false
  const heldIds = new Set((char?.equippedHeld || []).map((s) => s?.inventoryId).filter(Boolean))
  const wornIds = new Set((char?.equippedWorn || []).map((s) => s?.inventoryId).filter(Boolean))
  return heldIds.has(id) || wornIds.has(id)
}

/** 从物品条目（含 effects 与 legacy 字段）提取法术命中/DC 加值；若已装备同调则返回 0，避免重复 */
function getEntrySpellPowerBonus(entry, char, context) {
  if (isEntryEquippedAndAttuned(entry, char)) return { atk: 0, dc: 0 }
  let atk = 0
  let dc = 0
  for (const e of getEffectsFromItem(entry)) {
    if (e.effectType === 'spell_attack_bonus') {
      const raw = e.value && typeof e.value === 'object' && 'val' in e.value ? e.value.val : e.value
      atk += evaluateBuffValue(raw, context) || 0
    } else if (e.effectType === 'save_dc_bonus') {
      const raw = e.value && typeof e.value === 'object' && 'val' in e.value ? e.value.val : e.value
      dc += evaluateBuffValue(raw, context) || 0
    }
  }
  return { atk, dc }
}

/** 战斗手段行：24 细分为 12 份 — 名称2 | 射程2 | 命中2 | 伤害5.5 | 删除0.5（删列=1/24；Tailwind 无 grid-cols-24 故用任意值） */
const COMBAT_MEAN_ROW_GRID =
  'grid grid-cols-[repeat(24,minmax(0,1fr))] items-center gap-x-1 w-full min-w-0 overflow-hidden'

/** 战斗状态根容器：同 Buff 最外框，仅黑系外投影 + 底内收边，无 shadow-dnd-card 顶白 inset（圆角易像外发光） */
const COMBAT_ROOT_OUTER_SHADOW =
  'shadow-[0_6px_22px_rgba(0,0,0,0.48),0_2px_6px_rgba(0,0,0,0.28),inset_0_-1px_0_rgba(0,0,0,0.22)]'
/** 内层分区：仅顶边内高光，无外扩散 */
const COMBAT_INNER_RIM_ONLY = 'shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]'
/** 战斗手段行 / 武技招式卡：浅黑外投影，无顶白 inset */
const COMBAT_LIST_ROW_SHADOW = 'shadow-[0_2px_10px_rgba(0,0,0,0.42)]'

/** 战斗手段：非高显（灰标签、区标题、添加行）统一 text-xs；高显（名称、射程/命中/伤害数值与骰串）用 text-sm */
const CM_MEAN_LABEL = 'text-xs'
const CM_MEAN_HI = 'text-sm'
const CM_BTN_GOLD =
  'w-6 h-6 shrink-0 flex items-center justify-center rounded-md border border-transparent bg-transparent text-dnd-gold-light transition-colors hover:text-dnd-gold'
const CM_BTN_RED =
  'w-6 h-6 shrink-0 flex items-center justify-center rounded-md border border-transparent bg-transparent text-dnd-red/90 transition-colors hover:text-dnd-red'
const CM_BTN_CRIT =
  'w-6 h-6 shrink-0 flex items-center justify-center rounded-md border border-transparent bg-transparent text-red-300 transition-colors hover:text-red-200'
const CM_DICE_IC = 'w-[1.872rem] h-[1.872rem] opacity-95'
const CM_DICE_IC_GOLD = 'w-[2.246rem] h-[2.246rem] opacity-95'

/** 骰子图标类操作的统一名称（悬停与无障碍） */
const QUICK_ROLL_BTN = '快捷投掷按钮'
function quickRollTitle(detail) {
  return detail ? `${QUICK_ROLL_BTN}：${detail}` : QUICK_ROLL_BTN
}

/** 快捷投掷：命中 / 伤害 / 重击均用 Lucide 双骰图标（与最初版一致）；kind 保留供调用处语义一致 */
function QuickRollIcon({ kind, className = CM_DICE_IC }) {
  void kind
  return <Dices className={className} aria-hidden />
}

/** 根据施法时间/动作描述，统一战斗手段动作标签 */
function resolveCombatMeanActionLabel(source) {
  const s = String(source || '').trim()
  if (!s) return '动作'
  if (/附赠|bonus/i.test(s)) return '附赠'
  if (/反应|reaction/i.test(s)) return '反应'
  if (/迅捷|swift/i.test(s)) return '迅捷'
  if (/全回合|整轮|full[\s-]round/i.test(s)) return '整轮'
  if (/移动|move/i.test(s)) return '移动'
  if (/动作|action/i.test(s)) return '动作'
  return s
}

/** 动作标签配色：动作=天蓝，附赠=翠绿，反应=琥珀，整轮=玫红，其它=灰 */
function actionLabelClass(label) {
  switch (label) {
    case '附赠':
      return 'text-emerald-300/90 bg-emerald-900/35 border-emerald-500/30'
    case '反应':
      return 'text-amber-300/90 bg-amber-900/35 border-amber-500/30'
    case '整轮':
      return 'text-rose-300/90 bg-rose-900/35 border-rose-500/30'
    case '移动':
      return 'text-violet-300/90 bg-violet-900/35 border-violet-500/30'
    case '动作':
    default:
      return 'text-sky-300/90 bg-sky-900/35 border-sky-500/30'
  }
}

/** 动作标签徽章 */
function ActionLabelBadge({ source, className = '' }) {
  const label = resolveCombatMeanActionLabel(source)
  return (
    <span
      className={`shrink-0 text-[10px] leading-none px-1 py-[1px] rounded border ${actionLabelClass(label)} ${className}`}
      title={`动作类型：${label}`}
    >
      {label}
    </span>
  )
}

const EXHAUSTION_LEVELS = [0, 1, 2, 3, 4, 5, 6]

function getExhaustionColor(level) {
  if (level <= 0) return 'text-gray-400'
  const colors = ['text-red-400', 'text-red-500', 'text-red-600', 'text-red-700', 'text-red-800', 'text-red-900']
  return colors[Math.min(level - 1, 5)] ?? 'text-red-900'
}

const EXHAUSTION_DESC = ['', '1：d20 检定 -2，速度 -5 尺', '2：d20 检定 -4，速度 -10 尺', '3：d20 检定 -6，速度 -15 尺', '4：d20 检定 -8，速度 -20 尺', '5：d20 检定 -10，速度 -25 尺', '6：死亡']
const DEATH_SAVE_COUNT = 6

function getDefaultDeathSaves() {
  return { results: Array(DEATH_SAVE_COUNT).fill(null), lastRoll: null }
}

function normalizeDeathSaves(ds) {
  if (!ds) return getDefaultDeathSaves()
  if (Array.isArray(ds.results) && ds.results.length >= DEATH_SAVE_COUNT) {
    const results = ds.results.slice(0, DEATH_SAVE_COUNT).map((r) =>
      r === 'success' || r === 'failure' ? r : null
    )
    return { results, lastRoll: ds.lastRoll ?? null }
  }
  const s = Math.min(3, Number(ds.success) || 0)
  const f = Math.min(3, Number(ds.failure) || 0)
  const results = [
    ...Array(s).fill('success'),
    ...Array(f).fill('failure'),
    ...Array(DEATH_SAVE_COUNT - s - f).fill(null),
  ].slice(0, DEATH_SAVE_COUNT)
  return { results, lastRoll: ds.lastRoll ?? null }
}

const CONDITION_LABELS = Object.fromEntries(
  CONDITION_OPTIONS.filter((o) => o.value !== 'exhaustion').map((o) => [o.value, o.label])
)

/** 是否有生效中的「防死」效果（手动 Buff 或已同调装备附魔） */
function hasActiveDeathWard(mergedBuffs) {
  if (!Array.isArray(mergedBuffs)) return false
  return mergedBuffs.some((b) => {
    if (b.enabled === false) return false
    const effects = getEffectsFromBuff(b)
    return effects.some((e) => e.effectType === 'death_ward' && e.value)
  })
}

/**
 * 消耗第一个生效的「防死」效果，返回可传给 onSave 的 patch。
 * 只处理手动 buff（char.buffs）与已同调装备附魔（inventory 条目 effects）。
 */
function consumeDeathWard(char, mergedBuffs) {
  if (!Array.isArray(mergedBuffs)) return null
  for (const b of mergedBuffs) {
    if (b.enabled === false) continue
    const effects = getEffectsFromBuff(b)
    const idx = effects.findIndex((e) => e.effectType === 'death_ward' && e.value)
    if (idx === -1) continue

    if (b.fromItem) {
      const entryId = typeof b.id === 'string' && b.id.startsWith('item_') ? b.id.slice(5) : null
      if (!entryId || !char) continue
      const inventory = Array.isArray(char.inventory) ? char.inventory : []
      const entryIndex = inventory.findIndex((entry) => entry?.id === entryId)
      if (entryIndex === -1) continue
      const entry = inventory[entryIndex]
      const newEffects = Array.isArray(entry.effects) ? entry.effects.map((e) => ({ ...e })) : []
      const effectIdx = newEffects.findIndex((e) => e.effectType === 'death_ward' && e.value)
      if (effectIdx === -1) continue
      newEffects[effectIdx] = { ...newEffects[effectIdx], value: false }
      return {
        inventory: inventory.map((invEntry, i) =>
          i === entryIndex ? { ...invEntry, effects: newEffects } : invEntry,
        ),
      }
    }

    const buffs = Array.isArray(char?.buffs) ? char.buffs : []
    const buffIndex = buffs.findIndex((buff) => buff?.id === b.id)
    if (buffIndex === -1) continue
    const buff = buffs[buffIndex]
    const newEffects = Array.isArray(buff.effects) ? buff.effects.map((e) => ({ ...e })) : []
    const effectIdx = newEffects.findIndex((e) => e.effectType === 'death_ward' && e.value)
    if (effectIdx === -1) continue
    newEffects[effectIdx] = { ...newEffects[effectIdx], value: false }
    return {
      buffs: buffs.map((buffItem, i) => (i === buffIndex ? { ...buffItem, effects: newEffects } : buffItem)),
    }
  }
  return null
}

/** 从背包中筛出武器（类型=武器或枪械），返回 { index, entry, proto, name, 攻击, 伤害 } */
function getWeaponsFromInventory(inventory = []) {
  return inventory
    .map((entry, index) => {
      const proto = entry?.itemId ? getItemById(entry.itemId) : null
      if (!proto || (proto.类型 !== '近战武器' && proto.类型 !== '远程武器' && proto.类型 !== '枪械')) return null
      const 攻击 = entry.攻击 ?? proto.攻击 ?? '—'
      const 伤害 = entry.伤害 ?? proto.伤害 ?? '—'
      const name = (entry.name && String(entry.name).trim()) || proto.类别 || proto.name || '—'
      return { index, entry, proto, name, 攻击, 伤害 }
    })
    .filter(Boolean)
}

/** 从背包中筛出消耗品-爆炸品（类型=消耗品 子类型=爆炸品，或 类型=爆炸物），用于战斗手段 */
function getExplosivesFromInventory(inventory = []) {
  return inventory
    .map((entry, index) => {
      const proto = entry?.itemId ? getItemById(entry.itemId) : null
      if (!proto) return null
      const isExplosive = proto.类型 === '爆炸物' || (proto.类型 === '消耗品' && proto.子类型 === '爆炸品')
      if (!isExplosive) return null
      const 攻击 = (entry.攻击 ?? proto.攻击 ?? '').trim()
      const diceMatch = 攻击.match(/(\d+d\d+)/i)
      const dice = diceMatch ? diceMatch[1] : null
      const damageType = (攻击.replace(/^\d+d\d+\s*/i, '').trim() || (entry.伤害 ?? proto.伤害 ?? '—')).trim() || '—'
      const name = (entry.name && String(entry.name).trim()) || proto.类别 || proto.name || '—'
      const 攻击距离 = (entry.攻击距离 ?? proto.攻击距离 ?? '').toString().trim()
      const 爆炸半径 = entry.爆炸半径 ?? proto.爆炸半径
      const qty = Math.max(0, Number(entry.qty) ?? 1)
      return { index, entry, proto, name, 攻击距离, 爆炸半径, dice, damageType, qty }
    })
    .filter(Boolean)
}

/** 从背包中筛出法器（类型=法器），用于战斗手段；充能型显示 当前/上限；魔杖/法杖/权杖均纳入 */
function getFocusItemsFromInventory(inventory = []) {
  return inventory
    .map((entry, index) => {
      const proto = entry?.itemId ? getItemById(entry.itemId) : null
      if (!proto || proto.类型 !== '法器') return null
      const chargeMax = entry.chargeMax ?? proto.充能上限
      const hasCharge = chargeMax != null && Number(chargeMax) > 0
      const 类别 = (proto.类别 ?? '').trim()
      const isWandStaffRod = /魔杖|法杖|权杖/.test(类别)
      const name = (entry.name && String(entry.name).trim()) || proto.类别 || proto.name || '—'
      const charge = Math.max(0, Number(entry.charge) ?? 0)
      return { index, entry, proto, name, charge, chargeMax: hasCharge ? (Number(entry.chargeMax ?? proto.充能上限) || 0) : null, isWandStaffRod }
    })
    .filter(Boolean)
}

/** 从背包中筛出卷轴（消耗品 子类型=卷轴），用于战斗手段-道具攻击 */
function getScrollsFromInventory(inventory = []) {
  return inventory
    .map((entry, index) => {
      const proto = entry?.itemId ? getItemById(entry.itemId) : null
      if (!proto || proto.类型 !== '消耗品' || proto.子类型 !== '卷轴') return null
      const name = (entry.name && String(entry.name).trim()) || proto.类别 || proto.name || '—'
      return { index, entry, proto, name }
    })
    .filter(Boolean)
}

/** 匹配 XdY / XDY / 全角ｄ 等骰子片段（不含前导加值数字） */
const WEAPON_DICE_CHUNK_RE = /\d+[dD\uFF44]\d+/gi

/**
 * 规范化伤害骰表达式：合并同类骰子、统一大写 D、保留固定加值与类型/备注。
 * 支持额外骰子带类型，如 "2d12 力场" → "2D12 力场"。
 * 如 "2d6+2d6+2d4+2d4+2d4+5 钝击" → "4D6+6D4+5 钝击"。
 */
function compactDiceExpression(expr) {
  if (!expr || typeof expr !== 'string') return expr
  let s = expr.trim()
  if (!s || s === '—') return expr
  const hashIdx = s.lastIndexOf(' #')
  const note = hashIdx >= 0 ? s.slice(hashIdx + 2).trim() : ''
  if (hashIdx >= 0) s = s.slice(0, hashIdx).trim()

  const rawMatches = s.match(WEAPON_DICE_CHUNK_RE) || []
  if (rawMatches.length === 0) return expr

  const counts = {}
  for (const d of rawMatches) {
    const m = String(d).toLowerCase().match(/^(\d+)d(\d+)$/)
    if (m) counts[m[2]] = (counts[m[2]] || 0) + (parseInt(m[1], 10) || 0)
  }

  let rest = s
  for (const raw of rawMatches) {
    rest = rest.replace(new RegExp(String(raw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')
  }
  rest = rest.replace(/\s+/g, ' ').trim()

  let flatMod = 0
  const modMatches = rest.match(/[+-]\d+/g) || []
  for (const mod of modMatches) {
    flatMod += parseInt(mod, 10)
    rest = rest.replace(mod, '')
  }
  rest = rest.replace(/\s+/g, ' ').trim()

  const diceParts = Object.entries(counts)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([size, count]) => `${count}D${size}`)

  let out = diceParts.join('+')
  if (flatMod !== 0) out += (flatMod > 0 ? `+${flatMod}` : `${flatMod}`)
  if (rest && rest !== '—') out += ` ${rest}`
  if (note) out += ` #${note}`
  return out
}

/** 将 auto 增益渲染为行内小徽章（显示在战斗手段伤害格，方便玩家看到 BUFF 生效情况） */
function renderAutoGainBadges(gains, onClick) {
  const autoGains = (gains || []).filter((g) => g && g.auto && g.enabled !== false)
  if (autoGains.length === 0) return null
  const items = []
  for (const g of autoGains) {
    const v = Number(g.value) || 0
    const sign = v >= 0 ? '+' : ''
    if (g.type === 'attackBonus') items.push(`${sign}${v} 命中`)
    else if (g.type === 'damageBonus') items.push(`${sign}${v} 伤害`)
    else if (g.type === 'perDieBonus') items.push(`${sign}${v} 每骰`)
    else if (g.type === 'extraDice') items.push(g.dice ? `+${g.dice}` : '+骰')
    else if (g.type === 'advantage') items.push(g.advantage === 'disadvantage' ? '劣势' : '优势')
    else if (g.type === 'diceFloor2') items.push('骰底2')
  }
  if (items.length === 0) return null
  return (
    <span className="inline-flex flex-wrap items-center gap-1 ml-1">
      {items.map((text, i) => (
        <span
          key={i}
          onClick={onClick ? (e) => { e.stopPropagation(); onClick() } : undefined}
          className={`inline-flex items-center rounded border border-dnd-gold/40 bg-dnd-gold/15 px-1 py-px text-[10px] font-medium text-dnd-gold-light ${onClick ? 'cursor-pointer hover:bg-dnd-gold/30 hover:border-dnd-gold/70' : ''}`}
          title={onClick ? '点击编辑/开关自动增益' : '来自临时 BUFF 的自动增益'}
        >
          {text}
        </span>
      ))}
    </span>
  )
}


/** 计算法术射程显示文本，应用 BUFF 的 spellRangeMultiplier / spellRangeBonus */
function computeSpellRangeDisplay(rawRange, multiplier = 1, bonus = 0) {
  if (!rawRange) return '—'
  const text = String(rawRange).trim()
  if (text === '自身') return '自身'
  if (text === '触碰') {
    if (bonus > 0) return `触碰 +${bonus} 尺`
    return '触碰'
  }
  const match = text.match(/(\d+)\s*尺/)
  if (match) {
    const base = parseInt(match[1], 10)
    const final = base * Math.max(1, multiplier || 1) + (bonus || 0)
    return `${final} 尺`
  }
  return text
}

export default function CombatStatus({ char, hp, abilities, level, canEdit, onSave, moduleId }) {
  const { openForCheck } = useRoll()
  const { currentModuleId } = useModule()
  const combatModuleId = currentModuleId || 'default'
  const mergedBuffs = useMemo(
    () => getMergedBuffsForCalculator(char, combatModuleId),
    [
      char?.buffs,
      char?.selectedFeats,
      char?.selectedInvocations,
      char?.selectedFightingStyles,
      char?.selectedClassFeatures,
      char?.classFeatureChoices,
      char?.inventory,
      char?.equippedHeld,
      char?.equippedWorn,
      combatModuleId,
    ],
  )
  const buffStats = useBuffCalculator(char, mergedBuffs, char?.shields)

  const itemFormulaContext = useMemo(() => {
    const effectiveAbilities = buffStats?.abilities ?? abilities ?? {}
    const prof = proficiencyBonus(level)
    const spellAbility = getPrimarySpellcastingAbility(char)
    const spellMod = spellAbility ? abilityModifier(effectiveAbilities?.[spellAbility] ?? 10) : 0
    const classLevels = {}
    for (const c of getCharacterClasses(char)) classLevels[c.name] = c.level
    return {
      level,
      abilities: effectiveAbilities,
      prof,
      spellDC: spellAbility ? 8 + prof + spellMod : 0,
      spellAttack: spellAbility ? prof + spellMod : 0,
      classLevels,
    }
  }, [char, level, abilities, buffStats])
  const flatBuffEffects = useMemo(() => getFlatEffectEntries(mergedBuffs, char), [mergedBuffs, char])
  const acResult = getAC(char)
  const acTotal = buffStats?.ac != null ? buffStats.ac : (acResult.total + (buffStats?.acBonus ?? 0))
  const acModeOptions = useMemo(() => getACModeOptionsForCharacter(char), [char?.['class'], char?.multiclass, char?.prestige])
  const acModeEffective = getEffectiveACCalculationMode(char)
  const showAcModeSelect = canEdit && acModeOptions.length > 1
  const isCreatureTemplate = char?.subordinateTemplate === 'creature'
  /** 与豁免/技能一致：用 Buff 合并后的体质参与每级 HP，否则专长「体质+N」不会增加上限 */
  const abilitiesForMaxHp = buffStats?.abilities ?? abilities
  const maxHpBase = calcMaxHP(char, abilitiesForMaxHp) + getHPBuffSum(char) + (buffStats?.maxHpBonus ?? 0)
  const maxHpMult = buffStats?.maxHpMultiplier ?? 1
  const maxHpCalculated = Math.max(1, Math.floor(maxHpBase * maxHpMult))
  /** 生物卡可手动输入生命上限，使用 char.hp.max；否则用公式计算值 */
  const maxHp = isCreatureTemplate && (char?.hp?.max != null && Number(char.hp.max) > 0)
    ? Math.max(1, Number(char.hp.max))
    : maxHpCalculated

  /** 防御 Buff「伤害减免」：扣血输入视为受到的伤害，实际扣除 max(0, 输入−减免) */
  const buffDamageReduction = Math.max(0, Number(buffStats?.damageReduction) || 0)

  const [hpCurrent, setHpCurrent] = useState(hp?.current ?? 0)
  const [hpTemp, setHpTemp] = useState(hp?.temp ?? 0)
  const [hpBuffTemp, setHpBuffTemp] = useState(hp?.buffTemp ?? 0)
  const [deductVal, setDeductVal] = useState('')
  const [healVal, setHealVal] = useState('')
  const [tempInputVal, setTempInputVal] = useState('')
  const [conditions, setConditions] = useState(() => Array.isArray(char?.conditions) ? [...char.conditions] : [])
  const [exhaustion, setExhaustion] = useState(() => Math.max(0, Math.min(6, Number(char?.exhaustionLevel) || 0)))
  const [deathSaves, setDeathSaves] = useState(() => normalizeDeathSaves(char?.deathSaves))
  const [classResources, setClassResources] = useState(() => {
    const arr = Array.isArray(char?.classResources) ? char.classResources : []
    return arr.map((r, idx) => ({
      id: r.id ?? `r_${idx}_${(r.name || '—').replace(/\s+/g, '_')}`,
      name: r.name || '—',
      current: Math.max(0, Number(r.current) ?? 0),
      max: Math.max(1, Number(r.max) ?? 1),
      resourceKey: r.resourceKey || null,
      recovery: r.recovery || 'long',
      ...(r.diceType ? { diceType: r.diceType } : {}),
      ...(r.note ? { note: r.note } : {}),
    }))
  })
  const [addResourceName, setAddResourceName] = useState('')
  const [addResourceMax, setAddResourceMax] = useState(2)
  const [isAddingResource, setIsAddingResource] = useState(false)

  // ── 护盾数据（仅用于休息恢复，管理 UI 已移至 BUFF 编辑器）──
  const shields = Array.isArray(char?.shields) ? char.shields : []

  const saveShields = useCallback((next) => {
    onSave({ shields: next })
  }, [onSave])

  const normalizeCombatMeanType = (t) => {
    if (t === 'spell_attack' || t === 'spell' || t === 'item' || t === 'combo') return t
    return 'physical'
  }
  const [combatMeans, setCombatMeans] = useState(() => {
    const arr = Array.isArray(char?.combatMeans) ? char.combatMeans : []
    return arr.map((m, idx) => ({
      id: m.id ?? `cm_${idx}_${m.type === 'combo' ? 'combo' : m.type || 'physical'}`,
      type: normalizeCombatMeanType(m.type),
      weaponInventoryIndex: m.weaponInventoryIndex ?? null,
      itemInventoryIndex: m.itemInventoryIndex ?? null,
      spellId: m.spellId ?? null,
      spellName: m.spellName ?? '',
      spellLevel: m.spellLevel ?? null,
      hitResolution: m.hitResolution ?? 'spell_attack',
      damageDice: m.damageDice ?? '',
      damageTypeSpell: m.damageTypeSpell ?? '',
      extraDamageDice: Array.isArray(m.extraDamageDice) ? m.extraDamageDice : [],
      abilityForAttack: m.abilityForAttack ?? null,
      damageType: m.damageType ?? null,
      weaponVersatileMode: m.weaponVersatileMode || null,
      weaponProficient: m.weaponProficient !== false,
      weaponNameSuffix: m.weaponNameSuffix ?? '',
      targetCreatureType: m.targetCreatureType ?? '',
      primaryMeanId: m.primaryMeanId ?? null,
      attachments: Array.isArray(m.attachments) ? m.attachments : [],
      gains: Array.isArray(m.gains) ? m.gains : [],
    }))
  })
  const [showAddCombatMeanModal, setShowAddCombatMeanModal] = useState(false)
  const [editingCombatMeanId, setEditingCombatMeanId] = useState(null) // 编辑法术攻击时设为该条 id
  const [addMeanStep, setAddMeanStep] = useState('type') // 'type' | 'weapon' | 'item' | 'spell_attack' | 'combo'
  const [addSpellAttackName, setAddSpellAttackName] = useState('')
  const [addSpellAttackSpellId, setAddSpellAttackSpellId] = useState('')
  const [addSpellAttackHitResolution, setAddSpellAttackHitResolution] = useState('spell_attack')
  const [addSpellAttackDice, setAddSpellAttackDice] = useState('')
  const [addSpellAttackDamageType, setAddSpellAttackDamageType] = useState('')
  const [addSpellAttackSpellLevel, setAddSpellAttackSpellLevel] = useState('')
  const [addWeaponIndex, setAddWeaponIndex] = useState(null)
  const [addWeaponNameSuffix, setAddWeaponNameSuffix] = useState('')
  const [addAbility, setAddAbility] = useState('str')
  const [addDamageType, setAddDamageType] = useState('')
  const [addWeaponMode, setAddWeaponMode] = useState('one_hand')
  const [addWeaponProficient, setAddWeaponProficient] = useState(true)
  const [addTargetCreatureType, setAddTargetCreatureType] = useState('')
  const [addItemIndex, setAddItemIndex] = useState(null)
  const [addGains, setAddGains] = useState([])
  const [addComboPrimaryId, setAddComboPrimaryId] = useState(null)
  const [addComboAttachments, setAddComboAttachments] = useState([])
  const [showSpellModule, setShowSpellModule] = useState(() => char?.showSpellModule !== false)
  const [explosiveUsePending, setExplosiveUsePending] = useState(null) // { inventoryIndex, name, diceExpr, damageType }
  const [focusUsePending, setFocusUsePending] = useState(null) // { inventoryIndex, name, spellSub } 法器投掷待确认
  const [executeAbilityModal, setExecuteAbilityModal] = useState(null) // { ability, context }
  const [focusSpellMap, setFocusSpellMap] = useState({}) // { [inventoryIndex]: spellSub } 法器当前选中的内含法术
  const combatMeansRef = useRef(combatMeans)
  useEffect(() => {
    combatMeansRef.current = combatMeans
  }, [combatMeans])

  useEffect(() => {
    setShowSpellModule(char?.showSpellModule !== false)
  }, [char?.id, char?.showSpellModule])

  // 主动技能快捷栏
  const quickBar = useMemo(() => {
    return Array.isArray(char?.activeAbilityQuickBar) ? char.activeAbilityQuickBar : []
  }, [char?.activeAbilityQuickBar])

  const handleUpdateQuickBar = useCallback((next) => {
    onSave({ activeAbilityQuickBar: next })
  }, [onSave])

  // 结束架势
  const handleEndStance = useCallback(() => {
    if (!char?.activeStance?.buffId || !onSave) return
    const currentBuffs = Array.isArray(char.buffs) ? char.buffs : []
    onSave({
      buffs: currentBuffs.filter((b) => b.id !== char.activeStance.buffId),
      activeStance: null,
    })
  }, [char, onSave])

  const handleExecuteAbility = useCallback((ability, context) => {
    if (!ability || !char || !onSave) return
    setExecuteAbilityModal({ ability, context })
  }, [char, onSave])

  useEffect(() => {
    setHpCurrent(hp?.current ?? 0)
    setHpTemp(hp?.temp ?? 0)
    setHpBuffTemp(hp?.buffTemp ?? 0)
  }, [hp?.current, hp?.temp, hp?.buffTemp])

  /** BUFF 临时生命：BUFF 变化时同步到当前值；已扣减时不自动回涨 */
  const prevBuffTempHpRef = useRef(hp?.buffTemp ?? 0)
  useEffect(() => {
    const max = Math.max(0, Number(buffStats?.tempHp) || 0)
    if (max !== prevBuffTempHpRef.current) {
      setHpBuffTemp(max)
      prevBuffTempHpRef.current = max
      onSave({ hp: { current: hpCurrent, max: maxHp, temp: hpTemp, buffTemp: max } })
    }
  }, [buffStats?.tempHp])

  useEffect(() => {
    setConditions(Array.isArray(char?.conditions) ? [...char.conditions] : [])
  }, [char?.id, char?.conditions])

  useEffect(() => {
    setExhaustion(Math.max(0, Math.min(6, Number(char?.exhaustionLevel) || 0)))
  }, [char?.id, char?.exhaustionLevel])

  useEffect(() => {
    setDeathSaves(normalizeDeathSaves(char?.deathSaves))
  }, [char?.id, char?.deathSaves])

  useEffect(() => {
    const arr = Array.isArray(char?.classResources) ? char.classResources : []
    setClassResources(arr.map((r, idx) => ({
      id: r.id ?? `r_${idx}_${(r.name || '—').replace(/\s+/g, '_')}`,
      name: r.name || '—',
      current: Math.max(0, Number(r.current) ?? 0),
      max: Math.max(1, Number(r.max) ?? 1),
      resourceKey: r.resourceKey || null,
      recovery: r.recovery || 'long',
      ...(r.diceType ? { diceType: r.diceType } : {}),
      ...(r.note ? { note: r.note } : {}),
    })))
  }, [char?.id, char?.classResources])

  /* ── 自动填充/更新职业资源（基于 classResourceRules） ── */
  const classResourcesRef = useRef(classResources)
  useEffect(() => { classResourcesRef.current = classResources }, [classResources])

  useEffect(() => {
    const classes = getCharacterClasses(char)
    if (!classes.length) return
    const totalLevel = classes.reduce((s, c) => s + (c.level || 0), 0)
    const ab = buffStats?.abilities ?? {}
    const prev = classResourcesRef.current

    let next = prev.map((r) => ({ ...r }))
    let changed = false

    for (const cls of classes) {
      const rules = getAutoResources([cls])
      for (const rule of rules) {
        // 全局资源跳过（在下方单独处理）
        if (rule.classKey === '_global') continue
        const ctx = { classLevel: cls.level, totalLevel, abilities: ab }
        const newMax = computeResourceMax(rule, ctx)
        const existing = next.find((r) => r.resourceKey === rule.resourceKey)
        if (existing) {
          if (existing.max !== newMax && newMax > 0) {
            existing.max = newMax
            if (existing.current > newMax) existing.current = newMax
            changed = true
          }
        } else if (newMax > 0) {
          next.push(createResourceEntry(rule, ctx))
          changed = true
        }
      }
    }

    // 全局资源（如星辰点）：基于总等级，只处理一次
    const globalRules = RESOURCE_RULES.filter((r) => r.classKey === '_global' && r.recovery !== 'none')
    for (const rule of globalRules) {
      const ctx = { classLevel: totalLevel, totalLevel, abilities: ab }
      const newMax = computeResourceMax(rule, ctx)
      const existing = next.find((r) => r.resourceKey === rule.resourceKey)
      if (existing) {
        if (existing.max !== newMax) {
          existing.max = newMax
          if (existing.current > newMax) existing.current = newMax
          changed = true
        }
      } else if (newMax > 0) {
        next.push(createResourceEntry(rule, ctx))
        changed = true
      }
    }

    // 专长资源：根据角色拥有的专长自动填充
    const selectedFeatIds = new Set((char?.selectedFeats || []).map((f) => f?.featId).filter(Boolean))
    const featRules = RESOURCE_RULES.filter((r) => r.classKey === '_feat' && r.recovery !== 'none')
    for (const rule of featRules) {
      if (!selectedFeatIds.has(rule.featId)) continue
      const ctx = { classLevel: totalLevel, totalLevel, abilities: ab }
      const newMax = computeResourceMax(rule, ctx)
      const existing = next.find((r) => r.resourceKey === rule.resourceKey)
      if (existing) {
        if (existing.max !== newMax) {
          existing.max = newMax
          if (existing.current > newMax) existing.current = newMax
          changed = true
        }
      } else if (newMax > 0) {
        next.push(createResourceEntry(rule, ctx))
        changed = true
      }
    }

    if (changed) {
      setClassResources(next)
      onSave({ classResources: next.map((r) => ({
        id: r.id, name: r.name, current: r.current, max: r.max,
        ...(r.resourceKey ? { resourceKey: r.resourceKey } : {}),
        ...(r.recovery ? { recovery: r.recovery } : {}),
        ...(r.diceType ? { diceType: r.diceType } : {}),
      })) })
    }
  }, [char?.id, char?.['class'], char?.classLevel, char?.multiclass, char?.prestige, char?.selectedFeats, buffStats?.abilities])

  useEffect(() => {
    const arr = Array.isArray(char?.combatMeans) ? char.combatMeans : []
    setCombatMeans(arr.map((m, idx) => ({
      id: m.id ?? `cm_${idx}_${m.type === 'combo' ? 'combo' : m.type || 'physical'}`,
      type: normalizeCombatMeanType(m.type),
      weaponInventoryIndex: m.weaponInventoryIndex ?? null,
      itemInventoryIndex: m.itemInventoryIndex ?? null,
      spellId: m.spellId ?? null,
      spellName: m.spellName ?? '',
      spellLevel: m.spellLevel ?? null,
      hitResolution: m.hitResolution ?? 'spell_attack',
      damageDice: m.damageDice ?? '',
      damageTypeSpell: m.damageTypeSpell ?? '',
      extraDamageDice: Array.isArray(m.extraDamageDice) ? m.extraDamageDice : [],
      abilityForAttack: m.abilityForAttack ?? null,
      damageType: m.damageType ?? null,
      weaponVersatileMode: m.weaponVersatileMode || null,
      weaponProficient: m.weaponProficient !== false,
      weaponNameSuffix: m.weaponNameSuffix ?? '',
      targetCreatureType: m.targetCreatureType ?? '',
      primaryMeanId: m.primaryMeanId ?? null,
      attachments: Array.isArray(m.attachments) ? m.attachments : [],
      gains: Array.isArray(m.gains) ? m.gains : [],
    })))
  }, [char?.id, char?.combatMeans])

  /** 全局自动同步：当 BUFF 变化且不在编辑弹窗内时，为每个战斗手段重新生成 auto 增益 */
  useEffect(() => {
    if (showAddCombatMeanModal || editingCombatMeanId) return
    const prev = combatMeansRef.current
    let changed = false
    const next = prev.map((cm) => {
      let ctxCm = cm
      let isSpellMean = cm.type === 'spell_attack' || cm.type === 'spell'
      if (cm.type === 'combo') {
        const primary = prev.find((m) => m.id === cm.primaryMeanId)
        if (primary) {
          ctxCm = primary
          isSpellMean = primary.type === 'spell_attack' || primary.type === 'spell'
        }
      }
      const autoGains = buildDefaultGainsFromBuffs(ctxCm, buffStats, mergedBuffs, isSpellMean, char, itemFormulaContext)
      const merged = mergeAutoGains(cm.gains, autoGains)
      if (!gainsContentEqual(cm.gains, merged)) {
        changed = true
        return { ...cm, gains: merged }
      }
      return cm
    })
    if (changed) {
      saveCombatMeans(next)
    }
  }, [mergedBuffs, buffStats, itemFormulaContext, char, showAddCombatMeanModal, editingCombatMeanId])

  useEffect(() => {
    if (hpCurrent > maxHp) setHpCurrent(maxHp)
  }, [maxHp, hpCurrent])

  const saveCombatMeans = (next) => {
    setCombatMeans(next)
    onSave({
      combatMeans: next.map((m) => ({
        id: m.id,
        type: m.type,
        weaponInventoryIndex: m.weaponInventoryIndex,
        itemInventoryIndex: m.itemInventoryIndex ?? null,
        spellId: m.spellId,
        spellName: m.spellName,
        spellLevel: m.spellLevel,
        hitResolution: m.hitResolution,
        damageDice: m.damageDice,
        damageTypeSpell: m.damageTypeSpell,
        extraDamageDice: m.extraDamageDice,
        abilityForAttack: m.abilityForAttack,
        damageType: m.damageType,
        weaponVersatileMode: m.weaponVersatileMode || null,
        weaponProficient: m.weaponProficient,
        weaponNameSuffix: m.weaponNameSuffix,
        targetCreatureType: m.targetCreatureType,
        primaryMeanId: m.primaryMeanId ?? null,
        attachments: Array.isArray(m.attachments) ? m.attachments : [],
        gains: Array.isArray(m.gains) ? m.gains : [],
      })),
    })
  }
  const openAddCombatMeanModal = () => {
    setEditingCombatMeanId(null)
    setAddMeanStep('type')
    const first = weaponsFromInv[0]
    if (first) {
      setAddWeaponIndex(first.index)
      setAddAbility(inferPhysicalWeaponAbilityFromProto(first.proto))
      setAddWeaponMode(getDefaultWeaponMode(first))
    } else {
      setAddWeaponIndex(null)
      setAddAbility('str')
      setAddWeaponMode('one_hand')
    }
    setAddDamageType('')
    setAddWeaponNameSuffix('')
    setAddWeaponExtraDice([])
    setShowWeaponExtraDiceEditor(false)
    setAddWeaponProficient(true)
    setAddTargetCreatureType('')
    setAddSpellAttackSpellLevel('')
    setAddGains([])
    setAddComboPrimaryId(null)
    setAddComboAttachments([])
    setShowAddCombatMeanModal(true)
  }
  const confirmAddWeaponMean = () => {
    const patch = {
      type: 'physical',
      weaponInventoryIndex: addWeaponIndex,
      spellId: null,
      extraDamageDice: [...addWeaponExtraDice],
      abilityForAttack: addAbility,
      damageType: addDamageType || null,
      weaponVersatileMode: addWeaponMode || null,
      weaponProficient: addWeaponProficient,
      weaponNameSuffix: (addWeaponNameSuffix || '').trim(),
      targetCreatureType: addTargetCreatureType || '',
      gains: addGains,
    }
    if (editingCombatMeanId) {
      updateCombatMean(editingCombatMeanId, patch)
      setEditingCombatMeanId(null)
    } else {
      saveCombatMeans([...combatMeans, { id: 'cm_' + Date.now(), ...patch }])
    }
    setShowWeaponExtraDiceEditor(false)
    setShowAddCombatMeanModal(false)
  }
  const confirmAddItemMean = () => {
    const patch = {
      type: 'item',
      weaponInventoryIndex: null,
      itemInventoryIndex: addItemIndex,
      spellId: null,
      extraDamageDice: [],
      abilityForAttack: null,
      damageType: null,
      weaponProficient: true,
      spellLevel: null,
      targetCreatureType: addTargetCreatureType || '',
      gains: addGains,
    }
    if (editingCombatMeanId) {
      updateCombatMean(editingCombatMeanId, patch)
      setEditingCombatMeanId(null)
    } else {
      saveCombatMeans([...combatMeans, { id: 'cm_' + Date.now(), ...patch }])
    }
    setShowAddCombatMeanModal(false)
  }
  const confirmAddSpellAttackMean = () => {
    const spell = addSpellAttackSpellId ? getSpellById(addSpellAttackSpellId) : null
    const name = (spell?.name ?? (addSpellAttackSpellId ? addSpellAttackName : addSpellAttackName)).trim() || '法术攻击'
    // 若选择了法术，自动从法术数据派生命中/伤害/环位；保留手动输入作为兜底
    let derivedHitResolution = addSpellAttackHitResolution || 'spell_attack'
    let derivedDamageDice = (addSpellAttackDice || '').trim()
    let derivedDamageType = (addSpellAttackDamageType || '').trim()
    let derivedSpellLevel = addSpellAttackSpellLevel ? Number(addSpellAttackSpellLevel) : (spell?.level != null ? spell.level : null)
    if (spell?.description) {
      if (!addSpellAttackHitResolution) {
        if (spellUsesAttack(spell.description)) {
          derivedHitResolution = 'spell_attack'
        } else {
          const inferredSave = inferSaveFromSpellDescription(spell.description)
          if (inferredSave !== 'spell_attack') derivedHitResolution = inferredSave
        }
      }
      const damages = parseSpellDamageFromDescription(spell.description)
      if (damages.length > 0) {
        if (!derivedDamageDice) derivedDamageDice = damages[0].dice
        // 弹窗伤害类型下拉使用中文 label，存储中文以保持选择框回显一致
        if (!derivedDamageType) derivedDamageType = getDamageTypeLabel(damages[0].type)
      }
    }
    const lvl = derivedSpellLevel != null ? derivedSpellLevel : Number(addSpellAttackSpellLevel)
    const patch = {
      type: 'spell_attack',
      spellId: addSpellAttackSpellId || null,
      spellName: name,
      spellLevel: lvl >= 0 && lvl <= 9 ? lvl : null,
      hitResolution: derivedHitResolution,
      damageDice: derivedDamageDice,
      damageTypeSpell: derivedDamageType,
      targetCreatureType: addTargetCreatureType || '',
      gains: addGains,
    }
    if (editingCombatMeanId) {
      updateCombatMean(editingCombatMeanId, patch)
      setEditingCombatMeanId(null)
    } else {
      const newMean = {
        id: 'cm_' + Date.now(),
        ...patch,
        weaponInventoryIndex: null,
        itemInventoryIndex: null,
        extraDamageDice: [],
        abilityForAttack: null,
        damageType: null,
        weaponProficient: true,
      }
      saveCombatMeans([...combatMeans, newMean])
    }
    setShowAddCombatMeanModal(false)
    setAddSpellAttackName('')
    setAddSpellAttackSpellId('')
    setAddSpellAttackHitResolution('spell_attack')
    setAddSpellAttackDice('')
    setAddSpellAttackDamageType('')
    setAddSpellAttackSpellLevel('')
  }
  const confirmAddComboMean = () => {
    const primary = combatMeans.find((m) => m.id === addComboPrimaryId)
    if (!primary) return
    if (primary.type === 'combo' || primary.id === editingCombatMeanId) {
      alert('组合技的主手段不能选择另一个组合技，也不能选择当前组合技自身。')
      return
    }
    const attachments = (addComboAttachments || [])
      .map((a) => ({
        id: a.id ?? 'att_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
        name: (a.name || '').trim(),
        damageDice: (a.damageDice || '').trim(),
        damageType: (a.damageType || '').trim(),
        sourceType: (a.sourceType || 'custom'),
        sourceId: (a.sourceId || '').trim(),
      }))
      .filter(isValidComboAttachment)
    const patch = {
      type: 'combo',
      primaryMeanId: primary.id,
      attachments,
      targetCreatureType: primary.targetCreatureType || '',
      gains: addGains,
    }
    if (editingCombatMeanId) {
      updateCombatMean(editingCombatMeanId, patch)
      setEditingCombatMeanId(null)
    } else {
      saveCombatMeans([...combatMeans, { id: 'cm_' + Date.now(), ...patch }])
    }
    setShowAddCombatMeanModal(false)
    setAddComboPrimaryId(null)
    setAddComboAttachments([])
  }
  const openEditComboMean = (cm) => {
    setEditingCombatMeanId(cm.id)
    setAddComboPrimaryId(cm.primaryMeanId ?? null)
    setAddComboAttachments(
      Array.isArray(cm.attachments)
        ? cm.attachments.map((a) => ({
            ...a,
            sourceType: a.sourceType || 'custom',
            sourceId: (a.sourceId || '').trim(),
          }))
        : []
    )
    const primary = combatMeans.find((m) => m.id === cm.primaryMeanId)
    const isSpellPrimary = primary && primary.type === 'spell_attack'
    setAddGains(cm.gains?.length ? [...cm.gains] : buildDefaultGainsFromBuffs(primary || cm, buffStats, mergedBuffs, !!isSpellPrimary, char))
    setAddMeanStep('combo')
    setShowAddCombatMeanModal(true)
  }
  const openEditSpellAttack = (cm) => {
    setEditingCombatMeanId(cm.id)
    setAddSpellAttackName(cm.spellName || '')
    setAddSpellAttackSpellId(cm.spellId || '')
    setAddSpellAttackHitResolution(cm.hitResolution || 'spell_attack')
    setAddSpellAttackDice(cm.damageDice || '')
    setAddSpellAttackDamageType(getDamageTypeLabel(cm.damageTypeSpell))
    setAddSpellAttackSpellLevel(cm.spellLevel != null ? String(cm.spellLevel) : '')
    setAddTargetCreatureType(cm.targetCreatureType || '')
    setAddGains(cm.gains?.length ? [...cm.gains] : buildDefaultGainsFromBuffs(cm, buffStats, mergedBuffs, true, char))
    setAddMeanStep('spell_attack')
    setShowAddCombatMeanModal(true)
  }
  const openEditItemMean = (cm) => {
    setEditingCombatMeanId(cm.id)
    setAddItemIndex(cm.itemInventoryIndex ?? null)
    const itemOpt = cm.itemInventoryIndex != null ? itemMeansFromInv.find((x) => x.index === cm.itemInventoryIndex) : null
    const isSpellItem = itemOpt && (itemOpt.kind === 'focus' || itemOpt.kind === 'scroll')
    setAddTargetCreatureType(cm.targetCreatureType || '')
    setAddGains(cm.gains?.length ? [...cm.gains] : buildDefaultGainsFromBuffs(cm, buffStats, mergedBuffs, isSpellItem, char))
    setAddMeanStep('item')
    setShowAddCombatMeanModal(true)
  }
  const consumeExplosiveAndRoll = (inventoryIndex, diceExpr, label, damageType) => {
    const inv = [...(char?.inventory ?? [])]
    const entry = inv[inventoryIndex]
    if (!entry) {
      setExplosiveUsePending(null)
      return
    }
    const qty = Math.max(0, (Number(entry.qty) ?? 1) - 1)
    inv[inventoryIndex] = { ...entry, qty }
    onSave({ inventory: inv })
    setExplosiveUsePending(null)
    if (diceExpr && /^\d+d\d+/i.test(diceExpr)) {
      const gains = getEnabledGains({ gains: explosiveUsePending?.gains })
      const gainDamageBonus = sumGainDamageBonus(gains)
      const gainPerDieBonus = sumGainPerDieBonus(gains)
      const gainExtraDice = getGainExtraDice(gains)
      const gainDiceFloor2 = hasGainDiceFloor2(gains)
      const p = parseCombatDiceExpression(diceExpr)
      const diceCount = p ? p.count : 0
      const modifier = gainDamageBonus + gainPerDieBonus * diceCount
      const damageTypeLabel = damageType ? getDamageTypeLabel(damageType) : ''
      rollDamageDice(
        diceExpr,
        label,
        'explosive-' + inventoryIndex + '-' + Date.now(),
        modifier,
        false,
        damageTypeLabel,
        { extraDice: gainExtraDice, floor2: gainDiceFloor2 },
      )
    }
  }
  const useFocusCharge = (inventoryIndex, displayName, spellSub) => {
    const inv = [...(char?.inventory ?? [])]
    const entry = inv[inventoryIndex]
    if (!entry) {
      setFocusUsePending(null)
      return
    }
    const containedSpellRaw = extractContainedSpellValueFromEntry(entry)
    const cs = normalizeContainedSpellValue(containedSpellRaw, entry.charge)
    const sub = spellSub && typeof spellSub === 'object' ? spellSub : (cs.spells[0] ?? null)
    const cost = Math.max(0, Number(sub?.cost) || 1)
    const nextCharge = Math.max(0, (Number(entry.charge) || 0) - cost)
    inv[inventoryIndex] = { ...entry, charge: nextCharge }
    onSave({ inventory: inv })
    setFocusUsePending(null)
    const dCount = Math.max(0, Number(sub?.damageDiceCount) ?? 0)
    const dSides = Math.max(1, Number(sub?.damageDiceSides) ?? 6)
    if (dCount > 0) {
      const diceExpr = `${dCount}d${dSides}`
      const damageTypeLabel = sub?.damageType ? getDamageTypeLabel(sub.damageType) : ''
      const spellLabel = sub?.spellName?.trim() || displayName || '魔杖'
      const label = damageTypeLabel ? `${spellLabel} ${damageTypeLabel}` : spellLabel
      const gains = getEnabledGains({ gains: focusUsePending?.gains })
      const gainDamageBonus = sumGainDamageBonus(gains)
      const gainPerDieBonus = sumGainPerDieBonus(gains)
      const gainExtraDice = getGainExtraDice(gains)
      const gainDiceFloor2 = hasGainDiceFloor2(gains)
      const spellDamageExtras = focusUsePending?.spellDamageExtras || getSpellDamageBonusExtras(sub?.damageType, buffStats?.spellDamageBonuses, itemFormulaContext)
      const allExtraDice = [...gainExtraDice, ...spellDamageExtras.extraDice]
      // spell_damage_bonus 的 perDie/diceFloor 已统一通过 auto 增益体现，flatBonus/extraDice 仍自动追加
      const modifier = gainDamageBonus + gainPerDieBonus * dCount + spellDamageExtras.flatBonus
      const floor2 = gainDiceFloor2 || focusUsePending?.damageFloor2
      rollDamageDice(
        diceExpr,
        label,
        'focus-' + inventoryIndex + '-' + Date.now(),
        modifier,
        false,
        damageTypeLabel,
        { extraDice: allExtraDice, floor2 },
      )
    }
  }
  /** 使用卷轴：扣 1 数量，数量为 1 时从背包移除 */
  const useScroll = (inventoryIndex) => {
    const inv = [...(char?.inventory ?? [])]
    const entry = inv[inventoryIndex]
    if (!entry) return
    const qty = Math.max(0, (Number(entry.qty) ?? 1) - 1)
    if (qty <= 0) inv.splice(inventoryIndex, 1)
    else inv[inventoryIndex] = { ...entry, qty }
    onSave({ inventory: inv })
  }
  const removeCombatMean = (id) => {
    saveCombatMeans(combatMeans.filter((m) => m.id !== id))
  }
  const updateCombatMean = (id, patch) => {
    saveCombatMeans(combatMeans.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  const [lastDamageRoll, setLastDamageRoll] = useState(null) // { byType: { [type]: { rolls, modifier } } } 或旧格式 { total, rolls, modifier }
  useEffect(() => {
    if (!lastDamageRoll || typeof window === 'undefined') return
    window.dispatchEvent(new CustomEvent('dnd-external-roll', { detail: lastDamageRoll }))
  }, [lastDamageRoll])
  const [addWeaponExtraDice, setAddWeaponExtraDice] = useState([]) // 添加武器时的额外伤害骰，如 ['1d6 电']
  const [addWeaponExtraCount, setAddWeaponExtraCount] = useState(1)
  const [addWeaponExtraSides, setAddWeaponExtraSides] = useState(6)
  const [addWeaponExtraFlatMod, setAddWeaponExtraFlatMod] = useState(0)
  const [addWeaponExtraType, setAddWeaponExtraType] = useState('钝击')
  /** 额外伤害骰：默认折叠，点「添加」后展开编辑（类似附魔） */
  const [showWeaponExtraDiceEditor, setShowWeaponExtraDiceEditor] = useState(false)

  /** 物理武器：汇总主伤+所有额外骰，按伤害类型分组投掷并展示 */
  const rollAllWeaponDamage = (cm, weaponOpt, attackParsed, totalDamageMod, displayDamageType, isCrit) => {
    /** 仅本把武器 entry 上的「暴击×」；其它已装备武器的附魔不串用 */
    const critMult = isCrit ? getCritDamageDiceMultiplierFromItemEntry(weaponOpt?.entry ?? null, itemFormulaContext) : 1
    const animParts = []
    const animValues = []
    const sources = []
    const mainDiceList = attackParsed?.diceList?.length
      ? attackParsed.diceList
      : attackParsed?.dice
        ? [attackParsed.dice]
        : []
    mainDiceList.forEach((oneDice, i) => {
      sources.push({
        dice: oneDice,
        modifier: i === 0 ? Number(totalDamageMod) || 0 : 0,
        type: displayDamageType || '钝击',
      })
    })
    const rawT = cm.damageType || attackParsed.type
    const gainExtras = getGainExtraDice(getEnabledGains(cm))
    const extras = filterExtraDiceAgainstMain(attackParsed, rawT, [...getMergedWeaponExtraDiceStrings(cm, weaponOpt), ...gainExtras])
    const floor2 = hasGainDiceFloor2(getEnabledGains(cm))
    extras.forEach((d) => {
      const parts = typeof d === 'string' && d.includes(' ') ? d.split(' ') : [d, displayDamageType || '钝击']
      const dice = parts[0]
      const type = parts[1] || displayDamageType || '钝击'
      if (dice) sources.push({ dice, modifier: 0, type })
    })
    const byType = {}
    sources.forEach(({ dice, modifier, type }) => {
      const pool1 = rollCombatDicePool(dice)
      if (!pool1.parsed) {
        const r1 = rollDice(dice)
        const rolls = [...(r1.rolls ?? [])]
        const sumR1 = (r1.rolls ?? []).reduce((s, n) => s + (Number(n) || 0), 0)
        /** 重击：多轮骰点；表达式 flat 仅取首轮（与解析路径一致） */
        const exprFlatOnce = (Number(r1.total) || 0) - sumR1
        for (let k = 1; k < critMult; k++) {
          const r = rollDice(dice)
          rolls.push(...(r.rolls ?? []))
        }
        if (!byType[type]) byType[type] = { rolls: [], modifier: 0 }
        byType[type].rolls.push(...rolls)
        byType[type].modifier += (Number(modifier) || 0) + exprFlatOnce
        return
      }
      const extraCritRolls = []
      for (let k = 1; k < critMult; k++) {
        const poolExtra = rollCombatDicePool(dice)
        extraCritRolls.push(...poolExtra.rolls)
      }
      const rolls = [...pool1.rolls, ...extraCritRolls]
      /** 重击：骰子多投若干轮；表达式末尾加值（XdY+N 的 N）只加一次（D&D 2024 与 5e 武器重击一致） */
      const exprFlatOnce = pool1.flatMod
      const sourceMod = Number(modifier) || 0
      const pExpr = pool1.parsed
      if (pExpr && rolls.length === pExpr.count * critMult) {
        const effCount = pExpr.count * critMult
        const totalFlat = sourceMod + exprFlatOnce
        const piece =
          totalFlat !== 0
            ? `${effCount}d${pExpr.sides}${totalFlat >= 0 ? '+' : ''}${totalFlat}`
            : `${effCount}d${pExpr.sides}`
        animParts.push(piece)
        animValues.push(...rolls.map((n) => Number(n)))
      }
      if (!byType[type]) byType[type] = { rolls: [], modifier: 0 }
      byType[type].rolls.push(...rolls)
      byType[type].modifier += sourceMod + exprFlatOnce
    })
    if (floor2) {
      Object.values(byType).forEach((bundle) => {
        bundle.rolls = (bundle.rolls || []).map((n) => Math.max(2, Number(n) || 0))
      })
      for (let i = 0; i < animValues.length; i++) {
        animValues[i] = Math.max(2, Number(animValues[i]) || 0)
      }
    }
    const animBundle =
      animParts.length > 0 && animValues.length > 0
        ? { animate: true, formula: animParts.join(','), diceValues: animValues }
        : {}
    setLastDamageRoll({ byType, ...animBundle })
  }

  const rollDamageDice = (diceExpr, label, key, modifier = 0, isCrit = false, damageTypeLabel = '', options = {}) => {
    const mod = Number(modifier) || 0
    const raw = String(diceExpr || '').trim()
    const dt = String(damageTypeLabel || '').trim()
    const { extraDice = [], floor2 = false } = options || {}
    const typeExtra = dt ? { damageTypeLabel: dt } : {}
    /** 法术/非武器伤害重击始终按规则 ×2；装备暴击× 仅作用于武器 rollAllWeaponDamage */
    const critDiceMult = isCrit ? 2 : 1
    const applyFloor2 = (vals) =>
      floor2 ? vals.map((n) => Math.max(2, Number(n) || 0)) : vals.map((n) => Number(n) || 0)

    /** 构造待投掷骰池：主表达式 + 增益额外骰；主表达式承载 modifier，额外骰无附加调整值 */
    const pools = [{ dice: raw, modifier: mod, type: dt || '' }]
    if (Array.isArray(extraDice)) {
      extraDice.forEach((ed) => {
        const s = String(ed || '').trim()
        if (!s) return
        const parts = s.includes(' ') ? s.split(' ') : [s, '']
        const dice = parts[0]
        const type = parts[1] ? getDamageTypeLabel(parts[1]) || parts[1] : dt || ''
        if (dice) pools.push({ dice, modifier: 0, type })
      })
    }

    let grandTotal = 0
    const allRolls = []
    const animParts = []
    const animValues = []
    const byType = {}

    pools.forEach(({ dice, modifier, type }, idx) => {
      const isMain = idx === 0
      const poolRolls = []
      let firstFlat = 0
      let parsed = null
      for (let k = 0; k < critDiceMult; k++) {
        const p = rollCombatDicePool(dice)
        if (k === 0) {
          firstFlat = p.flatMod || 0
          parsed = p.parsed
        }
        poolRolls.push(...(p.rolls || []))
      }
      const rolls = applyFloor2(poolRolls)
      const diceSum = rolls.reduce((s, n) => s + n, 0)
      const sourceMod = isMain ? Number(modifier) || 0 : 0
      grandTotal += diceSum + firstFlat + sourceMod
      allRolls.push(...rolls)

      if (parsed && rolls.length === parsed.count * critDiceMult) {
        const effCount = parsed.count * critDiceMult
        const totalFlat = sourceMod + firstFlat
        const piece =
          totalFlat !== 0
            ? `${effCount}d${parsed.sides}${totalFlat >= 0 ? '+' : ''}${totalFlat}`
            : `${effCount}d${parsed.sides}`
        animParts.push(piece)
        animValues.push(...rolls)
      }

      if (type) {
        if (!byType[type]) byType[type] = { rolls: [], modifier: 0 }
        byType[type].rolls.push(...rolls)
        byType[type].modifier += firstFlat + sourceMod
      }
    })

    const critLabel = isCrit ? ' (重击×2伤害骰)' : ''
    const animBundle =
      animParts.length > 0 && animValues.length > 0
        ? { animate: true, formula: animParts.join(','), diceValues: animValues }
        : {}

    setLastDamageRoll({
      key: key ?? Date.now(),
      label: (label || raw) + critLabel,
      total: grandTotal,
      rolls: allRolls,
      dice: raw,
      modifier: mod,
      isCrit: !!isCrit,
      byType,
      ...animBundle,
      ...typeExtra,
    })
  }

  /** 组合技：把附件伤害骰合并到主手段后，复用对应投掷逻辑 */
  const getComboAttachmentDice = (cm) => {
    return (cm.attachments || [])
      .filter((a) => a.name && /^\d+d\d+/i.test(a.damageDice || ''))
      .map((a) => `${a.damageDice} ${a.damageType || ''}`.trim())
  }
  const buildComboEffectiveMean = (cm, primary) => {
    if (!primary) return null
    return {
      ...primary,
      id: cm.id,
      gains: cm.gains,
      extraDamageDice: [...(primary.extraDamageDice || []), ...getComboAttachmentDice(cm)],
    }
  }
  const rollComboDamage = (cm, isCrit) => {
    const primary = combatMeans.find((m) => m.id === cm.primaryMeanId)
    if (!primary) return
    if (primary.type === 'physical') {
      const weaponOpt = primary.weaponInventoryIndex != null ? weaponsFromInv.find((w) => w.index === primary.weaponInventoryIndex) : null
      if (!weaponOpt) return
      const effectiveMean = buildComboEffectiveMean(cm, primary)
      const comboPhysStats = computePhysicalWeaponStats(effectiveMean, weaponOpt, { effectiveAbilities, prof, spellAbility, buffStats, flatBuffEffects, itemFormulaContext })
      rollAllWeaponDamage(effectiveMean, weaponOpt, comboPhysStats.attackParsed, comboPhysStats.totalDamageMod, comboPhysStats.displayDamageType, isCrit)
    } else if (primary.type === 'spell_attack' || primary.type === 'spell') {
      const gains = getEnabledGains(cm)
      const gainDamageBonus = sumGainDamageBonus(gains)
      const gainPerDieBonus = sumGainPerDieBonus(gains)
      const gainExtraDice = getGainExtraDice(gains)
      const spellDamageExtras = getSpellDamageBonusExtras(primary.damageTypeSpell, buffStats?.spellDamageBonuses, itemFormulaContext)
      const spellDiceCount = (() => { const p = parseCombatDiceExpression((primary.damageDice || '').trim()); return p ? p.count : 0 })()
      const spellDamageMod = gainDamageBonus + gainPerDieBonus * spellDiceCount + spellDamageExtras.flatBonus
      const allSpellExtraDice = [...gainExtraDice, ...spellDamageExtras.extraDice, ...getComboAttachmentDice(cm)]
      const attachmentNames = cm.attachments?.map((a) => a.name).filter(Boolean)
      const labelSuffix = attachmentNames?.length ? `+${attachmentNames.join('/')}` : ''
      rollDamageDice((primary.damageDice || '').trim(), `${primary.spellName || '法术'}${labelSuffix} ${getDamageTypeLabel(primary.damageTypeSpell) || ''}`.trim(), 'combo-' + cm.id, spellDamageMod, isCrit, getDamageTypeLabel(primary.damageTypeSpell) || '', { extraDice: allSpellExtraDice, floor2: hasGainDiceFloor2(gains) })
    }
  }

  const weaponsFromInv = useMemo(() => getWeaponsFromInventory(char?.inventory ?? []), [char?.inventory])

  const openEditWeaponMean = useCallback((cm) => {
    setEditingCombatMeanId(cm.id)
    setAddWeaponIndex(cm.weaponInventoryIndex ?? null)
    setAddWeaponNameSuffix(cm.weaponNameSuffix ?? '')
    const wForEdit =
      cm.weaponInventoryIndex != null ? weaponsFromInv.find((x) => x.index === cm.weaponInventoryIndex) : null
    const rawDamageType = cm.damageType || (wForEdit ? parseWeaponAttack(getWeaponAttackStringForParsing(wForEdit, cm.weaponVersatileMode)).type : null)
    const flatEffects = getFlatEffectEntries(mergedBuffs, char)
    const spellAbilityOverride = getSpellAbilityForAttackFromBuffs(flatEffects, {
      weaponProto: wForEdit?.proto,
      damageType: rawDamageType,
      sourceItemInventoryId: wForEdit?.entry?.id,
    }) || getWeaponEntrySpellAbility(wForEdit?.entry)
    setAddAbility(resolvePhysicalWeaponAbilityKind(cm, wForEdit, spellAbilityOverride))
    setAddDamageType(cm.damageType ? String(cm.damageType) : '')
    setAddWeaponMode(cm.weaponVersatileMode || getDefaultWeaponMode(wForEdit))
    setAddWeaponProficient(cm.weaponProficient !== false)
    setAddTargetCreatureType(cm.targetCreatureType || '')
    setAddWeaponExtraDice(Array.isArray(cm.extraDamageDice) ? [...cm.extraDamageDice] : [])
    setShowWeaponExtraDiceEditor(false)
    setAddGains(cm.gains?.length ? [...cm.gains] : buildDefaultGainsFromBuffs(cm, buffStats, mergedBuffs, false, char))
    setAddMeanStep('weapon')
    setShowAddCombatMeanModal(true)
  }, [weaponsFromInv, buffStats, mergedBuffs])

  const explosivesFromInv = useMemo(() => getExplosivesFromInventory(char?.inventory ?? []), [char?.inventory])
  const focusFromInv = useMemo(() => getFocusItemsFromInventory(char?.inventory ?? []), [char?.inventory])
  const scrollsFromInv = useMemo(() => getScrollsFromInventory(char?.inventory ?? []), [char?.inventory])
  /** 道具攻击可选列表：消耗品（爆炸品）+ 法器（法杖/魔杖/权杖）+ 卷轴 */
  const itemMeansFromInv = useMemo(() => {
    const ex = (explosivesFromInv || []).map((e) => ({ ...e, kind: 'explosive', label: `${e.name}（消耗品）` }))
    const fo = (focusFromInv || []).filter((f) => f.chargeMax != null || f.isWandStaffRod).map((f) => ({ ...f, kind: 'focus', label: `${f.name}（法器）` }))
    const sc = (scrollsFromInv || []).map((s) => ({ ...s, kind: 'scroll', label: `${s.name}（卷轴）` }))
    return [...ex, ...fo, ...sc]
  }, [explosivesFromInv, focusFromInv, scrollsFromInv])
  const nonComboCombatMeans = useMemo(() => combatMeans.filter((m) => m.type !== 'combo'), [combatMeans])
  const preparedSpellsList = useMemo(() => {
    const raw = char?.spells ?? []
    return raw
      .filter((s) => s.prepared)
      .map((s) => ({ spellId: s.spellId ?? s.id, spell: getSpellById(s.spellId ?? s.id) }))
      .filter((x) => x.spell)
  }, [char?.spells])
  const effectiveAbilities = buffStats?.abilities ?? abilities
  const { spellAbility, spellAttackBonus, spellDC, prof } = getSpellcastingCombatStats(char, buffStats, level, abilities)
  const previewWeaponStats = useMemo(() => {
    if (addMeanStep !== 'weapon' || addWeaponIndex == null) return null
    const w = weaponsFromInv.find((x) => x.index === addWeaponIndex)
    if (!w) return null
    const previewCm = {
      id: 'preview',
      type: 'physical',
      weaponInventoryIndex: addWeaponIndex,
      abilityForAttack: addAbility,
      damageType: addDamageType || null,
      weaponVersatileMode: addWeaponMode || null,
      weaponProficient: addWeaponProficient,
      targetCreatureType: addTargetCreatureType || '',
      extraDamageDice: [...addWeaponExtraDice],
      gains: addGains,
    }
    return computePhysicalWeaponStats(previewCm, w, {
      effectiveAbilities,
      prof,
      spellAbility,
      buffStats,
      flatBuffEffects,
      itemFormulaContext,
    })
  }, [addMeanStep, addWeaponIndex, addAbility, addDamageType, addWeaponMode, addWeaponProficient, addTargetCreatureType, addWeaponExtraDice, addGains, weaponsFromInv, effectiveAbilities, prof, spellAbility, buffStats, flatBuffEffects, itemFormulaContext])
  const draftSpellCm = useMemo(() => ({ type: 'spell_attack', targetCreatureType: addTargetCreatureType || '' }), [addTargetCreatureType])
  const draftItemCm = useMemo(() => ({ type: 'item', itemInventoryIndex: addItemIndex ?? null, targetCreatureType: addTargetCreatureType || '' }), [addItemIndex, addTargetCreatureType])
  const draftItemIsSpell = useMemo(() => {
    const itemOpt = addItemIndex != null ? itemMeansFromInv.find((x) => x.index === addItemIndex) : null
    return !!(itemOpt && (itemOpt.kind === 'focus' || itemOpt.kind === 'scroll'))
  }, [addItemIndex, itemMeansFromInv])
  const draftWeaponCm = useMemo(() => ({ type: 'physical', weaponInventoryIndex: addWeaponIndex ?? null, damageType: addDamageType || null, targetCreatureType: addTargetCreatureType || '' }), [addWeaponIndex, addDamageType, addTargetCreatureType])
  const spellcastingLevel = getSpellcastingLevel(char)
  const maxSlotsByRing = useMemo(() => getMaxSpellSlotsByRing(char), [char])
  const spellSlotsMaxOverride = char?.spellSlotsMax && typeof char.spellSlotsMax === 'object' ? char.spellSlotsMax : {}
  const baseMaxByRing = useMemo(() => {
    const out = {}
    for (let ring = 1; ring <= 9; ring++) {
      out[ring] = spellSlotsMaxOverride[ring] != null
        ? Math.max(0, Number(spellSlotsMaxOverride[ring]) || 0)
        : (maxSlotsByRing[ring] ?? 0)
    }
    return out
  }, [maxSlotsByRing, spellSlotsMaxOverride])
  const effectiveMaxByRing = baseMaxByRing
  const visibleBaseRings = useMemo(
    () => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((r) => (baseMaxByRing[r] ?? 0) > 0),
    [baseMaxByRing],
  )
  const [spellSlotsCurrentLocal, setSpellSlotsCurrentLocal] = useState(char?.spellSlots ?? {})
  const spellSlotsSaveTimerRef = useRef(null)
  useEffect(() => {
    setSpellSlotsCurrentLocal(char?.spellSlots ?? {})
  }, [char?.spellSlots])
  useEffect(() => () => {
    if (spellSlotsSaveTimerRef.current) clearTimeout(spellSlotsSaveTimerRef.current)
  }, [])
  const saveSpellSlotsDebounced = useCallback((next) => {
    if (spellSlotsSaveTimerRef.current) clearTimeout(spellSlotsSaveTimerRef.current)
    spellSlotsSaveTimerRef.current = setTimeout(() => {
      onSave({ spellSlots: next })
      spellSlotsSaveTimerRef.current = null
    }, 140)
  }, [onSave])
  const setSpellSlotCurrentTotal = (ring, remaining) => {
    const max = effectiveMaxByRing[ring] ?? 0
    setSpellSlotsCurrentLocal((prev) => {
      const next = { ...(prev ?? {}), [ring]: Math.max(0, Math.min(max, remaining)) }
      saveSpellSlotsDebounced(next)
      return next
    })
  }
  /** 同一轮施法内多次点击（法术攻击 + 伤害）避免重复扣法术位 */
  const spentSpellSlotIdsRef = useRef(new Set())
  const getSpellMeanSlotRing = useCallback((cm) => {
    if (!cm) return null
    if (cm.type === 'item') {
      // 道具攻击（法器/爆炸品/卷轴）不消耗法术位：法器扣充能、爆炸品扣数量、卷轴扣数量
      return null
    }
    if (cm.type !== 'spell_attack' && cm.type !== 'spell') return null
    const lvl = Number(cm.spellLevel)
    if (lvl >= 1 && lvl <= 9) return lvl
    const spell = cm.spellId
      ? preparedSpellsList.find((p) => p.spellId === cm.spellId)?.spell
      : getMergedSpells().find((s) => s.name && s.name.trim() === (cm.spellName || '').trim())
    const inferred = Number(spell?.level)
    return inferred >= 1 && inferred <= 9 ? inferred : null
  }, [preparedSpellsList])
  const consumeSpellSlotForMean = useCallback((cm, label) => {
    const ring = getSpellMeanSlotRing(cm)
    if (!ring) return true
    if (spentSpellSlotIdsRef.current.has(cm.id)) return true
    const max = effectiveMaxByRing[ring] ?? 0
    const totalCur = Math.min(max, Math.max(0, spellSlotsCurrentLocal[ring] ?? max))
    if (totalCur <= 0) {
      window.alert(`${label || ring + ' 环法术位'}已耗尽`)
      return false
    }
    setSpellSlotCurrentTotal(ring, totalCur - 1)
    spentSpellSlotIdsRef.current.add(cm.id)
    setTimeout(() => spentSpellSlotIdsRef.current.delete(cm.id), 8000)
    return true
  }, [getSpellMeanSlotRing, effectiveMaxByRing, spellSlotsCurrentLocal])

  const setBaseSlotCurrent = (ring, remainingBase) => {
    setSpellSlotCurrentTotal(ring, Math.max(0, Math.min(effectiveMaxByRing[ring] ?? 0, remainingBase)))
  }

  const saveHp = (c, t, bt = hpBuffTemp) => {
    setHpCurrent(c)
    setHpTemp(t)
    setHpBuffTemp(bt)
    onSave({ hp: { current: c, max: maxHp, temp: t, buffTemp: bt } })
  }

  const handleDeduct = () => {
    const raw = parseInt(String(deductVal).trim(), 10)
    if (isNaN(raw) || raw <= 0) return
    const n = buffDamageReduction > 0 ? Math.max(0, raw - buffDamageReduction) : raw
    const effectiveBefore = Math.max(hpTemp, hpBuffTemp)
    const newEffective = Math.max(0, effectiveBefore - n)
    let newTemp, newBuffTemp
    if (hpTemp >= hpBuffTemp) {
      newTemp = Math.max(0, hpTemp - n)
      newBuffTemp = Math.min(hpBuffTemp, newTemp)
    } else {
      newBuffTemp = Math.max(0, hpBuffTemp - n)
      newTemp = Math.min(hpTemp, newBuffTemp)
    }
    const newCur = hpCurrent - Math.max(0, n - effectiveBefore)
    if (newCur < 1 && hasActiveDeathWard(mergedBuffs)) {
      const patch = consumeDeathWard(char, mergedBuffs)
      if (patch) {
        setHpCurrent(1)
        setHpTemp(0)
        setHpBuffTemp(0)
        onSave({ hp: { current: 1, max: maxHp, temp: 0, buffTemp: 0 }, ...patch })
        setDeductVal('')
        return
      }
    }
    saveHp(newCur, newTemp, newBuffTemp)
    setDeductVal('')
  }

  const handleAddTemp = () => {
    const n = parseInt(tempInputVal, 10)
    if (isNaN(n) || n <= 0) return
    saveHp(hpCurrent, hpTemp + n, hpBuffTemp)
    setTempInputVal('')
  }

  const handleHeal = () => {
    const n = parseInt(healVal, 10)
    if (isNaN(n)) return
    saveHp(Math.min(maxHp, hpCurrent + n), hpTemp, hpBuffTemp)
    setHealVal('')
  }

  const addCondition = (val) => {
    if (conditions.includes(val)) return
    const next = [...conditions, val]
    setConditions(next)
    onSave({ conditions: next })
  }

  const removeCondition = (val) => {
    const next = conditions.filter((c) => c !== val)
    setConditions(next)
    onSave({ conditions: next })
  }

  const setExhaustionLevel = (n) => {
    const v = Math.max(0, Math.min(6, Number(n) || 0))
    setExhaustion(v)
    onSave({ exhaustionLevel: v })
  }

  const rollDeathSave = () => {
    const results = [...(deathSaves.results ?? getDefaultDeathSaves().results)]
    const emptyIdx = results.findIndex((r) => r == null)
    if (emptyIdx < 0) return
    const roll = Math.floor(Math.random() * 20) + 1
    let isCrit = false
    let isFumble = false
    if (roll === 20) {
      /** D&D 2024：自然 20 恢复 1 HP、清醒，死亡豁免轨迹重置（不再计两次成功） */
      const wakeHp = Math.min(maxHp, Math.max(0, Number(hpCurrent) || 0) + 1)
      const next = {
        ...getDefaultDeathSaves(),
        lastRoll: { roll, isCritical: true, isFumble: false },
      }
      setHpCurrent(wakeHp)
      setDeathSaves(next)
      onSave({
        deathSaves: next,
        hp: { current: wakeHp, max: maxHp, temp: hpTemp, buffTemp: hpBuffTemp },
      })
      return
    } else if (roll === 1) {
      results[emptyIdx] = 'failure'
      if (emptyIdx + 1 < results.length) results[emptyIdx + 1] = 'failure'
      isFumble = true
    } else {
      results[emptyIdx] = roll >= 10 ? 'success' : 'failure'
    }
    const next = { results, lastRoll: { roll, isCritical: isCrit, isFumble } }
    setDeathSaves(next)
    onSave({ deathSaves: next })
  }

  const resetDeathSaves = () => {
    const next = getDefaultDeathSaves()
    setDeathSaves(next)
    onSave({ deathSaves: next })
  }

  const saveClassResources = (next) => {
    setClassResources(next)
    onSave({ classResources: next.map((r) => ({
      id: r.id,
      name: r.name,
      current: r.current,
      max: r.max,
      ...(r.resourceKey ? { resourceKey: r.resourceKey } : {}),
      ...(r.recovery ? { recovery: r.recovery } : {}),
      ...(r.diceType ? { diceType: r.diceType } : {}),
      ...(r.note ? { note: r.note } : {}),
    })) })
  }

  const addClassResource = () => {
    const name = (addResourceName?.trim() || '未命名')
    const max = Math.max(1, Number(addResourceMax) || 1)
    const next = [...classResources, { id: 'r_' + Date.now(), name, current: max, max }]
    saveClassResources(next)
    setAddResourceName('')
    setAddResourceMax(2)
    setIsAddingResource(false)
  }

  const removeClassResource = (id) => {
    saveClassResources(classResources.filter((r) => r.id !== id))
  }

  const adjustClassResource = (id, delta) => {
    const next = classResources.map((r) => {
      if (r.id !== id) return r
      const cur = Math.max(0, Math.min(r.max, r.current + delta))
      return { ...r, current: cur }
    })
    saveClassResources(next)
  }

  /* ── 短休：恢复 recovery='short' 的资源 + 魔契师契约法术位 ── */
  const handleShortRest = () => {
    const next = classResources.map((r) => {
      if (r.recovery === 'short') return { ...r, current: r.max }
      return r
    })
    saveClassResources(next)
    // 护盾短休恢复
    if (shields.length > 0) saveShields(recoverShieldsOnRest(shields, 'short'))
    // 护盾池短休恢复
    const spRecoverShort = recoverShieldPoolsOnRest(char, 'short', mergedBuffs)
    if (spRecoverShort) onSave({ shieldPoolStates: spRecoverShort })
    // 物品充能短休恢复（仅 recharge_short_rest 类型）
    const inv = char?.inventory ?? []
    if (inv.length > 0) {
      const { inventory: nextInv, logs } = restoreChargesForEvent(inv, 'short_rest')
      if (logs.length > 0) {
        onSave({ inventory: nextInv })
        const summary = logs.map((l) => `${l.name}：${l.from} → ${l.to}`).join('\n')
        console.log('短休恢复充能：', summary)
      }
    }
    // 魔契师短休恢复契约法术位
    const pactLv = getPactLevel(char)
    if (pactLv > 0) {
      const pactSlots = getPactSlotsByLevel(pactLv)
      const cur = spellSlotsCurrentLocal ?? {}
      const recovered = {}
      let changed = false
      for (let ring = 1; ring <= 9; ring++) {
        const max = effectiveMaxByRing[ring] ?? 0
        const add = pactSlots[ring] ?? 0
        if (add > 0 && max > 0) {
          const curVal = Math.min(max, cur[ring] ?? max)
          const newVal = Math.min(max, curVal + add)
          if (newVal !== curVal) changed = true
          recovered[ring] = newVal
        }
      }
      if (changed) {
        const merged = { ...(cur ?? {}), ...recovered }
        setSpellSlotsCurrentLocal(merged)
        onSave({ spellSlots: merged })
      }
    }
  }

  /* ── 长休：恢复所有资源 + 重置死亡豁免 + 恢复所有法术位 ── */
  const handleLongRest = () => {
    const next = classResources.map((r) => ({ ...r, current: r.max }))
    saveClassResources(next)
    // 护盾长休恢复
    if (shields.length > 0) saveShields(recoverShieldsOnRest(shields, 'long'))
    // 护盾池长休恢复
    const spRecoverLong = recoverShieldPoolsOnRest(char, 'long', mergedBuffs)
    if (spRecoverLong) onSave({ shieldPoolStates: spRecoverLong })
    // 物品充能长休恢复（recharge_long_rest）
    const inv = char?.inventory ?? []
    if (inv.length > 0) {
      const { inventory: nextInv, logs } = restoreChargesForEvent(inv, 'long_rest')
      if (logs.length > 0) {
        onSave({ inventory: nextInv })
        const summary = logs.map((l) => `${l.name}：${l.from} → ${l.to}`).join('\n')
        console.log('长休恢复充能：', summary)
      }
    }
    const ds = getDefaultDeathSaves()
    setDeathSaves(ds)
    onSave({ deathSaves: ds })
    // 长休恢复所有法术位到最大值
    const cur = spellSlotsCurrentLocal ?? {}
    const restored = {}
    let changed = false
    for (let ring = 1; ring <= 9; ring++) {
      const max = effectiveMaxByRing[ring] ?? 0
      if (max > 0) {
        const curVal = cur[ring] ?? max
        if (curVal < max) {
          restored[ring] = max
          changed = true
        }
      }
    }
    if (changed) {
      const merged = { ...(cur ?? {}), ...restored }
      setSpellSlotsCurrentLocal(merged)
      onSave({ spellSlots: merged })
    }
  }

  /* ── 黎明恢复：仅恢复黎明恢复类型的物品充能 ── */
  const handleDawn = () => {
    const inv = char?.inventory ?? []
    if (inv.length > 0) {
      const { inventory: nextInv, logs } = restoreChargesForEvent(inv, 'dawn')
      if (logs.length > 0) {
        onSave({ inventory: nextInv })
        const summary = logs.map((l) => `${l.name}：${l.from} → ${l.to}`).join('\n')
        console.log('黎明恢复充能：', summary)
      }
    }
  }

  const dexMod = abilityModifier(effectiveAbilities?.dex ?? 10)
  const init = dexMod + (buffStats?.initBonus ?? 0)
  const perception = 10 + abilityModifier(effectiveAbilities?.wis ?? 10) + Math.floor(prof * skillProfFactor(char?.skills?.perception || 'none'))
  const speedBase = (char?.speed ?? 30) + (buffStats?.speedBonus ?? 0)
  const speedPenalty = buffStats?.speedExhaustionPenalty ?? 0
  const speed = Math.max(0, Math.floor(speedBase * (buffStats?.speedMultiplier ?? 1)) - speedPenalty)
  const swimSpeed = Math.max(0, Math.floor((buffStats?.swimSpeedBonus ?? 0) * (buffStats?.speedMultiplier ?? 1)))
  const climbSpeed = Math.max(0, Math.floor((buffStats?.climbSpeedBonus ?? 0) * (buffStats?.speedMultiplier ?? 1)))
  const flySpeed = Math.max(0, Math.floor((buffStats?.flightSpeed ?? 0) * (buffStats?.speedMultiplier ?? 1)))

  const dsResults = deathSaves.results?.length === DEATH_SAVE_COUNT ? deathSaves.results : getDefaultDeathSaves().results
  const deathFailures = dsResults.filter((r) => r === 'failure').length
  const deathSuccesses = dsResults.filter((r) => r === 'success').length
  const effectiveTemp = Math.max(hpTemp, hpBuffTemp)
  const displayCurrent = hpCurrent + effectiveTemp
  const hasTempHp = effectiveTemp > 0

  let barColor = 'bg-gray-600'
  if (deathFailures >= 3 || hpCurrent <= -maxHp) {
    barColor = 'bg-gray-500'
  } else if (hasTempHp) {
    barColor = HP_BAR_TEMP_FILL_CLASS
  } else {
    barColor = hpBarMainFillClass(hpCurrent, maxHp)
  }

  const barWidth = maxHp > 0 ? Math.max(0, Math.min(100, (displayCurrent / maxHp) * 100)) : 0

  const statusEffectDescription = useMemo(() => {
    const parts = []
    if (exhaustion > 0 && EXHAUSTION_DESCRIPTIONS[exhaustion]) parts.push(`力竭${exhaustion}：${EXHAUSTION_DESCRIPTIONS[exhaustion]}`)
    conditions.forEach((c) => { const d = CONDITION_DESCRIPTIONS[c]; if (d) parts.push(`${CONDITION_LABELS[c] ?? c}：${d}`) })
    return parts.length ? parts.join('；') : ''
  }, [exhaustion, conditions])

  const deathSaveSummaryLine = useMemo(() => {
    const parts = [`成功 ${deathSuccesses}/3 · 失败 ${deathFailures}/3`]
    if (deathSaves.lastRoll != null) parts.push(`上次 d20=${deathSaves.lastRoll.roll}`)
    return parts.join(' · ')
  }, [deathSuccesses, deathFailures, deathSaves.lastRoll])

  const deductDamagePreview = useMemo(() => {
    if (buffDamageReduction <= 0) return null
    const raw = parseInt(String(deductVal).trim(), 10)
    if (isNaN(raw) || raw <= 0) return null
    return { raw, effective: Math.max(0, raw - buffDamageReduction) }
  }, [deductVal, buffDamageReduction])

  const DEATH_SAVE_RULE_HINT =
    '（D&D 2024）d20≥10 成功；投出 1 计两次失败；投出 20 恢复 1 HP、清醒并重置死亡豁免。累计 3 次成功伤势稳定；累计 3 次失败死亡。'

  /** 生命值上限计算公式文案（hover 提示） */
  const maxHpFormulaTooltip = useMemo(() => {
    const parts = []
    const classes = []
    const main = char?.['class']
    const mainLevel = Math.max(0, Math.min(20, Number(char?.classLevel) ?? 0))
    if (main && mainLevel > 0) classes.push({ name: main, level: mainLevel })
    const multiclass = char?.multiclass ?? []
    multiclass.forEach((m) => {
      const name = m?.['class']
      const level = Math.max(0, Math.min(20, Number(m?.level) ?? 0))
      if (name && level > 0) classes.push({ name, level })
    })
    const prestige = char?.prestige ?? []
    prestige.forEach((p) => {
      const name = p?.['class']
      const level = Math.max(0, Math.min(20, Number(p?.level) ?? 0))
      if (name && level > 0) classes.push({ name, level })
    })
    const conScore = abilitiesForMaxHp?.con != null ? Number(abilitiesForMaxHp.con) : Number(char?.abilities?.con ?? 10)
    const conMod = abilityModifier(conScore)
    let baseSum = 0
    classes.forEach(({ name, level }, idx) => {
      const hd = getHitDice(name)
      const avg = Math.ceil((hd + 1) / 2)
      if (idx === 0) {
        // 起始职业：第1级取最大值，后续取平均值
        const firstLv = hd + conMod
        const restLv = level > 1 ? (level - 1) * (avg + conMod) : 0
        const sub = firstLv + restLv
        baseSum += sub
        parts.push(`${name} ${level}级（起始）：1级 ${hd}+${conMod}=${firstLv}${level > 1 ? ` + ${level - 1}×(${avg}+${conMod})=${restLv}` : ''} = ${sub}`)
      } else {
        // 兼职/进阶：所有等级取平均值
        const sub = level * (avg + conMod)
        baseSum += sub
        parts.push(`${name} ${level}级（兼/进阶）：${level}×(${avg}+${conMod})=${sub}`)
      }
    })
    if (parts.length === 0) return '生命上限：无职业数据'

    /** 收集 HP 加值来源（旧格式 hp 字段 + 新/旧格式 max_hp_bonus） */
    const hpBonusSources = []
    ;(char?.buffs ?? []).forEach((b) => {
      const v = Number(b.hp) || 0
      if (v !== 0) {
        const src = b.source?.trim() || '未知来源'
        hpBonusSources.push(`${src} ${v > 0 ? '+' : ''}${v}`)
      }
    })
    mergedBuffs.forEach((b) => {
      if (Array.isArray(b.effects)) {
        b.effects.forEach((e) => {
          if (e.effectType === 'max_hp_bonus') {
            const v = evaluateBuffValue(e.value, itemFormulaContext)
            if (v !== 0) {
              const src = b.source?.trim() || '未知来源'
              hpBonusSources.push(`${src} ${v > 0 ? '+' : ''}${v}`)
            }
          }
        })
      } else if (b.effectType === 'max_hp_bonus') {
        const v = evaluateBuffValue(b.value, itemFormulaContext)
        if (v !== 0) {
          const src = b.source?.trim() || '未知来源'
          hpBonusSources.push(`${src} ${v > 0 ? '+' : ''}${v}`)
        }
      }
    })

    /** 收集 HP 倍率来源 */
    const multSources = []
    mergedBuffs.forEach((b) => {
      if (Array.isArray(b.effects)) {
        b.effects.forEach((e) => {
          if (e.effectType === 'max_hp_multiplier') {
            const v = evaluateBuffValue(e.value, itemFormulaContext) || 1
            if (v !== 1) {
              const src = b.source?.trim() || '未知来源'
              multSources.push(`${src} ×${v}`)
            }
          }
        })
      } else if (b.effectType === 'max_hp_multiplier') {
        const v = evaluateBuffValue(b.value, itemFormulaContext) || 1
        if (v !== 1) {
          const src = b.source?.trim() || '未知来源'
          multSources.push(`${src} ×${v}`)
        }
      }
    })

    let formula = `基础 = ${baseSum}`
    const hpBuffSum = getHPBuffSum(char)
    if (hpBuffSum !== 0) { formula += ` + HP加值 ${hpBuffSum}`; baseSum += hpBuffSum }
    const maxHpBonus = buffStats?.maxHpBonus ?? 0
    if (maxHpBonus !== 0) { formula += ` + 上限加值 ${maxHpBonus}`; baseSum += maxHpBonus }
    const mult = buffStats?.maxHpMultiplier ?? 1
    if (mult !== 1) { formula += ` × 倍率 ${mult}`; baseSum = Math.max(1, Math.floor(baseSum * mult)) }
    formula += ` = ${maxHpCalculated}`
    if (isCreatureTemplate && char?.hp?.max != null && Number(char.hp.max) > 0) {
      formula += `（生物卡手动设定：${Number(char.hp.max)}）`
    }
    const detailLines = [...parts, formula]
    if (hpBonusSources.length) detailLines.push(`  HP加值来源：${hpBonusSources.join('、')}`)
    if (multSources.length) detailLines.push(`  倍率来源：${multSources.join('、')}`)
    return detailLines.join('\n')
  }, [char, abilitiesForMaxHp, buffStats?.maxHpBonus, buffStats?.maxHpMultiplier, maxHpCalculated, mergedBuffs])

  return (
    <div
      className={`panel-highlight-top rounded-xl border border-white/10 bg-gradient-to-b from-[#243147]/35 to-[#1f2a3d]/30 p-3 space-y-3 ${COMBAT_ROOT_OUTER_SHADOW}`}
    >
      <div
        className={`rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/28 to-[#222f45]/22 p-3 ${COMBAT_INNER_RIM_ONLY}`}
      >
        <div className="flex items-baseline gap-2 mb-1.5" title={maxHpFormulaTooltip}>
          <h3 className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider shrink-0">生命值</h3>
          <span className="text-white font-bold text-xl font-mono">
            {displayCurrent} / {maxHp}
            {hasTempHp && (
              <span className="text-blue-400 text-sm font-normal ml-1">
                （含 {effectiveTemp} 临时{hpBuffTemp === effectiveTemp && hpBuffTemp > 0 ? `，BUFF ${hpBuffTemp}` : ''}）
              </span>
            )}
          </span>
        </div>
        <div className="h-3 rounded bg-gray-900 overflow-hidden">
          <div className={`h-full rounded transition-all ${barColor}`} style={{ width: `${barWidth}%` }} />
        </div>
        {canEdit && isCreatureTemplate && (
          <div className="mt-2 flex items-center gap-2">
            <label className="text-gray-400 text-sm whitespace-nowrap">生命上限</label>
            <input
              type="number"
              min={1}
              value={char?.hp?.max ?? ''}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10)
                if (!isNaN(v) && v >= 1) {
                  onSave({ hp: { current: hpCurrent, max: v, temp: hpTemp, buffTemp: hpBuffTemp } })
                }
              }}
              onBlur={(e) => {
                const v = parseInt(e.target.value, 10)
                const safe = (isNaN(v) || v < 1) ? maxHpCalculated : v
                onSave({ hp: { current: hpCurrent, max: safe, temp: hpTemp, buffTemp: hpBuffTemp } })
              }}
              placeholder={String(maxHpCalculated)}
              className={inputClass + ' h-8 w-24 font-mono'}
            />
          </div>
        )}
        {canEdit && (
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div className="min-w-0">
              <div className="flex gap-2">
                <div
                  className={
                    'flex flex-1 min-w-0 min-h-9 rounded-lg border overflow-hidden focus-within:ring-2 focus-within:outline-none ' +
                    (buffDamageReduction > 0
                      ? 'border-dnd-gold/50 bg-gray-900/70 shadow-[inset_0_0_0_1px_rgba(199,154,66,0.2)] focus-within:border-dnd-gold-light focus-within:ring-dnd-gold/30'
                      : 'border-[var(--border-color)] bg-[var(--input-bg)] focus-within:border-[var(--accent)] focus-within:ring-[var(--accent)]')
                  }
                >
                  <span
                    className={
                      'shrink-0 flex items-center px-2 text-xs whitespace-nowrap border-r border-gray-600/60 select-none ' +
                      (buffDamageReduction > 0 ? 'text-dnd-gold-light tabular-nums' : 'text-[var(--text-muted)]')
                    }
                    title={
                      buffDamageReduction > 0
                        ? `将扣除 max(0, 输入−${buffDamageReduction}) 点 HP（先扣临时生命）`
                        : undefined
                    }
                  >
                    {buffDamageReduction > 0 ? `伤害减免 ${buffDamageReduction}` : '受到的伤害'}
                  </span>
                  <div className="flex flex-1 min-w-0 min-h-9 items-center gap-2 pl-2 pr-2">
                    <input
                      type="number"
                      value={deductVal}
                      onChange={(e) => setDeductVal(e.target.value)}
                      placeholder=""
                      aria-label={buffDamageReduction > 0 ? `伤害减免 ${buffDamageReduction}，输入受到的伤害数值` : '受到的伤害数值'}
                      title={
                        buffDamageReduction > 0
                          ? `伤害减免 ${buffDamageReduction}：将扣除 max(0, 输入−${buffDamageReduction}) 点 HP（先扣临时生命）`
                          : undefined
                      }
                      className={
                        (deductDamagePreview
                          ? 'min-w-[2.25rem] max-w-[5.5rem] shrink-0 '
                          : 'min-w-0 flex-1 ') +
                        'h-9 bg-transparent font-mono text-sm text-[var(--text-main)] border-0 outline-none focus:ring-0 placeholder:text-[var(--text-muted)]'
                      }
                    />
                    {deductDamagePreview && (
                      <span className="min-w-0 flex-1 text-[10px] text-gray-400 tabular-nums leading-snug">
                        受到 <span className="text-white font-mono">{deductDamagePreview.raw}</span>
                        {' → '}
                        实际扣 HP <span className="text-dnd-gold-light font-mono font-semibold">{deductDamagePreview.effective}</span>
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleDeduct}
                  title={
                    buffDamageReduction > 0
                      ? `扣除 HP = max(0, 输入伤害−减免${buffDamageReduction})，再先扣临时生命`
                      : '从临时生命与当前生命扣除'
                  }
                  className={
                    'px-3 py-1.5 rounded text-white text-sm font-medium shrink-0 transition-shadow ' +
                    (buffDamageReduction > 0
                      ? 'bg-dnd-red border border-dnd-gold/55 shadow-[0_0_14px_rgba(199,154,66,0.28)] hover:shadow-[0_0_18px_rgba(199,154,66,0.38)]'
                      : 'bg-dnd-red')
                  }
                >
                  扣除
                </button>
              </div>
            </div>
            <div>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={healVal}
                  onChange={(e) => setHealVal(e.target.value)}
                  placeholder="输入单次恢复血量"
                  className={inputClass + ' h-9 flex-1 min-w-0'}
                />
                <button type="button" onClick={handleHeal} className="px-3 py-1.5 rounded bg-green-600 text-white text-sm font-medium">
                  恢复
                </button>
                <button type="button" onClick={() => saveHp(maxHp, hpTemp, hpBuffTemp)} className="px-3 py-1.5 rounded border border-gray-500 text-gray-400 text-sm">
                  满血
                </button>
              </div>
            </div>
            <div>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={tempInputVal}
                  onChange={(e) => setTempInputVal(e.target.value)}
                  placeholder="输入临时血量"
                  className={inputClass + ' h-9 flex-1 min-w-0'}
                  min={0}
                />
                <button type="button" onClick={handleAddTemp} className="px-3 py-1.5 rounded bg-blue-600 text-white text-sm font-medium">
                  加入
                </button>
                {hpTemp > 0 && (
                  <button type="button" onClick={() => saveHp(hpCurrent, 0, hpBuffTemp)} className="px-3 py-1.5 rounded border border-gray-500 text-gray-400 text-sm">
                    清除
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div
          className={`rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/26 to-[#222f45]/22 p-2 sm:p-3 min-h-[4rem] flex flex-row flex-nowrap items-center justify-center gap-1.5 sm:gap-2 min-w-0 ${COMBAT_INNER_RIM_ONLY}`}
          title={[
            buffStats?.ac != null ? `由 Buff 计算器得出: ${acTotal}` : null,
            acResult.acFormulaNote ? `职业特性：${acResult.acFormulaNote}` : null,
            [
              acResult.acFormulaNote ? `特性基准 ${acResult.base ?? '—'}` : `基础AC ${acResult.base ?? '—'}`,
              !acResult.acFormulaNote ? `+ 敏调 ${(acResult.dexContrib ?? 0) >= 0 ? '+' : ''}${acResult.dexContrib ?? 0}` : null,
              (acResult.shieldBase ?? acResult.shield) > 0 ? `+ 盾AC ${acResult.shieldBase ?? acResult.shield}` : null,
              (acResult.shieldMagic ?? 0) > 0 ? `+ 盾牌增强 ${acResult.shieldMagic}` : null,
              (acResult.armorMagic ?? 0) > 0 ? `+ 盔甲增强 ${acResult.armorMagic}` : null,
              (acResult.outerMagic ?? 0) > 0 ? `+ 外袍 ${acResult.outerMagic}` : null,
              (acResult.other ?? 0) !== 0 ? `+ 其他 ${(acResult.other ?? 0) >= 0 ? '+' : ''}${acResult.other}` : null,
              `+ BUFF ${(acResult.buff ?? 0) >= 0 ? '+' : ''}${acResult.buff ?? 0}`,
              (buffStats?.acBonus ?? 0) !== 0 ? `+ Buff加值 ${(buffStats?.acBonus ?? 0) >= 0 ? '+' : ''}${buffStats?.acBonus}` : null,
            ].filter(Boolean).join(' → ') + ` = ${acTotal}`,
          ].filter(Boolean).join('\n')}
        >
          {showAcModeSelect ? (
            <select
              value={acModeEffective}
              onChange={(e) => onSave({ acCalculationMode: e.target.value || 'equipment' })}
              className={inputClass + ' !w-[8.75rem] max-w-[9.5rem] shrink-0 h-7 text-xs py-0 pl-2 pr-7 box-border'}
              title="AC 计算方式"
            >
              {acModeOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          ) : acModeEffective !== 'equipment' ? (
            <span className="text-xs text-gray-400 leading-tight inline-block min-w-0 max-w-[9.5rem] shrink-0 text-left whitespace-nowrap">
              {acModeOptions.find((o) => o.value === acModeEffective)?.label ?? ''}
            </span>
          ) : null}
          <div className="flex items-center justify-center gap-1 sm:gap-2 shrink-0">
            <span className="text-gray-400 text-xl sm:text-2xl font-medium">AC</span>
            <span className="text-gray-600 text-xl sm:text-2xl">|</span>
            <span className="text-white font-bold text-3xl sm:text-4xl font-mono tabular-nums">{acTotal}</span>
          </div>
        </div>
        <div
          className={`rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/26 to-[#222f45]/22 p-3 min-h-[4rem] flex items-center justify-center gap-2 ${COMBAT_INNER_RIM_ONLY}`}
        >
          <span className="text-gray-400 text-2xl font-medium">先攻</span>
          <span className="text-gray-600 text-2xl">|</span>
          <span className="text-white font-bold text-4xl font-mono">{init}</span>
          <button type="button" onClick={() => openForCheck('先攻', init, { quickRoll: true })} title={quickRollTitle('先攻')} aria-label={quickRollTitle('先攻')} className="w-7 h-7 flex items-center justify-center rounded border border-transparent bg-transparent text-dnd-red/90 hover:text-dnd-red shrink-0">
            <QuickRollIcon kind="d20" className={CM_DICE_IC} />
          </button>
        </div>
        <div
          className={`rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/26 to-[#222f45]/22 p-3 min-h-[4rem] flex items-center justify-center gap-2 ${COMBAT_INNER_RIM_ONLY}`}
        >
          <span className="text-gray-400 text-2xl font-medium">被动察觉</span>
          <span className="text-gray-600 text-2xl">|</span>
          <span className="text-white font-bold text-4xl font-mono">{perception}</span>
        </div>
        <div
          className={`rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/26 to-[#222f45]/22 p-3 min-h-[4rem] flex flex-col items-center justify-center gap-1 ${COMBAT_INNER_RIM_ONLY}`}
        >
          <div className="flex items-center gap-2">
            <span className="text-gray-400 text-2xl font-medium">速度</span>
            <span className="text-gray-600 text-2xl">|</span>
            <span className="text-white font-bold text-4xl font-mono">{speed} 尺</span>
          </div>
          {(swimSpeed > 0 || climbSpeed > 0 || flySpeed > 0) && (
            <div className="flex gap-2 flex-wrap justify-center">
              {flySpeed > 0 && <span className="text-xs text-sky-400 bg-sky-400/10 px-1.5 py-0.5 rounded">飞行 {flySpeed}</span>}
              {swimSpeed > 0 && <span className="text-xs text-cyan-400 bg-cyan-400/10 px-1.5 py-0.5 rounded">游泳 {swimSpeed}</span>}
              {climbSpeed > 0 && <span className="text-xs text-amber-400 bg-amber-400/10 px-1.5 py-0.5 rounded">攀爬 {climbSpeed}</span>}
            </div>
          )}
        </div>
        <div className="col-span-2 sm:col-span-4 flex flex-col sm:flex-row gap-2 min-w-0">
          <div
            className={`flex-[2] min-w-0 rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/26 to-[#222f45]/22 px-2 py-2 flex flex-col gap-1.5 ${COMBAT_INNER_RIM_ONLY}`}
          >
            <h3 className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider leading-tight shrink-0">状态效果</h3>
            <div className="flex flex-col gap-1.5 min-h-8 overflow-hidden min-w-0">
              <div className="flex items-center gap-1 shrink-0">
                {canEdit ? (
                  <>
                    <span className="text-gray-500 text-xs whitespace-nowrap">力竭</span>
                    <select
                      value={exhaustion}
                      onChange={(e) => setExhaustionLevel(Number(e.target.value))}
                      className={`h-5 min-h-0 px-1 rounded border border-gray-600 bg-gray-700 text-xs font-medium focus:border-dnd-red focus:ring-1 focus:ring-dnd-red shrink-0 ${getExhaustionColor(exhaustion)}`}
                    >
                      <option value={0}>无</option>
                      {[1, 2, 3, 4, 5, 6].map((n) => (
                        <option key={n} value={n}>等级{n}</option>
                      ))}
                    </select>
                  </>
                ) : (
                  <span className={`inline-flex items-center px-1 py-0.5 rounded text-xs font-medium whitespace-nowrap shrink-0 ${exhaustion > 0 ? 'bg-red-900/20 ' + getExhaustionColor(exhaustion) : 'text-gray-400'}`}>
                    力竭 {exhaustion > 0 ? exhaustion : '无'}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1 min-w-0">
                {conditions.map((c) => (
                  <span
                    key={c}
                    className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-xs bg-red-900/40 text-red-200 whitespace-nowrap shrink-0"
                  >
                    {CONDITION_LABELS[c] ?? c}
                    {canEdit && (
                      <button type="button" onClick={() => removeCondition(c)} className="hover:bg-red-800/50 rounded px-0.5">
                        ×
                      </button>
                    )}
                  </span>
                ))}
                {canEdit && CONDITION_OPTIONS.filter((o) => o.value !== 'exhaustion' && !conditions.includes(o.value)).map((o) => (
                  <button
                    key={o.value}
                    type="button"
                    onClick={() => addCondition(o.value)}
                    className="px-1 py-0.5 rounded text-xs border border-gray-600 text-gray-400 hover:bg-gray-700 whitespace-nowrap shrink-0"
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="min-h-[1.125rem] px-0.5 pt-1.5 text-xs text-gray-400 truncate border-t border-white/10 leading-tight" title={statusEffectDescription || undefined}>
              {statusEffectDescription || '\u00A0'}
            </div>
          </div>

          <div
            className={`flex-1 min-w-0 rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/26 to-[#222f45]/22 px-2 py-2 flex flex-col gap-1.5 ${COMBAT_INNER_RIM_ONLY}`}
          >
            <h3 className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider leading-tight shrink-0">死亡豁免</h3>
            <div className="flex flex-col gap-1.5 min-h-8 overflow-hidden min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap shrink-0">
                <span className="text-gray-500 text-xs whitespace-nowrap">记录</span>
                <span className="text-emerald-400/90 text-xs font-mono tabular-nums">
                  成功 {deathSuccesses}/3
                </span>
                <span className="text-gray-600 text-xs">·</span>
                <span className="text-red-400/90 text-xs font-mono tabular-nums">
                  失败 {deathFailures}/3
                </span>
                {deathSaves.lastRoll != null && (
                  <span className="text-gray-500 text-xs whitespace-nowrap tabular-nums">
                    d20={deathSaves.lastRoll.roll}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <div className="flex items-center gap-1.5">
                  {dsResults.map((r, i) => (
                    <span
                      key={i}
                      className={`w-6 h-6 rounded-full border flex-shrink-0 box-border ${
                        r === 'success' ? 'bg-emerald-600 border-emerald-500' : r === 'failure' ? 'bg-red-600 border-red-500' : 'bg-gray-700 border-gray-600'
                      }`}
                      title={r === 'success' ? '成功' : r === 'failure' ? '失败' : '未投'}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1.5 ml-auto sm:ml-0">
                  <button
                    type="button"
                    onClick={rollDeathSave}
                    title={quickRollTitle('死亡豁免')}
                    aria-label={quickRollTitle('死亡豁免')}
                    className="w-8 h-8 min-w-8 min-h-8 flex items-center justify-center rounded border border-transparent bg-transparent text-dnd-red/90 hover:text-dnd-red shrink-0 box-border"
                  >
                    <QuickRollIcon kind="d20" className={CM_DICE_IC} />
                  </button>
                  <button
                    type="button"
                    onClick={resetDeathSaves}
                    title="清空死亡豁免记录"
                    className="h-8 px-2 min-h-8 flex items-center justify-center rounded text-xs border border-gray-500 text-gray-400 hover:bg-gray-700/50 shrink-0 box-border"
                  >
                    重置
                  </button>
                </div>
              </div>
            </div>
            <div
              className="min-h-[1.125rem] px-0.5 pt-1.5 text-xs text-gray-400 border-t border-white/10 leading-tight truncate"
              title={`${deathSaveSummaryLine}\n${DEATH_SAVE_RULE_HINT}`}
            >
              {deathSaveSummaryLine} · {DEATH_SAVE_RULE_HINT}
            </div>
          </div>

          {/* 其它职业资源 */}
          <div
            className={`flex-[2] min-w-0 rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/26 to-[#222f45]/22 px-2 py-2 flex flex-col gap-1.5 ${COMBAT_INNER_RIM_ONLY}`}
          >
            <div className="flex items-center justify-between gap-1 mb-1 shrink-0">
              <h3 className={`text-dnd-gold-light ${CM_MEAN_LABEL} font-semibold uppercase tracking-wider leading-tight`}>其它职业资源</h3>
              <div className="flex items-center gap-1 shrink-0">
                {canEdit && classResources.some((r) => r.recovery === 'short') && (
                  <button type="button" onClick={handleShortRest} className="px-1.5 py-0.5 rounded bg-amber-700/60 text-amber-200 text-[10px] font-medium hover:bg-amber-700/80" title="短休：恢复所有短休资源">
                    短休
                  </button>
                )}
                {canEdit && classResources.length > 0 && (
                  <button type="button" onClick={handleLongRest} className="px-1.5 py-0.5 rounded bg-indigo-700/60 text-indigo-200 text-[10px] font-medium hover:bg-indigo-700/80" title="长休：恢复所有资源 + 重置死亡豁免">
                    长休
                  </button>
                )}
                {canEdit && (
                  <button type="button" onClick={handleDawn} className="px-1.5 py-0.5 rounded bg-orange-700/60 text-orange-200 text-[10px] font-medium hover:bg-orange-700/80" title="黎明恢复：恢复黎明恢复类型的物品充能">
                    黎明
                  </button>
                )}
                {canEdit && (
                  <button type="button" onClick={() => setIsAddingResource(true)} className="text-white text-xs font-bold uppercase tracking-wider hover:underline">
                    + 添加
                  </button>
                )}
              </div>
              </div>
              {canEdit ? (
                <div className="flex flex-col min-h-0 overflow-hidden gap-0.5">
                  {isAddingResource ? (
                    <>
                      <div className="flex items-center gap-1 flex-nowrap px-0.5 py-0.5 rounded border border-dashed border-gray-500 min-w-0 w-full">
                        <input
                          type="text"
                          value={addResourceName}
                          onChange={(e) => setAddResourceName(e.target.value)}
                          placeholder="名称"
                          className={inputClass + ' h-6 min-w-0 flex-1 text-sm'}
                          autoFocus
                        />
                        <input
                          type="number"
                          min={1}
                          value={addResourceMax}
                          onChange={(e) => setAddResourceMax(Math.max(1, parseInt(e.target.value, 10) || 1))}
                          placeholder="上限"
                          className={inputClass + ' h-6 !w-12 text-sm text-center shrink-0'}
                        />
  <button type="button" onClick={addClassResource} className="h-6 px-1.5 rounded bg-dnd-red text-white text-sm font-medium hover:bg-dnd-red-hover shrink-0">
                        保存
                      </button>
                      <button type="button" onClick={() => { setIsAddingResource(false); setAddResourceName(''); setAddResourceMax(2) }} className="text-gray-400 hover:text-white text-sm shrink-0">
                        取消
                      </button>
                      </div>
                      <div className="grid grid-cols-[1fr_auto_2.5rem_2.5rem_2.5rem] gap-x-0 gap-y-0.5 min-w-0">
                        {classResources.map((r) => (
                          <React.Fragment key={r.id}>
                            <div className="min-w-0 flex items-center gap-0.5 px-0.5 py-0.5 rounded-l border border-gray-600 border-r-0 bg-gray-800/80">
  <span className="text-dnd-text-body text-sm font-medium truncate">{r.name}</span>
                              {r.recovery === 'short' && <span className="text-[9px] text-amber-300 bg-amber-800/40 px-0.5 rounded leading-tight shrink-0">短</span>}
                              {r.recovery === 'long' && <span className="text-[9px] text-indigo-300 bg-indigo-800/40 px-0.5 rounded leading-tight shrink-0">长</span>}
                              {r.recovery === 'special' && <span className="text-[9px] text-purple-300 bg-purple-800/40 px-0.5 rounded leading-tight shrink-0">特</span>}
                          </div>
                          <div className="flex items-center justify-end px-0.5 py-0.5 border border-gray-600 border-r-0 bg-gray-800/80">
                            <span className="text-white font-mono text-sm tabular-nums whitespace-nowrap">{r.current}/{r.max}</span>
                          </div>
                          <div className="flex items-center justify-center py-0.5 border border-gray-600 border-r-0 bg-gray-800/80">
                            <button type="button" onClick={() => adjustClassResource(r.id, -1)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-600 text-gray-400 hover:text-white" title="减少">
                                <Minus size={10} />
                              </button>
                            </div>
                            <div className="flex items-center justify-center py-0.5 border border-gray-600 border-r-0 bg-gray-800/80">
                              <button type="button" onClick={() => adjustClassResource(r.id, 1)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-600 text-gray-400 hover:text-white" title="增加">
                                <Plus size={10} />
                              </button>
                            </div>
                            <div className="flex items-center justify-center py-0.5 rounded-r border border-gray-600 bg-gray-800/80">
                              <button type="button" onClick={() => removeClassResource(r.id)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red" title="移除">
                                <Trash2 size={10} />
                              </button>
                            </div>
                          </React.Fragment>
                        ))}
                      </div>
                    </>
                  ) : (
                    <div className="grid grid-cols-[1fr_auto_2.5rem_2.5rem_2.5rem] gap-x-0 gap-y-0.5 min-w-0 w-full">
                      {classResources.map((r) => (
                        <React.Fragment key={r.id}>
                          <div className="min-w-0 flex items-center gap-0.5 px-0.5 py-0.5 rounded-l border border-gray-600 border-r-0 bg-gray-800/80">
                            <span className="text-dnd-text-body text-sm font-medium truncate" title={r.note || ''}>{r.name}</span>
                            {r.recovery === 'short' && <span className="text-[9px] text-amber-300 bg-amber-800/40 px-0.5 rounded leading-tight shrink-0">短</span>}
                            {r.recovery === 'long' && <span className="text-[9px] text-indigo-300 bg-indigo-800/40 px-0.5 rounded leading-tight shrink-0">长</span>}
                            {r.recovery === 'special' && <span className="text-[9px] text-purple-300 bg-purple-800/40 px-0.5 rounded leading-tight shrink-0">特</span>}
                          </div>
                          <div className="flex items-center justify-end px-0.5 py-0.5 border border-gray-600 border-r-0 bg-gray-800/80">
                            <span className="text-white font-mono text-sm tabular-nums whitespace-nowrap">{r.current}/{r.max}</span>
                          </div>
                          <div className="flex items-center justify-center py-0.5 border border-gray-600 border-r-0 bg-gray-800/80">
                            <button type="button" onClick={() => adjustClassResource(r.id, -1)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-600 text-gray-400 hover:text-white" title="减少">
                              <Minus size={10} />
                            </button>
                          </div>
                          <div className="flex items-center justify-center py-0.5 border border-gray-600 border-r-0 bg-gray-800/80">
                            <button type="button" onClick={() => adjustClassResource(r.id, 1)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-gray-600 text-gray-400 hover:text-white" title="增加">
                              <Plus size={10} />
                            </button>
                          </div>
                          <div className="flex items-center justify-center py-0.5 rounded-r border border-gray-600 bg-gray-800/80">
                            <button type="button" onClick={() => removeClassResource(r.id)} className="w-5 h-5 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red" title="移除">
                              <Trash2 size={10} />
                            </button>
                          </div>
                        </React.Fragment>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-[1fr_auto] gap-x-0 gap-y-0.5 min-w-0 w-full">
                  {classResources.map((r) => (
                    <React.Fragment key={r.id}>
                      <div className="min-w-0 flex items-center px-0.5 py-0.5 rounded-l border border-gray-600 border-r-0 bg-gray-800/80">
                        <span className="text-dnd-text-body text-sm font-medium truncate">{r.name}</span>
                      </div>
                      <div className="flex items-center justify-end px-0.5 py-0.5 rounded-r border border-gray-600 bg-gray-800/80">
                        <span className="text-white font-mono text-sm tabular-nums whitespace-nowrap">{r.current}/{r.max}</span>
                      </div>
                    </React.Fragment>
                  ))}
                  {classResources.length === 0 && <span className="text-gray-500 text-sm col-span-2">—</span>}
                </div>
              )}
          </div>
        </div>
      </div>

      {showSpellModule ? (
        <div
          className={`w-full mt-2 rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/26 to-[#222f45]/22 p-2 flex flex-col gap-2 ${COMBAT_INNER_RIM_ONLY}`}
        >
          {/* 第一行：施法能力整行均分平铺，保持一行内，字号统一 */}
          <div className="flex flex-nowrap items-center justify-evenly gap-x-2 gap-y-1 min-w-0 overflow-x-auto text-sm [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            <span className="text-dnd-gold-light font-bold uppercase tracking-wider shrink-0">施法能力</span>
            <span className="border-r border-white/10 h-5 self-center shrink-0" aria-hidden />
            <span className="text-dnd-text-muted shrink-0">法术攻击加值</span>
            <span className="text-white font-mono tabular-nums shrink-0">{spellAttackBonus != null ? (spellAttackBonus >= 0 ? '+' : '') + spellAttackBonus : '—'}</span>
            {spellAttackBonus != null && (
              <button type="button" onClick={() => openForCheck('法术攻击', spellAttackBonus, { quickRoll: true })} className="w-7 h-7 flex items-center justify-center rounded border border-transparent bg-transparent text-dnd-red/90 hover:text-dnd-red shrink-0" title={quickRollTitle('法术攻击')} aria-label={quickRollTitle('法术攻击')}>
                <QuickRollIcon kind="d20" className={CM_DICE_IC} />
              </button>
            )}
            <span className="border-r border-white/10 h-5 self-center shrink-0" aria-hidden />
            <span className="text-dnd-text-muted shrink-0">DC</span>
            <span className="text-white font-mono tabular-nums shrink-0">{spellDC != null ? spellDC : '—'}</span>
            <span className="border-r border-white/10 h-5 self-center shrink-0" aria-hidden />
            <span className="text-dnd-text-muted shrink-0">施法属性</span>
            <span className="text-white shrink-0">{spellAbility != null ? (ABILITY_NAMES_ZH[spellAbility] ?? spellAbility) : '—'}</span>
            <span className="border-r border-white/10 h-5 self-center shrink-0" aria-hidden />
            <span className="text-dnd-text-muted shrink-0">施法者等级</span>
            <span className="text-white font-mono tabular-nums shrink-0">{spellcastingLevel}</span>
            {canEdit && (
              <button type="button" onClick={() => { setShowSpellModule(false); onSave({ showSpellModule: false }); }} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red shrink-0" title="移除施法能力模块">
                <Trash2 size={12} />
              </button>
            )}
          </div>
          {char?.psychicCollapseEcho && (
            <div className="w-full rounded-lg border border-dnd-gold/45 bg-dnd-gold/10 px-3 py-2 text-xs">
              <p className="text-dnd-gold-light font-bold uppercase tracking-wide mb-0.5">灵崩回响 · 下回合</p>
              <p className="text-gray-300 leading-snug">
                原目标原地点再结算「{char.psychicCollapseEcho.spellName}」（{char.psychicCollapseEcho.ring}环）
              </p>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => onSave({ psychicCollapseEcho: null })}
                  className="mt-1.5 touch-manipulation rounded border border-dnd-gold/40 px-2 py-1 text-[11px] text-dnd-gold-light hover:bg-dnd-gold/15"
                >
                  已执行 / 清除
                </button>
              )}
            </div>
          )}
          {/* 法术环位 | 圆点… 组间竖线；同一行内所有圆点 flex-1 均分剩余宽度 */}
          <div className="w-full">
            <div className="w-full min-w-0 flex flex-col gap-2 rounded border border-white/10 bg-[#233148]/25 p-2 sm:p-2.5 text-sm">
              <div className="flex min-w-0 w-full items-stretch gap-2 sm:gap-3">
                <div className="flex shrink-0 flex-col justify-center border-r border-white/15 pr-2 sm:pr-3">
                  <span className="text-dnd-gold-light text-xs font-bold uppercase tracking-wide sm:text-sm">法术环位</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                  <div
                    className="flex min-h-9 min-w-0 flex-row items-center"
                    role="group"
                    aria-label="1 至 9 环法术位，圆点均分宽度"
                  >
                    {visibleBaseRings.flatMap((ring, ringIdx) => {
                      const max = effectiveMaxByRing[ring] ?? 0
                      const cur = Math.min(max, Math.max(0, spellSlotsCurrentLocal[ring] ?? max))
                      const sep =
                        ringIdx > 0 ? (
                          <div
                            key={`sep-dot-${ring}`}
                            className="mx-0.5 h-5 w-px shrink-0 self-center bg-white/20 sm:mx-1"
                            aria-hidden
                          />
                        ) : null
                      const out = []
                      if (sep) out.push(sep)
                      const numeralClass = 'text-[8px] sm:text-[9px] tabular-nums'
                      if (canEdit) {
                        for (let i = 0; i < max; i++) {
                          const remainingIfClick = i + 1
                          const isFilled = i < cur
                          const tip =
                            remainingIfClick === 1 && cur === 1
                              ? '点击后剩余 0（实心=剩余，空心=已用）'
                              : `点击后剩余 ${remainingIfClick}/${max}（实心=剩余，空心=已用）`
                          out.push(
                            <button
                              key={`${ring}-${i}`}
                              type="button"
                              onClick={() => {
                                if (remainingIfClick === 1 && cur === 1) setBaseSlotCurrent(ring, 0)
                                else setBaseSlotCurrent(ring, remainingIfClick)
                              }}
                              className="touch-manipulation flex min-h-9 min-w-0 flex-1 basis-0 items-center justify-center px-0.5"
                              title={`${ring}环 · ${tip}`}
                              aria-label={`${ring}环 · ${tip}`}
                            >
                              <span
                                className={`flex aspect-square max-h-7 w-full max-w-full min-w-[10px] items-center justify-center rounded-full border-2 px-px font-bold leading-none tracking-tight ${numeralClass} ${
                                  isFilled
                                    ? 'border-dnd-gold-light bg-dnd-gold/85 text-[#141820] shadow-[0_0_6px_rgba(212,184,120,0.35)]'
                                    : 'border-gray-500 bg-transparent text-gray-400'
                                }`}
                              >
                                {ring}
                              </span>
                            </button>,
                          )
                        }
                      } else {
                        for (let i = 0; i < max; i++) {
                          const isFilled = i < cur
                          out.push(
                            <div
                              key={`${ring}-${i}`}
                              className="flex min-h-9 min-w-0 flex-1 basis-0 items-center justify-center px-0.5"
                              aria-hidden
                            >
                              <span
                                className={`flex aspect-square max-h-7 w-full max-w-full min-w-[10px] items-center justify-center rounded-full border-2 px-px font-bold leading-none tracking-tight ${numeralClass} ${
                                  isFilled
                                    ? 'border-dnd-gold-light bg-dnd-gold/85 text-[#141820]'
                                    : 'border-gray-500 bg-transparent text-gray-400'
                                }`}
                              >
                                {ring}
                              </span>
                            </div>,
                          )
                        }
                      }
                      return out
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : canEdit ? (
        <button type="button" onClick={() => { setShowSpellModule(true); onSave({ showSpellModule: true }); }} className="w-full mt-2 py-1.5 rounded-lg border border-dashed border-gray-500 text-gray-400 hover:bg-gray-800/50 text-sm font-bold uppercase tracking-wider">
          + 添加施法能力
        </button>
      ) : null}

      <div className="flex flex-col gap-2 mt-2">
        <div className="min-w-0 w-full flex flex-col gap-2">
      <div className="rounded-lg border border-gray-600 bg-gray-800/50 p-2 w-full min-w-0">
        <h3 className={`text-dnd-gold-light ${CM_MEAN_LABEL} font-semibold uppercase tracking-wider mb-1`}>战斗手段</h3>
        <div className="space-y-2">
          {combatMeans.map((cm) => {
            const isCombo = cm.type === 'combo'
            const comboPrimary = isCombo ? combatMeans.find((m) => m.id === cm.primaryMeanId) : null
            const displayMean = isCombo && comboPrimary
              ? {
                  ...comboPrimary,
                  id: cm.id,
                  gains: cm.gains,
                  extraDamageDice: [
                    ...(comboPrimary.extraDamageDice || []),
                    ...(cm.attachments || [])
                      .filter(isValidComboAttachment)
                      .map((a) => `${a.damageDice} ${a.damageType || ''}`.trim()),
                  ],
                }
              : cm
            const comboAttachmentNames = isCombo ? (cm.attachments || []).map((a) => a.name).filter(Boolean) : []
            const comboSuffix = comboAttachmentNames.length ? `+${comboAttachmentNames.join('/')}` : ''
            const isPhysical = displayMean.type === 'physical'
            const isItem = displayMean.type === 'item'
            const itemMeanOpt = isItem && displayMean.itemInventoryIndex != null ? itemMeansFromInv.find((x) => x.index === displayMean.itemInventoryIndex) : null
            const weaponOpt = isPhysical && displayMean.weaponInventoryIndex != null ? weaponsFromInv.find((w) => w.index === displayMean.weaponInventoryIndex) : null
            const physStats = isPhysical && weaponOpt
              ? computePhysicalWeaponStats(displayMean, weaponOpt, {
                  effectiveAbilities,
                  prof,
                  spellAbility,
                  buffStats,
                  flatBuffEffects,
                  itemFormulaContext,
                })
              : null
            const attackParsed = physStats?.attackParsed ?? (weaponOpt ? parseWeaponAttack(getWeaponAttackStringForParsing(weaponOpt, displayMean.weaponVersatileMode)) : { dice: null, diceList: [], type: '—' })
            const rawDamageType = physStats?.rawDamageType ?? (displayMean.damageType || attackParsed.type)
            const spellAbilityOverride = physStats?.weaponAbilityKind
              ? null
              : getSpellAbilityForAttackFromBuffs(flatBuffEffects, {
                  weaponProto: weaponOpt?.proto,
                  damageType: rawDamageType,
                  sourceItemInventoryId: weaponOpt?.entry?.id,
                })
            const weaponAbilityKind = physStats?.weaponAbilityKind ?? resolvePhysicalWeaponAbilityKind(displayMean, weaponOpt, spellAbilityOverride)
            const abilityKey = physStats?.abilityKey ?? (weaponAbilityKind === 'spell' ? spellAbility : weaponAbilityKind)
            const abilityMod = physStats?.abilityMod ?? abilityModifier(effectiveAbilities?.[abilityKey] ?? 10)
            const isRangedWeapon = physStats?.isRangedWeapon ?? (weaponOpt ? isRangedWeaponProto(weaponOpt.proto) : false)
            const weaponCategoryAttackFlat = physStats?.weaponCategoryAttackFlat ?? (weaponOpt?.proto
              ? sumWeaponCategoryAttackDamageBonus(buffStats?.weaponCategoryAttackDamageBonuses ?? [], weaponOpt.proto)
              : 0)
            const buffAttackBonus = physStats?.buffAttackBonus ?? ((isRangedWeapon ? (buffStats?.rangedAttackBonus ?? 0) : (buffStats?.meleeAttackBonus ?? 0)) + weaponCategoryAttackFlat)
            const buffDamageBonus = physStats?.buffDamageBonus ?? ((isRangedWeapon ? (buffStats?.rangedDamageBonus ?? 0) : (buffStats?.meleeDamageBonus ?? 0)) + weaponCategoryAttackFlat)
            const weaponProficient = physStats?.weaponProficient ?? (displayMean.weaponProficient !== false)
            const gains = physStats?.gains ?? getEnabledGains(displayMean)
            const gainAttackBonus = physStats?.gainAttackBonus ?? sumGainAttackBonus(gains)
            const gainDamageBonus = physStats?.gainDamageBonus ?? sumGainDamageBonus(gains)
            const gainPerDieBonus = physStats?.gainPerDieBonus ?? sumGainPerDieBonus(gains)
            const gainExtraDice = physStats?.gainExtraDice ?? getGainExtraDice(gains)
            const gainAdvantage = physStats?.gainAdvantage ?? getGainAdvantage(gains)
            const gainDiceFloor2 = physStats?.gainDiceFloor2 ?? hasGainDiceFloor2(gains)
            // 条件范围加值已统一通过 auto 增益体现，此处不再重复追加
            const physicalAttackBonus = physStats?.physicalAttackBonus ?? (abilityMod + (weaponProficient ? prof : 0) + buffAttackBonus + gainAttackBonus)
            const damageMod = physStats?.damageMod ?? abilityMod
            const weaponExtraDiceStrings = physStats?.weaponExtraDiceStrings ?? [...getMergedWeaponExtraDiceStrings(displayMean, weaponOpt), ...gainExtraDice]
            const allWeaponDiceCount = physStats?.allWeaponDiceCount ?? ((attackParsed.diceList || []).reduce((s, d) => s + (parseCombatDiceExpression(d)?.count || 0), 0) +
              weaponExtraDiceStrings.reduce((s, d) => s + (parseCombatDiceExpression(String(d).split(' ')[0])?.count || 0), 0))
            const weaponPerDieMod = physStats?.weaponPerDieMod ?? (gainPerDieBonus * allWeaponDiceCount)
            const totalDamageMod = physStats?.totalDamageMod ?? (damageMod + buffDamageBonus + gainDamageBonus + weaponPerDieMod)
            const displayDamageType = physStats?.displayDamageType ?? (rawDamageType ? getDamageTypeLabel(rawDamageType) : '—')
            const isSpellAttack = displayMean.type === 'spell_attack'
            const spellOpt = !isPhysical && !isItem && !isSpellAttack && displayMean.spellId ? preparedSpellsList.find((p) => p.spellId === displayMean.spellId) : null
            const spell = spellOpt?.spell
            const spellDesc = spell?.description ?? ''
            const spellIsAttack = spellUsesAttack(spellDesc)
            const spellDamageList = spell ? parseSpellDamageFromDescription(spellDesc) : []

            /* 无效项（仅会显示 — 的模块）不渲染，避免出现空白卡片 */
            if (isItem && !itemMeanOpt) return null
            if (isPhysical && !weaponOpt) return null
            if (isCombo && !comboPrimary) return null
            if (!isPhysical && !isItem && !isSpellAttack && !isCombo && !spellOpt) return null


            /* ── 构建共享上下文 ── */
            const cardCtx = {
              canEdit, isCombo, gains,
              // 物理武器计算结果
              physStats,
              // 法术相关
              spellAttackBonus, spellDC, buffStats,
              // 增益
              gainAttackBonus, gainDamageBonus, gainPerDieBonus,
              gainExtraDice, gainAdvantage, gainDiceFloor2,
              // 公式/角色
              itemFormulaContext, effectiveAbilities, prof,
              // 道具相关
              focusSpellMap,
              // 回调
              openEditWeaponMean, openEditSpellAttack, openEditItemMean, openEditComboMean,
              removeCombatMean, openForCheck, rollAllWeaponDamage, rollDamageDice,
              consumeSpellSlotForMean, renderAutoGainBadges,
              // 状态设置
              setExplosiveUsePending, useScroll, setFocusUsePending, setFocusSpellMap,
              // 数据源
              getMergedSpells,
              // 角色数据（道具卡需要）
              char,
            }

            return (
              <>
                {isItem && itemMeanOpt ? (
                  <ItemUseCard displayMean={displayMean} itemMeanOpt={itemMeanOpt} ctx={cardCtx} />
                ) : isSpellAttack ? (
                  <SpellAttackCard displayMean={displayMean} comboSuffix={comboSuffix} ctx={cardCtx} />
                ) : isPhysical ? (
                  <WeaponAttackCard displayMean={displayMean} weaponOpt={weaponOpt} ctx={cardCtx} comboSuffix={comboSuffix} />
                ) : (
                  /* 兜底法术卡片（未配置战斗手段详情的原始法术） */
                  <div
                    key={cm.id}
                    className={`rounded-lg border border-gray-600 bg-gray-800/80 p-2 ${COMBAT_LIST_ROW_SHADOW}`}
                  >
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          value={cm.type}
                          onChange={(e) => updateCombatMean(cm.id, { type: e.target.value, weaponInventoryIndex: null, spellId: null })}
                          className={inputClass + ' !text-xs h-7 w-24'}
                          disabled={!canEdit}
                        >
                          <option value="physical">物理攻击</option>
                          <option value="spell">法术攻击</option>
                        </select>
                        <ActionLabelBadge source={spell?.castingTime || ''} />
                        {canEdit && (
                          <button type="button" onClick={() => removeCombatMean(cm.id)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red" title="移除">
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>法术</span>
                        <select
                          value={cm.spellId ?? ''}
                          onChange={(e) => updateCombatMean(cm.id, { spellId: e.target.value || null })}
                          className={inputClass + ' !text-xs h-7 flex-1 min-w-0 max-w-[160px]'}
                          disabled={!canEdit}
                        >
                          <option value="">—</option>
                          {preparedSpellsList.map((p) => (
                            <option key={p.spellId} value={p.spellId}>{p.spell?.name ?? p.spellId}</option>
                          ))}
                        </select>
                      </div>
                      {spell && (
                        <>
                          {spellIsAttack ? (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>法术攻击</span>
                              <span className={`text-white font-mono ${CM_MEAN_HI} tabular-nums`}>{spellAttackBonus != null ? (spellAttackBonus >= 0 ? '+' : '') + spellAttackBonus : '—'}</span>
                              {spellAttackBonus != null && (
                                <button type="button" onClick={() => { if (!consumeSpellSlotForMean(cm, spell.name)) return; openForCheck(spell.name + ' 法术攻击', spellAttackBonus, { quickRoll: true }) }} className={CM_BTN_RED} title={quickRollTitle('法术攻击')} aria-label={quickRollTitle('法术攻击')}>
                                  <QuickRollIcon kind="d20" />
                                </button>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>法术 DC</span>
                              <span className={`text-white font-mono ${CM_MEAN_HI} tabular-nums`}>{spellDC != null ? spellDC : '—'}</span>
                            </div>
                          )}
                          {spellDamageList.length > 0 && (
                            <div className="flex flex-wrap items-center gap-2">
                              {spellDamageList.map((d, i) => (
                                <span key={i} className="inline-flex items-center gap-0.5">
                                  <span className={`text-white font-mono ${CM_MEAN_HI}`}>{d.dice} {d.type}</span>
                                  <button type="button" onClick={() => { if (!consumeSpellSlotForMean(cm, spell.name)) return; rollDamageDice(d.dice, spell.name + ' ' + d.type, 'spell-' + cm.id + '-' + i, 0, false, getDamageTypeLabel(d.type) || d.type || '') }} className={CM_BTN_GOLD} title={quickRollTitle('伤害')} aria-label={quickRollTitle('伤害')}>
                                    <QuickRollIcon kind="damage" className={CM_DICE_IC_GOLD} />
                                  </button>
                                  {spellIsAttack && (
                                    <button type="button" onClick={() => { if (!consumeSpellSlotForMean(cm, spell.name)) return; rollDamageDice(d.dice, spell.name + ' ' + d.type, 'spell-' + cm.id + '-' + i, 0, true, getDamageTypeLabel(d.type) || d.type || '') }} className={CM_BTN_CRIT} title={quickRollTitle('伤害（重击×2伤害骰）')} aria-label={quickRollTitle('伤害（重击×2伤害骰）')}>
                                      <QuickRollIcon kind="crit" className={CM_DICE_IC_GOLD} />
                                    </button>
                                  )}
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </>
                  </div>
                )}
              </>
            )

          })}
          {canEdit && (
            <button type="button" onClick={openAddCombatMeanModal} className={`text-dnd-text-muted ${CM_MEAN_LABEL} font-semibold uppercase tracking-wider hover:text-dnd-gold-light hover:underline`}>
              + 添加战斗手段
            </button>
          )}
        </div>
      </div>

          {explosiveUsePending && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50" onClick={() => setExplosiveUsePending(null)}>
              <div className="rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl max-w-sm w-full mx-2" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-dnd-gold-light text-sm font-bold mb-2">是否使用？</h3>
                <p className="text-gray-300 text-sm mb-3">使用将消耗 1 数量，并投掷伤害。</p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setExplosiveUsePending(null)} className="flex-1 py-1.5 rounded border border-gray-500 text-gray-400 text-sm">取消</button>
                  <button type="button" onClick={() => consumeExplosiveAndRoll(explosiveUsePending.inventoryIndex, explosiveUsePending.diceExpr, explosiveUsePending.name + ' ' + (getDamageTypeLabel(explosiveUsePending.damageType) || ''), explosiveUsePending.damageType)} className="flex-1 py-1.5 rounded bg-dnd-red hover:bg-dnd-red-hover text-white text-sm">使用</button>
                </div>
              </div>
            </div>
          )}
          {focusUsePending && (
            <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50" onClick={() => setFocusUsePending(null)}>
              <div className="rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl max-w-sm w-full mx-2" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-dnd-gold-light text-sm font-bold mb-2">是否使用？</h3>
                <p className="text-gray-300 text-sm mb-3">
                  {focusUsePending.spellSub ? (
                    <>
                      使用 <span className="text-white font-medium">{focusUsePending.spellSub.spellName?.trim() || focusUsePending.name || '法器'}</span>
                      {' '}（{focusUsePending.spellSub.level || 0}环）将消耗 <span className="text-white font-medium">{focusUsePending.spellSub.cost || 1}</span> 充能。
                    </>
                  ) : (
                    <>使用将消耗 1 充能。</>
                  )}
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setFocusUsePending(null)} className="flex-1 py-1.5 rounded border border-gray-500 text-gray-400 text-sm">取消</button>
                  <button type="button" onClick={() => {
                    const cm = combatMeans.find((m) => m.id === focusUsePending?.combatMeanId)
                    if (cm && !consumeSpellSlotForMean(cm, focusUsePending.name || '法器')) return
                    useFocusCharge(focusUsePending.inventoryIndex, focusUsePending.name, focusUsePending.spellSub)
                  }} className="flex-1 py-1.5 rounded bg-dnd-red hover:bg-dnd-red-hover text-white text-sm">使用</button>
                </div>
              </div>
            </div>
          )}
          {showAddCombatMeanModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => { setEditingCombatMeanId(null); setShowWeaponExtraDiceEditor(false); setShowAddCombatMeanModal(false); }}>
              <div className="rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl max-w-sm w-full mx-2" onClick={(e) => e.stopPropagation()}>
                {addMeanStep === 'type' && (
                  <AddMeanTypeStep
                    weaponsFromInv={weaponsFromInv}
                    itemMeansFromInv={itemMeansFromInv}
                    combatMeans={combatMeans}
                    buffStats={buffStats}
                    mergedBuffs={mergedBuffs}
                    char={char}
                    onPickWeapon={() => {
                      const w0 = weaponsFromInv[0]
                      setAddWeaponIndex(w0 ? w0.index : null)
                      setAddAbility(w0 ? inferPhysicalWeaponAbilityFromProto(w0.proto) : 'str')
                      setAddDamageType('')
                      setAddWeaponMode(w0 ? getDefaultWeaponMode(w0) : 'one_hand')
                      setShowWeaponExtraDiceEditor(false)
                      setAddMeanStep('weapon')
                    }}
                    onPickItem={() => {
                      const first = itemMeansFromInv[0]
                      setAddItemIndex(first ? first.index : null)
                      setAddMeanStep('item')
                    }}
                    onPickSpell={() => {
                      setAddSpellAttackName('')
                      setAddSpellAttackSpellId('')
                      setAddSpellAttackHitResolution('spell_attack')
                      setAddSpellAttackDice('')
                      setAddSpellAttackDamageType('')
                      setAddMeanStep('spell_attack')
                    }}
                    onPickCombo={() => {
                      const primary = combatMeans[0] || null
                      setAddComboPrimaryId(primary ? primary.id : null)
                      setAddComboAttachments([])
                      const isSpellPrimary = primary && (primary.type === 'spell_attack' || primary.type === 'spell')
                      setAddGains(buildDefaultGainsFromBuffs(primary || {}, buffStats, mergedBuffs, !!isSpellPrimary, char))
                      setAddMeanStep('combo')
                    }}
                    onCancel={() => setShowAddCombatMeanModal(false)}
                  />
                )}
                {addMeanStep === 'spell_attack' && (
                  <AddSpellStep
                    spellName={addSpellAttackName} setSpellName={setAddSpellAttackName}
                    spellId={addSpellAttackSpellId} setSpellId={setAddSpellAttackSpellId}
                    hitResolution={addSpellAttackHitResolution} setHitResolution={setAddSpellAttackHitResolution}
                    dice={addSpellAttackDice} setDice={setAddSpellAttackDice}
                    damageType={addSpellAttackDamageType} setDamageType={setAddSpellAttackDamageType}
                    spellLevel={addSpellAttackSpellLevel} setSpellLevel={setAddSpellAttackSpellLevel}
                    addGains={addGains} setAddGains={setAddGains}
                    draftSpellCm={draftSpellCm} buffStats={buffStats} mergedBuffs={mergedBuffs} char={char} itemFormulaContext={itemFormulaContext}
                    editingCombatMeanId={editingCombatMeanId}
                    onBack={() => { setEditingCombatMeanId(null); setAddMeanStep('type'); }}
                    onSave={confirmAddSpellAttackMean}
                  />
                )}
                {addMeanStep === 'item' && (
                  <AddItemStep
                    itemIndex={addItemIndex} setItemIndex={setAddItemIndex}
                    itemMeansFromInv={itemMeansFromInv}
                    addGains={addGains} setAddGains={setAddGains}
                    draftItemCm={draftItemCm} draftItemIsSpell={draftItemIsSpell}
                    buffStats={buffStats} mergedBuffs={mergedBuffs} char={char} itemFormulaContext={itemFormulaContext}
                    editingCombatMeanId={editingCombatMeanId}
                    onBack={() => setAddMeanStep('type')}
                    onSave={confirmAddItemMean}
                  />
                )}
                {addMeanStep === 'combo' && (
                  <AddComboStep
                    primaryId={addComboPrimaryId} setPrimaryId={setAddComboPrimaryId}
                    attachments={addComboAttachments} setAttachments={setAddComboAttachments}
                    nonComboCombatMeans={nonComboCombatMeans}
                    weaponsFromInv={weaponsFromInv} itemMeansFromInv={itemMeansFromInv} combatMeans={combatMeans}
                    addGains={addGains} setAddGains={setAddGains}
                    buffStats={buffStats} mergedBuffs={mergedBuffs} char={char} itemFormulaContext={itemFormulaContext}
                    editingCombatMeanId={editingCombatMeanId}
                    onBack={() => { setEditingCombatMeanId(null); setAddComboPrimaryId(null); setAddComboAttachments([]); setAddMeanStep('type'); }}
                    onSave={confirmAddComboMean}
                  />
                )}
                {addMeanStep === 'weapon' && (
                  <AddWeaponStep
                    weaponIndex={addWeaponIndex} setWeaponIndex={setAddWeaponIndex}
                    weaponNameSuffix={addWeaponNameSuffix} setWeaponNameSuffix={setAddWeaponNameSuffix}
                    ability={addAbility} setAbility={setAddAbility}
                    damageType={addDamageType} setDamageType={setAddDamageType}
                    weaponMode={addWeaponMode} setWeaponMode={setAddWeaponMode}
                    weaponProficient={addWeaponProficient} setWeaponProficient={setAddWeaponProficient}
                    targetCreatureType={addTargetCreatureType} setTargetCreatureType={setAddTargetCreatureType}
                    weaponsFromInv={weaponsFromInv} char={char} canEdit={canEdit}
                    addWeaponExtraDice={addWeaponExtraDice} setAddWeaponExtraDice={setAddWeaponExtraDice}
                    showExtraDiceEditor={showWeaponExtraDiceEditor} setShowExtraDiceEditor={setShowWeaponExtraDiceEditor}
                    extraCount={addWeaponExtraCount} setExtraCount={setAddWeaponExtraCount}
                    extraSides={addWeaponExtraSides} setExtraSides={setAddWeaponExtraSides}
                    extraFlatMod={addWeaponExtraFlatMod} setExtraFlatMod={setAddWeaponExtraFlatMod}
                    extraType={addWeaponExtraType} setExtraType={setAddWeaponExtraType}
                    previewWeaponStats={previewWeaponStats} prof={prof}
                    addGains={addGains} setAddGains={setAddGains}
                    draftWeaponCm={draftWeaponCm} buffStats={buffStats} mergedBuffs={mergedBuffs} itemFormulaContext={itemFormulaContext}
                    editingCombatMeanId={editingCombatMeanId}
                    onBack={() => { setEditingCombatMeanId(null); setShowWeaponExtraDiceEditor(false); setAddMeanStep('type'); }}
                    onSave={confirmAddWeaponMean}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 主动技能快捷栏 */}
      <ActiveAbilityQuickBar
        char={char}
        quickBar={quickBar}
        onUpdateQuickBar={handleUpdateQuickBar}
        onExecute={handleExecuteAbility}
        canEdit={canEdit}
        moduleId={moduleId}
        onEndStance={handleEndStance}
      />

      {executeAbilityModal && (
        <AbilityUseModal
          activeAbility={executeAbilityModal.ability}
          char={char}
          featureName={executeAbilityModal.ability?.name || '主动技能'}
          onConfirm={(patch, lines) => {
            if (patch && Object.keys(patch).length > 0) onSave(patch)
          }}
          onClose={() => setExecuteAbilityModal(null)}
        />
      )}
      
      {/* 召唤物管理面板 */}
      <SummonedCreaturesPanel
        char={char}
        onDelete={(summonId) => {
          if (!onSave) return
          const currentSummons = Array.isArray(char.summonedCreatures) ? char.summonedCreatures : []
          const newSummons = currentSummons.filter(s => s.id !== summonId)
          onSave({ summonedCreatures: newSummons })
        }}
      />
    </div>
  )
}

