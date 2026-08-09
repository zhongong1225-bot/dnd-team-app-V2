/**
 * 物品添加弹窗：在 BUFF 添加逻辑基础上改造
 * 1. 选择物品类型 → 获得基础信息（重量、简介、名字）
 * 2. 可修改名字、简介
 * 3. 可增减的效果模块（同 BUFF 式添加/删除）
 * 4. 数量 -/+
 * 生成新物品条目，由调用方写入背包或仓库
 */
import { useState, useEffect, useMemo, useRef } from 'react'
import { Trash2, Plus, Pencil } from 'lucide-react'
import { getItemListGrouped, getItemById, getItemDisplayName, parseWeaponNoteToTraits, buildWeaponNoteFromTraits, WEAPON_TRAIT_OPTIONS, WEAPON_MASTERY_OPTIONS, itemRequiresAttunement } from '../data/itemDatabase'
import { inputClass, textareaClass } from '../lib/inputStyles'
import { useModule } from '../contexts/ModuleContext'
import { BUFF_TYPES, getCategories, normalizeEffectCategory, parseDamageString, formatDamageForAttack, ITEM_STORAGE_DEFAULT_ITEM_IDS } from '../data/buffTypes'
import { DamageDiceInlineRow, NumberStepper, EffectModuleModal } from './BuffForm'
import { getEffectSummaryShort } from './BuffListItem'
import { evaluateBuffValue, isFormulaValue } from '../lib/formulas'
import {
  normalizeContainedSpellValue,
  mergeContainedSpellEffects,
  isNewContainedSpellValue,
  getContainedSpellTotalCharges,
} from '../lib/containedSpellModel'
import { formatContainedSpellLines } from '../lib/containedSpellBrief'

/** 从护甲/衣服附注解析为可编辑字段（先匹配护甲基础再匹配盾牌，与 formulas 一致） */
function parseArmorNoteToFields(note) {
  const empty = { isShield: false, baseAC: '', dexMode: 'full', dexCap: 2, strReq: '', stealth: '—', shieldBonus: '' }
  if (!note || typeof note !== 'string') return empty
  const s = note.trim()
  if (!s) return empty
  // 护甲：AC 14+敏捷(最大2)
  const armorDexCapMatch = s.match(/AC\s*(\d+)\s*\+\s*敏捷\s*[（(]\s*最大\s*(\d+)\s*[）)]/i)
  if (armorDexCapMatch) {
    return { ...empty, baseAC: armorDexCapMatch[1], dexMode: 'cap', dexCap: parseInt(armorDexCapMatch[2], 10) || 2, strReq: (s.match(/力量\s*(\d+)/i) || [])[1] || '', stealth: /隐匿\s*劣势/i.test(s) ? '劣势' : '—' }
  }
  // 护甲：AC 14+敏捷
  const armorDexMatch = s.match(/AC\s*(\d+)\s*\+\s*敏捷/i)
  if (armorDexMatch) {
    return { ...empty, baseAC: armorDexMatch[1], dexMode: 'full', strReq: (s.match(/力量\s*(\d+)/i) || [])[1] || '', stealth: /隐匿\s*劣势/i.test(s) ? '劣势' : '—' }
  }
  // 护甲：AC 14（不加敏捷）
  const armorFixedMatch = s.match(/AC\s*(\d+)(?:\s*[;；]|\s*$)/i)
  if (armorFixedMatch) {
    return { ...empty, baseAC: armorFixedMatch[1], dexMode: 'none', strReq: (s.match(/力量\s*(\d+)/i) || [])[1] || '', stealth: /隐匿\s*劣势/i.test(s) ? '劣势' : '—' }
  }
  // 盾牌：AC +2
  const shieldMatch = s.match(/AC\s*\+\s*(\d+)/i)
  if (shieldMatch) {
    return { ...empty, isShield: true, shieldBonus: shieldMatch[1] }
  }
  return empty
}

/** 根据护甲/衣服字段构建附注字符串 */
function buildArmorNoteFromFields(fields) {
  if (!fields) return ''
  if (fields.isShield) {
    const n = fields.shieldBonus === '' ? '2' : String(fields.shieldBonus)
    return `AC +${n}；力量—；隐匿—`
  }
  const base = fields.baseAC === '' ? '10' : String(fields.baseAC)
  let acPart = `AC ${base}`
  if (fields.dexMode === 'full') acPart += '+敏捷'
  else if (fields.dexMode === 'cap') acPart += `+敏捷（最大${fields.dexCap ?? 2}）`
  const strPart = fields.strReq === '' ? '—' : fields.strReq
  const stealthPart = fields.stealth === '劣势' ? '劣势' : '—'
  return `${acPart}；力量${strPart}；隐匿${stealthPart}`
}

/** 武器基础/多用伤害不应包含固定加值（加值来自能力调整、熟练、魔法加值等 Buff），去掉 legacy 中的 flat mod */
function stripDiceFlatMod(plus) {
  if (!plus || typeof plus !== 'string') return plus
  const m = plus.trim().match(/^(\d+)d(\d+)([+-]\d+)?$/i)
  if (!m) return plus
  return `${m[1]}d${m[2]}`
}

/** 解析武器伤害字符串，将「1d8/1d10 钝击」拆分为基础与多用（双手）伤害 */
function splitVersatileDamage(str) {
  const parsed = parseDamageString(str)
  const base = { minus: parsed.minus ?? '', plus: stripDiceFlatMod(parsed.plus) ?? '', o1: '', o2: '', type: parsed.type ?? '', o3: parsed.o3 ?? '' }
  const versa = { minus: '', plus: '', o1: '', o2: '', type: parsed.type ?? '', o3: '' }
  if (base.plus.includes('/')) {
    const [p1, p2] = base.plus.split('/')
    base.plus = stripDiceFlatMod(p1.trim()) ?? ''
    versa.plus = stripDiceFlatMod(p2.trim()) ?? ''
  }
  return { base, versa }
}

