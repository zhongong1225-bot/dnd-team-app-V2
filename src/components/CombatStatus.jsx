/**
 * 战斗状态（重写版）
 * 显示：HP、AC、先攻、死亡豁免、状态效果、力竭、其它职业资源、战斗手段
 */
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { Plus, Minus, Trash2, Pencil, Circle, CircleDot, CheckCircle2, Dices } from 'lucide-react'
import { useRoll } from '../contexts/RollContext'
import { useModule } from '../contexts/ModuleContext'
import { useRuleTextOverridesMap } from '../hooks/useRuleTextOverridesMap'
import { buildMartialKey, resolveRuleText } from '../lib/ruleTextOverrides'
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

/** 战斗手段弹窗用：伤害类型选项（与 buffTypes 统一简称）；排除 雷鸣 */
const DAMAGE_TYPE_OPTIONS = DAMAGE_TYPES.filter((d) => d.label !== '雷鸣').map((d) => ({ value: d.label, label: d.label }))
/** 伤害类型超短称（紧凑排版用，与 DAMAGE_TYPES 简称对应） */
const DAMAGE_TYPE_SHORT = { 强酸: '酸', 钝击: '钝', 寒冷: '寒', 火焰: '火', 力场: '力', 闪电: '电', 暗蚀: '暗', 穿刺: '穿', 毒素: '毒', 心灵: '心', 光耀: '光', 挥砍: '挥', 雷鸣: '雷', 贯通: '贯', 治疗: '疗' }
/** 内含法术命中判断 value -> 显示文案（与 BuffForm 一致） */
const HIT_RESOLUTION_LABELS = { dex_save: '敏捷豁免', str_save: '力量豁免', con_save: '体质豁免', wis_save: '感知豁免', int_save: '智力豁免', cha_save: '魅力豁免', spell_attack: '法术攻击' }
import { getItemById, parseWeaponNoteToTraits } from '../data/itemDatabase'
import { getSpellById, getWandScrollSpellPower, getMergedSpells } from '../data/spellDatabase'
import { getSpellcastingLevel, getMaxSpellSlotsByRing, getHitDice, getPrimarySpellcastingAbility } from '../data/classDatabase'
import { getSpellcastingCombatStats } from '../lib/spellcastingStats'
import { rollDice, rollCombatDicePool, parseCombatDiceExpression } from '../data/weaponDatabase'
import { buildQuickRollAnimation } from '../lib/quickRollAnimation'
import {
  MARTIAL_TECHNIQUE_STYLES,
  getMartialTechniqueById,
  inferMartialSlotKind,
  listMartialTechniquesForSlot,
} from '../data/martialTechniques'
import MartialStyleIntroBlock from './MartialStyleIntroBlock'
import { NumberStepper } from './BuffForm'
import InfoTooltip from './InfoTooltip'
import { MartialTechTooltipContent } from '../lib/infoTooltipContent'
import { isNewContainedSpellValue, normalizeContainedSpellValue } from '../lib/containedSpellModel'
import { getFlatEffectEntries } from '../lib/effects/effectMapping'

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