/** 根据基础伤害与多用伤害对象构建「攻击」字段；类型相同时合并为「1d8/1d10 钝击」。武器基础伤害不带固定加值。 */
function buildWeaponAttack(baseObj, versaObj) {
  const basePlus = stripDiceFlatMod(baseObj?.plus || '')
  const versaPlus = stripDiceFlatMod(versaObj?.plus || '')
  const base = { ...baseObj, plus: basePlus }
  const versa = { ...versaObj, plus: versaPlus }
  const baseStr = formatDamageForAttack(base)
  const versaStr = formatDamageForAttack(versa)
  if (!versaStr || !versaPlus) return baseStr
  const baseType = base.type || ''
  const versaType = versa.type || baseType
  const sameType = baseType && versaType === baseType
  const note = base.o3 || versa.o3 || ''
  let out = ''
  if (sameType) {
    out = `${basePlus}/${versaPlus} ${baseType}`
  } else {
    out = `${basePlus}${baseType ? ' ' + baseType : ''}/${versaPlus}${versaType ? ' ' + versaType : ''}`.trim()
  }
  if (note) out = `${out} #${note}`
  return out
}

function createEmptyModule() {
  const firstCat = getCategories()[0]?.key ?? 'ability'
  const firstEffect = BUFF_TYPES[firstCat]?.effects?.[0]?.key ?? 'ability_score'
  return {
    id: 'm_' + Math.random().toString(36).slice(2),
    category: firstCat,
    effectType: firstEffect,
    value: 0,
    customText: '',
    collapsed: false,
  }
}

function createItemStorageModule() {
  return { ...createEmptyModule(), category: 'container', effectType: 'item_storage', value: true, customText: '' }
}

function isDefaultStorageItem(entryOrItemId) {
  const id = typeof entryOrItemId === 'string' ? entryOrItemId : entryOrItemId?.itemId
  return ITEM_STORAGE_DEFAULT_ITEM_IDS.includes(id)
}

/** 将背包条目转成可增加模块列表（与 BUFF 一致：category + effectType） */
function entryToEffectModules(entry, proto) {
  const mods = []
  const add = (category, effectType, data = {}) => mods.push({
    ...createEmptyModule(),
    category,
    effectType,
    id: 'm_' + Math.random().toString(36).slice(2),
    ...data,
  })

  const isShield = proto?.子类型 === '盾牌'
  const shieldBaseMatch = isShield && (entry?.附注 ?? proto?.附注 ?? '').match(/AC\s*\+\s*(\d+)/i)
  const shieldBaseAC = shieldBaseMatch ? parseInt(shieldBaseMatch[1], 10) : null
  // 若条目已有 effects（含空数组），优先从中还原；空数组表示用户已删光附魔效果，不再从其它字段推断
  if (Array.isArray(entry?.effects)) {
    if (entry.effects.length === 0) {
      // 次元袋/秘藏箱等默认储物物品强制保留容器效果
      return isDefaultStorageItem(entry) ? [createItemStorageModule()] : []
    }
    // 迁移：多个独立 contained_spell effect 合并为一个多法术共享总充能池
    let effects = entry.effects
    const mergedCS = mergeContainedSpellEffects(effects, entry.charge)
    if (mergedCS) {
      effects = effects.filter((e) => e.effectType !== 'contained_spell')
      effects.push({
        category: normalizeEffectCategory('contained_spell', 'charge'),
        effectType: 'contained_spell',
        value: mergedCS,
        customText: '',
      })
    }
    const toRestore = isShield && shieldBaseAC != null
      ? effects.filter((e) => (e.effectType ?? '') !== 'ac_bonus' || (Number(e.value) || 0) !== shieldBaseAC)
      : effects
    toRestore.forEach((e) => {
      let val = e.value ?? 0
      /** 内含法术统一归一化为新结构，总能量与 entry.charge 保持一致 */
      if (e.effectType === 'contained_spell' && typeof val === 'object' && val && !Array.isArray(val)) {
        val = normalizeContainedSpellValue(val, entry.charge)
      }
      add(normalizeEffectCategory(e.effectType ?? '', e.category), e.effectType ?? '', {
        value: val,
        customText: typeof e.value === 'string' ? e.value : (e.customText ?? ''),
      })
    })
    if (isDefaultStorageItem(entry) && !mods.some((m) => m.effectType === 'item_storage')) {
      mods.push(createItemStorageModule())
    }
    return mods
  }

  const magicVal = entry.magicBonus != null && entry.magicBonus !== '' ? Number(entry.magicBonus) : 0
  if (magicVal !== 0) {
    if (proto && (proto.类型 === '盔甲' || proto.类型 === '衣服')) add('defense', 'ac_bonus', { value: magicVal })
    else add('offense', 'attack_melee', { value: magicVal })
  }
  if (entry.charge != null && entry.charge !== '') add('mobility_casting', 'charge', { value: Number(entry.charge) || 0 })
  const 附注 = (entry.附注 ?? proto?.附注 ?? '').trim()
  const acMatch = 附注.match(/AC\s*\+\s*(\d+)/i)
  if (acMatch && !isShield) add('defense', 'ac_bonus', { value: parseInt(acMatch[1], 10) || 0 })
  if (entry.spellDC != null && entry.spellDC !== '') add('mobility_casting', 'save_dc_bonus', { value: { val: Number(entry.spellDC) || 0, advantage: '' } })
  if (entry.spellAttackBonus != null && entry.spellAttackBonus !== '') add('mobility_casting', 'spell_attack_bonus', { value: { val: Number(entry.spellAttackBonus) || 0, advantage: '' } })
  const 攻击距离 = (entry.攻击距离 ?? '').trim()
  const reachNum = 攻击距离.match(/(\d+)/)?.[1]
  if (reachNum) add('offense', 'reach_bonus', { value: parseInt(reachNum, 10) || 0 })
  if ((entry.攻击范围 ?? '').trim()) add('offense', 'attack_range', { customText: String(entry.攻击范围).trim() })
  if (isDefaultStorageItem(entry) && !mods.some((m) => m.effectType === 'item_storage')) {
    mods.push(createItemStorageModule())
  }
  if (mods.length === 0) add('offense', 'attack_melee', { value: 0 })
  return mods
}

/** 从效果模块值中提取可用数字：支持纯数字、公式对象、以及 { val: ... } / { speed: ... } 包装对象 */
function resolveModuleNumericValue(val, context = {}) {
  if (isFormulaValue(val)) return evaluateBuffValue(val, context)
  if (typeof val === 'number' && !Number.isNaN(val)) return val
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    if (isFormulaValue(val.val)) return evaluateBuffValue(val.val, context)
    if (val.val != null) return Number(val.val) || 0
    if (val.speed != null) return Number(val.speed) || 0
  }
  return 0
}

/** 从 BUFF 效果模块写出到物品条目的字段（附注片段、magicBonus、攻击距离等） */
function effectModuleToEntryParts(mod, currentEffect, context = {}) {
  if (!currentEffect) return {}
  const key = currentEffect.key
  const val = mod.value
  const text = mod.customText ?? ''
  const num = resolveModuleNumericValue(val, context)
  if (key === 'ac_bonus') return { 附注Part: (num > 0 ? 'AC+' + num : '') }
  if (key === 'damage_reduction') return { 附注Part: num !== 0 ? `伤害减免${num}` : '' }
  if (key === 'attack_melee' || key === 'attack_ranged' || key === 'attack_all') return { magicBonus: num }
  if (key === 'attack_bonus') return { magicBonus: evaluateBuffValue(val?.val, context) || 0 }
  if (key === 'reach_bonus') return { 攻击距离: num > 0 ? num + '尺' : '' }
  if (key === 'attack_range') return { 攻击范围: text.trim() || '' }
  if (key === 'charge') return { charge: num }
  if (key === 'save_dc_bonus') return { spellDC: evaluateBuffValue(val?.val, context) || 0 }
  if (key === 'spell_attack_bonus') return { spellAttackBonus: evaluateBuffValue(val?.val, context) || 0 }
  if (key === 'dmg_bonus_melee') return { 附注Part: num > 0 ? '近战伤害+' + num : '' }
  if (key === 'dmg_bonus_ranged') return { 附注Part: num > 0 ? '远程伤害+' + num : '' }
  if (key === 'crit_extra_dice') return { 附注Part: num >= 2 ? '暴击×' + num : '' }
  if (key === 'crit_range_expand') return { 附注Part: text.trim() ? '暴击范围 ' + text.trim() : '' }
  if (key?.startsWith('custom_')) return { 附注Part: text.trim() }
  return {}
}

/** 物品稀有度选项 */
const RARITY_OPTIONS = [
  { value: '', label: '— 稀有度 —' },
  { value: '普通', label: '普通' },
  { value: '非普通', label: '非普通' },
  { value: '珍稀', label: '珍稀' },
  { value: '极珍稀', label: '极珍稀' },
  { value: '传说', label: '传说' },
  { value: '神器', label: '神器' },
]