/** 从 flatEffects 中查找生效的「施法属性命中」效果，返回应使用的属性 key（int/wis/cha） */
function getSpellAbilityForAttackFromBuffs(flatEffects, ctx) {
  if (!Array.isArray(flatEffects)) return null
  for (const e of flatEffects) {
    if (e.effectType !== 'spell_ability_attack') continue
    const { scope } = normalizeScope(e.scope, e.scopeDetail)
    if (scope === SCOPE_KIND.global || scope === '') return e.value?.ability || null
    const matches = scopeMatchesCombatMean(e, {
      sourceKind: 'physical',
      weaponProto: ctx.weaponProto,
      damageType: ctx.damageType,
      targetCreatureType: ctx.targetCreatureType || '',
      sourceItemInventoryId: ctx.sourceItemInventoryId,
    })
    if (matches) return e.value?.ability || null
  }
  return null
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
/** 与装备/背包物品卡同系：每招独立成卡 */
const MARTIAL_MOVE_CARD_CLASS =
  `rounded-md border border-gray-600/50 bg-[#1a2430]/90 px-3 py-2.5 min-w-0 ${COMBAT_LIST_ROW_SHADOW}`
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

function serializeCombatMartialForSave(slots) {
  return slots.map((m) => {
    const kind =
      m.kind === 'stance' || m.kind === 'strike' || m.kind === 'other'
        ? m.kind
        : inferMartialSlotKind(getMartialTechniqueById(m.techniqueId))
    const row = {
      id: m.id,
      techniqueId: m.techniqueId,
      prepared: m.prepared === true,
      kind,
    }
    if ((kind === 'strike' || kind === 'other') && m.used === true) row.used = true
    return row
  })
}

function buildMartialSlotsFromRows(stanceRows, strikeRows, otherSlots) {
  const next = []
  ;(stanceRows || []).forEach((r) => {
    if (!r?.techniqueId) return
    next.push({ id: r.id, techniqueId: r.techniqueId, prepared: !!r.prepared, kind: 'stance' })
  })
  ;(strikeRows || []).forEach((r) => {
    if (!r?.techniqueId) return
    next.push({
      id: r.id,
      techniqueId: r.techniqueId,
      prepared: !!r.prepared,
      kind: 'strike',
      used: r.used === true,
    })
  })
  ;(otherSlots || []).forEach((o) => {
    if (!o?.techniqueId) return
    const k =
      o.kind === 'stance' || o.kind === 'strike' || o.kind === 'other'
        ? o.kind
        : inferMartialSlotKind(getMartialTechniqueById(o.techniqueId))
    next.push({
      id: o.id,
      techniqueId: o.techniqueId,
      prepared: o.prepared === true,
      kind: k,
      used: o.used === true,
    })
  })
  return next
}

function shortMartialAction(action) {
  const s = String(action || '').trim()
  if (!s) return '—'
  if (/附赠/.test(s)) return '附赠'
  if (/迅捷/.test(s)) return '迅捷'
  if (/标准/.test(s)) return '标准'
  if (/移动/.test(s)) return '移动'
  if (/反应/.test(s)) return '反应'
  if (/全回合|整轮/.test(s)) return '整轮'
  return s.replace(/动作$/, '').trim() || s
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
 * 解析武器「攻击」字符串：支持多段伤害骰如 "2d8+1d6+5 贯通"
 * - diceList：全部骰段（统一小写 d）；dice：首段（兼容旧逻辑）
 * - type：去掉所有骰子与独立数值加值后的余下文案（多为伤害类型）
 */
function parseWeaponAttack(attackStr) {
  if (!attackStr || typeof attackStr !== 'string') return { dice: null, diceList: [], type: '—' }
  let s = attackStr.trim()
  const hashIdx = s.lastIndexOf(' #')
  if (hashIdx >= 0) s = s.slice(0, hashIdx).trim()
  if (!s || s === '—') return { dice: null, diceList: [], type: '—' }
  const rawMatches = s.match(WEAPON_DICE_CHUNK_RE)
  const diceList = rawMatches ? rawMatches.map((d) => d.replace(/\uFF44/g, 'd').replace(/D/g, 'd').toLowerCase()) : []
  const dice = diceList[0] ?? null
  let rest = s
  for (const raw of rawMatches || []) {
    rest = rest.replace(new RegExp(String(raw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')
  }
  rest = rest.replace(/\s+/g, ' ').trim()
  /** 去掉与骰子混写的纯数字加值（如 2d8+1d6+5 贯通 中的 +5），保留文字类型 */
  rest = rest
    .split(/\s+/)
    .filter((tok) => tok && !/^\+*\d+$/.test(tok))
    .join(' ')
    .trim()
  const type = rest && rest !== '' ? rest : '—'
  if (diceList.length === 0) {
    return { dice: null, diceList: [], type: s }
  }
  return { dice, diceList, type }
}

/** 战斗行内展示：多骰用 + 连接，如 2D8+1D6 */
function formatWeaponAttackDiceDisplay(attackParsed) {
  const list = attackParsed?.diceList?.length
    ? attackParsed.diceList
    : attackParsed?.dice
      ? [attackParsed.dice]
      : []
  if (!list.length) return '—'
  return list.join('+').toUpperCase()
}

/** 非零时输出 +N / -N；为 0 时输出空串（避免出现「2d6+」后无数字） */
function formatSignedModifier(n) {
  const m = Number(n)
  if (Number.isNaN(m) || m === 0) return ''
  return m > 0 ? `+${m}` : `${m}`
}

/** 远程武器与枪械在命中/伤害 Buff 上与近战区分（枪械原型子类型常为空） */
function isRangedWeaponProto(proto) {
  if (!proto) return false
  return proto.子类型 === '远程' || proto.类型 === '枪械'
}

/** 武器战斗模式选项 */
const WEAPON_MODE_OPTIONS = [
  { value: 'one_hand', label: '单手' },
  { value: 'two_hand', label: '双手' },
  { value: 'ranged', label: '远程' },
]

/** 武器基础伤害不应包含固定加值，去掉 legacy 中的 flat mod（兼容 1d8 + 0 空格） */
function stripDiceFlatMod(plus) {
  if (!plus || typeof plus !== 'string') return plus
  const m = plus.trim().match(/^(\d+)d(\d+)\s*([+-])\s*(\d+)$/i)
  if (!m) return plus
  return `${m[1]}d${m[2]}`
}

function getWeaponNote(weaponOpt) {
  return String(weaponOpt?.entry?.附注 ?? weaponOpt?.proto?.附注 ?? '')
}

/** 武器是否带「双手」词条 */
function weaponHasTwoHanded(weaponOpt) {
  return /双手/i.test(getWeaponNote(weaponOpt))
}

/** 武器是否带「投掷」词条 */
function weaponHasThrown(weaponOpt) {
  return /投掷/i.test(getWeaponNote(weaponOpt))
}

/** 武器是否带「多用」词条 */
function weaponHasVersatile(weaponOpt) {
  return /多用/i.test(getWeaponNote(weaponOpt))
}

/** 根据武器推断默认战斗模式 */
function getDefaultWeaponMode(weaponOpt) {
  if (!weaponOpt) return 'one_hand'
  if (isRangedWeaponProto(weaponOpt.proto)) return 'ranged'
  const hasTwo = weaponHasTwoHanded(weaponOpt)
  const hasVersatile = weaponHasVersatile(weaponOpt)
  const hasThrown = weaponHasThrown(weaponOpt)
  // 纯双手武器（双手且非多用、非投掷）默认双手
  if (hasTwo && !hasVersatile && !hasThrown) return 'two_hand'
  return 'one_hand'
}

/** 武器是否带「轻型」词条 */
function weaponHasLight(weaponOpt) {
  return /轻型/i.test(getWeaponNote(weaponOpt))
}

/** 角色当前是否双持两把轻型武器 */
function isDualWieldingLightWeapons(character) {
  const held = character?.equippedHeld ?? []
  const inv = character?.inventory ?? []
  let lightCount = 0
  for (const slot of held) {
    if (!slot?.inventoryId) continue
    const entry = inv.find((e) => e.id === slot.inventoryId)
    if (!entry) continue
    const proto = entry?.itemId ? getItemById(entry.itemId) : null
    const note = String(proto?.附注 ?? '')
    if (/轻型/i.test(note)) lightCount++
  }
  return lightCount >= 2
}

/** 根据武器返回可用的模式下拉选项；character 用于判断双持附赠攻击 */
function getWeaponModeOptions(weaponOpt, character) {
  if (!weaponOpt) return WEAPON_MODE_OPTIONS
  if (isRangedWeaponProto(weaponOpt.proto)) return WEAPON_MODE_OPTIONS.filter((o) => o.value === 'ranged')
  const hasTwo = weaponHasTwoHanded(weaponOpt)
  const hasVersatile = weaponHasVersatile(weaponOpt)
  const hasThrown = weaponHasThrown(weaponOpt)
  let options
  // 纯双手武器：只显示双手（不需要下拉）
  if (hasTwo && !hasVersatile && !hasThrown) {
    options = WEAPON_MODE_OPTIONS.filter((o) => o.value === 'two_hand')
  } else if (hasVersatile && hasThrown) {
    // 多用 + 投掷：单手/投掷
    options = WEAPON_MODE_OPTIONS.filter((o) => o.value === 'one_hand' || o.value === 'ranged')
  } else if (hasVersatile) {
    // 多用：单手/双手
    options = WEAPON_MODE_OPTIONS.filter((o) => o.value === 'one_hand' || o.value === 'two_hand')
  } else {
    // 单独投掷 / 普通单手：单手
    options = WEAPON_MODE_OPTIONS.filter((o) => o.value === 'one_hand')
  }
  // 双持轻型武器且当前武器为轻型单手：增加附赠攻击（副手）
  if (
    character &&
    isDualWieldingLightWeapons(character) &&
    weaponHasLight(weaponOpt) &&
    !hasTwo &&
    !isRangedWeaponProto(weaponOpt.proto)
  ) {
    options = [...options, { value: 'bonus_action', label: '附赠攻击' }]
  }
  return options
}

/** 根据武器返回可用的属性选项；非灵巧近战固定力量，远程固定敏捷，灵巧可切换力/敏 */
function getAbilityOptions(weaponOpt, currentAbility) {
  const ranged = weaponOpt && isRangedWeaponProto(weaponOpt.proto)
  const dex = weaponOpt && weaponUsesDex(weaponOpt.proto)
  let options
  if (ranged) {
    options = [{ value: 'dex', label: '敏捷' }]
  } else if (dex) {
    options = [
      { value: 'str', label: '力量' },
      { value: 'dex', label: '敏捷' },
    ]
  } else {
    options = [{ value: 'str', label: '力量' }]
  }
  // 兼容旧存档中保存的 spell 等其它值
  if (currentAbility && !options.some((o) => o.value === currentAbility)) {
    const label = currentAbility === 'spell' ? '施法属性' : currentAbility
    options = [...options, { value: currentAbility, label }]
  }
  return options
}

/** 从武器「攻击」字段拆出单手/双手伤害对象（结构同 parseDamageString） */
function getWeaponBaseDamageObjects(weaponOpt) {
  const attack = String(weaponOpt?.攻击 ?? '').trim()
  const parsed = parseDamageString(attack)
  const plus = parsed.plus || ''
  const base = { ...parsed, plus: '', minus: '', o1: '', o2: '', o3: parsed.o3 }
  const versa = { ...parsed, plus: '', minus: '', o1: '', o2: '', o3: parsed.o3 }
  if (plus.includes('/')) {
    const [p1, p2] = plus.split('/')
    base.plus = stripDiceFlatMod(p1.trim()) || ''
    versa.plus = stripDiceFlatMod(p2.trim()) || ''
  } else {
    base.plus = stripDiceFlatMod(plus) || ''
  }
  return { base, versa }
}

/** 获取按模式处理后的武器攻击字符串（用于解析骰子与类型） */
function getWeaponAttackStringForParsing(weaponOpt, mode) {
  if (!weaponOpt) return ''
  const { base, versa } = getWeaponBaseDamageObjects(weaponOpt)
  // 双持副手附赠攻击使用单手伤害骰
  const baseAttack = formatDamageForAttack(mode === 'two_hand' ? versa : base)
  let attack = baseAttack
  const appendDiceFromText = (text) => {
    if (!text || String(text).trim() === '' || String(text).trim() === '—') return
    const extra = String(text).match(WEAPON_DICE_CHUNK_RE) || []
    for (const seg of extra) {
      const segNorm = seg.replace(/\uFF44/g, 'd').replace(/D/g, 'd').toLowerCase()
      if (!attack.toLowerCase().includes(segNorm)) {
        attack = attack ? `${attack.replace(/\s+$/, '')}+${segNorm}` : segNorm
      }
    }
  }
  appendDiceFromText(weaponOpt.伤害)
  appendDiceFromText(weaponOpt.entry?.附注)
  appendDiceFromText(weaponOpt.proto?.附注)
  return attack
}

/** 战斗手段增益类型定义 */
const GAIN_TYPES = [
  { key: 'extraDice', label: '增加伤害骰' },
  { key: 'damageBonus', label: '增加伤害' },
  { key: 'attackBonus', label: '增加命中' },
  { key: 'diceFloor2', label: '伤害骰不能低于2' },
  { key: 'perDieBonus', label: '每伤害骰+1' },
  { key: 'advantage', label: '优劣势' },
]

/** 取战斗手段启用的增益列表 */
function getEnabledGains(cm) {
  return Array.isArray(cm?.gains) ? cm.gains.filter((g) => g && g.enabled !== false) : []
}

function sumGainAttackBonus(gains) {
  return gains.filter((g) => g.type === 'attackBonus').reduce((s, g) => s + (Number(g.value) || 0), 0)
}
function sumGainDamageBonus(gains) {
  return gains.filter((g) => g.type === 'damageBonus').reduce((s, g) => s + (Number(g.value) || 0), 0)
}
function sumGainPerDieBonus(gains) {
  return gains.filter((g) => g.type === 'perDieBonus').reduce((s, g) => s + (Number(g.value) || 0), 0)
}
function getGainExtraDice(gains) {
  return gains.filter((g) => g.type === 'extraDice' && g.dice).map((g) => g.dice)
}
function getGainAdvantage(gains) {
  const adv = gains.find((g) => g.type === 'advantage' && g.enabled !== false)
  return adv && (adv.advantage === 'advantage' || adv.advantage === 'disadvantage') ? adv.advantage : null
}
function hasGainDiceFloor2(gains) {
  return gains.some((g) => g.type === 'diceFloor2' && g.enabled !== false)
}

/** 统一计算物理战斗手段的命中、伤害与 Buff 分解（行展示与弹窗预览共用） */
function computePhysicalWeaponStats(cm, weaponOpt, ctx) {
  const { effectiveAbilities, prof, spellAbility, buffStats, flatBuffEffects, itemFormulaContext } = ctx
  const isRangedWeapon = weaponOpt ? isRangedWeaponProto(weaponOpt.proto) : false
  const weaponCategoryAttackFlat = weaponOpt?.proto
    ? sumWeaponCategoryAttackDamageBonus(buffStats?.weaponCategoryAttackDamageBonuses ?? [], weaponOpt.proto)
    : 0
  const buffAttackBonus = (isRangedWeapon ? (buffStats?.rangedAttackBonus ?? 0) : (buffStats?.meleeAttackBonus ?? 0)) + weaponCategoryAttackFlat
  const buffDamageBonus = (isRangedWeapon ? (buffStats?.rangedDamageBonus ?? 0) : (buffStats?.meleeDamageBonus ?? 0)) + weaponCategoryAttackFlat
  const weaponProficient = cm.weaponProficient !== false
  const gains = getEnabledGains(cm)
  const gainAttackBonus = sumGainAttackBonus(gains)
  const gainDamageBonus = sumGainDamageBonus(gains)
  const gainPerDieBonus = sumGainPerDieBonus(gains)
  const gainExtraDice = getGainExtraDice(gains)
  const gainAdvantage = getGainAdvantage(gains)
  const gainDiceFloor2 = hasGainDiceFloor2(gains)
  const attackParsed = weaponOpt
    ? parseWeaponAttack(getWeaponAttackStringForParsing(weaponOpt, cm.weaponVersatileMode))
    : { dice: null, diceList: [], type: '—' }
  const rawDamageType = cm.damageType || attackParsed.type
  const spellAbilityOverride = getSpellAbilityForAttackFromBuffs(flatBuffEffects, {
    weaponProto: weaponOpt?.proto,
    damageType: rawDamageType,
    sourceItemInventoryId: weaponOpt?.entry?.id,
  })
  const weaponAbilityKind = resolvePhysicalWeaponAbilityKind(cm, weaponOpt, spellAbilityOverride)
  const abilityKey = weaponAbilityKind === 'spell' ? spellAbility : weaponAbilityKind
  const abilityMod = abilityModifier(effectiveAbilities?.[abilityKey] ?? 10)
  const conditionalBonuses = calculateConditionalAttackDamageBonus(cm, flatBuffEffects, {
    weaponProto: weaponOpt?.proto,
    damageType: rawDamageType,
    sourceItemInventoryId: weaponOpt?.entry?.id,
  }, itemFormulaContext)
  const physicalAttackBonus = abilityMod + (weaponProficient ? prof : 0) + buffAttackBonus + gainAttackBonus + (conditionalBonuses?.attackBonus || 0)
  // 双持副手附赠攻击伤害不加属性调整值
  const damageMod = cm.weaponVersatileMode === 'bonus_action' ? 0 : abilityMod
  const weaponExtraDiceStrings = [...getMergedWeaponExtraDiceStrings(cm, weaponOpt), ...gainExtraDice]
  const allWeaponDiceCount = (attackParsed.diceList || []).reduce((s, d) => s + (parseCombatDiceExpression(d)?.count || 0), 0) +
    weaponExtraDiceStrings.reduce((s, d) => s + (parseCombatDiceExpression(String(d).split(' ')[0])?.count || 0), 0)
  const weaponPerDieMod = gainPerDieBonus * allWeaponDiceCount
  const totalDamageMod = damageMod + buffDamageBonus + gainDamageBonus + weaponPerDieMod + (conditionalBonuses?.damageBonus || 0)
  const displayDamageType = rawDamageType ? getDamageTypeLabel(rawDamageType) : '—'
  return {
    weaponAbilityKind, abilityKey, abilityMod, isRangedWeapon, weaponCategoryAttackFlat,
    buffAttackBonus, buffDamageBonus, weaponProficient, gains, gainAttackBonus, gainDamageBonus,
    gainPerDieBonus, gainExtraDice, gainAdvantage, gainDiceFloor2, attackParsed, rawDamageType,
    conditionalBonuses, physicalAttackBonus, damageMod, weaponExtraDiceStrings, allWeaponDiceCount,
    weaponPerDieMod, totalDamageMod, displayDamageType,
  }
}

/** 根据战斗手段类型与 Buff 统计，自动生成一组默认增益建议（仅在用户未手动设置时填充） */
function buildDefaultGainsFromBuffs(cm, buffStats, mergedBuffs, isSpellMean = false) {
  const gains = []
  const isPhysical = cm?.type === 'physical'
  const pushOnce = (type, payload) => {
    const id = 'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6)
    gains.push({ id, type, enabled: true, ...payload })
  }
  const relevantScope = (scope) => {
    if (!isPhysical) return scope === 'global' || scope == null || scope === ''
    const ranged = cm?.weaponInventoryIndex != null
      ? (() => {
          const entry = (mergedBuffs?.__inventory || []).find((e) => e?.index === cm.weaponInventoryIndex)
          return isRangedWeaponProto(entry?.proto)
        })()
      : false
    if (ranged) return scope === 'ranged' || scope === 'firearm' || scope === 'global' || scope == null || scope === ''
    return scope === 'melee' || scope === 'global' || scope == null || scope === ''
  }
  if (buffStats) {
    const melee = Number(buffStats?.meleeAttackBonus) || 0
    const ranged = Number(buffStats?.rangedAttackBonus) || 0
    const meleeDmg = Number(buffStats?.meleeDamageBonus) || 0
    const rangedDmg = Number(buffStats?.rangedDamageBonus) || 0
    const attackVal = isPhysical ? (ranged || melee) : (melee || ranged)
    const damageVal = isPhysical ? (rangedDmg || meleeDmg) : (meleeDmg || rangedDmg)
    if (attackVal) pushOnce('attackBonus', { value: attackVal })
    if (damageVal) pushOnce('damageBonus', { value: damageVal })
  }
  if (Array.isArray(mergedBuffs)) {
    for (const b of mergedBuffs) {
      if (b.enabled === false) continue
      const effects = Array.isArray(b.effects) ? b.effects : [b]
      for (const e of effects) {
        if (!e) continue
        const scopeOk = relevantScope(e.scope)
        if (!scopeOk && isPhysical) continue
        if (e.effectType === 'extra_damage_dice') {
          const raw = e.value
          if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.onlySpellDamage && !isSpellMean) continue
          let diceText = ''
          if (typeof raw === 'string' && raw.trim()) {
            diceText = raw.trim()
          } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
            diceText = formatDamageForAttack(raw)
          }
          if (diceText) pushOnce('extraDice', { dice: diceText })
        }
        if (e.effectType === 'attack_bonus' || e.effectType === 'damage_bonus' || e.effectType === 'attack_damage_bonus') {
          const obj = typeof e.value === 'object' && e.value && !Array.isArray(e.value) ? e.value : null
          const adv = obj?.advantage
          if ((adv === 'advantage' || adv === 'disadvantage') && !gains.some((g) => g.type === 'advantage')) {
            pushOnce('advantage', { advantage: adv })
          }
        }
      }
    }
  }
  return gains
}

/** 战斗手段增益编辑器 */
function GainEditor({ gains, onChange }) {
  const [addingType, setAddingType] = useState('')
  const items = Array.isArray(gains) ? gains : []
  const makeId = () => 'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6)
  const updateItem = (id, patch) => {
    onChange(items.map((g) => (g.id === id ? { ...g, ...patch } : g)))
  }
  const removeItem = (id) => {
    onChange(items.filter((g) => g.id !== id))
  }
  const addItem = (type) => {
    const base = { id: makeId(), type, enabled: true }
    let payload = base
    switch (type) {
      case 'extraDice':
        payload = { ...base, dice: '1d6' }
        break
      case 'damageBonus':
      case 'attackBonus':
      case 'perDieBonus':
        payload = { ...base, value: 1 }
        break
      case 'advantage':
        payload = { ...base, advantage: 'advantage' }
        break
      case 'diceFloor2':
      default:
        break
    }
    onChange([...items, payload])
    setAddingType('')
  }
  return (
    <div className="w-full border-t border-gray-600/80 pt-2 space-y-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <label className="text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider">增益</label>
        <div className="flex items-center gap-1.5">
          {addingType ? (
            <select
              value={addingType}
              onChange={(e) => {
                const t = e.target.value
                if (t) addItem(t)
              }}
              className={`${inputClass} h-7 text-[10px] py-0 px-1 min-w-[6rem]`}
              autoFocus
            >
              <option value="">选择增益类型</option>
              {GAIN_TYPES.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
          ) : (
            <button
              type="button"
              onClick={() => setAddingType('extraDice')}
              className="flex shrink-0 items-center gap-0.5 rounded border border-dashed border-dnd-gold/50 px-2 py-0.5 text-[10px] font-medium text-dnd-gold-light hover:bg-dnd-gold/15"
            >
              <Plus className="h-3 w-3" />
              增加增益
            </button>
          )}
        </div>
      </div>
      {items.length === 0 && <p className="text-dnd-text-muted text-[10px]">暂无增益，点击「增加增益」添加。</p>}
      <div className="space-y-1.5">
        {items.map((g) => {
          const typeLabel = GAIN_TYPES.find((t) => t.key === g.type)?.label || g.type
          return (
            <div
              key={g.id}
              className={`flex items-center gap-1.5 rounded border border-gray-600 bg-gray-700/30 p-1.5 text-xs ${g.enabled === false ? 'opacity-60' : ''}`}
            >
              <input
                type="checkbox"
                checked={g.enabled !== false}
                onChange={(e) => updateItem(g.id, { enabled: e.target.checked })}
                className="rounded border-gray-500 shrink-0"
                title={g.enabled === false ? '已禁用' : '已启用'}
              />
              <span className="shrink-0 text-dnd-text-muted w-20 truncate" title={typeLabel}>
                {typeLabel}
              </span>
              <div className="flex-1 min-w-0">
                {g.type === 'extraDice' && (
                  <input
                    type="text"
                    value={g.dice || ''}
                    onChange={(e) => updateItem(g.id, { dice: e.target.value })}
                    placeholder="如 1d6 火焰"
                    className={`${inputClass} w-full h-7 text-xs font-mono`}
                  />
                )}
                {(g.type === 'damageBonus' || g.type === 'attackBonus' || g.type === 'perDieBonus') && (
                  <NumberStepper
                    className="!w-[5.5rem] !min-w-0 !px-2"
                    value={Number(g.value) || 0}
                    onChange={(v) => updateItem(g.id, { value: v })}
                    min={-99}
                    max={99}
                    compact
                    narrow
                  />
                )}
                {g.type === 'advantage' && (
                  <select
                    value={g.advantage || 'advantage'}
                    onChange={(e) => updateItem(g.id, { advantage: e.target.value })}
                    className={`${inputClass} h-7 text-xs py-0 px-1 w-full`}
                  >
                    <option value="advantage">优势</option>
                    <option value="disadvantage">劣势</option>
                  </select>
                )}
              </div>
              <button
                type="button"
                onClick={() => removeItem(g.id)}
                className="shrink-0 rounded border border-gray-500 px-1.5 py-0.5 text-gray-400 hover:bg-gray-600"
              >
                移除
              </button>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * 从武器背包条目的附魔 effects 读取：额外伤害骰文案
 * 命中/伤害加值已统一通过 getBuffsFromEquipmentAndInventory 转成虚拟 BUFF，
 * 由 useBuffCalculator 计算一次，此处不再重复累加平加值。
 */
function getWeaponEntryDamageExtras(entry, proto, isSpellMean = false) {
  if (!entry || !Array.isArray(entry.effects)) return { flatBonus: 0, extraDiceStrings: [] }
  const extraDiceStrings = []
  for (const e of entry.effects) {
    if (!e) continue
    if (e.effectType === 'extra_damage_dice') {
      const raw = e.value
      if (raw && typeof raw === 'object' && !Array.isArray(raw) && raw.onlySpellDamage && !isSpellMean) continue
      if (typeof raw === 'string' && raw.trim()) {
        extraDiceStrings.push(raw.trim())
      } else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const line = formatDamageForAttack(raw)
        if (line) extraDiceStrings.push(line)
      }
    }
  }
  return { flatBonus: 0, extraDiceStrings }
}

function getMergedWeaponExtraDiceStrings(cm, weaponOpt) {
  const fromMean = Array.isArray(cm?.extraDamageDice) ? [...cm.extraDamageDice] : []
  const fromEntry = weaponOpt?.entry ? getWeaponEntryDamageExtras(weaponOpt.entry, weaponOpt.proto).extraDiceStrings : []
  const seen = new Set()
  const out = []
  for (const d of [...fromMean, ...fromEntry]) {
    const s = typeof d === 'string' ? d.trim() : ''
    if (!s) continue
    const key = s.toLowerCase().replace(/\s+/g, ' ')
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
  }
  return out
}

/** 与主武器任一段骰+类型完全相同时不重复展示额外一行 */
function filterExtraDiceAgainstMain(attackParsed, rawDamageType, lines) {
  const mainDiceList = attackParsed?.diceList?.length
    ? attackParsed.diceList
    : attackParsed?.dice
      ? [attackParsed.dice]
      : []
  const mainLower = mainDiceList.map((x) => x.toLowerCase())
  return lines.filter((d) => {
    const p = parseWeaponAttack(d)
    const extraDice = (p.dice || '').toLowerCase()
    const sameDice = extraDice && mainLower.includes(extraDice)
    const sameType = (p.type || '').trim() === (rawDamageType || '').trim()
    return !(sameDice && sameType)
  })
}

/** 武器是否使用敏捷（灵巧） */
function weaponUsesDex(proto) {
  return proto?.附注 && /灵巧/i.test(String(proto.附注))
}

/** 未在战斗手段中指定属性时：远程/枪械/灵巧 → 敏，其余 → 力 */
function inferPhysicalWeaponAbilityFromProto(proto) {
  if (!proto) return 'str'
  if (isRangedWeaponProto(proto) || weaponUsesDex(proto)) return 'dex'
  return 'str'
}

/**
 * 战斗手段「武器所用属性」：
 * - 施法属性 / 敏捷 明确保存则沿用；
 * - 若存在生效的「施法属性命中」BUFF，则优先使用其指定的智力/感知/魅力；
 * - 远程与枪械在 5e 中攻击与伤害用敏调；旧存档常误存为「力量」，仍用力调会导致伤害只显示附魔 +5 而无敏调。
 * - 未指定时按武器类型推断。
 */
function resolvePhysicalWeaponAbilityKind(cm, weaponOpt, spellAbilityOverride) {
  const ex = cm?.abilityForAttack
  const proto = weaponOpt?.proto
  const ranged = proto && isRangedWeaponProto(proto)
  if (spellAbilityOverride) return spellAbilityOverride
  if (ex === 'spell') return 'spell'
  if (ex === 'dex') return 'dex'
  if (ex === 'str') {
    if (ranged) return 'dex'
    return 'str'
  }
  return inferPhysicalWeaponAbilityFromProto(proto)
}

/** 从法术描述中解析伤害，如 "受到1d6点强酸伤害" → [{ dice: '1d6', type: '强酸' }] */
function parseSpellDamageFromDescription(desc) {
  if (!desc || typeof desc !== 'string') return []
  const results = []
  const re = /(\d+d\d+)\s*点?\s*(\S+)\s*伤害/g
  let m
  while ((m = re.exec(desc))) results.push({ dice: m[1], type: m[2] })
  return results
}

/** 法术是否使用攻击检定（描述中含 法术攻击 / 远程法术攻击 / 近战法术攻击） */
function spellUsesAttack(desc) {
  return desc && /(远程|近战)?法术攻击/.test(String(desc))
}

export default function CombatStatus({ char, hp, abilities, level, canEdit, onSave }) {
  const { openForCheck } = useRoll()
  const { currentModuleId } = useModule()
  const ruleOverridesMap = useRuleTextOverridesMap(currentModuleId || 'default')
  const combatModuleId = currentModuleId || 'default'
  const mergedBuffs = useMemo(
    () => getMergedBuffsForCalculator(char, combatModuleId),
    [
      char?.buffs,
      char?.selectedFeats,
      char?.inventory,
      char?.equippedHeld,
      char?.equippedWorn,
      combatModuleId,
    ],
  )
  const buffStats = useBuffCalculator(char, mergedBuffs)
  const itemFormulaContext = useMemo(() => {
    const effectiveAbilities = buffStats?.abilities ?? abilities ?? {}
    const prof = proficiencyBonus(level)
    const spellAbility = getPrimarySpellcastingAbility(char)
    const spellMod = spellAbility ? abilityModifier(effectiveAbilities?.[spellAbility] ?? 10) : 0
    return {
      level,
      abilities: effectiveAbilities,
      prof,
      spellDC: spellAbility ? 8 + prof + spellMod : 0,
      spellAttack: spellAbility ? prof + spellMod : 0,
    }
  }, [char, level, abilities, buffStats])
  const flatBuffEffects = useMemo(() => getFlatEffectEntries(mergedBuffs), [mergedBuffs])
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
    return arr.map((r) => ({ id: r.id ?? 'r_' + Math.random().toString(36).slice(2), name: r.name || '—', current: Math.max(0, Number(r.current) ?? 0), max: Math.max(1, Number(r.max) ?? 1) }))
  })
  const [addResourceName, setAddResourceName] = useState('')
  const [addResourceMax, setAddResourceMax] = useState(2)
  const [isAddingResource, setIsAddingResource] = useState(false)
  const [combatMeans, setCombatMeans] = useState(() => {
    const arr = Array.isArray(char?.combatMeans) ? char.combatMeans : []
    return arr.map((m) => ({
      id: m.id ?? 'cm_' + Math.random().toString(36).slice(2),
      type: m.type === 'spell_attack' ? 'spell_attack' : m.type === 'spell' ? 'spell' : m.type === 'item' ? 'item' : 'physical',
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
      gains: Array.isArray(m.gains) ? m.gains : [],
    }))
  })
  const [showAddCombatMeanModal, setShowAddCombatMeanModal] = useState(false)
  const [editingCombatMeanId, setEditingCombatMeanId] = useState(null) // 编辑法术攻击时设为该条 id
  const [addMeanStep, setAddMeanStep] = useState('type') // 'type' | 'weapon' | 'item' | 'spell_attack'
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
  const [showSpellModule, setShowSpellModule] = useState(() => char?.showSpellModule !== false)
  const [showMartialModule, setShowMartialModule] = useState(() => char?.showMartialModule !== false)
  const [showExtraSlotsEdit, setShowExtraSlotsEdit] = useState(false)
  const [showExtraSlotsModal, setShowExtraSlotsModal] = useState(false)
  const [explosiveUsePending, setExplosiveUsePending] = useState(null) // { inventoryIndex, name, diceExpr, damageType }
  const [focusUsePending, setFocusUsePending] = useState(null) // { inventoryIndex, name, spellSub } 法器投掷待确认
  const [focusSpellMap, setFocusSpellMap] = useState({}) // { [inventoryIndex]: spellSub } 法器当前选中的内含法术
  /** 当前启用的架势槽 id（全角色至多一个） */
  const [martialActiveStanceId, setMartialActiveStanceId] = useState(() =>
    typeof char?.martialActiveStanceId === 'string' && char.martialActiveStanceId.trim() ? char.martialActiveStanceId : null
  )
  /** 战斗区武技卡片展开状态 */
  const [expandedMartialIds, setExpandedMartialIds] = useState(new Set())
  const toggleMartialExpand = (slotId) => {
    setExpandedMartialIds((prev) => {
      const next = new Set(prev)
      if (next.has(slotId)) next.delete(slotId)
      else next.add(slotId)
      return next
    })
  }
  /** 战斗区·武技：含架势/攻击技槽、准备状态、其它类型（强化/应对等）；非架势可有 used */
  const [martialSlots, setMartialSlots] = useState(() => {
    const arr = Array.isArray(char?.combatMartialTechniques) ? char.combatMartialTechniques : []
    return arr
      .map((m) => {
        const techniqueId = m.techniqueId || ''
        const tech = techniqueId ? getMartialTechniqueById(techniqueId) : null
        const kind =
          m.kind === 'stance' || m.kind === 'strike' || m.kind === 'other' ? m.kind : inferMartialSlotKind(tech)
        return {
          id: m.id ?? 'mt_' + Math.random().toString(36).slice(2),
          techniqueId,
          prepared: m.prepared === true,
          kind,
          used: (kind === 'strike' || kind === 'other') && m.used === true,
        }
      })
      .filter((m) => m.techniqueId)
  })
  const [martialLearnQuota, setMartialLearnQuota] = useState(() => {
    const rawStyle = char?.martialLearnQuota?.style
    // 兼容旧存档：字符串转数组
    const style = Array.isArray(rawStyle) ? rawStyle : rawStyle ? [rawStyle] : []
    return {
      stanceMax: Math.max(0, Math.min(30, Number(char?.martialLearnQuota?.stanceMax) || 0)),
      strikeMax: Math.max(0, Math.min(30, Number(char?.martialLearnQuota?.strikeMax) || 0)),
      style,
    }
  })
  /** 添加武技弹窗内编辑快照：quota + 两行槽表 */
  const [martialModal, setMartialModal] = useState(null)
  const [showAddMartialModal, setShowAddMartialModal] = useState(false)
  const martialSlotsRef = useRef(martialSlots)
  const martialActiveStanceRef = useRef(martialActiveStanceId)
  useEffect(() => {
    martialSlotsRef.current = martialSlots
  }, [martialSlots])
  useEffect(() => {
    martialActiveStanceRef.current = martialActiveStanceId
  }, [martialActiveStanceId])

  useEffect(() => {
    setShowSpellModule(char?.showSpellModule !== false)
  }, [char?.id, char?.showSpellModule])

  useEffect(() => {
    setShowMartialModule(char?.showMartialModule !== false)
  }, [char?.id, char?.showMartialModule])

  useEffect(() => {
    setHpCurrent(hp?.current ?? 0)
    setHpTemp(hp?.temp ?? 0)
    setHpBuffTemp(hp?.buffTemp ?? 0)
  }, [hp?.current, hp?.temp, hp?.buffTemp])

  /** BUFF 临时生命：BUFF 变化时同步到当前值；已扣减时不自动回涨 */
  const prevBuffTempHpRef = useRef(0)
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
    setClassResources(arr.map((r) => ({ id: r.id ?? 'r_' + Math.random().toString(36).slice(2), name: r.name || '—', current: Math.max(0, Number(r.current) ?? 0), max: Math.max(1, Number(r.max) ?? 1) })))
  }, [char?.id, char?.classResources])

  useEffect(() => {
    const arr = Array.isArray(char?.combatMeans) ? char.combatMeans : []
    setCombatMeans(arr.map((m) => ({
      id: m.id ?? 'cm_' + Math.random().toString(36).slice(2),
      type: m.type === 'spell_attack' ? 'spell_attack' : m.type === 'spell' ? 'spell' : m.type === 'item' ? 'item' : 'physical',
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
      gains: Array.isArray(m.gains) ? m.gains : [],
    })))
  }, [char?.id, char?.combatMeans])

  useEffect(() => {
    const arr = Array.isArray(char?.combatMartialTechniques) ? char.combatMartialTechniques : []
    setMartialSlots(
      arr
        .map((m) => {
          const techniqueId = m.techniqueId || ''
          const tech = techniqueId ? getMartialTechniqueById(techniqueId) : null
          const kind =
            m.kind === 'stance' || m.kind === 'strike' || m.kind === 'other' ? m.kind : inferMartialSlotKind(tech)
          return {
            id: m.id ?? 'mt_' + Math.random().toString(36).slice(2),
            techniqueId,
            prepared: m.prepared === true,
            kind,
            used: (kind === 'strike' || kind === 'other') && m.used === true,
          }
        })
        .filter((m) => m.techniqueId)
    )
    setMartialActiveStanceId(
      typeof char?.martialActiveStanceId === 'string' && char.martialActiveStanceId.trim()
        ? char.martialActiveStanceId
        : null
    )
    const q = char?.martialLearnQuota
    if (q && typeof q === 'object') {
      const rawStyle = q.style
      const style = Array.isArray(rawStyle) ? rawStyle : rawStyle ? [rawStyle] : []
      setMartialLearnQuota({
        stanceMax: Math.max(0, Math.min(30, Number(q.stanceMax) || 0)),
        strikeMax: Math.max(0, Math.min(30, Number(q.strikeMax) || 0)),
        style,
      })
    }
  }, [char?.id, char?.combatMartialTechniques, char?.martialLearnQuota, char?.martialActiveStanceId])

  useEffect(() => {
    if (hpCurrent > maxHp) setHpCurrent(maxHp)
  }, [maxHp, hpCurrent])

  const saveCombatMartialSlots = (next) => {
    setMartialSlots(next)
    const stanceIds = new Set(next.filter((s) => s.kind === 'stance').map((s) => s.id))
    let act = martialActiveStanceId
    if (act && !stanceIds.has(act)) act = null
    const actSlot = act ? next.find((s) => s.id === act) : null
    if (!actSlot || actSlot.kind !== 'stance') act = null
    setMartialActiveStanceId(act)
    onSave({
      combatMartialTechniques: serializeCombatMartialForSave(next),
      martialLearnQuota: { ...martialLearnQuota },
      martialActiveStanceId: act,
    })
  }

  const pickMartialActiveStance = (slotId) => {
    const prev = martialSlotsRef.current
    const stanceIds = new Set(prev.filter((s) => s.kind === 'stance').map((s) => s.id))
    if (!slotId || !stanceIds.has(slotId)) return
    const nextActive = martialActiveStanceId === slotId ? null : slotId
    setMartialActiveStanceId(nextActive)
    onSave({
      combatMartialTechniques: serializeCombatMartialForSave(prev),
      martialLearnQuota: { ...martialLearnQuota },
      martialActiveStanceId: nextActive,
    })
  }

  const toggleMartialOtherUsed = (slotId) => {
    const prev = martialSlotsRef.current
    const next = prev.map((s) =>
      s.id === slotId && (s.kind === 'strike' || s.kind === 'other') ? { ...s, used: !s.used } : s
    )
    saveCombatMartialSlots(next)
  }

  const commitMartialModal = useCallback(
    (nextModal) => {
      setMartialModal(nextModal)
      const others = martialSlotsRef.current.filter((s) => s.kind === 'other')
      let built = buildMartialSlotsFromRows(nextModal.stanceRows, nextModal.strikeRows, others)
      const prevMap = new Map(martialSlotsRef.current.map((s) => [s.id, s]))
      built = built.map((s) => {
        const p = prevMap.get(s.id)
        if (p && (s.kind === 'strike' || s.kind === 'other') && p.used) return { ...s, used: true }
        return s
      })
      const stanceIds = new Set(built.filter((s) => s.kind === 'stance').map((s) => s.id))
      let act = martialActiveStanceRef.current
      if (act && !stanceIds.has(act)) act = null
      const actSlot = act ? built.find((s) => s.id === act) : null
      if (!actSlot || actSlot.kind !== 'stance') act = null
      setMartialSlots(built)
      setMartialActiveStanceId(act)
      setMartialLearnQuota(nextModal.quota)
      onSave({
        combatMartialTechniques: serializeCombatMartialForSave(built),
        martialLearnQuota: {
          stanceMax: nextModal.quota.stanceMax,
          strikeMax: nextModal.quota.strikeMax,
          style: nextModal.quota.style,
        },
        martialActiveStanceId: act,
      })
    },
    [onSave]
  )

  const openMartialSettingsModal = () => {
    const stanceSlots = martialSlots.filter((s) => s.kind === 'stance')
    const strikeSlots = martialSlots.filter((s) => s.kind === 'strike')
    const sm = martialLearnQuota.stanceMax
    const st = martialLearnQuota.strikeMax
    const stanceRows = Array.from({ length: sm }, (_, i) => ({
      id: stanceSlots[i]?.id ?? `mt_st_${i}_${Date.now()}`,
      techniqueId: stanceSlots[i]?.techniqueId || '',
      prepared: !!stanceSlots[i]?.prepared,
    }))
    const strikeRows = Array.from({ length: st }, (_, i) => ({
      id: strikeSlots[i]?.id ?? `mt_sk_${i}_${Date.now()}`,
      techniqueId: strikeSlots[i]?.techniqueId || '',
      prepared: !!strikeSlots[i]?.prepared,
    }))
    setMartialModal({
      quota: { ...martialLearnQuota },
      stanceRows,
      strikeRows,
    })
    setShowAddMartialModal(true)
  }

  const renderMartialCombatRow = (slot, column) => {
    const tech = getMartialTechniqueById(slot.techniqueId)
    const isStanceCol = column === 'stance'
    const activeStance = isStanceCol && martialActiveStanceId === slot.id
    const usedOther = !isStanceCol && slot.used === true
    const tagAction = tech ? shortMartialAction(tech.action) : '—'
    const tagStyle = tech?.style ?? '—'
    const tagRange = tech?.range ?? tech?.target ?? '—'
    const descRaw = tech?.description != null && String(tech.description).trim() ? String(tech.description).trim() : ''
    const descText = tech?.id
      ? String(resolveRuleText(ruleOverridesMap, buildMartialKey(tech.id), descRaw) || '').trim()
      : descRaw
    const styleGraphemes = tagStyle !== '—' ? Array.from(tagStyle) : []
    const styleSubTracking = styleGraphemes.length === 2 ? 'tracking-[0.62em]' : ''
    const isExpanded = expandedMartialIds.has(slot.id)
    const hasDesc = descText.length > 0
    return (
      <div key={slot.id} className={MARTIAL_MOVE_CARD_CLASS}>
        <div className="flex gap-2.5 items-start">
          <div className="flex shrink-0 flex-col items-center">
            {isStanceCol ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); pickMartialActiveStance(slot.id) }}
                title={activeStance ? '正在使用' : '设为正在使用'}
                aria-label={activeStance ? '正在使用' : '设为正在使用'}
                className={`rounded-md border p-1 transition-colors ${
                  activeStance
                    ? 'border-dnd-gold/50 bg-dnd-gold/10 text-dnd-gold-light'
                    : 'border-gray-600/55 bg-gray-900/30 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                }`}
              >
                {activeStance ? <CircleDot className="h-4 w-4" strokeWidth={2.25} /> : <Circle className="h-4 w-4" strokeWidth={2} />}
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleMartialOtherUsed(slot.id) }}
                title={usedOther ? '已使用' : '标记已使用'}
                aria-label={usedOther ? '已使用' : '标记已使用'}
                className={`rounded-md border p-1 transition-colors ${
                  usedOther
                    ? 'border-amber-600/55 bg-amber-950/20 text-amber-200/90'
                    : 'border-gray-600/55 bg-gray-900/30 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                }`}
              >
                {usedOther ? <CheckCircle2 className="h-4 w-4" strokeWidth={2.25} /> : <Circle className="h-4 w-4" strokeWidth={2} />}
              </button>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 cursor-pointer select-none"
              onClick={() => toggleMartialExpand(slot.id)}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <InfoTooltip
                    content={<MartialTechTooltipContent tech={tech} />}
                    triggerClassName=""
                    disabled={!tech}
                  >
                    <span
                      className={`break-words font-semibold leading-tight ${tech ? 'text-sm text-white' : 'text-xs text-gray-500'}`}
                    >
                      {tech?.name ?? '未知武技（库中无此条目）'}
                    </span>
                  </InfoTooltip>
                  {tech && tagStyle !== '—' ? (
                    <span className="text-[10px] leading-tight text-dnd-text-muted">
                      <span className={['inline-block', 'break-words', styleSubTracking].filter(Boolean).join(' ')}>{tagStyle}</span>
                    </span>
                  ) : null}
                  {tech?.tag ? (
                    <span className="text-[10px] leading-tight text-violet-300/85">{tech.tag}</span>
                  ) : null}
                </div>
              </div>
              <div className="shrink-0 text-right text-[10px] leading-tight">
                <div className={isStanceCol ? 'text-dnd-gold-light/80' : 'text-dnd-text-muted'}>{tagAction}</div>
                <div className={isStanceCol ? 'text-dnd-gold-light/80' : 'text-dnd-text-muted'}>{tagRange}</div>
              </div>
            </div>
            {isExpanded && hasDesc && (
              <p className="mt-2 border-t border-gray-700/35 pt-2 text-[11px] leading-snug break-words text-dnd-text-body">
                {descText}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

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
    const name = (addSpellAttackSpellId ? (getSpellById(addSpellAttackSpellId)?.name ?? addSpellAttackName) : addSpellAttackName).trim() || '法术攻击'
    const lvl = Number(addSpellAttackSpellLevel)
    const patch = {
      type: 'spell_attack',
      spellName: name,
      spellLevel: lvl >= 1 && lvl <= 9 ? lvl : null,
      hitResolution: addSpellAttackHitResolution || 'spell_attack',
      damageDice: (addSpellAttackDice || '').trim(),
      damageTypeSpell: (addSpellAttackDamageType || '').trim(),
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
        spellId: null,
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
  const openEditSpellAttack = (cm) => {
    setEditingCombatMeanId(cm.id)
    setAddSpellAttackName(cm.spellName || '')
    setAddSpellAttackSpellId(cm.spellId || '')
    setAddSpellAttackHitResolution(cm.hitResolution || 'spell_attack')
    setAddSpellAttackDice(cm.damageDice || '')
    setAddSpellAttackDamageType(cm.damageTypeSpell || '')
    setAddSpellAttackSpellLevel(cm.spellLevel != null ? String(cm.spellLevel) : '')
    setAddTargetCreatureType(cm.targetCreatureType || '')
    setAddGains(cm.gains?.length ? [...cm.gains] : buildDefaultGainsFromBuffs(cm, buffStats, mergedBuffs, true))
    setAddMeanStep('spell_attack')
    setShowAddCombatMeanModal(true)
  }
  const openEditItemMean = (cm) => {
    setEditingCombatMeanId(cm.id)
    setAddItemIndex(cm.itemInventoryIndex ?? null)
    const itemOpt = cm.itemInventoryIndex != null ? itemMeansFromInv.find((x) => x.index === cm.itemInventoryIndex) : null
    const isSpellItem = itemOpt && (itemOpt.kind === 'focus' || itemOpt.kind === 'scroll')
    setAddTargetCreatureType(cm.targetCreatureType || '')
    setAddGains(cm.gains?.length ? [...cm.gains] : buildDefaultGainsFromBuffs(cm, buffStats, mergedBuffs, isSpellItem))
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
    const containedSpell = entry?.effects?.find((e) => e.effectType === 'contained_spell')?.value
    const cs = normalizeContainedSpellValue(containedSpell, entry.charge)
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
      const modifier = gainDamageBonus + gainPerDieBonus * dCount + spellDamageExtras.perDieBonus * dCount + spellDamageExtras.flatBonus
      const floor2 = gainDiceFloor2 || focusUsePending?.damageFloor2 || spellDamageExtras.diceFloor2
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

  const weaponsFromInv = useMemo(() => getWeaponsFromInventory(char?.inventory ?? []), [char?.inventory])

  const openEditWeaponMean = useCallback((cm) => {
    setEditingCombatMeanId(cm.id)
    setAddWeaponIndex(cm.weaponInventoryIndex ?? null)
    setAddWeaponNameSuffix(cm.weaponNameSuffix ?? '')
    const wForEdit =
      cm.weaponInventoryIndex != null ? weaponsFromInv.find((x) => x.index === cm.weaponInventoryIndex) : null
    const rawDamageType = cm.damageType || (wForEdit ? parseWeaponAttack(getWeaponAttackStringForParsing(wForEdit, cm.weaponVersatileMode)).type : null)
    const flatEffects = getFlatEffectEntries(mergedBuffs)
    const spellAbilityOverride = getSpellAbilityForAttackFromBuffs(flatEffects, {
      weaponProto: wForEdit?.proto,
      damageType: rawDamageType,
      sourceItemInventoryId: wForEdit?.entry?.id,
    })
    setAddAbility(resolvePhysicalWeaponAbilityKind(cm, wForEdit, spellAbilityOverride))
    setAddDamageType(cm.damageType ? String(cm.damageType) : '')
    setAddWeaponMode(cm.weaponVersatileMode || getDefaultWeaponMode(wForEdit))
    setAddWeaponProficient(cm.weaponProficient !== false)
    setAddTargetCreatureType(cm.targetCreatureType || '')
    setAddWeaponExtraDice(Array.isArray(cm.extraDamageDice) ? [...cm.extraDamageDice] : [])
    setShowWeaponExtraDiceEditor(false)
    setAddGains(cm.gains?.length ? [...cm.gains] : buildDefaultGainsFromBuffs(cm, buffStats, mergedBuffs))
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
  const spellcastingLevel = getSpellcastingLevel(char)
  const maxSlotsByRing = useMemo(() => getMaxSpellSlotsByRing(char), [char])
  const spellSlotsMaxOverride = char?.spellSlotsMax && typeof char.spellSlotsMax === 'object' ? char.spellSlotsMax : {}
  const extraSpellSlotsMode = char?.extraSpellSlotsMode === 'points' ? 'points' : 'slots'
  const extraSpellSlotsPoints = useMemo(() => {
    const p = char?.extraSpellSlotsPoints
    const max = Math.max(0, Number(p?.max) ?? 0)
    const current = Math.max(0, Math.min(max || 999, Number(p?.current) ?? max))
    return { max, current }
  }, [char?.extraSpellSlotsPoints])
  const extraSpellSlotsList = useMemo(() => {
    const raw = char?.extraSpellSlots
    if (Array.isArray(raw)) return raw.map((e) => ({ id: e.id ?? 'ex_' + Math.random().toString(36).slice(2), ring: Math.min(9, Math.max(1, Number(e.ring) || 1)), max: Math.max(0, Number(e.max) ?? 1) }))
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return Object.entries(raw).filter(([, n]) => (n || 0) > 0).map(([ring, max]) => ({ id: 'ex_' + ring, ring: Number(ring) || 1, max: Number(max) || 0 }))
    }
    return []
  }, [char?.extraSpellSlots])
  const baseMaxByRing = useMemo(() => {
    const out = {}
    for (let ring = 1; ring <= 9; ring++) {
      out[ring] = spellSlotsMaxOverride[ring] != null
        ? Math.max(0, Number(spellSlotsMaxOverride[ring]) || 0)
        : (maxSlotsByRing[ring] ?? 0)
    }
    return out
  }, [maxSlotsByRing, spellSlotsMaxOverride])
  const extraMaxByRing = useMemo(() => {
    const out = {}
    for (let ring = 1; ring <= 9; ring++) out[ring] = 0
    if (extraSpellSlotsMode !== 'slots') return out
    for (const e of extraSpellSlotsList) {
      const ring = Math.min(9, Math.max(1, Number(e.ring) || 1))
      out[ring] += Math.max(0, Number(e.max) || 0)
    }
    return out
  }, [extraSpellSlotsList, extraSpellSlotsMode])
  const effectiveMaxByRing = useMemo(() => {
    const out = {}
    for (let ring = 1; ring <= 9; ring++) {
      out[ring] = (baseMaxByRing[ring] ?? 0) + (extraMaxByRing[ring] ?? 0)
    }
    return out
  }, [baseMaxByRing, extraMaxByRing])
  const visibleBaseRings = useMemo(
    () => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((r) => (baseMaxByRing[r] ?? 0) > 0),
    [baseMaxByRing],
  )
  const visibleExtraRings = useMemo(
    () => [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((r) => (extraMaxByRing[r] ?? 0) > 0),
    [extraMaxByRing],
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
  const getSlotSplit = useCallback((ring) => {
    const baseMax = baseMaxByRing[ring] ?? 0
    const extraMax = extraMaxByRing[ring] ?? 0
    const effectiveMax = Math.max(0, baseMax + extraMax)
    const totalCur = Math.min(effectiveMax, Math.max(0, spellSlotsCurrentLocal[ring] ?? effectiveMax))
    const baseCur = Math.min(baseMax, totalCur)
    const extraCur = Math.max(0, totalCur - baseMax)
    return { baseMax, extraMax, effectiveMax, baseCur, extraCur, totalCur }
  }, [baseMaxByRing, extraMaxByRing, spellSlotsCurrentLocal])

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
    const { totalCur } = getSlotSplit(ring)
    if (totalCur <= 0) {
      window.alert(`${label || ring + ' 环法术位'}已耗尽`)
      return false
    }
    setSpellSlotCurrentTotal(ring, totalCur - 1)
    spentSpellSlotIdsRef.current.add(cm.id)
    setTimeout(() => spentSpellSlotIdsRef.current.delete(cm.id), 8000)
    return true
  }, [getSpellMeanSlotRing, getSlotSplit])

  const setBaseSlotCurrent = (ring, remainingBase) => {
    const { extraCur, baseMax } = getSlotSplit(ring)
    const nextBase = Math.max(0, Math.min(baseMax, remainingBase))
    setSpellSlotCurrentTotal(ring, nextBase + extraCur)
  }
  const setExtraSlotCurrent = (ring, remainingExtra) => {
    const { baseCur, extraMax } = getSlotSplit(ring)
    const nextExtra = Math.max(0, Math.min(extraMax, remainingExtra))
    setSpellSlotCurrentTotal(ring, baseCur + nextExtra)
  }
  const saveExtraSpellSlots = (next) => {
    onSave({ extraSpellSlots: next.map((e) => ({ id: e.id, ring: e.ring, max: e.max })) })
  }
  const addExtraSpellSlot = () => {
    saveExtraSpellSlots([...extraSpellSlotsList, { id: 'ex_' + Date.now(), ring: 1, max: 1 }])
  }
  const removeExtraSpellSlot = (id) => {
    saveExtraSpellSlots(extraSpellSlotsList.filter((e) => e.id !== id))
  }
  const updateExtraSpellSlot = (id, patch) => {
    saveExtraSpellSlots(extraSpellSlotsList.map((e) => (e.id === id ? { ...e, ...patch } : e)))
  }
  const setExtraSpellSlotsMode = (mode) => {
    onSave({ extraSpellSlotsMode: mode })
  }
  const saveExtraSpellSlotsPoints = (max, current) => {
    const m = Math.max(0, Number(max) ?? 0)
    const c = Math.max(0, Math.min(m || 999, Number(current) ?? m))
    onSave({ extraSpellSlotsPoints: { max: m, current: c } })
  }
  const deductExtraSpellPoints = (ring) => {
    const cost = Math.min(9, Math.max(1, Number(ring) || 1))
    const next = Math.max(0, extraSpellSlotsPoints.current - cost)
    onSave({ extraSpellSlotsPoints: { ...extraSpellSlotsPoints, current: next } })
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
    let remaining = n
    const fromTemp = Math.min(remaining, hpTemp)
    remaining -= fromTemp
    const fromBuffTemp = Math.min(remaining, hpBuffTemp)
    remaining -= fromBuffTemp
    const newTemp = Math.max(0, hpTemp - fromTemp)
    const newBuffTemp = Math.max(0, hpBuffTemp - fromBuffTemp)
    const newCur = hpCurrent - remaining
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
    onSave({ classResources: next.map((r) => ({ id: r.id, name: r.name, current: r.current, max: r.max })) })
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

  const dexMod = abilityModifier(effectiveAbilities?.dex ?? 10)
  const init = dexMod + (buffStats?.initBonus ?? 0)
  const perception = 10 + abilityModifier(effectiveAbilities?.wis ?? 10) + Math.floor(prof * skillProfFactor(char?.skills?.perception || 'none'))
  const speedBase = (char?.speed ?? 30) + (buffStats?.speedBonus ?? 0)
  const speedPenalty = buffStats?.speedExhaustionPenalty ?? 0
  const speed = Math.max(0, Math.floor(speedBase * (buffStats?.speedMultiplier ?? 1)) - speedPenalty)

  const dsResults = deathSaves.results?.length === DEATH_SAVE_COUNT ? deathSaves.results : getDefaultDeathSaves().results
  const deathFailures = dsResults.filter((r) => r === 'failure').length
  const deathSuccesses = dsResults.filter((r) => r === 'success').length
  const effectiveTemp = hpTemp + hpBuffTemp
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
      className={`rounded-xl border border-white/10 bg-gradient-to-b from-[#243147]/35 to-[#1f2a3d]/30 p-3 space-y-3 ${COMBAT_ROOT_OUTER_SHADOW}`}
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
                （含 {effectiveTemp} 临时{hpBuffTemp > 0 ? `，BUFF ${hpBuffTemp}` : ''}）
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
          className={`rounded-lg border border-white/10 bg-gradient-to-b from-[#2a3952]/26 to-[#222f45]/22 p-3 min-h-[4rem] flex items-center justify-center gap-2 ${COMBAT_INNER_RIM_ONLY}`}
        >
          <span className="text-gray-400 text-2xl font-medium">速度</span>
          <span className="text-gray-600 text-2xl">|</span>
          <span className="text-white font-bold text-4xl font-mono">{speed} 尺</span>
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
                {canEdit && (
                  <button type="button" onClick={() => setIsAddingResource(true)} className="text-white text-xs font-bold uppercase tracking-wider hover:underline shrink-0">
                    + 添加
                  </button>
                )}
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
                            <div className="min-w-0 flex items-center px-0.5 py-0.5 rounded-l border border-gray-600 border-r-0 bg-gray-800/80">
  <span className="text-dnd-text-body text-sm font-medium truncate">{r.name}</span>
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
                          <div className="min-w-0 flex items-center px-0.5 py-0.5 rounded-l border border-gray-600 border-r-0 bg-gray-800/80">
                            <span className="text-dnd-text-body text-sm font-medium truncate">{r.name}</span>
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
                {char.psychicCollapseEcho.source === 'extraPoints' ? ' · 上次为额外点数' : ''}
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
                      const { baseMax: max, baseCur: cur } = getSlotSplit(ring)
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
              <div className="flex min-w-0 w-full flex-wrap items-stretch gap-2 border-t border-white/10 pt-2 sm:gap-3">
                <div className="flex shrink-0 flex-col justify-center border-r border-white/15 pr-2 sm:pr-3">
                  <span className="text-dnd-text-muted text-xs font-bold uppercase tracking-wide sm:text-sm">额外环位</span>
                </div>
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
                  {extraSpellSlotsMode === 'points' && extraSpellSlotsPoints.max > 0 && (
                    <div className="flex min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="shrink-0 font-mono text-sm tabular-nums text-gray-300">
                        {extraSpellSlotsPoints.current}/{extraSpellSlotsPoints.max}
                      </span>
                      <div
                        className="flex min-h-9 min-w-0 flex-1 flex-row items-center basis-[min(100%,24rem)] sm:basis-auto"
                        role="group"
                        aria-label="额外环位点数：按环阶扣除"
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].flatMap((r, idx) => {
                          const numeralClass = 'text-[8px] sm:text-[9px] tabular-nums'
                          const canPay = extraSpellSlotsPoints.current >= r
                          const sep =
                            idx > 0 ? (
                              <div
                                key={`extra-sep-${r}`}
                                className="mx-0.5 h-5 w-px shrink-0 self-center bg-white/20 sm:mx-1"
                                aria-hidden
                              />
                            ) : null
                          const btn = (
                            <button
                              key={r}
                              type="button"
                              onClick={() => deductExtraSpellPoints(r)}
                              disabled={!canPay}
                              className="touch-manipulation flex min-h-9 min-w-0 flex-1 basis-0 items-center justify-center px-0.5 disabled:cursor-not-allowed"
                              title={canPay ? `施放${r}环法术，扣 ${r} 点` : `点数不足（需 ${r} 点）`}
                              aria-label={canPay ? `扣除 ${r} 点施放${r}环` : `点数不足，无法施放${r}环`}
                            >
                              <span
                                className={`flex aspect-square max-h-7 w-full max-w-full min-w-[10px] items-center justify-center rounded-full border-2 px-px font-bold leading-none tracking-tight transition-colors ${numeralClass} ${
                                  canPay
                                    ? 'border-dnd-gold/55 bg-dnd-gold/15 text-dnd-gold-light shadow-[0_0_4px_rgba(212,184,120,0.12)] hover:border-dnd-gold-light hover:bg-dnd-gold/25'
                                    : 'border-gray-600 bg-transparent text-gray-600 opacity-70'
                                }`}
                              >
                                {r}
                              </span>
                            </button>
                          )
                          return sep ? [sep, btn] : [btn]
                        })}
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setShowExtraSlotsModal(true)}
                          className="touch-manipulation shrink-0 rounded-full border border-gray-500/80 bg-gray-800/40 px-3 py-1.5 text-xs text-gray-300 hover:border-dnd-gold/40 hover:bg-gray-700/60 hover:text-dnd-gold-light"
                        >
                          设置
                        </button>
                      )}
                    </div>
                  )}
                  {extraSpellSlotsMode === 'slots' && extraSpellSlotsList.length > 0 && (
                    <div className="flex min-w-0 flex-row flex-wrap items-center gap-x-2 gap-y-1">
                      <div
                        className="flex min-h-9 min-w-0 flex-1 flex-row items-center basis-[min(100%,24rem)] sm:basis-auto"
                        role="group"
                        aria-label="额外环位，按环位分开展示"
                      >
                        {visibleExtraRings.flatMap((r, idx) => {
                          const { extraMax, extraCur } = getSlotSplit(r)
                          const numeralClass = 'text-[8px] sm:text-[9px] tabular-nums'
                          const sep =
                            idx > 0 ? (
                              <div
                                key={`extra-slot-sep-${r}`}
                                className="mx-0.5 h-5 w-px shrink-0 self-center bg-white/20 sm:mx-1"
                                aria-hidden
                              />
                            ) : null
                          const out = []
                          if (sep) out.push(sep)
                          for (let i = 0; i < extraMax; i++) {
                            const remainingIfClick = i + 1
                            const isFilled = i < extraCur
                            const tip =
                              remainingIfClick === 1 && extraCur === 1
                                ? '点击后额外环位剩余 0'
                                : `点击后额外环位剩余 ${remainingIfClick}/${extraMax}`
                            out.push(
                              canEdit ? (
                                <button
                                  key={`extra-slot-${r}-${i}`}
                                  type="button"
                                  onClick={() => {
                                    if (remainingIfClick === 1 && extraCur === 1) setExtraSlotCurrent(r, 0)
                                    else setExtraSlotCurrent(r, remainingIfClick)
                                  }}
                                  className="touch-manipulation flex min-h-9 min-w-0 flex-1 basis-0 items-center justify-center px-0.5"
                                  title={`${r}环额外 · ${tip}`}
                                  aria-label={`${r}环额外 · ${tip}`}
                                >
                                  <span
                                    className={`flex aspect-square max-h-7 w-full max-w-full min-w-[10px] items-center justify-center rounded-full border-2 px-px font-bold leading-none tracking-tight ${numeralClass} ${
                                      isFilled
                                        ? 'border-sky-300 bg-sky-400/35 text-sky-100 shadow-[0_0_6px_rgba(125,211,252,0.25)]'
                                        : 'border-sky-700/70 bg-transparent text-sky-600/90'
                                    }`}
                                  >
                                    {r}
                                  </span>
                                </button>
                              ) : (
                                <div
                                  key={`extra-slot-${r}-${i}`}
                                  className="flex min-h-9 min-w-0 flex-1 basis-0 items-center justify-center px-0.5"
                                  aria-hidden
                                >
                                  <span
                                    className={`flex aspect-square max-h-7 w-full max-w-full min-w-[10px] items-center justify-center rounded-full border-2 px-px font-bold leading-none tracking-tight ${numeralClass} ${
                                      isFilled
                                        ? 'border-sky-300 bg-sky-400/35 text-sky-100'
                                        : 'border-sky-700/70 bg-transparent text-sky-600/90'
                                    }`}
                                  >
                                    {r}
                                  </span>
                                </div>
                              ),
                            )
                          }
                          return out
                        })}
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() => setShowExtraSlotsModal(true)}
                          className="touch-manipulation shrink-0 rounded-full border border-gray-500/80 bg-gray-800/40 px-3 py-1.5 text-xs text-gray-300 hover:border-dnd-gold/40 hover:bg-gray-700/60 hover:text-dnd-gold-light"
                        >
                          设置
                        </button>
                      )}
                    </div>
                  )}
                  {((extraSpellSlotsMode === 'slots' && extraSpellSlotsList.length === 0 && !canEdit) ||
                    (extraSpellSlotsMode === 'points' && extraSpellSlotsPoints.max === 0 && !canEdit)) && (
                    <span className="text-gray-500">—</span>
                  )}
                  {extraSpellSlotsMode === 'slots' && extraSpellSlotsList.length === 0 && canEdit && (
                    <button
                      type="button"
                      onClick={() => setShowExtraSlotsModal(true)}
                      className="touch-manipulation shrink-0 rounded-full border border-gray-500/80 bg-gray-800/40 px-3 py-1.5 text-xs text-gray-300 hover:border-dnd-gold/40 hover:bg-gray-700/60 hover:text-dnd-gold-light"
                    >
                      设置
                    </button>
                  )}
                  {extraSpellSlotsMode === 'points' && extraSpellSlotsPoints.max === 0 && canEdit && (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-gray-500 text-sm">未启用点数额外环位</span>
                      <button
                        type="button"
                        onClick={() => setShowExtraSlotsModal(true)}
                        className="touch-manipulation shrink-0 rounded-full border border-gray-500/80 bg-gray-800/40 px-3 py-1.5 text-xs text-gray-300 hover:border-dnd-gold/40 hover:bg-gray-700/60 hover:text-dnd-gold-light"
                      >
                        设置
                      </button>
                    </div>
                  )}
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
            const isPhysical = cm.type === 'physical'
            const isItem = cm.type === 'item'
            const itemMeanOpt = isItem && cm.itemInventoryIndex != null ? itemMeansFromInv.find((x) => x.index === cm.itemInventoryIndex) : null
            const weaponOpt = isPhysical && cm.weaponInventoryIndex != null ? weaponsFromInv.find((w) => w.index === cm.weaponInventoryIndex) : null
            const physStats = isPhysical && weaponOpt
              ? computePhysicalWeaponStats(cm, weaponOpt, {
                  effectiveAbilities,
                  prof,
                  spellAbility,
                  buffStats,
                  flatBuffEffects,
                  itemFormulaContext,
                })
              : null
            const attackParsed = physStats?.attackParsed ?? (weaponOpt ? parseWeaponAttack(getWeaponAttackStringForParsing(weaponOpt, cm.weaponVersatileMode)) : { dice: null, diceList: [], type: '—' })
            const rawDamageType = physStats?.rawDamageType ?? (cm.damageType || attackParsed.type)
            const spellAbilityOverride = physStats?.weaponAbilityKind
              ? null
              : getSpellAbilityForAttackFromBuffs(flatBuffEffects, {
                  weaponProto: weaponOpt?.proto,
                  damageType: rawDamageType,
                  sourceItemInventoryId: weaponOpt?.entry?.id,
                })
            const weaponAbilityKind = physStats?.weaponAbilityKind ?? resolvePhysicalWeaponAbilityKind(cm, weaponOpt, spellAbilityOverride)
            const abilityKey = physStats?.abilityKey ?? (weaponAbilityKind === 'spell' ? spellAbility : weaponAbilityKind)
            const abilityMod = physStats?.abilityMod ?? abilityModifier(effectiveAbilities?.[abilityKey] ?? 10)
            const isRangedWeapon = physStats?.isRangedWeapon ?? (weaponOpt ? isRangedWeaponProto(weaponOpt.proto) : false)
            const weaponCategoryAttackFlat = physStats?.weaponCategoryAttackFlat ?? (weaponOpt?.proto
              ? sumWeaponCategoryAttackDamageBonus(buffStats?.weaponCategoryAttackDamageBonuses ?? [], weaponOpt.proto)
              : 0)
            const buffAttackBonus = physStats?.buffAttackBonus ?? ((isRangedWeapon ? (buffStats?.rangedAttackBonus ?? 0) : (buffStats?.meleeAttackBonus ?? 0)) + weaponCategoryAttackFlat)
            const buffDamageBonus = physStats?.buffDamageBonus ?? ((isRangedWeapon ? (buffStats?.rangedDamageBonus ?? 0) : (buffStats?.meleeDamageBonus ?? 0)) + weaponCategoryAttackFlat)
            const weaponProficient = physStats?.weaponProficient ?? (cm.weaponProficient !== false)
            const gains = physStats?.gains ?? getEnabledGains(cm)
            const gainAttackBonus = physStats?.gainAttackBonus ?? sumGainAttackBonus(gains)
            const gainDamageBonus = physStats?.gainDamageBonus ?? sumGainDamageBonus(gains)
            const gainPerDieBonus = physStats?.gainPerDieBonus ?? sumGainPerDieBonus(gains)
            const gainExtraDice = physStats?.gainExtraDice ?? getGainExtraDice(gains)
            const gainAdvantage = physStats?.gainAdvantage ?? getGainAdvantage(gains)
            const gainDiceFloor2 = physStats?.gainDiceFloor2 ?? hasGainDiceFloor2(gains)
            const conditionalBonuses = physStats?.conditionalBonuses ?? (isPhysical
              ? calculateConditionalAttackDamageBonus(cm, flatBuffEffects, {
                  weaponProto: weaponOpt?.proto,
                  damageType: rawDamageType,
                  sourceItemInventoryId: weaponOpt?.entry?.id,
                }, itemFormulaContext)
              : { attackBonus: 0, damageBonus: 0 })
            const physicalAttackBonus = physStats?.physicalAttackBonus ?? (abilityMod + (weaponProficient ? prof : 0) + buffAttackBonus + gainAttackBonus + (conditionalBonuses?.attackBonus || 0))
            const damageMod = physStats?.damageMod ?? abilityMod
            const weaponExtraDiceStrings = physStats?.weaponExtraDiceStrings ?? [...getMergedWeaponExtraDiceStrings(cm, weaponOpt), ...gainExtraDice]
            const allWeaponDiceCount = physStats?.allWeaponDiceCount ?? ((attackParsed.diceList || []).reduce((s, d) => s + (parseCombatDiceExpression(d)?.count || 0), 0) +
              weaponExtraDiceStrings.reduce((s, d) => s + (parseCombatDiceExpression(String(d).split(' ')[0])?.count || 0), 0))
            const weaponPerDieMod = physStats?.weaponPerDieMod ?? (gainPerDieBonus * allWeaponDiceCount)
            const totalDamageMod = physStats?.totalDamageMod ?? (damageMod + buffDamageBonus + gainDamageBonus + weaponPerDieMod + (conditionalBonuses?.damageBonus || 0))
            const displayDamageType = physStats?.displayDamageType ?? (rawDamageType ? getDamageTypeLabel(rawDamageType) : '—')
            const isSpellAttack = cm.type === 'spell_attack'
            const spellOpt = !isPhysical && !isItem && !isSpellAttack && cm.spellId ? preparedSpellsList.find((p) => p.spellId === cm.spellId) : null
            const spell = spellOpt?.spell
            const spellDesc = spell?.description ?? ''
            const spellIsAttack = spellUsesAttack(spellDesc)
            const spellDamageList = spell ? parseSpellDamageFromDescription(spellDesc) : []

            /* 无效项（仅会显示 — 的模块）不渲染，避免出现空白卡片 */
            if (isItem && !itemMeanOpt) return null
            if (isPhysical && !weaponOpt) return null
            if (!isPhysical && !isItem && !isSpellAttack && !spellOpt) return null

            return (
              <div
                key={cm.id}
                className={`rounded-lg border border-gray-600 bg-gray-800/80 p-2 ${COMBAT_LIST_ROW_SHADOW}`}
              >
                {isItem && itemMeanOpt ? (
                  <div className={COMBAT_MEAN_ROW_GRID}>
                    <div className="col-span-5 flex items-center gap-1 min-w-0 pr-2">
                      <ActionLabelBadge source="1 动作" />
                      <span className={`text-white font-medium ${CM_MEAN_HI} truncate min-w-0`}>{itemMeanOpt.name}</span>
                      {canEdit && (
                        <button type="button" onClick={() => openEditItemMean(cm)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-600 text-gray-400 hover:text-dnd-gold-light shrink-0" title="编辑道具攻击">
                          <Pencil size={12} />
                        </button>
                      )}
                    </div>
                    {itemMeanOpt.kind === 'explosive' ? (
                      (() => {
                        const currentEntry = char?.inventory?.[cm.itemInventoryIndex]
                        const currentQty = currentEntry != null ? Math.max(0, Number(currentEntry.qty) ?? 1) : 0
                        const c = 'pl-2 border-l border-gray-600 flex items-center gap-x-1 min-w-0 overflow-hidden'
                        return (
                          <>
                            <div className="col-span-4 pl-2 border-l border-gray-600 flex min-w-0 flex-col gap-0.5 overflow-hidden sm:flex-row sm:items-center sm:gap-x-3">
                              <span className="flex min-w-0 items-center gap-x-1"><span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>抛距</span><span className={`text-white ${CM_MEAN_HI} truncate`}>{itemMeanOpt.攻击距离 || '—'}{/^\d+$/.test(String(itemMeanOpt.攻击距离 || '').trim()) ? '尺' : ''}</span></span>
                              <span className="flex min-w-0 items-center gap-x-1"><span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>爆炸半径</span><span className={`text-white ${CM_MEAN_HI} truncate`}>{itemMeanOpt.爆炸半径 != null ? `${itemMeanOpt.爆炸半径}尺` : '—'}</span></span>
                            </div>
                            <div className={`${c} col-span-4`}><span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>命中</span><span className={`text-white ${CM_MEAN_HI} truncate`}>—</span></div>
                            {(() => {
                              const explosiveDiceCount = (() => { const p = parseCombatDiceExpression((itemMeanOpt.dice || '').trim()); return p ? p.count : 0 })()
                              const explosiveDamageMod = gainDamageBonus + gainPerDieBonus * explosiveDiceCount
                              const explosiveExtraText = gainExtraDice.length ? (' + ' + gainExtraDice.join(' + ')) : ''
                              const explosiveModText = (explosiveDamageMod !== 0 && itemMeanOpt.dice) ? ` ${formatSignedModifier(explosiveDamageMod)}` : ''
                              const damageText = itemMeanOpt.dice ? `${(itemMeanOpt.dice || '').toUpperCase()} ${itemMeanOpt.damageType || ''}${explosiveExtraText}${explosiveModText}`.trim() : (gainExtraDice.length ? gainExtraDice.join(' + ') : '—')
                              return (
                                <div className={`${c} col-span-10 flex flex-wrap items-center gap-x-1 gap-y-1`}>
                                  <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>伤害</span>
                                  <span className={`text-white font-mono ${CM_MEAN_HI} truncate whitespace-nowrap min-w-0`}>{damageText}</span>
                                  <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>数量</span>
                                  <span className={`text-white ${CM_MEAN_HI} tabular-nums`}>{currentQty}</span>
                                  {itemMeanOpt.dice && currentQty > 0 && (
                                    <button type="button" onClick={() => setExplosiveUsePending({ inventoryIndex: itemMeanOpt.index, name: itemMeanOpt.name, diceExpr: itemMeanOpt.dice, damageType: itemMeanOpt.damageType, gains: getEnabledGains(cm) })} className={CM_BTN_GOLD} title={quickRollTitle('投掷伤害（使用后扣 1 数量）')} aria-label={quickRollTitle('投掷伤害（使用后扣 1 数量）')}>
                                      <QuickRollIcon kind="damage" className={CM_DICE_IC_GOLD} />
                                    </button>
                                  )}
                                </div>
                              )
                            })()}
                            <div className="col-span-1 pl-1 border-l border-gray-600 flex items-center justify-end gap-0.5 shrink-0 min-w-0">
                              {canEdit && (
                                <button type="button" onClick={() => removeCombatMean(cm.id)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red shrink-0" title="移除">
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </>
                        )
                      })()
                    ) : itemMeanOpt.kind === 'scroll' ? (
                      (() => {
                        const currentEntry = char?.inventory?.[cm.itemInventoryIndex]
                        const currentQty = currentEntry != null ? Math.max(0, Number(currentEntry.qty) ?? 1) : 0
                        const c = 'pl-2 border-l border-gray-600 flex items-center gap-x-1 min-w-0 overflow-hidden'
                        return (
                          <>
                            <div className="col-span-[16] pl-2 border-l border-gray-600 min-h-7 min-w-0" aria-hidden />
                            <div className={`${c} col-span-2 justify-center`}><span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>数量</span><span className={`text-white ${CM_MEAN_HI} tabular-nums`}>{currentQty}张</span></div>
                            <div className="col-span-1 pl-1 border-l border-gray-600 flex items-center justify-end gap-0.5 shrink-0 min-w-0">
                              {currentQty > 0 && (
                                <button type="button" onClick={() => useScroll(itemMeanOpt.index)} className={CM_BTN_RED} title={quickRollTitle('使用卷轴（消耗 1 张）')} aria-label={quickRollTitle('使用卷轴（消耗 1 张）')}>
                                  <QuickRollIcon kind="damage" />
                                </button>
                              )}
                              {canEdit && (
                                <button type="button" onClick={() => removeCombatMean(cm.id)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red shrink-0" title="移除">
                                  <Trash2 size={12} />
                                </button>
                              )}
                            </div>
                          </>
                        )
                      })()
                    ) : (() => {
                      const currentEntry = char?.inventory?.[cm.itemInventoryIndex]
                      const currentCharge = currentEntry != null ? Math.max(0, Number(currentEntry.charge) ?? 0) : 0
                      const containedSpell = currentEntry?.effects?.find((e) => e.effectType === 'contained_spell')?.value
                      const cs = normalizeContainedSpellValue(containedSpell, currentEntry?.charge)
                      const chargeMaxRaw = itemMeanOpt.chargeMax || currentEntry?.chargeMax || cs?.totalCharges || 0
                      const chargeMax = chargeMaxRaw > 0 ? chargeMaxRaw : (currentCharge > 0 ? currentCharge : 0)
                      const hasSpells = cs.spells.length > 0
                      const selectedSub = hasSpells
                        ? (cs.spells.find((s) => {
                            const sel = focusSpellMap[cm.itemInventoryIndex]
                            if (!sel) return false
                            return (sel.spellId && sel.spellId === s.spellId && sel.spellName === s.spellName) ||
                              (!sel.spellId && sel.spellName === s.spellName)
                          }) || cs.spells.find((s) => (s.cost || 1) <= currentCharge) || cs.spells[0])
                        : null
                      const level = Math.max(0, Math.min(9, Number(selectedSub?.level) ?? 0))
                      const itemProto = currentEntry?.itemId ? getItemById(currentEntry.itemId) : null
                      const useWandScrollTable = !!(itemProto && (/魔杖|卷轴/.test(itemProto.类别 || '') || itemProto.子类型 === '卷轴'))
                      const basePower = useWandScrollTable ? getWandScrollSpellPower(level) : null
                      const evalContext = { abilities: effectiveAbilities, level, prof, spellDC, spellAttack: spellAttackBonus }
                      const entrySpellBonus = getEntrySpellPowerBonus(currentEntry, char, evalContext)
                      const focusSpellAttackForMean = basePower
                        ? basePower.attackBonus + entrySpellBonus.atk + gainAttackBonus
                        : (spellAttackBonus != null ? spellAttackBonus + entrySpellBonus.atk + gainAttackBonus : null)
                      const focusDcForMean = basePower
                        ? basePower.dc + entrySpellBonus.dc
                        : (spellDC != null ? spellDC + entrySpellBonus.dc : null)
                      const hitRes = selectedSub?.hitResolution && (HIT_RESOLUTION_LABELS[selectedSub.hitResolution] || selectedSub.hitResolution === 'none') ? selectedSub.hitResolution : 'dex_save'
                      const hitLabel = HIT_RESOLUTION_LABELS[hitRes]
                      const hitText = hitRes === 'none'
                        ? ((selectedSub?.range || '').trim() || '—')
                        : hitRes === 'spell_attack'
                          ? `${hitLabel} ${focusSpellAttackForMean != null ? (focusSpellAttackForMean >= 0 ? '+' : '') + focusSpellAttackForMean : '—'}`
                          : `${hitLabel} DC ${focusDcForMean != null ? focusDcForMean : '—'}`
                      const dCount = Math.max(0, Number(selectedSub?.damageDiceCount) ?? 0)
                      const dSides = Math.max(1, Number(selectedSub?.damageDiceSides) ?? 6)
                      const damageDiceText = dCount > 0 ? `${dCount}d${dSides}` : ''
                      const damageTypeLabel = selectedSub?.damageType ? getDamageTypeLabel(selectedSub.damageType) : ''
                      const focusSpellDamageExtras = getSpellDamageBonusExtras(selectedSub?.damageType, buffStats?.spellDamageBonuses, itemFormulaContext)
                      const focusDamageMod = gainDamageBonus + gainPerDieBonus * dCount + focusSpellDamageExtras.perDieBonus * dCount + focusSpellDamageExtras.flatBonus
                      const focusAllExtraDice = [...gainExtraDice, ...focusSpellDamageExtras.extraDice]
                      const focusExtraText = focusAllExtraDice.length ? (' + ' + focusAllExtraDice.join(' + ')) : ''
                      const focusModText = (focusDamageMod !== 0 && damageDiceText) ? ` ${formatSignedModifier(focusDamageMod)}` : ''
                      const focusDamageFloor2 = gainDiceFloor2 || focusSpellDamageExtras.diceFloor2
                      const damageText = damageDiceText ? (damageTypeLabel ? `${damageDiceText} ${damageTypeLabel}${focusExtraText}${focusModText}` : `${damageDiceText}${focusExtraText}${focusModText}`) : (focusAllExtraDice.length ? focusAllExtraDice.join(' + ') : '—')
                      const spellRange = (selectedSub?.range != null && String(selectedSub.range).trim() !== '') ? (String(selectedSub.range).trim() + (/^\d+$/.test(String(selectedSub.range).trim()) ? '尺' : '')) : '—'
                      const cell = 'pl-2 border-l border-gray-600 flex items-center gap-x-1 min-w-0 overflow-hidden'
                      const selectedIdx = selectedSub ? cs.spells.indexOf(selectedSub) : -1
                      const canCast = currentCharge > 0 && selectedSub && (selectedSub.cost || 1) <= currentCharge
                      return (
                        <>
                          <div className={`${cell} col-span-4`}><span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>距离</span><span className={`text-white ${CM_MEAN_HI} truncate`}>{spellRange}</span></div>
                          <div className={`${cell} col-span-4`}><span className={`text-white ${CM_MEAN_HI} truncate`}>{hitText || '—'}</span></div>
                          <div className={`${cell} col-span-10 flex flex-wrap items-center gap-x-1 gap-y-1`}>
                            {hasSpells && cs.spells.length > 1 && (
                              <>
                                <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>法术</span>
                                <select
                                  value={selectedIdx >= 0 ? selectedIdx : 0}
                                  onChange={(e) => {
                                    const idx = Number(e.target.value)
                                    const sub = cs.spells[idx]
                                    if (sub) {
                                      setFocusSpellMap((prev) => ({ ...prev, [cm.itemInventoryIndex]: sub }))
                                    }
                                  }}
                                  className={inputClass + ' !text-xs h-6 py-0 px-1 min-w-0 flex-1 max-w-[140px] bg-gray-800'}
                                  title="选择要使用的内含法术"
                                >
                                  {cs.spells.map((s, idx) => (
                                    <option key={idx} value={idx}>
                                      {s.spellName?.trim() || '未命名'} · {s.level || 0}环
                                    </option>
                                  ))}
                                </select>
                              </>
                            )}
                            {hasSpells && cs.spells.length === 1 && (
                              <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>{cs.spells[0].spellName?.trim() || '内含法术'} · {cs.spells[0].level || 0}环</span>
                            )}
                            <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>伤害</span>
                            <span className={`text-white font-mono ${CM_MEAN_HI} truncate whitespace-nowrap min-w-0`}>{damageText}</span>
                            <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>充能</span>
                            <span className={`text-white font-mono ${CM_MEAN_HI} tabular-nums`}>{currentCharge}/{chargeMax}</span>
                            {canCast && (
                              <button type="button" onClick={() => setFocusUsePending({ inventoryIndex: itemMeanOpt.index, name: itemMeanOpt.name, combatMeanId: cm.id, spellSub: selectedSub, gains: getEnabledGains(cm), spellDamageExtras: focusSpellDamageExtras, damageFloor2: focusDamageFloor2 })} className={CM_BTN_RED} title={quickRollTitle(`法器投掷（确认后扣 ${selectedSub?.cost || 1} 充能）`)} aria-label={quickRollTitle(`法器投掷（确认后扣 ${selectedSub?.cost || 1} 充能）`)}>
                                <QuickRollIcon kind="damage" className={CM_DICE_IC_GOLD} />
                              </button>
                            )}
                          </div>
                          <div className="col-span-1 pl-1 border-l border-gray-600 flex items-center justify-end gap-0.5 shrink-0 min-w-0">
                            {canEdit && (
                              <button type="button" onClick={() => removeCombatMean(cm.id)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red shrink-0" title="移除">
                                <Trash2 size={12} />
                              </button>
                            )}
                          </div>
                        </>
                      )
                    })()}
                  </div>
                ) : isSpellAttack ? (
                  (() => {
                    const matchedSpell = getMergedSpells().find((s) => s.id === cm.spellId || (s.name && s.name.trim() === (cm.spellName || '').trim()))
                    const hitRes = cm.hitResolution && HIT_RESOLUTION_LABELS[cm.hitResolution] ? cm.hitResolution : 'spell_attack'
                    const hitLabel = HIT_RESOLUTION_LABELS[hitRes]
                    const spellConditionalBonuses = calculateConditionalAttackDamageBonus(cm, flatBuffEffects, {
                      damageType: cm.damageTypeSpell,
                    }, itemFormulaContext)
                    const spellAttackForMean = spellAttackBonus != null ? spellAttackBonus + gainAttackBonus + (spellConditionalBonuses?.attackBonus || 0) : null
                    const hitValue = hitRes === 'spell_attack' ? (spellAttackForMean != null ? (spellAttackForMean >= 0 ? '+' : '') + spellAttackForMean : null) : (spellDC != null ? spellDC : null)
                    /** 战斗手段行内空间有限，法术攻击用简称「法攻」避免截断 */
                    const hitLabelShort = hitRes === 'spell_attack' ? '法攻' : hitLabel
                    const hitText = hitRes === 'spell_attack' ? (hitValue != null ? `${hitLabelShort} ${hitValue}` : '—') : (hitValue != null ? `${hitLabel} DC ${hitValue}` : '—')
                    const spellDiceCount = (() => { const p = parseCombatDiceExpression((cm.damageDice || '').trim()); return p ? p.count : 0 })()
                    const spellDamageExtras = getSpellDamageBonusExtras(cm.damageTypeSpell, buffStats?.spellDamageBonuses, itemFormulaContext)
                    const spellDamageMod = gainDamageBonus + gainPerDieBonus * spellDiceCount + (spellConditionalBonuses?.damageBonus || 0) + spellDamageExtras.perDieBonus * spellDiceCount + spellDamageExtras.flatBonus
                    const baseDamageText = (cm.damageDice || '').trim() ? ((cm.damageDice || '').toUpperCase() + (cm.damageTypeSpell ? ' ' + getDamageTypeLabel(cm.damageTypeSpell) : '')) : ''
                    const allSpellExtraDice = [...gainExtraDice, ...spellDamageExtras.extraDice]
                    const extraDamageText = allSpellExtraDice.length ? (' + ' + allSpellExtraDice.join(' + ')) : ''
                    const modDamageText = (spellDamageMod !== 0 && baseDamageText) ? ` ${formatSignedModifier(spellDamageMod)}` : ''
                    const damageText = baseDamageText ? `${baseDamageText}${extraDamageText}${modDamageText}` : (allSpellExtraDice.length ? allSpellExtraDice.join(' + ') : '—')
                    const spellDamageFloor2 = gainDiceFloor2 || spellDamageExtras.diceFloor2
                    const cell = 'pl-2 border-l border-gray-600 flex items-center gap-x-1 min-w-0 overflow-hidden'
                    const empty = 'pl-2 border-l border-gray-600 min-w-0 overflow-hidden'
                    return (
                      <div className={COMBAT_MEAN_ROW_GRID}>
                        <div className="col-span-5 flex items-center gap-1 min-w-0 pr-2">
                          <ActionLabelBadge source={matchedSpell?.castingTime || ''} />
                          <span className={`text-white font-medium ${CM_MEAN_HI} truncate min-w-0`}>{cm.spellName || '法术攻击'}</span>
                          {canEdit && (
                            <button type="button" onClick={() => openEditSpellAttack(cm)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-600 text-gray-400 hover:text-dnd-gold-light shrink-0" title="编辑法术">
                              <Pencil size={12} />
                            </button>
                          )}
                        </div>
                        <div className={`${empty} col-span-4`}><span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>距离</span><span className={`text-white ${CM_MEAN_HI} truncate`}>—</span></div>
                        <div className={`${cell} col-span-4 flex items-center gap-x-1.5 min-w-0`}>
                          <span className={`text-white ${CM_MEAN_HI} truncate min-w-0`}>{hitText}</span>
                          {hitRes === 'spell_attack' && spellAttackForMean != null && (
                            <button type="button" onClick={() => { if (!consumeSpellSlotForMean(cm, cm.spellName || '法术')) return; openForCheck((cm.spellName || '法术攻击') + ' 法术攻击', spellAttackForMean, { quickRoll: true, advantage: gainAdvantage }) }} className={CM_BTN_RED} title={quickRollTitle('法术攻击')} aria-label={quickRollTitle('法术攻击')}>
                              <QuickRollIcon kind="d20" />
                            </button>
                          )}
                        </div>
                        <div className="col-span-10 pl-2 border-l border-gray-600 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
                          <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>伤害</span>
                          <span className={`min-w-0 flex-1 font-mono ${CM_MEAN_HI} tabular-nums text-white whitespace-nowrap sm:truncate`}>{damageText}</span>
                          {(cm.damageDice || '').trim() && (
                            <>
                              <button
                                type="button"
                                onClick={() => { if (!consumeSpellSlotForMean(cm, cm.spellName || '法术')) return; rollDamageDice((cm.damageDice || '').trim(), (cm.spellName || '法术') + ' ' + (getDamageTypeLabel(cm.damageTypeSpell) || ''), 'spell_attack-' + cm.id, spellDamageMod, false, getDamageTypeLabel(cm.damageTypeSpell) || '', { extraDice: allSpellExtraDice, floor2: spellDamageFloor2 }) }}
                                className={CM_BTN_GOLD}
                                title={quickRollTitle('伤害')}
                                aria-label={quickRollTitle('伤害')}
                              >
                                <QuickRollIcon kind="damage" className={CM_DICE_IC_GOLD} />
                              </button>
                              {hitRes === 'spell_attack' && (
                                <button
                                  type="button"
                                  onClick={() => { if (!consumeSpellSlotForMean(cm, cm.spellName || '法术')) return; rollDamageDice((cm.damageDice || '').trim(), (cm.spellName || '法术') + ' ' + (getDamageTypeLabel(cm.damageTypeSpell) || ''), 'spell_attack-' + cm.id, spellDamageMod, true, getDamageTypeLabel(cm.damageTypeSpell) || '', { extraDice: allSpellExtraDice, floor2: spellDamageFloor2 }) }}
                                  className={CM_BTN_CRIT}
                                  title={quickRollTitle('伤害（重击×2伤害骰）')}
                                  aria-label={quickRollTitle('伤害（重击×2伤害骰）')}
                                >
                                  <QuickRollIcon kind="crit" className={CM_DICE_IC_GOLD} />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                        <div className="col-span-1 pl-1 border-l border-gray-600 flex items-center justify-end gap-0.5 shrink-0 min-w-0">
                          {canEdit && (
                            <button type="button" onClick={() => removeCombatMean(cm.id)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red shrink-0" title="移除">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })()
                ) : isPhysical ? (
                  <div className={COMBAT_MEAN_ROW_GRID}>
                    <div className="col-span-5 flex items-center gap-1 min-w-0 pr-2">
                      <ActionLabelBadge source="1 动作" />
                      <span className={`text-white font-medium ${CM_MEAN_HI} truncate min-w-0`}>{(weaponOpt?.name ?? '—') + (cm.weaponNameSuffix ? String(cm.weaponNameSuffix).trim() : '')}</span>
                      {canEdit && (
                        <button type="button" onClick={() => openEditWeaponMean(cm)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-gray-600 text-gray-400 hover:text-dnd-gold-light shrink-0" title="编辑武器">
                          <Pencil size={12} />
                        </button>
                      )}
                    </div>
                    {weaponOpt && (
                      (() => {
                        const weaponCritDiceMult = getCritDamageDiceMultiplierFromItemEntry(weaponOpt.entry, itemFormulaContext)
                        const weaponCritThreatMin = getCritThreatMinNaturalFromItemEntry(weaponOpt.entry)
                        const isRanged = weaponOpt.proto?.子类型 === '远程'
                        const entryAttackDist = (weaponOpt.entry?.攻击距离 ?? '').toString().trim()
                        const protoAttackDist = (weaponOpt.proto?.攻击距离 ?? '').toString().trim()
                        const entryNote = (weaponOpt.entry?.附注 ?? '').trim()
                        const protoNote = (weaponOpt.proto?.附注 ?? '').trim()
                        const entryRangeMatch = entryNote.match(/(\d+\s*\/\s*\d+)/)
                        const manualRangeFromNote = entryRangeMatch ? entryRangeMatch[1].replace(/\s+/g, '') : ''
                        const { range: entryNoteRange } = parseWeaponNoteToTraits(entryNote)
                        const { range: protoNoteRange } = parseWeaponNoteToTraits(protoNote)
                        const mergedNote = (entryNote || protoNote || '').trim()
                        // 射程显示优先手动输入（装备条目）→ 词条默认（武器库）→ 近战兜底
                        const explicitRange = entryAttackDist || manualRangeFromNote || entryNoteRange || protoAttackDist || protoNoteRange
                        const rangeDisplay = explicitRange
                          ? (entryAttackDist || manualRangeFromNote || entryNoteRange || protoAttackDist || protoNoteRange || '—')
                          : (isRanged ? '—' : (/触及/.test(mergedNote) ? '触及10尺' : '触及'))
                        return (
                      <>
                        <div className="col-span-4 pl-2 border-l border-gray-600 flex items-center gap-x-1 min-w-0 overflow-hidden">
                          <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>射程</span>
                          <span className={`text-white ${CM_MEAN_HI} truncate`}>{rangeDisplay}</span>
                        </div>
                        <div className="col-span-4 pl-2 border-l border-gray-600 flex items-center gap-x-1.5 min-w-0 overflow-hidden">
                          <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>攻击</span>
                          <span className={`text-white font-mono ${CM_MEAN_HI} tabular-nums truncate`}>{physicalAttackBonus >= 0 ? '+' : ''}{physicalAttackBonus}</span>
                          <button type="button" onClick={() => openForCheck(weaponOpt.name + ' 攻击', physicalAttackBonus, { quickRoll: true, critThreatMinNatural: weaponCritThreatMin, advantage: gainAdvantage })} className={CM_BTN_RED} title={quickRollTitle('攻击')} aria-label={quickRollTitle('攻击')}>
                            <QuickRollIcon kind="d20" />
                          </button>
                        </div>
                        <div className="col-span-10 pl-2 border-l border-gray-600 flex min-w-0 flex-wrap items-center gap-x-1 gap-y-1">
                          <span className={`text-dnd-text-muted ${CM_MEAN_LABEL} shrink-0`}>伤害</span>
                          <span className={`min-w-0 flex-1 font-mono ${CM_MEAN_HI} tabular-nums text-white whitespace-nowrap [overflow-wrap:anywhere] sm:truncate`}>
                            {formatWeaponAttackDiceDisplay(attackParsed)}
                            <span
                              title={`伤害加值明细：属性调整值 ${abilityMod >= 0 ? '+' : ''}${abilityMod}，Buff 伤害加值 ${buffDamageBonus >= 0 ? '+' : ''}${buffDamageBonus}${conditionalBonuses?.damageBonus ? `，条件范围伤害加值 ${conditionalBonuses.damageBonus >= 0 ? '+' : ''}${conditionalBonuses.damageBonus}` : ''}，增益伤害加值 ${gainDamageBonus >= 0 ? '+' : ''}${gainDamageBonus}${weaponPerDieMod !== 0 ? `，每骰加成 ${weaponPerDieMod >= 0 ? '+' : ''}${weaponPerDieMod}` : ''}`}
                              className="cursor-help"
                            >
                              {formatSignedModifier(totalDamageMod)}
                            </span>{' '}
                            {displayDamageType}
                            {filterExtraDiceAgainstMain(attackParsed, rawDamageType, weaponExtraDiceStrings).map((d) => ` + ${d}`).join('')}
                          </span>
                          {((attackParsed.diceList?.length || attackParsed.dice)
                            || filterExtraDiceAgainstMain(attackParsed, rawDamageType, weaponExtraDiceStrings).length > 0) && (
                            <>
                              <button type="button" onClick={() => rollAllWeaponDamage(cm, weaponOpt, attackParsed, totalDamageMod, displayDamageType, false)} className={CM_BTN_GOLD} title={quickRollTitle('伤害')} aria-label={quickRollTitle('伤害')}>
                                <QuickRollIcon kind="damage" />
                              </button>
                              <button type="button" onClick={() => rollAllWeaponDamage(cm, weaponOpt, attackParsed, totalDamageMod, displayDamageType, true)} className={CM_BTN_CRIT} title={quickRollTitle(`伤害（重击×${weaponCritDiceMult}伤害骰）`)} aria-label={quickRollTitle(`伤害（重击×${weaponCritDiceMult}伤害骰）`)}>
                                <QuickRollIcon kind="crit" />
                              </button>
                            </>
                          )}
                        </div>
                        <div className="col-span-1 flex min-w-0 items-center justify-end gap-0.5 pl-1 border-l border-gray-600 shrink-0">
                          {canEdit && (
                            <button type="button" onClick={() => removeCombatMean(cm.id)} className="w-6 h-6 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red shrink-0" title="移除">
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      </>
                        )
                      })()
                    )}
                  </div>
                ) : (
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
                )}
              </div>
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
          {showExtraSlotsModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => setShowExtraSlotsModal(false)}>
              <div className="rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl max-w-md w-full mx-2 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-dnd-gold-light text-sm font-bold mb-3">额外环位设置</h3>
                <div className="inline-flex rounded border border-gray-600 bg-gray-800/50 p-0.5 text-xs mb-3">
                  <button type="button" onClick={() => setExtraSpellSlotsMode('slots')} className={`px-3 py-1.5 rounded ${extraSpellSlotsMode === 'slots' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>按环位</button>
                  <button type="button" onClick={() => setExtraSpellSlotsMode('points')} className={`px-3 py-1.5 rounded ${extraSpellSlotsMode === 'points' ? 'bg-gray-600 text-white' : 'text-gray-400 hover:text-gray-200'}`}>按点数</button>
                </div>
                {extraSpellSlotsMode === 'points' && (
                  <div className="space-y-2 text-sm">
                    <p className="text-gray-500 text-xs">输入总点数，施法时 1 环扣 1 点、2 环扣 2 点，以此类推。</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-gray-400">上限</span>
                      <input type="number" min={0} value={extraSpellSlotsPoints.max || ''} onChange={(ev) => saveExtraSpellSlotsPoints(ev.target.value === '' ? 0 : parseInt(ev.target.value, 10), extraSpellSlotsPoints.current)} className={inputClass + ' w-20 h-8 text-center text-sm'} placeholder="0" />
                      <span className="text-gray-400">剩余</span>
                      <input type="number" min={0} value={extraSpellSlotsPoints.current} onChange={(ev) => saveExtraSpellSlotsPoints(extraSpellSlotsPoints.max, ev.target.value === '' ? 0 : parseInt(ev.target.value, 10))} className={inputClass + ' w-20 h-8 text-center text-sm'} />
                    </div>
                    {extraSpellSlotsPoints.max > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => (
                          <button key={r} type="button" onClick={() => deductExtraSpellPoints(r)} disabled={extraSpellSlotsPoints.current < r} className="w-8 h-8 rounded border border-gray-500 bg-gray-800/50 text-gray-300 hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed text-xs" title={`施放${r}环扣${r}点`}>−{r}</button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {extraSpellSlotsMode === 'slots' && (
                  <div className="space-y-2 text-sm">
                    <p className="text-gray-500 text-xs">为各环位分别设置额外数量，与法术环位合并显示。</p>
                    <div className="flex flex-col gap-2">
                      {extraSpellSlotsList.map((e) => (
                        <div key={e.id} className="inline-flex items-center gap-2">
                          <select value={e.ring} onChange={(ev) => updateExtraSpellSlot(e.id, { ring: Number(ev.target.value) })} className={inputClass + ' h-8 w-24 text-sm'} title={`${e.ring}环`}>
                            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => (
                              <option key={r} value={r}>{r}环</option>
                            ))}
                          </select>
                          <span className="text-gray-500">上限</span>
                          <input type="number" min={1} value={e.max} onChange={(ev) => updateExtraSpellSlot(e.id, { max: Math.max(1, parseInt(ev.target.value, 10) || 1) })} className={inputClass + ' w-16 h-8 text-center text-sm'} />
                          <button type="button" onClick={() => removeExtraSpellSlot(e.id)} className="w-7 h-7 flex items-center justify-center rounded hover:bg-red-900/50 text-gray-400 hover:text-dnd-red" title="移除">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => addExtraSpellSlot()} className="mt-1 px-2 py-1 rounded border border-dashed border-gray-500 text-gray-400 hover:bg-gray-700 text-xs">
                      + 添加一项
                    </button>
                  </div>
                )}
                <button type="button" onClick={() => setShowExtraSlotsModal(false)} className="mt-4 w-full py-2 rounded border border-gray-500 text-gray-400 hover:bg-gray-700 text-sm">
                  关闭
                </button>
              </div>
            </div>
          )}
          {showAddCombatMeanModal && (
            <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => { setEditingCombatMeanId(null); setShowWeaponExtraDiceEditor(false); setShowAddCombatMeanModal(false); }}>
              <div className="rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl max-w-sm w-full mx-2" onClick={(e) => e.stopPropagation()}>
                {addMeanStep === 'type' ? (
                  <>
                    <h3 className="text-dnd-gold-light text-sm font-bold mb-3">添加战斗手段</h3>
                    <div className="flex flex-col gap-2">
                      <button type="button" onClick={() => { const w0 = weaponsFromInv[0]; const nextIdx = w0 ? w0.index : null; setAddWeaponIndex(nextIdx); setAddAbility(w0 ? inferPhysicalWeaponAbilityFromProto(w0.proto) : 'str'); setAddDamageType(''); setAddWeaponMode(w0 ? getDefaultWeaponMode(w0) : 'one_hand'); setShowWeaponExtraDiceEditor(false); setAddMeanStep('weapon'); }} className="w-full py-2.5 rounded bg-dnd-red hover:bg-dnd-red-hover text-white font-medium text-sm">
                        武器攻击
                      </button>
                      <button type="button" onClick={() => { const first = itemMeansFromInv[0]; setAddItemIndex(first ? first.index : null); setAddMeanStep('item'); }} disabled={itemMeansFromInv.length === 0} className="w-full py-2.5 rounded bg-dnd-red hover:bg-dnd-red-hover disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-sm">
                        道具攻击
                      </button>
                      <button type="button" onClick={() => { setAddSpellAttackName(''); setAddSpellAttackSpellId(''); setAddSpellAttackHitResolution('spell_attack'); setAddSpellAttackDice(''); setAddSpellAttackDamageType(''); setAddMeanStep('spell_attack'); }} className="w-full py-2.5 rounded bg-dnd-red hover:bg-dnd-red-hover text-white font-medium text-sm">
                        法术攻击
                      </button>
                    </div>
                    {itemMeansFromInv.length === 0 && <p className="text-dnd-text-muted text-xs mt-1">背包中暂无消耗品、法器（法杖/魔杖/权杖）或卷轴时，道具攻击不可选。</p>}
                    <button type="button" onClick={() => setShowAddCombatMeanModal(false)} className="mt-3 w-full py-1.5 rounded border border-gray-500 text-gray-400 text-xs">取消</button>
                  </>
                ) : addMeanStep === 'spell_attack' ? (
                  <>
                    <h3 className="text-dnd-gold-light text-sm font-bold mb-3">{editingCombatMeanId ? '编辑法术' : '法术攻击'}</h3>
                    <p className="text-dnd-text-muted text-xs mb-2">输入法术名查找并选择，设置命中判定与伤害。</p>
                    <div className="space-y-2.5 text-sm">
                      <div>
                        <label className="block text-dnd-text-muted text-xs mb-0.5">法术名</label>
                        <input
                          type="text"
                          value={addSpellAttackName}
                          onChange={(e) => {
                            const name = e.target.value
                            setAddSpellAttackName(name)
                            if (!name.trim()) {
                              setAddSpellAttackSpellId('')
                              return
                            }
                            const spell = getMergedSpells().find((s) => s.name && s.name.trim() === name.trim())
                            if (spell) {
                              setAddSpellAttackSpellId(spell.id)
                              const lvl = Number(spell.level)
                              setAddSpellAttackSpellLevel(lvl >= 1 && lvl <= 9 ? String(lvl) : '')
                              const damages = parseSpellDamageFromDescription(spell.description ?? '')
                              const first = damages[0]
                              if (first) {
                                setAddSpellAttackDice(first.dice || '')
                                setAddSpellAttackDamageType(first.type || '')
                              }
                            } else {
                              setAddSpellAttackSpellId('')
                            }
                          }}
                          placeholder="输入以查找"
                          className={inputClass + ' w-full h-8 text-xs'}
                          list="spell-attack-spell-list"
                        />
                        <datalist id="spell-attack-spell-list">
                          {getMergedSpells()
                            .filter((s) => !addSpellAttackName.trim() || (s.name && s.name.toLowerCase().includes(addSpellAttackName.trim().toLowerCase())))
                            .slice(0, 80)
                            .map((s) => (
                              <option key={s.id} value={s.name} />
                            ))}
                        </datalist>
                      </div>
                      <div>
                        <label className="block text-dnd-text-muted text-xs mb-0.5">命中判定</label>
                        <select value={addSpellAttackHitResolution} onChange={(e) => setAddSpellAttackHitResolution(e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
                          {Object.entries(HIT_RESOLUTION_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-dnd-text-muted text-xs mb-0.5">伤害骰</label>
                        <input type="text" value={addSpellAttackDice} onChange={(e) => setAddSpellAttackDice(e.target.value)} placeholder="如 2d6" className={inputClass + ' w-full h-8 text-xs font-mono'} />
                      </div>
                      <div>
                        <label className="block text-dnd-text-muted text-xs mb-0.5">伤害类型</label>
                        <select value={addSpellAttackDamageType} onChange={(e) => setAddSpellAttackDamageType(e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
                          <option value="">—</option>
                          {DAMAGE_TYPE_OPTIONS.map((d) => (
                            <option key={d.value} value={d.value}>{d.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-dnd-text-muted text-xs mb-0.5">法术位环阶（自动扣减）</label>
                        <select value={addSpellAttackSpellLevel} onChange={(e) => setAddSpellAttackSpellLevel(e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
                          <option value="">不扣法术位</option>
                          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((lvl) => (
                            <option key={lvl} value={String(lvl)}>{lvl} 环</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-dnd-text-muted text-xs mb-0.5">目标生物类型（条件范围生效用）</label>
                        <select value={addTargetCreatureType} onChange={(e) => setAddTargetCreatureType(e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
                          <option value="">—</option>
                          {CREATURE_TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <GainEditor gains={addGains} onChange={setAddGains} />
                    <div className="flex gap-2 mt-3">
                      <button type="button" onClick={() => { setEditingCombatMeanId(null); setAddMeanStep('type'); }} className="flex-1 py-1.5 rounded border border-gray-500 text-gray-400 text-xs">上一步</button>
                      <button type="button" onClick={confirmAddSpellAttackMean} className="flex-1 py-1.5 rounded bg-dnd-red hover:bg-dnd-red-hover text-white text-xs">{editingCombatMeanId ? '保存' : '保存'}</button>
                    </div>
                  </>
                ) : addMeanStep === 'item' ? (
                  <>
                    <h3 className="text-dnd-gold-light text-sm font-bold mb-3">{editingCombatMeanId ? '编辑道具攻击' : '道具攻击'}</h3>
                    <p className="text-dnd-text-muted text-xs mb-2">从背包中的消耗品（爆炸品）、法器（法杖/魔杖/权杖）或卷轴选择一项。</p>
                    <div className="space-y-2.5 text-sm">
                      <label className="block text-dnd-text-muted text-xs mb-0.5">道具</label>
                      <select value={addItemIndex ?? ''} onChange={(e) => setAddItemIndex(e.target.value === '' ? null : parseInt(e.target.value, 10))} className={inputClass + ' w-full h-8 text-xs'}>
                        <option value="">—</option>
                        {itemMeansFromInv.map((it) => (
                          <option key={it.index} value={it.index}>{it.label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-dnd-text-muted text-xs mb-0.5">目标生物类型（条件范围生效用）</label>
                      <select value={addTargetCreatureType} onChange={(e) => setAddTargetCreatureType(e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
                        <option value="">—</option>
                        {CREATURE_TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </div>
                    <GainEditor gains={addGains} onChange={setAddGains} />
                    <div className="flex gap-2 mt-3">
                      <button type="button" onClick={() => setAddMeanStep('type')} className="flex-1 py-1.5 rounded border border-gray-500 text-gray-400 text-xs">上一步</button>
                      <button type="button" onClick={confirmAddItemMean} disabled={addItemIndex == null} className="flex-1 py-1.5 rounded bg-dnd-red hover:bg-dnd-red-hover disabled:opacity-50 text-white text-xs">{editingCombatMeanId ? '保存' : '确认'}</button>
                    </div>
                  </>
                ) : (
                  <>
                    <h3 className="text-dnd-gold-light text-sm font-bold mb-3">{editingCombatMeanId ? '编辑武器' : '武器攻击'}</h3>
                    <div className="space-y-2.5 text-sm">
                      <div>
                        <label className="block text-dnd-text-muted text-xs mb-0.5">武器</label>
                        <div className="flex items-center gap-1.5 w-full min-w-0 flex-nowrap">
                          <select value={addWeaponIndex ?? ''} onChange={(e) => { const v = e.target.value === '' ? null : parseInt(e.target.value, 10); setAddWeaponIndex(v); const w = v != null ? weaponsFromInv.find((x) => x.index === v) : null; if (w?.proto) { setAddAbility(inferPhysicalWeaponAbilityFromProto(w.proto)); const parsed = parseWeaponAttack(w.攻击); const autoType = parsed.type && parsed.type !== '—' ? parsed.type : ''; setAddDamageType(autoType); setAddWeaponMode(getDefaultWeaponMode(w)); } else { setAddDamageType(''); setAddWeaponMode('one_hand'); } }} className={inputClass + ' h-8 text-xs shrink-0 max-w-[10rem]'} disabled={!canEdit} style={{ width: 'auto', minWidth: '6rem' }}>
                            <option value="">—</option>
                            {weaponsFromInv.map((w) => (
                              <option key={w.index} value={w.index}>{w.name}</option>
                            ))}
                          </select>
                          <input type="text" value={addWeaponNameSuffix} onChange={(e) => setAddWeaponNameSuffix(e.target.value)} placeholder="追加名称" className={inputClass + ' h-8 text-xs flex-1 min-w-0'} />
                        </div>
                      </div>
                      {(() => {
                        const currentWeapon = addWeaponIndex != null ? weaponsFromInv.find((x) => x.index === addWeaponIndex) : null
                        return (
                          <div className="grid grid-cols-3 gap-2">
                            <div className="min-w-0">
                              <label className="block text-dnd-text-muted text-xs mb-0.5">战斗模式</label>
                              {(() => {
                                const modeOptions = getWeaponModeOptions(currentWeapon, char)
                                const currentLabel = modeOptions.find((o) => o.value === addWeaponMode)?.label ?? modeOptions[0]?.label ?? ''
                                if (modeOptions.length <= 1) {
                                  return (
                                    <div className={inputClass + ' w-full h-8 text-xs flex items-center text-white'}>
                                      {currentLabel || '—'}
                                    </div>
                                  )
                                }
                                return (
                                  <select value={addWeaponMode} onChange={(e) => setAddWeaponMode(e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
                                    {modeOptions.map((o) => (
                                      <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                  </select>
                                )
                              })()}
                            </div>
                            <div className="min-w-0">
                              <label className="block text-dnd-text-muted text-xs mb-0.5">属性</label>
                              {(() => {
                                const abilityOptions = getAbilityOptions(currentWeapon, addAbility)
                                const currentLabel = abilityOptions.find((o) => o.value === addAbility)?.label ?? abilityOptions[0]?.label ?? ''
                                if (abilityOptions.length <= 1) {
                                  return (
                                    <div className={inputClass + ' w-full h-8 text-xs flex items-center text-white'}>
                                      {currentLabel || '—'}
                                    </div>
                                  )
                                }
                                return (
                                  <select value={addAbility} onChange={(e) => setAddAbility(e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
                                    {abilityOptions.map((o) => (
                                      <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                  </select>
                                )
                              })()}
                            </div>
                            <div className="min-w-0">
                              <label className="block text-dnd-text-muted text-xs mb-0.5">伤害类型</label>
                              <select value={addDamageType} onChange={(e) => setAddDamageType(e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
                                <option value="">—</option>
                                {DAMAGE_TYPE_OPTIONS.map((d) => (
                                  <option key={d.value} value={d.value}>{d.label}</option>
                                ))}
                              </select>
                            </div>
                          </div>
                        )
                      })()}
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={addWeaponProficient} onChange={(e) => setAddWeaponProficient(e.target.checked)} className="rounded border-gray-500" />
                        <span className="text-dnd-text-body text-xs">武器熟练</span>
                      </label>
                      <div>
                        <label className="block text-dnd-text-muted text-xs mb-0.5">目标生物类型（条件范围生效用）</label>
                        <select value={addTargetCreatureType} onChange={(e) => setAddTargetCreatureType(e.target.value)} className={inputClass + ' w-full h-8 text-xs'}>
                          <option value="">—</option>
                          {CREATURE_TYPE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                          ))}
                        </select>
                      </div>
                      {previewWeaponStats && (
                        <div className="rounded border border-gray-600/80 bg-gray-900/40 p-2 space-y-1.5">
                          <div className="text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider">实时预览</div>
                          <div className="text-xs">
                            <span className="text-dnd-text-muted">命中</span>{' '}
                            <span className="text-white font-mono tabular-nums">{previewWeaponStats.physicalAttackBonus >= 0 ? '+' : ''}{previewWeaponStats.physicalAttackBonus}</span>
                            <span className="text-dnd-text-muted text-[10px] ml-1">
                              = 属性{previewWeaponStats.abilityMod >= 0 ? '+' : ''}{previewWeaponStats.abilityMod}
                              {' '}· 熟练{previewWeaponStats.weaponProficient ? `+${prof}` : '+0'}
                              {previewWeaponStats.buffAttackBonus !== 0 && ` · Buff${previewWeaponStats.buffAttackBonus >= 0 ? '+' : ''}${previewWeaponStats.buffAttackBonus}`}
                              {previewWeaponStats.gainAttackBonus !== 0 && ` · 增益${previewWeaponStats.gainAttackBonus >= 0 ? '+' : ''}${previewWeaponStats.gainAttackBonus}`}
                              {previewWeaponStats.conditionalBonuses?.attackBonus ? ` · 条件${previewWeaponStats.conditionalBonuses.attackBonus >= 0 ? '+' : ''}${previewWeaponStats.conditionalBonuses.attackBonus}` : ''}
                            </span>
                          </div>
                          <div className="text-xs">
                            <span className="text-dnd-text-muted">伤害</span>{' '}
                            <span className="text-white font-mono tabular-nums">
                              {formatWeaponAttackDiceDisplay(previewWeaponStats.attackParsed)}
                              {formatSignedModifier(previewWeaponStats.totalDamageMod)} {previewWeaponStats.displayDamageType}
                              {filterExtraDiceAgainstMain(previewWeaponStats.attackParsed, previewWeaponStats.rawDamageType, previewWeaponStats.weaponExtraDiceStrings).map((d) => ` + ${d}`).join('')}
                            </span>
                            <span className="text-dnd-text-muted text-[10px] ml-1">
                              = 主骰 {formatWeaponAttackDiceDisplay(previewWeaponStats.attackParsed)}
                              {previewWeaponStats.weaponExtraDiceStrings.length > 0 && ` · 额外 ${previewWeaponStats.weaponExtraDiceStrings.join(' ')}`}
                              {previewWeaponStats.totalDamageMod !== 0 && ` · 加值${previewWeaponStats.totalDamageMod >= 0 ? '+' : ''}${previewWeaponStats.totalDamageMod}`}
                            </span>
                          </div>
                        </div>
                      )}
                      <div className="w-full border-t border-gray-600/80 pt-2">
                        <div className="mb-1 flex items-center justify-between gap-2">
                          <label className="text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider">额外伤害骰（可选）</label>
                          {!showWeaponExtraDiceEditor && (
                            <button
                              type="button"
                              onClick={() => setShowWeaponExtraDiceEditor(true)}
                              className="flex shrink-0 items-center gap-0.5 rounded border border-dashed border-dnd-gold/50 px-2 py-0.5 text-[10px] font-medium text-dnd-gold-light hover:bg-dnd-gold/15"
                            >
                              <Plus className="h-3 w-3" />
                              添加
                            </button>
                          )}
                        </div>
                        {addWeaponExtraDice.length > 0 && (
                          <ul className="mb-1.5 space-y-1">
                            {addWeaponExtraDice.map((d, i) => (
                              <li key={i} className="flex items-center gap-1.5 text-xs">
                                <span className="font-mono text-white">{d}</span>
                                <button type="button" onClick={() => setAddWeaponExtraDice((arr) => arr.filter((_, j) => j !== i))} className="shrink-0 rounded border border-gray-500 px-1.5 py-0.5 text-gray-400 hover:bg-gray-600">
                                  移除
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        {showWeaponExtraDiceEditor && (
                          <div className="space-y-2 rounded border border-gray-600 bg-gray-700/30 p-2">
                            <p className="text-[10px] leading-snug text-dnd-text-muted">设置数量、骰面、加值与伤害类型后，点击「加入列表」；可多次添加。</p>
                            <div className="flex w-full min-w-0 flex-wrap items-center gap-1">
                              <div className="flex min-w-0 flex-nowrap items-center gap-1">
                                <NumberStepper
                                  className="!w-[4.5rem] !min-w-0 !px-3"
                                  value={addWeaponExtraCount}
                                  onChange={(v) => setAddWeaponExtraCount(Math.max(1, v))}
                                  min={1}
                                  max={99}
                                  compact
                                  narrow
                                />
                                <select
                                  value={addWeaponExtraSides}
                                  onChange={(e) => setAddWeaponExtraSides(Number(e.target.value))}
                                  className={inputClass + ' h-8 w-[3.5rem] shrink-0 px-1 text-xs text-center'}
                                  title="骰面"
                                >
                                  <option value={4}>d4</option>
                                  <option value={6}>d6</option>
                                  <option value={8}>d8</option>
                                  <option value={10}>d10</option>
                                  <option value={12}>d12</option>
                                </select>
                                <span className="shrink-0 px-0.5 text-xs text-dnd-text-muted">+</span>
                                <NumberStepper
                                  className="!w-[4.5rem] !min-w-0 !px-3"
                                  value={addWeaponExtraFlatMod}
                                  onChange={setAddWeaponExtraFlatMod}
                                  min={-99}
                                  max={99}
                                  compact
                                  narrow
                                />
                              </div>
                              <select
                                value={addWeaponExtraType}
                                onChange={(e) => setAddWeaponExtraType(e.target.value)}
                                className={inputClass + ' h-8 min-w-0 flex-1 text-xs'}
                                title="伤害类型"
                              >
                                {DAMAGE_TYPE_OPTIONS.map((opt) => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                            </div>
                            <div className="flex justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => setShowWeaponExtraDiceEditor(false)}
                                className="rounded border border-gray-500 px-2 py-1 text-[10px] text-gray-400 hover:bg-gray-700"
                              >
                                取消
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const c = Math.max(1, Number(addWeaponExtraCount) || 1)
                                  const s = Number(addWeaponExtraSides) || 6
                                  const fm = Number(addWeaponExtraFlatMod) || 0
                                  let body = `${c}d${s}`
                                  if (fm !== 0) body += fm > 0 ? `+${fm}` : `${fm}`
                                  setAddWeaponExtraDice((arr) => [...arr, `${body} ${addWeaponExtraType}`])
                                  setAddWeaponExtraFlatMod(0)
                                  setShowWeaponExtraDiceEditor(false)
                                }}
                                className="rounded bg-dnd-red px-2 py-1 text-[10px] font-medium text-white hover:bg-dnd-red-hover"
                              >
                                加入列表
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    <GainEditor gains={addGains} onChange={setAddGains} />
                    <div className="flex gap-2 mt-3">
                      <button type="button" onClick={() => { setEditingCombatMeanId(null); setShowWeaponExtraDiceEditor(false); setAddMeanStep('type'); }} className="flex-1 py-1.5 rounded border border-gray-500 text-gray-400 text-xs">上一步</button>
                      <button type="button" onClick={confirmAddWeaponMean} disabled={addWeaponIndex == null} className="flex-1 py-1.5 rounded bg-dnd-red hover:bg-dnd-red-hover disabled:opacity-50 text-white text-xs">{editingCombatMeanId ? '保存' : '确认'}</button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
          {showAddMartialModal && martialModal && (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-2"
              onClick={() => {
                setShowAddMartialModal(false)
                setMartialModal(null)
              }}
            >
              <div
                className="rounded-lg border border-gray-600 bg-gray-800 p-4 shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col min-h-0 gap-3"
                onClick={(e) => e.stopPropagation()}
              >
                <h3 className="text-dnd-gold-light text-sm font-bold shrink-0">武技设置</h3>

                <section className="rounded border border-gray-600/80 bg-gray-900/30 p-2.5 space-y-2 shrink-0">
                  <h4 className="text-dnd-text-muted text-[11px] font-semibold uppercase tracking-wider">可学习武技数量</h4>
                  <div className="flex flex-nowrap items-center gap-x-2 gap-y-2 sm:gap-x-3 overflow-x-auto pb-0.5">
                    <span className="text-dnd-text-body text-xs shrink-0">架势槽位</span>
                    <NumberStepper
                      value={martialModal.quota.stanceMax}
                      onChange={(v) => {
                        const clamped = Math.max(0, Math.min(30, v))
                        const { quota, stanceRows, strikeRows } = martialModal
                        const nextQuota = { ...quota, stanceMax: clamped }
                        let nextStance = [...stanceRows]
                        if (clamped > nextStance.length) {
                          for (let i = nextStance.length; i < clamped; i += 1) {
                            nextStance.push({
                              id: `mt_st_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
                              techniqueId: '',
                              prepared: false,
                            })
                          }
                        } else {
                          nextStance = nextStance.slice(0, clamped)
                        }
                        commitMartialModal({ quota: nextQuota, stanceRows: nextStance, strikeRows })
                      }}
                      min={0}
                      max={30}
                      compact
                      narrow
                    />
                    <span className="text-dnd-text-muted/80 shrink-0 select-none" aria-hidden>
                      |
                    </span>
                    <span className="text-dnd-text-body text-xs shrink-0">攻击技槽位</span>
                    <NumberStepper
                      value={martialModal.quota.strikeMax}
                      onChange={(v) => {
                        const clamped = Math.max(0, Math.min(30, v))
                        const { quota, stanceRows, strikeRows } = martialModal
                        const nextQuota = { ...quota, strikeMax: clamped }
                        let nextStrike = [...strikeRows]
                        if (clamped > nextStrike.length) {
                          for (let i = nextStrike.length; i < clamped; i += 1) {
                            nextStrike.push({
                              id: `mt_sk_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
                              techniqueId: '',
                              prepared: false,
                            })
                          }
                        } else {
                          nextStrike = nextStrike.slice(0, clamped)
                        }
                        commitMartialModal({ quota: nextQuota, stanceRows, strikeRows: nextStrike })
                      }}
                      min={0}
                      max={30}
                      compact
                      narrow
                    />
                  </div>
                  <div>
                    <label className="block text-dnd-text-muted text-[11px] mb-1">可学习流派</label>
                    <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                      {MARTIAL_TECHNIQUE_STYLES.map((s) => {
                        const checked = martialModal.quota.style.includes(s)
                        return (
                          <label key={s} className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                const nextStyle = checked
                                  ? martialModal.quota.style.filter((x) => x !== s)
                                  : [...martialModal.quota.style, s]
                                const sanitize = (rows) =>
                                  rows.map((r) => {
                                    if (!r.techniqueId) return r
                                    const t = getMartialTechniqueById(r.techniqueId)
                                    if (!t || (nextStyle.length > 0 && !nextStyle.includes(t.style))) {
                                      return { ...r, techniqueId: '', prepared: false }
                                    }
                                    return r
                                  })
                                const nextQuota = { ...martialModal.quota, style: nextStyle }
                                commitMartialModal({
                                  ...martialModal,
                                  quota: nextQuota,
                                  stanceRows: sanitize(martialModal.stanceRows),
                                  strikeRows: sanitize(martialModal.strikeRows),
                                })
                              }}
                              className="h-3.5 w-3.5 accent-dnd-gold cursor-pointer"
                            />
                            <span className="text-dnd-text-body text-xs">{s}</span>
                          </label>
                        )
                      })}
                    </div>
                  </div>
                  {martialModal.quota.style.length > 0 ? (
                    <div className="max-h-[22vh] overflow-y-auto pr-0.5 rounded border border-gray-700/80 bg-black/20 p-1.5 space-y-1.5">
                      {martialModal.quota.style.map((s) => (
                        <MartialStyleIntroBlock key={s} styleName={s} compact />
                      ))}
                    </div>
                  ) : null}
                </section>

                <section className="min-h-0 flex-1 flex flex-col gap-2 overflow-hidden">
                  <h4 className="text-dnd-text-muted text-[11px] font-semibold uppercase tracking-wider shrink-0">
                    已分配招式（自下拉选择；每条可点「准备」）
                  </h4>
                  <div className="min-h-0 flex-1 overflow-y-auto space-y-3 pr-0.5">
                    <div>
                      <p className="text-dnd-gold-light/90 text-xs font-medium mb-1.5">架势</p>
                      {martialModal.stanceRows.length === 0 ? (
                        <p className="text-dnd-text-muted text-xs py-1">请先将「架势槽位」设为大于 0。</p>
                      ) : (
                        <div className="space-y-1.5">
                          {martialModal.stanceRows.map((row, idx) => {
                            const selectedIds = new Set(
                              martialModal.stanceRows
                                .filter((_, i) => i !== idx)
                                .map((r) => r.techniqueId)
                                .filter(Boolean)
                            )
                            const options = listMartialTechniquesForSlot(
                              'stance',
                              martialModal.quota.style
                            ).filter((t) => !selectedIds.has(t.id) || t.id === row.techniqueId)
                            return (
                              <div
                                key={row.id}
                                className="flex flex-wrap items-center gap-2 rounded border border-gray-600/80 bg-gray-900/40 px-2 py-1.5"
                              >
                                <span className="text-dnd-text-muted text-[10px] shrink-0 w-8">{idx + 1}</span>
                                <select
                                  value={row.techniqueId}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    const next = martialModal.stanceRows.map((r, i) =>
                                      i === idx ? { ...r, techniqueId: v, prepared: v ? r.prepared : false } : r
                                    )
                                    commitMartialModal({ ...martialModal, stanceRows: next })
                                  }}
                                  className={inputClass + ' flex-1 min-w-[12rem] h-8 text-xs'}
                                >
                                  <option value="">— 选择架势 —</option>
                                  {options.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}（{t.type}）
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={!row.techniqueId}
                                  onClick={() => {
                                    const next = martialModal.stanceRows.map((r, i) =>
                                      i === idx && r.techniqueId ? { ...r, prepared: !r.prepared } : r
                                    )
                                    commitMartialModal({ ...martialModal, stanceRows: next })
                                  }}
                                  className={`shrink-0 rounded px-2 py-1 text-xs border transition-colors ${
                                    row.prepared
                                      ? 'border-dnd-gold/50 bg-dnd-gold/15 text-dnd-gold-light'
                                      : 'border-gray-600 text-gray-400 hover:bg-gray-700'
                                  } disabled:opacity-40 disabled:pointer-events-none`}
                                >
                                  {row.prepared ? '已准备' : '准备'}
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-dnd-gold-light/90 text-xs font-medium mb-1.5">攻击技</p>
                      {martialModal.strikeRows.length === 0 ? (
                        <p className="text-dnd-text-muted text-xs py-1">请先将「攻击技槽位」设为大于 0。</p>
                      ) : (
                        <div className="space-y-1.5">
                          {martialModal.strikeRows.map((row, idx) => {
                            const selectedIds = new Set(
                              martialModal.strikeRows
                                .filter((_, i) => i !== idx)
                                .map((r) => r.techniqueId)
                                .filter(Boolean)
                            )
                            const options = listMartialTechniquesForSlot(
                              'strike',
                              martialModal.quota.style
                            ).filter((t) => !selectedIds.has(t.id) || t.id === row.techniqueId)
                            return (
                              <div
                                key={row.id}
                                className="flex flex-wrap items-center gap-2 rounded border border-gray-600/80 bg-gray-900/40 px-2 py-1.5"
                              >
                                <span className="text-dnd-text-muted text-[10px] shrink-0 w-8">{idx + 1}</span>
                                <select
                                  value={row.techniqueId}
                                  onChange={(e) => {
                                    const v = e.target.value
                                    const next = martialModal.strikeRows.map((r, i) =>
                                      i === idx ? { ...r, techniqueId: v, prepared: v ? r.prepared : false } : r
                                    )
                                    commitMartialModal({ ...martialModal, strikeRows: next })
                                  }}
                                  className={inputClass + ' flex-1 min-w-[12rem] h-8 text-xs'}
                                >
                                  <option value="">— 选择攻击技 —</option>
                                  {options.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}（Lv.{t.level ?? '—'}）
                                    </option>
                                  ))}
                                </select>
                                <button
                                  type="button"
                                  disabled={!row.techniqueId}
                                  onClick={() => {
                                    const next = martialModal.strikeRows.map((r, i) =>
                                      i === idx && r.techniqueId ? { ...r, prepared: !r.prepared } : r
                                    )
                                    commitMartialModal({ ...martialModal, strikeRows: next })
                                  }}
                                  className={`shrink-0 rounded px-2 py-1 text-xs border transition-colors ${
                                    row.prepared
                                      ? 'border-dnd-gold/50 bg-dnd-gold/15 text-dnd-gold-light'
                                      : 'border-gray-600 text-gray-400 hover:bg-gray-700'
                                  } disabled:opacity-40 disabled:pointer-events-none`}
                                >
                                  {row.prepared ? '已准备' : '准备'}
                                </button>
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                <button
                  type="button"
                  onClick={() => {
                    setShowAddMartialModal(false)
                    setMartialModal(null)
                  }}
                  className="w-full py-2 rounded border border-gray-500 text-gray-400 hover:bg-gray-700 text-sm shrink-0"
                >
                  关闭
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showMartialModule ? (
        <div
          className={`mt-2 w-full min-w-0 rounded-lg border border-gray-600 bg-gray-800/50 p-2 ${COMBAT_INNER_RIM_ONLY}`}
        >
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className={`text-dnd-gold-light ${CM_MEAN_LABEL} font-semibold uppercase tracking-wider`}>武技</h3>
            {canEdit ? (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={openMartialSettingsModal}
                  className="h-6 w-6 flex items-center justify-center rounded text-gray-400 hover:text-dnd-gold-light hover:bg-gray-700/40"
                  title="编辑武技（添加招式、可学数量与准备状态）"
                  aria-label="编辑武技"
                >
                  <Pencil size={12} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMartialModule(false)
                    onSave({ showMartialModule: false })
                  }}
                  className="h-6 w-6 flex items-center justify-center rounded text-gray-400 hover:text-dnd-red hover:bg-red-900/35"
                  title="折叠武技模块（战斗区不再显示武技区块，数据保留）"
                  aria-label="折叠武技模块"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ) : null}
          </div>
          <div className="min-w-0">
            {martialSlots.length === 0 ? (
              <p className="text-dnd-text-muted text-xs">暂无武技，点击右上角「编辑」在弹窗中设置可学数量并分配招式</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {martialSlots.length === 0 ? (
                  <p className="py-2 text-center text-dnd-text-muted text-[11px] col-span-full">暂无</p>
                ) : (
                  martialSlots.map((slot) => renderMartialCombatRow(slot, slot.kind === 'stance' ? 'stance' : 'other'))
                )}
              </div>
            )}
          </div>
        </div>
      ) : canEdit ? (
        <button
          type="button"
          onClick={() => {
            setShowMartialModule(true)
            onSave({ showMartialModule: true })
          }}
          className="w-full mt-2 py-1.5 rounded-lg border border-dashed border-gray-500 text-gray-400 hover:bg-gray-800/50 text-sm font-bold uppercase tracking-wider"
        >
          + 武技模块
        </button>
      ) : null}
    </div>
  )
}