export default function ItemAddForm({ open, onClose, onSave, submitLabel = '确认加入', editEntry = null, inventory = [], spellDC, spellAttackBonus, referenceData }) {
  const { customLibraryEpoch } = useModule()
  const grouped = useMemo(() => getItemListGrouped(), [customLibraryEpoch])
  const ammoOptionsFromInv = useMemo(() => {
    const cats = new Set()
    inventory.forEach((entry) => {
      const proto = getItemById(entry?.itemId)
      if (proto?.类型 === '弹药' && proto?.类别) cats.add(proto.类别)
    })
    return [...cats].sort((a, b) => a.localeCompare(b))
  }, [inventory])
  const [type, setType] = useState('')
  const [itemId, setItemId] = useState('')
  const [rarity, setRarity] = useState('')
  const [isAttuned, setIsAttuned] = useState(false)
  const [name, setName] = useState('')
  const [intro, setIntro] = useState('')
  const [qty, setQty] = useState(1)
  const [effectModules, setEffectModules] = useState(() => [])
  const [editingModuleId, setEditingModuleId] = useState(null)
  const editingModule = useMemo(() => effectModules.find((m) => m.id === editingModuleId) || null, [effectModules, editingModuleId])
  const [armorFields, setArmorFields] = useState(() => ({ isShield: false, baseAC: '', dexMode: 'full', dexCap: 2, strReq: '', stealth: '—', shieldBonus: '' }))
  const [weaponDamage, setWeaponDamage] = useState(() => ({ minus: '', plus: '', o1: '', o2: '', type: '', o3: '' }))
  const [weaponVersatileDamage, setWeaponVersatileDamage] = useState(() => ({ minus: '', plus: '', o1: '', o2: '', type: '', o3: '' }))
  const [weaponTraits, setWeaponTraits] = useState(() => [])
  const [weaponRange, setWeaponRange] = useState(() => '')
  const [weaponAmmoCategory, setWeaponAmmoCategory] = useState(() => '')
  const [weaponMastery, setWeaponMastery] = useState(() => '')
  const [explosiveAttackDistance, setExplosiveAttackDistance] = useState(() => '')
  const [explosiveRadius, setExplosiveRadius] = useState(() => 0)
  const [explosiveDamage, setExplosiveDamage] = useState(() => ({ minus: '', plus: '', o1: '', o2: '', type: '', o3: '' }))
  const introRef = useRef(null)
  const newModuleIdRef = useRef(null)

  const typeGroup = grouped.find((g) => g.type === type)
  const subTypeGroups = typeGroup?.subTypes ?? []
  const items = subTypeGroups.flatMap((s) => s.items ?? [])
  const selectedPrototype = itemId ? getItemById(itemId) : null
  const weightDisplay = selectedPrototype?.重量 ?? '—'
  const isEdit = !!editEntry
  const isArmorOrClothing = selectedPrototype && (selectedPrototype.类型 === '盔甲' || selectedPrototype.类型 === '衣服')
  const isArmor = selectedPrototype?.类型 === '盔甲'
  const isWeapon = selectedPrototype && (selectedPrototype.类型 === '近战武器' || selectedPrototype.类型 === '远程武器' || selectedPrototype.类型 === '枪械')
  const isExplosive = selectedPrototype && (selectedPrototype.类型 === '爆炸物' || (selectedPrototype.类型 === '消耗品' && selectedPrototype.子类型 === '爆炸品'))
  const isShield = isArmor && selectedPrototype?.子类型 === '盾牌'
  /** 魔杖/卷轴使用固定法强表（按环阶），不沿用角色法术DC/攻击加值 */
  const useWandScrollTable = (() => {
    const p = isEdit ? getItemById(editEntry?.itemId) : selectedPrototype
    return !!(p && (/魔杖|卷轴/.test(p.类别 || '') || p.子类型 === '卷轴'))
  })()

  /** 用于效果简写求值与内含法术 DC/法攻/充能显示 */
  const effectSummaryContext = useMemo(() => ({
    ...(referenceData || {}),
    spellDC,
    spellAttackBonus,
    useWandScrollTable,
  }), [referenceData, spellDC, spellAttackBonus, useWandScrollTable])

  const autoResizeIntro = () => {
    const el = introRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }

  useEffect(() => {
    if (!open) return
    if (editEntry) {
      const proto = editEntry.itemId ? getItemById(editEntry.itemId) : null
      const typeFromProto = proto ? (grouped.find((g) => g.type === proto.类型)?.type ?? proto.类型 ?? '') : ''
      setType(typeFromProto)
      setItemId(editEntry.itemId ?? '')
      setRarity(editEntry.rarity ?? '')
      setIsAttuned(!!editEntry.isAttuned)
      setName((editEntry.name && editEntry.name.trim()) || (proto ? getItemDisplayName(proto) : '') || '')
      setIntro((editEntry.详细介绍 != null && editEntry.详细介绍 !== '') ? String(editEntry.详细介绍) : (proto?.详细介绍 ?? '') || '')
      setQty(Math.max(1, Number(editEntry.qty) ?? 1))
      setEffectModules(entryToEffectModules(editEntry, proto))
      const note = (editEntry.附注 != null && editEntry.附注 !== '') ? String(editEntry.附注) : (proto?.附注 ?? '')
      if (proto && proto.类型 === '盔甲') {
        let f = parseArmorNoteToFields(note)
        setArmorFields(f)
      } else {
        setArmorFields({ isShield: false, baseAC: '', dexMode: 'full', dexCap: 2, strReq: '', stealth: '—', shieldBonus: '' })
      }
      if (proto && (proto.类型 === '近战武器' || proto.类型 === '远程武器' || proto.类型 === '枪械')) {
        const { base, versa } = splitVersatileDamage(editEntry?.攻击 ?? proto?.攻击 ?? '')
        setWeaponDamage(base)
        setWeaponVersatileDamage(versa)
        const { traits, range, ammoCategory } = parseWeaponNoteToTraits(editEntry?.附注 ?? proto?.附注 ?? '')
        setWeaponTraits(traits)
        setWeaponRange((editEntry?.攻击距离 ?? range ?? proto?.攻击距离 ?? '').trim())
        setWeaponAmmoCategory(ammoCategory ?? '')
        setWeaponMastery((editEntry?.精通 != null && editEntry?.精通 !== '') ? String(editEntry.精通) : (proto?.精通 ?? ''))
      } else {
        setWeaponDamage({ minus: '', plus: '', o1: '', o2: '', type: '', o3: '' })
        setWeaponVersatileDamage({ minus: '', plus: '', o1: '', o2: '', type: '', o3: '' })
        setWeaponTraits([])
        setWeaponRange('')
        setWeaponAmmoCategory('')
        setWeaponMastery('')
      }
      if (proto && (proto.类型 === '爆炸物' || (proto.类型 === '消耗品' && proto.子类型 === '爆炸品'))) {
        const rangeStr = (editEntry?.攻击距离 ?? proto?.攻击距离 ?? '').trim()
        setExplosiveAttackDistance(rangeStr || '')
        setExplosiveRadius(typeof editEntry?.爆炸半径 === 'number' ? editEntry.爆炸半径 : (proto?.爆炸半径 ?? 0))
        setExplosiveDamage(parseDamageString(editEntry?.攻击 ?? proto?.攻击 ?? ''))
      } else {
        setExplosiveAttackDistance('')
        setExplosiveRadius(0)
        setExplosiveDamage({ minus: '', plus: '', o1: '', o2: '', type: '', o3: '' })
      }
    } else {
      setType('')
      setItemId('')
      setRarity('')
      setIsAttuned(false)
      setName('')
      setIntro('')
      setQty(1)
      setEffectModules([])
      setArmorFields({ isShield: false, baseAC: '', dexMode: 'full', dexCap: 2, strReq: '', stealth: '—', shieldBonus: '' })
      setWeaponDamage({ minus: '', plus: '', o1: '', o2: '', type: '', o3: '' })
      setWeaponTraits([])
      setWeaponRange('')
      setWeaponAmmoCategory('')
      setWeaponMastery('')
      setExplosiveAttackDistance('')
      setExplosiveRadius(0)
      setExplosiveDamage({ minus: '', plus: '', o1: '', o2: '', type: '', o3: '' })
    }
  }, [open, editEntry, grouped])

  useEffect(() => {
    if (!itemId || isEdit) return
    const proto = getItemById(itemId)
    setName(proto ? getItemDisplayName(proto) : '')
    setIntro(proto?.详细介绍 ?? '')
    if (isDefaultStorageItem(itemId)) {
      setEffectModules([createItemStorageModule()])
    } else {
      setEffectModules([])
    }
    if (proto && proto.类型 === '盔甲') {
      let f = parseArmorNoteToFields(proto.附注 ?? '')
      setArmorFields(f)
    }
    if (proto && (proto.类型 === '近战武器' || proto.类型 === '远程武器' || proto.类型 === '枪械')) {
      const { base, versa } = splitVersatileDamage(proto.攻击 ?? '')
      setWeaponDamage(base)
      setWeaponVersatileDamage(versa)
      const { traits, range, ammoCategory } = parseWeaponNoteToTraits(proto.附注 ?? '')
      setWeaponTraits(traits)
      setWeaponRange((proto.攻击距离 ?? range ?? '').trim())
      setWeaponAmmoCategory(ammoCategory ?? '')
      setWeaponMastery(proto.精通 ?? '')
    }
    if (proto && (proto.类型 === '爆炸物' || (proto.类型 === '消耗品' && proto.子类型 === '爆炸品'))) {
      setExplosiveAttackDistance((proto.攻击距离 ?? '').trim() || '')
      setExplosiveRadius(proto.爆炸半径 ?? 0)
      setExplosiveDamage(parseDamageString(proto.攻击 ?? ''))
    } else {
      setExplosiveAttackDistance('')
      setExplosiveRadius(0)
      setExplosiveDamage({ minus: '', plus: '', o1: '', o2: '', type: '', o3: '' })
    }
  }, [itemId, isEdit])

  useEffect(() => {
    if (!open) return
    autoResizeIntro()
  }, [open, intro])

  const updateModule = (id, next) => {
    setEffectModules((prev) => prev.map((m) => (m.id === id ? (typeof next === 'function' ? next(m) : { ...m, ...next }) : m)))
  }

  const removeModule = (id) => {
    setEffectModules((prev) => prev.filter((m) => m.id !== id))
  }

  const handleAddModule = () => {
    const m = createEmptyModule()
    newModuleIdRef.current = m.id
    setEffectModules((prev) => [...prev, m])
    setEditingModuleId(m.id)
  }

  const handleEditModule = (id) => {
    newModuleIdRef.current = null
    setEditingModuleId(id)
  }

  const handleSaveModule = (draft) => {
    if (!editingModuleId) return
    updateModule(editingModuleId, draft)
    newModuleIdRef.current = null
    setEditingModuleId(null)
  }

  const handleCancelModule = () => {
    if (editingModuleId && editingModuleId === newModuleIdRef.current) {
      removeModule(editingModuleId)
    }
    newModuleIdRef.current = null
    setEditingModuleId(null)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!itemId && !editEntry) return
    const proto = itemId ? getItemById(itemId) : (editEntry?.itemId ? getItemById(editEntry.itemId) : null)
    // 合并多个 contained_spell 模块为一个，保证一个物品只有一条内含法术效果
    let workingModules = effectModules
    const csModules = workingModules.filter((m) => m.effectType === 'contained_spell')
    if (csModules.length > 1) {
      const mergedValue = mergeContainedSpellEffects(
        csModules.map((m) => ({ effectType: 'contained_spell', value: m.value })),
        editEntry?.charge,
      )
      const firstId = csModules[0].id
      const dropIds = new Set(csModules.slice(1).map((m) => m.id))
      workingModules = workingModules
        .filter((m) => !dropIds.has(m.id))
        .map((m) => (m.id === firstId ? { ...m, value: mergedValue } : m))
    }
    let 攻击 = (editEntry?.攻击 ?? proto?.攻击 ?? '').trim() || undefined
    let 伤害 = (editEntry?.伤害 ?? proto?.伤害 ?? '').trim() || undefined
    let 攻击距离 = (editEntry?.攻击距离 ?? proto?.攻击距离 ?? '').trim() || undefined
    let 攻击范围 = (editEntry?.攻击范围 ?? '').trim() || undefined
    if (isWeapon && weaponDamage) {
      const versa = weaponTraits.includes('多用') ? weaponVersatileDamage : { ...weaponVersatileDamage, plus: '' }
      攻击 = buildWeaponAttack(weaponDamage, versa).trim() || 攻击
      伤害 = weaponDamage.type || 伤害
      const r = String(weaponRange ?? '').trim()
      if (r) 攻击距离 = r
    }
    if (isExplosive && explosiveDamage) {
      攻击 = formatDamageForAttack(explosiveDamage).trim() || 攻击
      伤害 = explosiveDamage.type || 伤害
      攻击距离 = (explosiveAttackDistance != null && String(explosiveAttackDistance).trim() !== '') ? String(explosiveAttackDistance).trim() : 攻击距离
    }
    let 附注 = ''
    if (isArmor) 附注 = buildArmorNoteFromFields(armorFields)
    else if (isWeapon) 附注 = buildWeaponNoteFromTraits(weaponTraits, weaponRange, weaponAmmoCategory) || (proto?.附注 ?? '').trim()
    else 附注 = (proto?.附注 ?? '').trim()
    const 精通 = isWeapon && weaponMastery ? weaponMastery : (editEntry?.精通 ?? proto?.精通 ?? undefined)
    let magicBonus = 0
    let charge = 0
    let spellDC = undefined
    let itemSpellAttackBonus = undefined
    const effectsForSave = []
    workingModules.forEach((mod) => {
      const catData = BUFF_TYPES[mod.category]
      const effects = catData?.effects ?? []
      const currentEffect = effects.find((e) => e.key === mod.effectType)
      if (!currentEffect) return
      // 统一 Effect 结构（与 src/lib/effects/effectModel 一致），保证下次编辑 1:1 还原且与 BUFF 计算共用
      let saveVal = mod.value ?? 0
      if (currentEffect.dataType === 'text') saveVal = typeof mod.value === 'string' ? mod.value : (mod.customText ?? '')
      else if (currentEffect.dataType === 'boolean') saveVal = !!(mod.value === true || mod.value === 'true' || mod.value === 1)
      // 内含法术统一归一化为新结构，并让总能量与 entry.charge 同步
      if (currentEffect.key === 'contained_spell') {
        saveVal = normalizeContainedSpellValue(saveVal, editEntry?.charge)
        charge = getContainedSpellTotalCharges(saveVal)
      }
      const parts = effectModuleToEntryParts(mod, currentEffect, referenceData)
      // 盔甲/衣服：AC 加值写入 magicBonus，用于 AC 计算；不拼进附注
      if (isArmorOrClothing && currentEffect.key === 'ac_bonus') {
        const bonus = evaluateBuffValue(mod.value, referenceData)
        magicBonus = Number.isNaN(Number(bonus)) ? 0 : Number(bonus)
        return
      }
      effectsForSave.push({
        category: mod.category,
        effectType: currentEffect.key,
        value: saveVal,
        customText: mod.customText ?? '',
      })
      if (!isArmorOrClothing && parts.附注Part) 附注 = (附注 ? 附注 + '；' : '') + parts.附注Part
      if (parts.magicBonus != null) magicBonus = parts.magicBonus
      if (parts.charge != null) charge = parts.charge
      if (parts.spellDC != null) spellDC = parts.spellDC
      if (parts.spellAttackBonus != null) itemSpellAttackBonus = parts.spellAttackBonus
      if (parts.攻击距离 !== undefined) 攻击距离 = parts.攻击距离 || undefined
      if (parts.攻击范围 !== undefined) 攻击范围 = parts.攻击范围 || undefined
    })
    // 默认储物物品强制写入 item_storage 效果
    if (isDefaultStorageItem(itemId || editEntry) && !effectsForSave.some((e) => e.effectType === 'item_storage')) {
      effectsForSave.push({ category: 'container', effectType: 'item_storage', value: true, customText: '' })
    }
    const entry = {
      id: editEntry ? editEntry.id : 'inv_' + Date.now(),
      isAttuned,
      itemId: itemId || editEntry?.itemId || '',
      ...(rarity ? { rarity } : {}),
      name: (name?.trim()) || editEntry?.name || proto?.类别 || (proto ? getItemDisplayName(proto) : '') || '—',
      攻击: 攻击 || undefined,
      伤害: 伤害 || undefined,
      攻击距离: 攻击距离 || undefined,
      攻击范围: 攻击范围 || undefined,
      详细介绍: intro != null ? String(intro).trim() : '',
      附注: 附注 != null ? String(附注).trim() : '',
      ...(isWeapon && 精通 ? { 精通 } : {}),
      重量: proto?.重量,
      qty: Math.max(1, qty),
      magicBonus,
      charge,
      ...(spellDC != null ? { spellDC } : {}),
      ...(itemSpellAttackBonus != null ? { spellAttackBonus: itemSpellAttackBonus } : {}),
      effects: effectsForSave,
      ...(isExplosive ? { 爆炸半径: Number(explosiveRadius) || 0 } : {}),
      // 保留容器内的嵌套物品（若编辑的是已有容器）
      ...(Array.isArray(editEntry?.nestedInventory) ? { nestedInventory: editEntry.nestedInventory } : {}),
    }
    onSave(entry)
    onClose()
  }

  const renderEffectModulesSection = (title = '附魔效果（可多条）', wrapperClassName = '') => (
    <div className={`${wrapperClassName}`}>
      <div className="flex items-center justify-between mb-0.5">
        <label className="block text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider">{title}</label>
        <button
          type="button"
          onClick={handleAddModule}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-dnd-gold text-dnd-gold-light hover:bg-dnd-gold/20 text-[10px] font-medium"
        >
          <Plus className="w-3 h-3" />
          添加效果
        </button>
      </div>
      <div className="space-y-1">
        {effectModules.length === 0 ? (
          <p className="text-gray-500 text-xs text-center py-2">暂无附魔效果</p>
        ) : (
          effectModules.map((mod) => {
            const catData = BUFF_TYPES[mod.category]
            const currentEffect = catData?.effects?.find((e) => e.key === mod.effectType)
            const label = currentEffect ? (currentEffect.label ?? mod.effectType) : '—'
            const isContainedSpell = mod.effectType === 'contained_spell' && mod.value && typeof mod.value === 'object' && !Array.isArray(mod.value)
            let summaryNode
            let summaryTitle
            if (isContainedSpell) {
              const { totalText, lines } = formatContainedSpellLines(mod.value, effectSummaryContext)
              summaryTitle = [totalText, ...lines].filter(Boolean).join(' · ')
              summaryNode = (
                <span className="text-gray-200 text-sm block leading-snug">
                  {totalText && <span className="text-dnd-text-muted text-xs block">{totalText}</span>}
                  {lines.map((line, i) => (
                    <span key={i} className="block">{line}</span>
                  ))}
                </span>
              )
            } else {
              const summary = currentEffect
                ? getEffectSummaryShort({ effectType: mod.effectType, value: mod.value, customText: mod.customText }, effectSummaryContext)
                : '未选择效果'
              summaryTitle = summary
              summaryNode = <span className="text-gray-200 text-sm truncate" title={summary}>{summary}</span>
            }
            return (
              <div
                key={mod.id}
                className="rounded border border-white/[0.08] bg-[#1a2333]/60 px-2 py-1.5 flex items-start justify-between gap-2"
              >
                <div className="min-w-0 flex-1 flex items-start gap-2">
                  <span className="text-dnd-gold-light/90 text-xs font-medium shrink-0 pt-0.5" title={summaryTitle}>{label}</span>
                  {summaryNode}
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleEditModule(mod.id)}
                    className="p-1 rounded text-gray-400 hover:bg-gray-700 hover:text-dnd-gold transition-colors"
                    title="编辑"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeModule(mod.id)}
                    className="p-1 rounded text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors"
                    title="删除"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-[200] bg-black/50" onClick={onClose} aria-hidden />
      <div className="fixed inset-4 sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 sm:max-w-5xl sm:w-full z-[201] overflow-auto max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="space-y-2.5 p-3 bg-gray-800 rounded-xl border border-gray-600 min-w-0 w-full max-w-full">
          {isEdit && <h4 className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider">编辑物品</h4>}

          {/* 选择物品类型 → 获得基础信息（编辑时为只读） */}
          <div className="min-w-0 max-w-full">
            <div className="flex flex-nowrap items-center gap-1.5 min-w-0 max-w-full overflow-hidden">
              {isEdit && <span className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider shrink-0">类型</span>}
              {isEdit ? (
                <span className="min-w-0 truncate text-sm text-dnd-text-body">
                  <span className="text-gray-400">{type || '—'}</span>
                  <span className="text-gray-500 mx-0.5">/</span>
                  {selectedPrototype ? (getItemDisplayName(selectedPrototype) || itemId) : itemId || '—'}
                </span>
              ) : (
                <>
                  <select
                    value={type}
                    onChange={(e) => { setType(e.target.value); setItemId(''); }}
                    className={inputClass + ' h-8 min-w-0 w-[7rem] text-sm shrink-0'}
                  >
                    <option value="">— 类型 —</option>
                    {grouped.map((g) => (
                      <option key={g.type} value={g.type}>{g.type}</option>
                    ))}
                  </select>
                  <select
                    value={itemId}
                    onChange={(e) => setItemId(e.target.value)}
                    className={inputClass + ' h-8 flex-1 min-w-0 text-sm max-w-full'}
                    disabled={!type}
                  >
                    <option value="">— 选择物品 —</option>
                    {items.map((x) => (
                      <option key={x.id} value={x.id}>{x._display || getItemDisplayName(x) || x.类别}</option>
                    ))}
                  </select>
                </>
              )}
              <div className="ml-auto flex shrink-0 items-center gap-1.5">
                <select
                  value={rarity}
                  onChange={(e) => setRarity(e.target.value)}
                  className={inputClass + ' h-8 min-w-0 w-24 text-sm shrink-0'}
                >
                  {RARITY_OPTIONS.map((o) => (
                    <option key={o.value || '_'} value={o.value}>{o.label}</option>
                  ))}
                </select>
                {(isEdit || (selectedPrototype && itemRequiresAttunement(selectedPrototype))) && (
                  <label className="shrink-0 inline-flex items-center gap-1.5 h-8 px-2 rounded-lg border border-gray-600 bg-gray-800 text-gray-300 text-xs cursor-pointer whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={isAttuned}
                      onChange={(e) => setIsAttuned(e.target.checked)}
                      className="h-3.5 w-3.5 rounded border-gray-500 bg-black/30 text-dnd-gold focus:ring-dnd-gold/40"
                    />
                    同调
                  </label>
                )}
                {selectedPrototype && (
                  <span className="text-dnd-text-muted text-xs whitespace-nowrap shrink-0">重量：{weightDisplay}</span>
                )}
              </div>
            </div>
          </div>

          {/* 名字（可修改） */}
          <div className="flex items-center gap-2 min-w-0">
            {isEdit && <span className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider shrink-0">名字</span>}
            {!isEdit && <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-0.5 shrink-0">名字</label>}
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={selectedPrototype ? `不填则用「${getItemDisplayName(selectedPrototype)}」` : '可选'}
              className={inputClass + ' flex-1 min-w-0 h-8 text-sm'}
            />
          </div>

          {/* 简介（可修改） */}
          <div>
            <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-0.5">简介</label>
            <textarea
              ref={introRef}
              value={intro}
              onChange={(e) => setIntro(e.target.value)}
              onInput={autoResizeIntro}
              placeholder="附魔、说明等"
              rows={2}
              className={textareaClass + ' w-full text-sm min-w-0 break-words resize-none overflow-hidden'}
            />
          </div>

          {/* 爆炸物：三模块 — 左+中占 1/2 弹窗，右占 1/2；模块内内容均分平铺 */}
          {isExplosive && selectedPrototype ? (
            <div className="w-full rounded border border-gray-600 bg-gray-700/30 px-2 py-1">
              <div className="flex flex-nowrap items-baseline gap-0 min-w-0 w-full text-gray-200 text-xs">
                {/* 左半：抛投距离 | 分隔符 | 爆炸半径，共占 50% */}
                <div className="flex flex-nowrap items-baseline gap-0 min-w-0 flex-1">
                  <div className="flex items-baseline justify-evenly gap-1.5 min-w-0 flex-1 px-0.5">
                    <span className="shrink-0">抛投距离</span>
                    <NumberStepper
                      value={parseInt(explosiveAttackDistance, 10) || parseInt(String(explosiveAttackDistance || '').match(/\d+/)?.[0], 10) || 0}
                      onChange={(n) => setExplosiveAttackDistance(String(n))}
                      min={0}
                      max={999}
                      step={5}
                      compact
                      narrow
                      unifiedColor
                    />
                    <span className="shrink-0">尺</span>
                  </div>
                  <div className="flex shrink-0 self-stretch items-stretch" aria-hidden>
                    <span className="w-3 shrink-0" />
                    <span className="border-l border-gray-500 w-0 shrink-0 self-stretch" />
                    <span className="w-3 shrink-0" />
                  </div>
                  <div className="flex items-baseline justify-evenly gap-1.5 min-w-0 flex-1 px-0.5">
                    <span className="shrink-0">爆炸半径</span>
                    <NumberStepper
                      value={explosiveRadius}
                      onChange={setExplosiveRadius}
                      min={0}
                      max={999}
                      step={5}
                      compact
                      narrow
                      unifiedColor
                    />
                    <span className="shrink-0">尺</span>
                  </div>
                </div>
                <div className="flex shrink-0 self-stretch items-stretch" aria-hidden>
                  <span className="w-3 shrink-0" />
                  <span className="border-l border-gray-500 w-0 shrink-0 self-stretch" />
                  <span className="w-3 shrink-0" />
                </div>
                {/* 右半：伤害，占 50% */}
                <div className="flex items-baseline justify-evenly min-w-0 flex-1 px-0.5">
                  <DamageDiceInlineRow
                    value={explosiveDamage}
                    onChange={(next) => {
                      if (next.value != null) setExplosiveDamage(next.value)
                    }}
                    module={{ id: 'explosive-dmg', value: explosiveDamage }}
                    compact
                    leftLabel="伤害"
                    narrowBlocks
                    evenSpacing
                    unifiedColor
                    evenSpread
                  />
                </div>
              </div>
            </div>
          ) : null}

          {/* 武器基本属性：伤害、词条、精通（选择物品时从基础数据自动填入）；下方为附魔效果 */}
          {isWeapon && selectedPrototype ? (
            <div className="w-full rounded border border-gray-600 bg-gray-700/30 px-2 py-1.5 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider">武器基本属性</span>
                <button type="button" onClick={() => {
                  const { base, versa } = splitVersatileDamage(selectedPrototype.攻击 ?? '')
                  setWeaponDamage(base)
                  setWeaponVersatileDamage(versa)
                }} className="text-xs px-1.5 py-0.5 rounded border border-gray-500 text-gray-400 hover:bg-gray-600">使用模版</button>
              </div>
              <div>
                <DamageDiceInlineRow
                  value={weaponDamage}
                  onChange={(next) => next.value != null && setWeaponDamage(next.value)}
                  module={{ id: 'weapon-dmg', effectType: 'extra_damage_dice', value: weaponDamage }}
                  compact
                  hideFlatMod
                  leftLabel="伤害"
                  trailing={
                    <>
                      <span className="text-dnd-text-muted text-xs shrink-0">精通</span>
                      <select value={weaponMastery} onChange={(e) => setWeaponMastery(e.target.value)} className={inputClass + ' h-7 text-xs min-w-[6rem] h-full py-0 pr-6'} title="精通">
                        <option value="">—</option>
                        {WEAPON_MASTERY_OPTIONS.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </>
                  }
                />
              </div>
              {weaponTraits.includes('多用') && (
                <div>
                  <DamageDiceInlineRow
                    value={weaponVersatileDamage}
                    onChange={(next) => {
                      if (next.value == null) return
                      setWeaponVersatileDamage((prev) => ({
                        ...next.value,
                        type: next.value.type || prev.type || weaponDamage.type || '',
                      }))
                    }}
                    module={{ id: 'weapon-versatile-dmg', effectType: 'extra_damage_dice', value: weaponVersatileDamage }}
                    compact
                    hideFlatMod
                    leftLabel="双手"
                  />
                </div>
              )}
              <div>
                <span className="text-dnd-text-muted text-xs block mb-0.5">词条</span>
                <div className="flex flex-wrap gap-x-2 gap-y-1">
                  {WEAPON_TRAIT_OPTIONS.map((t) => {
                    const isRangeTrait = t === '射程'
                    const isAmmoTrait = t === '弹药'
                    const checked = weaponTraits.includes(t)
                    return (
                      <label key={t} className={`flex items-center gap-1 cursor-pointer text-xs ${(isRangeTrait || isAmmoTrait) ? 'whitespace-nowrap' : ''}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            const nextChecked = e.target.checked
                            setWeaponTraits((prev) => nextChecked ? [...prev, t] : prev.filter((x) => x !== t))
                          }}
                          className="rounded border-gray-600 bg-gray-800 text-dnd-red"
                        />
                        <span className="text-dnd-text-body">{t}</span>
                        {isRangeTrait && checked && (
                          <input
                            type="text"
                            value={weaponRange}
                            onChange={(e) => setWeaponRange(e.target.value)}
                            placeholder="XX/XX"
                            className={inputClass + ' h-7 text-xs w-28 ml-1'}
                          />
                        )}
                        {isAmmoTrait && checked && (
                          <select
                            value={weaponAmmoCategory}
                            onChange={(e) => setWeaponAmmoCategory(e.target.value)}
                            className={inputClass + ' h-7 text-xs min-w-0 max-w-[8rem] ml-1'}
                            title="选择背包内弹药"
                          >
                            <option value="">— 选择弹药 —</option>
                            {ammoOptionsFromInv.map((cat) => (
                              <option key={cat} value={cat}>{cat}</option>
                            ))}
                          </select>
                        )}
                      </label>
                    )
                  })}
                </div>
              </div>
              {renderEffectModulesSection('附魔效果（可多条）', 'w-full pt-1.5 border-t border-gray-600/80')}
            </div>
          ) : null}

          {/* 盔甲/盾牌：基础属性与附魔为同级，先基础（必填）后附魔（魔法物品可选） */}
          {isArmor && (
            <>
              <div className="rounded border border-gray-600 bg-gray-700/30 px-2 py-1.5 space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider">{isShield ? '盾牌基本属性' : '盔甲基本属性'}</span>
                </div>
                {isShield ? (
                  <div className="flex items-center gap-2">
                    <span className="text-dnd-text-muted text-xs">基础 AC</span>
                    <NumberStepper
                      value={Number(armorFields.shieldBonus) || 0}
                      onChange={(v) => setArmorFields((f) => ({ ...f, shieldBonus: String(Math.max(0, v)) }))}
                      min={0}
                      compact
                    />
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-dnd-text-muted shrink-0 text-xs">基础 AC</span>
                      <NumberStepper
                        value={Math.max(0, parseInt(armorFields.baseAC, 10) || 0)}
                        onChange={(v) => setArmorFields((f) => ({ ...f, baseAC: String(Math.max(0, v)) }))}
                        min={0}
                        max={30}
                        compact
                      />
                    </div>
                    <div className="flex items-center gap-1 min-w-[8rem] flex-1">
                      <span className="text-dnd-text-muted shrink-0">敏捷调整值</span>
                      <select
                        value={armorFields.dexMode === 'cap' ? (armorFields.dexCap === 3 ? 'cap3' : 'cap2') : 'full'}
                        onChange={(e) => {
                          const v = e.target.value
                          if (v === 'cap3') setArmorFields((f) => ({ ...f, dexMode: 'cap', dexCap: 3 }))
                          else if (v === 'cap2') setArmorFields((f) => ({ ...f, dexMode: 'cap', dexCap: 2 }))
                          else setArmorFields((f) => ({ ...f, dexMode: 'full', dexCap: 2 }))
                        }}
                        className={inputClass + ' h-7 text-xs flex-1'}
                      >
                        <option value="full">敏调</option>
                        <option value="cap2">敏调最大2</option>
                        <option value="cap3">中甲大师（敏调最大3）</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-1 min-w-[7rem] flex-1">
                      <span className="text-dnd-text-muted shrink-0">力量需求</span>
                      <input
                        type="text"
                        value={armorFields.strReq}
                        onChange={(e) => setArmorFields((f) => ({ ...f, strReq: e.target.value }))}
                        className={inputClass + ' h-7 text-xs flex-1'}
                        placeholder="— / 13"
                      />
                    </div>
                    <div className="flex items-center gap-1 min-w-[7rem] flex-1">
                      <span className="text-dnd-text-muted shrink-0">隐匿劣势</span>
                      <select
                        value={armorFields.stealth}
                        onChange={(e) => setArmorFields((f) => ({ ...f, stealth: e.target.value }))}
                        className={inputClass + ' h-7 text-xs flex-1'}
                      >
                        <option value="—">—</option>
                        <option value="劣势">劣势</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded border border-gray-600 bg-gray-700/30 px-2 py-1.5 space-y-1.5">
                {renderEffectModulesSection()}
              </div>
            </>
          )}

          {/* 非武器且非盔甲/衣服：仅附魔效果 */}
          {!isWeapon && !isArmor && (
            <div className="w-full rounded border border-gray-600 bg-gray-700/30 px-2 py-1.5 space-y-1.5">
              {renderEffectModulesSection()}
            </div>
          )}

          {/* 数量、重量 同行 */}
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-0.5">数量</label>
              <div className="flex items-center gap-1 h-8">
                <button type="button" onClick={() => setQty(Math.max(1, (qty || 1) - 1))} className="h-8 w-8 rounded border border-gray-600 bg-gray-700 text-white font-bold text-sm">−</button>
                <input type="number" min={1} value={qty} onChange={(e) => setQty(Math.max(1, parseInt(e.target.value, 10) || 1))} className={inputClass + ' h-8 w-16 text-center text-sm'} />
                <button type="button" onClick={() => setQty((qty || 1) + 1)} className="h-8 w-8 rounded border border-gray-600 bg-gray-700 text-white font-bold text-sm">+</button>
              </div>
            </div>
            <div>
              <label className="block text-dnd-gold-light text-xs font-bold uppercase tracking-wider mb-0.5">重量</label>
              <p className="h-8 flex items-center text-dnd-text-muted text-xs">{weightDisplay}</p>
            </div>
          </div>

          <div className="flex gap-1.5 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-3 py-1.5 rounded border border-gray-600 text-gray-300 hover:bg-gray-700 text-sm">
              取消
            </button>
            <button type="submit" disabled={!itemId && !isEdit} className="px-3 py-1.5 rounded bg-dnd-red hover:bg-dnd-red-hover text-white font-medium text-sm disabled:opacity-50">
              {submitLabel}
            </button>
          </div>
        </form>
      </div>

      {editingModule && (
        <>
          <div className="fixed inset-0 z-[202] bg-black/50" onClick={handleCancelModule} aria-hidden />
          <div className="fixed inset-0 z-[203] flex items-center justify-center p-4 sm:p-8 overflow-auto" onClick={handleCancelModule}>
            <div className="w-full max-w-2xl max-h-[90vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
              <EffectModuleModal
                module={editingModule}
                isNew={editingModuleId === newModuleIdRef.current}
                onSave={handleSaveModule}
                onCancel={handleCancelModule}
                referenceData={referenceData}
                baseReferenceData={referenceData}
                spellDC={spellDC}
                spellAttackBonus={spellAttackBonus}
                useWandScrollTable={useWandScrollTable}
              />
            </div>
          </div>
        </>
      )}
    </>
  )
}
