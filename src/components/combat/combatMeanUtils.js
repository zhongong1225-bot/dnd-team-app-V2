/**
 * 战斗手段共享工具：常量、武器/法术/组合技/增益 纯函数
 * 从 CombatStatus.jsx 抽出，供添加弹窗各步骤组件共用。
 */
import { DAMAGE_TYPES, getDamageTypeLabel, normalizeScope, SCOPE_KIND, scopeMatchesCombatMean, parseDamageString, formatDamageForAttack, weaponProtoMatchesBuffWeaponCategories } from '../../data/buffTypes'
import { getSpellById } from '../../data/spellDatabase'
import { getItemById } from '../../data/itemDatabase'
import { MARTIAL_TECHNIQUES, getMartialTechniqueById } from '../../data/martialTechniques'
import { parseCombatDiceExpression } from '../../data/weaponDatabase'
import { sumWeaponCategoryAttackDamageBonus } from '../../hooks/useBuffCalculator'
import { abilityModifier } from '../../lib/formulas'

/* ═══════════════════ 常量 ═══════════════════ */

/** 战斗手段弹窗用：伤害类型选项（排除 雷鸣） */
export const DAMAGE_TYPE_OPTIONS = DAMAGE_TYPES.filter((d) => d.label !== '雷鸣').map((d) => ({ value: d.label, label: d.label }))

/** 伤害类型超短称 */
export const DAMAGE_TYPE_SHORT = { 强酸: '酸', 钝击: '钝', 寒冷: '寒', 火焰: '火', 力场: '力', 闪电: '电', 暗蚀: '暗', 穿刺: '穿', 毒素: '毒', 心灵: '心', 光耀: '光', 挥砍: '挥', 雷鸣: '雷', 贯通: '贯', 治疗: '疗' }

/** 内含法术命中判定 value -> 显示文案 */
export const HIT_RESOLUTION_LABELS = { dex_save: '敏捷豁免', str_save: '力量豁免', con_save: '体质豁免', wis_save: '感知豁免', int_save: '智力豁免', cha_save: '魅力豁免', spell_attack: '法术攻击' }

/** 组合技附件来源类型 */
export const COMBO_ATTACHMENT_SOURCE_TYPES = [
  { value: 'custom', label: '自定义' },
  { value: 'combatMean', label: '战斗手段' },
  { value: 'martialTechnique', label: '武技' },
  { value: 'classFeature', label: '职业能力' },
]

/** 可直接作为组合技附件引用的职业能力 */
export const COMBO_CLASS_FEATURE_OPTIONS = [
  { id: 'divine_smite', name: '至圣斩', defaultDamageDice: '2d8' },
  { id: 'eldritch_smite', name: '魔能斩', defaultDamageDice: '1d8' },
  { id: 'sneak_attack', name: '偷袭', defaultDamageDice: '1d6' },
  { id: 'brutal_strike', name: '凶蛮打击', defaultDamageDice: '1d10' },
  { id: 'improved_brutal_strike', name: '强化凶蛮打击', defaultDamageDice: '2d10' },
  { id: 'psychic_smite', name: '灵能重击', defaultDamageDice: '3d8' },
]

/** 战斗手段增益类型定义 */
export const GAIN_TYPES = [
  { key: 'extraDice', label: '增加伤害骰' },
  { key: 'damageBonus', label: '增加伤害' },
  { key: 'attackBonus', label: '增加命中' },
  { key: 'diceFloor2', label: '伤害骰不能低于2' },
  { key: 'perDieBonus', label: '每伤害骰+1' },
  { key: 'advantage', label: '优劣势' },
]

/** 武器战斗模式选项 */
export const WEAPON_MODE_OPTIONS = [
  { value: 'one_hand', label: '单手' },
  { value: 'two_hand', label: '双手' },
  { value: 'ranged', label: '远程' },
]

/** 匹配 XdY 骰子片段 */
const WEAPON_DICE_CHUNK_RE = /\d+[dDｄ]\d+/gi

/* ═══════════════════ 骰子工具 ═══════════════════ */

/** 合并相同面数的骰子列表 */
export function mergeDuplicateDice(diceList) {
  if (!Array.isArray(diceList)) return diceList
  const counts = {}
  let hasMergeable = false
  for (const d of diceList) {
    const s = String(d).trim().toLowerCase()
    const m = s.match(/^(\d+)d(\d+)$/)
    if (!m) return diceList
    hasMergeable = true
    counts[m[2]] = (counts[m[2]] || 0) + (parseInt(m[1], 10) || 0)
  }
  if (!hasMergeable) return diceList
  return Object.entries(counts)
    .sort(([a], [b]) => Number(b) - Number(a))
    .map(([size, count]) => `${count}d${size}`)
}

/* ═══════════════════ 武器工具 ═══════════════════ */

/** 远程武器/枪械判断 */
export function isRangedWeaponProto(proto) {
  if (!proto) return false
  return proto.子类型 === '远程' || proto.类型 === '枪械'
}

/** 武器是否使用敏捷（灵巧） */
export function weaponUsesDex(proto) {
  return proto?.附注 && /灵巧/i.test(String(proto.附注))
}

export function getWeaponNote(weaponOpt) {
  return String(weaponOpt?.entry?.附注 ?? weaponOpt?.proto?.附注 ?? '')
}
export function weaponHasTwoHanded(weaponOpt) { return /双手/i.test(getWeaponNote(weaponOpt)) }
export function weaponHasThrown(weaponOpt) { return /投掷/i.test(getWeaponNote(weaponOpt)) }
export function weaponHasVersatile(weaponOpt) { return /多用/i.test(getWeaponNote(weaponOpt)) }
export function weaponHasLight(weaponOpt) { return /轻型/i.test(getWeaponNote(weaponOpt)) }

/** 角色是否双持轻型武器 */
export function isDualWieldingLightWeapons(character) {
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

/** 根据武器推断默认战斗模式 */
export function getDefaultWeaponMode(weaponOpt) {
  if (!weaponOpt) return 'one_hand'
  if (isRangedWeaponProto(weaponOpt.proto)) return 'ranged'
  const hasTwo = weaponHasTwoHanded(weaponOpt)
  const hasVersatile = weaponHasVersatile(weaponOpt)
  const hasThrown = weaponHasThrown(weaponOpt)
  if (hasTwo && !hasVersatile && !hasThrown) return 'two_hand'
  return 'one_hand'
}

/** 武器可用模式选项 */
export function getWeaponModeOptions(weaponOpt, character) {
  if (!weaponOpt) return WEAPON_MODE_OPTIONS
  if (isRangedWeaponProto(weaponOpt.proto)) return WEAPON_MODE_OPTIONS.filter((o) => o.value === 'ranged')
  const hasTwo = weaponHasTwoHanded(weaponOpt)
  const hasVersatile = weaponHasVersatile(weaponOpt)
  const hasThrown = weaponHasThrown(weaponOpt)
  let options
  if (hasTwo && !hasVersatile && !hasThrown) {
    options = WEAPON_MODE_OPTIONS.filter((o) => o.value === 'two_hand')
  } else if (hasVersatile && hasThrown) {
    options = WEAPON_MODE_OPTIONS.filter((o) => o.value === 'one_hand' || o.value === 'ranged')
  } else if (hasVersatile) {
    options = WEAPON_MODE_OPTIONS.filter((o) => o.value === 'one_hand' || o.value === 'two_hand')
  } else {
    options = WEAPON_MODE_OPTIONS.filter((o) => o.value === 'one_hand')
  }
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

/** 武器可用属性选项 */
export function getAbilityOptions(weaponOpt, currentAbility) {
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
  if (currentAbility && !options.some((o) => o.value === currentAbility)) {
    const label = currentAbility === 'spell' ? '施法属性' : currentAbility
    options = [...options, { value: currentAbility, label }]
  }
  return options
}

/** 未在战斗手段中指定属性时的默认推断 */
export function inferPhysicalWeaponAbilityFromProto(proto) {
  if (!proto) return 'str'
  if (isRangedWeaponProto(proto) || weaponUsesDex(proto)) return 'dex'
  return 'str'
}

/** 武器基础伤害拆分（单手/双手） */
export function stripDiceFlatMod(plus) {
  if (!plus || typeof plus !== 'string') return plus
  const m = plus.trim().match(/^(\d+)d(\d+)\s*([+-])\s*(\d+)$/i)
  if (!m) return plus
  return `${m[1]}d${m[2]}`
}

export function getWeaponBaseDamageObjects(weaponOpt) {
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
    const note = String(weaponOpt?.entry?.附注 ?? weaponOpt?.proto?.附注 ?? '')
    const versatileMatch = note.match(/多用[（(](\d+d\d+)[）)]/i)
    versa.plus = versatileMatch ? (stripDiceFlatMod(versatileMatch[1].trim()) || base.plus) : base.plus
  }
  return { base, versa }
}

/** 获取用于解析的武器攻击字符串 */
export function getWeaponAttackStringForParsing(weaponOpt, mode) {
  if (!weaponOpt) return ''
  const { base, versa } = getWeaponBaseDamageObjects(weaponOpt)
  const baseAttack = formatDamageForAttack(mode === 'two_hand' ? versa : base)
  let attack = baseAttack
  const damageText = String(weaponOpt.伤害 ?? '').trim()
  if (damageText && damageText !== '—') {
    const extra = damageText.match(WEAPON_DICE_CHUNK_RE) || []
    for (const seg of extra) {
      const segNorm = seg.replace(/\uFF44/g, 'd').replace(/D/g, 'd').toLowerCase()
      if (!attack.toLowerCase().includes(segNorm)) {
        attack = attack ? `${attack.replace(/\s+$/, '')}+${segNorm}` : segNorm
      }
    }
  }
  return attack
}

/** 解析武器攻击字符串 */
export function parseWeaponAttack(attackStr) {
  if (!attackStr || typeof attackStr !== 'string') return { dice: null, diceList: [], type: '—' }
  let s = attackStr.trim()
  const hashIdx = s.lastIndexOf(' #')
  if (hashIdx >= 0) s = s.slice(0, hashIdx).trim()
  if (!s || s === '—') return { dice: null, diceList: [], type: s }
  const rawMatches = s.match(WEAPON_DICE_CHUNK_RE)
  const diceList = mergeDuplicateDice(rawMatches ? rawMatches.map((d) => d.replace(/\uFF44/g, 'd').replace(/D/g, 'd').toLowerCase()) : [])
  const dice = diceList[0] ?? null
  let rest = s
  for (const raw of rawMatches || []) {
    rest = rest.replace(new RegExp(String(raw).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), ' ')
  }
  rest = rest.replace(/\s+/g, ' ').trim()
  rest = rest.split(/\s+/).filter((tok) => tok && !/^\+*\d+$/.test(tok)).join(' ').trim()
  const type = rest && rest !== '' ? rest : '—'
  if (diceList.length === 0) return { dice: null, diceList: [], type: s }
  return { dice, diceList, type }
}

/** 战斗行内展示：多骰用 + 连接 */
export function formatWeaponAttackDiceDisplay(attackParsed) {
  const list = attackParsed?.diceList?.length ? attackParsed.diceList : attackParsed?.dice ? [attackParsed.dice] : []
  if (!list.length) return '—'
  return list.join('+').toUpperCase()
}

/** 非零时输出 +N / -N */
export function formatSignedModifier(n) {
  const m = Number(n)
  if (Number.isNaN(m) || m === 0) return ''
  return m > 0 ? `+${m}` : `${m}`
}

/** 与主武器骰+类型完全相同时不重复展示 */
export function filterExtraDiceAgainstMain(attackParsed, rawDamageType, lines) {
  const mainDiceList = attackParsed?.diceList?.length ? attackParsed.diceList : attackParsed?.dice ? [attackParsed.dice] : []
  const mainLower = mainDiceList.map((x) => x.toLowerCase())
  return lines.filter((d) => {
    const p = parseWeaponAttack(d)
    const extraDice = (p.dice || '').toLowerCase()
    const sameDice = extraDice && mainLower.includes(extraDice)
    const sameType = (p.type || '').trim() === (rawDamageType || '').trim()
    return !(sameDice && sameType)
  })
}

/* ═══════════════════ 武器 → 施法属性 / 增益 ═══════════════════ */

/** 从武器附魔 effects 读取施法属性覆盖 */
export function getWeaponEntrySpellAbility(entry) {
  if (!entry || !Array.isArray(entry.effects)) return null
  for (const e of entry.effects) {
    if (!e) continue
    if (e.effectType === 'spell_ability_attack' && e.value && typeof e.value === 'object' && e.value.ability) {
      return e.value.ability
    }
  }
  return null
}

/** 从 flatBuffEffects 读取施法属性命中覆盖 */
export function getSpellAbilityForAttackFromBuffs(flatEffects, ctx) {
  if (!Array.isArray(flatEffects)) return null
  for (const e of flatEffects) {
    if (!e || e.effectType !== 'spell_ability_attack') continue
    const { scope } = normalizeScope(e.scope, e.scopeDetail)
    if (scope !== '' && scope !== SCOPE_KIND.global) {
      if (!scopeMatchesCombatMean(e, { ...ctx, sourceKind: 'physical' })) continue
    }
    if (e.value && typeof e.value === 'object' && e.value.ability) return e.value.ability
  }
  return null
}

/** 判断武器属性种类：str / dex / spell */
export function resolvePhysicalWeaponAbilityKind(cm, weaponOpt, spellAbilityOverride) {
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

/** 从武器条目读取额外伤害骰文案 */
export function getWeaponEntryDamageExtras(entry, proto, isSpellMean = false) {
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

/** 合并战斗手段 extraDamageDice + 武器条目额外骰 */
export function getMergedWeaponExtraDiceStrings(cm, weaponOpt) {
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

/** 统一计算物理战斗手段的命中、伤害与 Buff 分解 */
export function computePhysicalWeaponStats(cm, weaponOpt, ctx) {
  const { effectiveAbilities, prof, spellAbility, buffStats, flatBuffEffects, itemFormulaContext } = ctx
  const isRangedWeapon = weaponOpt ? isRangedWeaponProto(weaponOpt.proto) : false
  const weaponCategoryAttackFlat = weaponOpt?.proto
    ? sumWeaponCategoryAttackDamageBonus(buffStats?.weaponCategoryAttackDamageBonuses ?? [], weaponOpt.proto)
    : 0
  const buffAttackBonus = (isRangedWeapon ? (buffStats?.rangedAttackBonus ?? 0) : (buffStats?.meleeAttackBonus ?? 0)) + weaponCategoryAttackFlat
  const buffDamageBonus = (isRangedWeapon ? (buffStats?.rangedDamageBonus ?? 0) : (buffStats?.meleeDamageBonus ?? 0)) + weaponCategoryAttackFlat
  const weaponProficient = cm.weaponProficient !== false
  const weaponExpertiseCategories = buffStats?.weaponExpertiseCategories ?? []
  const weaponIsExpert = weaponProficient && weaponExpertiseCategories.length > 0 && weaponOpt?.proto && weaponProtoMatchesBuffWeaponCategories(weaponOpt.proto, weaponExpertiseCategories)
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
  }) || getWeaponEntrySpellAbility(weaponOpt?.entry)
  const weaponAbilityKind = resolvePhysicalWeaponAbilityKind(cm, weaponOpt, spellAbilityOverride)
  const abilityKey = weaponAbilityKind === 'spell' ? spellAbility : weaponAbilityKind
  const abilityMod = abilityModifier(effectiveAbilities?.[abilityKey] ?? 10)
  const physicalAttackBonus = abilityMod + (weaponProficient ? (weaponIsExpert ? prof * 2 : prof) : 0) + buffAttackBonus + gainAttackBonus
  const damageMod = cm.weaponVersatileMode === 'bonus_action' ? 0 : abilityMod
  const weaponExtraDiceStrings = [...getMergedWeaponExtraDiceStrings(cm, weaponOpt), ...gainExtraDice]
  const allWeaponDiceCount = (attackParsed.diceList || []).reduce((s, d) => s + (parseCombatDiceExpression(d)?.count || 0), 0) +
    weaponExtraDiceStrings.reduce((s, d) => s + (parseCombatDiceExpression(String(d).split(' ')[0])?.count || 0), 0)
  const weaponPerDieMod = gainPerDieBonus * allWeaponDiceCount
  const totalDamageMod = damageMod + buffDamageBonus + gainDamageBonus + weaponPerDieMod
  const displayDamageType = rawDamageType ? getDamageTypeLabel(rawDamageType) : '—'
  return {
    weaponAbilityKind, abilityKey, abilityMod, isRangedWeapon, weaponCategoryAttackFlat,
    buffAttackBonus, buffDamageBonus, weaponProficient, weaponIsExpert, gains, gainAttackBonus, gainDamageBonus,
    gainPerDieBonus, gainExtraDice, gainAdvantage, gainDiceFloor2, attackParsed, rawDamageType,
    physicalAttackBonus, damageMod, weaponExtraDiceStrings, allWeaponDiceCount,
    weaponPerDieMod, totalDamageMod, displayDamageType,
  }
}

/* ═══════════════════ 法术工具 ═══════════════════ */

/** 从法术描述中解析伤害 */
export function parseSpellDamageFromDescription(desc) {
  if (!desc || typeof desc !== 'string') return []
  const results = []
  const re = /(\d+d\d+)\s*点?\s*(\S+)\s*伤害/g
  let m
  while ((m = re.exec(desc))) results.push({ dice: m[1], type: m[2] })
  return results
}

/** 法术是否使用攻击检定 */
export function spellUsesAttack(desc) {
  return desc && /(远程|近战)?法术攻击/.test(String(desc))
}

/** 根据法术描述推断豁免类型 */
export function inferSaveFromSpellDescription(desc) {
  if (!desc || typeof desc !== 'string') return 'spell_attack'
  const saveMap = { 敏捷: 'dex_save', 力量: 'str_save', 体质: 'con_save', 感知: 'wis_save', 智力: 'int_save', 魅力: 'cha_save' }
  for (const [name, key] of Object.entries(saveMap)) {
    if (desc.includes(`${name}豁免`)) return key
  }
  return 'spell_attack'
}

/* ═══════════════════ 组合技工具 ═══════════════════ */

/** 从文本提取第一个 XdY 伤害骰 */
export function inferDamageDiceFromText(text) {
  if (!text) return ''
  const match = String(text).match(/(\d+d\d+)/i)
  return match ? match[1] : ''
}

/** 判断组合技附件是否有效 */
export function isValidComboAttachment(a) {
  return !!(a && a.name && /^\d+d\d+/i.test(a.damageDice || ''))
}

/** 获取非组合技战斗手段的显示名称 */
export function getCombatMeanLabel(mean, { weaponsFromInv = [], itemMeansFromInv = [] } = {}) {
  if (!mean) return '—'
  if (mean.type === 'physical') {
    const w = weaponsFromInv.find((w) => w.index === mean.weaponInventoryIndex)
    const suffix = mean.weaponNameSuffix ? String(mean.weaponNameSuffix).trim() : ''
    if (w) return w.name + (suffix ? ` ${suffix}` : '')
    return '武器' + (suffix ? ` (${suffix})` : '') + (mean.weaponInventoryIndex != null ? ` #${mean.weaponInventoryIndex}` : '')
  }
  if (mean.type === 'spell_attack' || mean.type === 'spell') return mean.spellName || '法术'
  if (mean.type === 'item') {
    const it = itemMeansFromInv.find((x) => x.index === mean.itemInventoryIndex)
    return it?.name || '道具'
  }
  if (mean.type === 'combo') return mean.primaryMeanId ? '组合技' : '组合技'
  return '—'
}

/* ═══════════════════ 增益工具 ═══════════════════ */

/** 取战斗手段启用的增益列表 */
export function getEnabledGains(cm) {
  return Array.isArray(cm?.gains) ? cm.gains.filter((g) => g && g.enabled !== false) : []
}

export function sumGainAttackBonus(gains) {
  return gains.filter((g) => g.type === 'attackBonus').reduce((s, g) => s + (Number(g.value) || 0), 0)
}
export function sumGainDamageBonus(gains) {
  return gains.filter((g) => g.type === 'damageBonus').reduce((s, g) => s + (Number(g.value) || 0), 0)
}
export function sumGainPerDieBonus(gains) {
  return gains.filter((g) => g.type === 'perDieBonus').reduce((s, g) => s + (Number(g.value) || 0), 0)
}
export function getGainExtraDice(gains) {
  return gains.filter((g) => g.type === 'extraDice' && g.dice).map((g) => g.dice)
}
export function getGainAdvantage(gains) {
  const adv = gains.find((g) => g.type === 'advantage' && g.enabled !== false)
  return adv && (adv.advantage === 'advantage' || adv.advantage === 'disadvantage') ? adv.advantage : null
}
export function hasGainDiceFloor2(gains) {
  return gains.some((g) => g.type === 'diceFloor2' && g.enabled !== false)
}

/** 根据 BUFF 自动生成默认增益 */
export function buildDefaultGainsFromBuffs(cm, buffStats, mergedBuffs, isSpellMean = false, character = null, formulaContext = {}) {
  const gains = []
  const isPhysical = cm?.type === 'physical'
  const isSpellAttack = cm?.type === 'spell_attack' || cm?.type === 'spell'
  const pushOnce = (type, payload) => {
    const id = 'g_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6)
    gains.push({ id, type, enabled: true, auto: true, ...payload })
  }
  const hasAutoGain = (type) => gains.some((g) => g.type === type && g.auto)

  let scopeCtx = { sourceKind: cm?.type === 'item' ? 'item' : isPhysical ? 'physical' : 'spell_attack' }
  if (isPhysical && character?.inventory) {
    const entry = cm?.weaponInventoryIndex != null ? character.inventory[cm.weaponInventoryIndex] : null
    const proto = entry?.itemId ? getItemById(entry.itemId) : null
    scopeCtx = {
      ...scopeCtx,
      weaponProto: proto,
      damageType: cm?.damageType,
      targetCreatureType: cm?.targetCreatureType || '',
      sourceItemInventoryId: entry?.id,
    }
  } else if (isSpellAttack) {
    scopeCtx = {
      ...scopeCtx,
      damageType: cm?.damageTypeSpell,
      targetCreatureType: cm?.targetCreatureType || '',
      spellName: cm?.spellName || '',
      spellLevel: cm?.spellLevel != null ? Number(cm.spellLevel) : null,
    }
  }
  const scopeMatches = (e) => {
    const { scope } = normalizeScope(e.scope, e.scopeDetail)
    if (scope === SCOPE_KIND.global || scope === '') return true
    if (isPhysical || isSpellAttack) return scopeMatchesCombatMean(e, scopeCtx)
    return false
  }

  let totalAttackBonus = 0
  let totalDamageBonus = 0
  let totalPerDieBonus = 0
  let advantageValue = null
  if (Array.isArray(mergedBuffs)) {
    for (const b of mergedBuffs) {
      if (b.enabled === false) continue
      const effects = Array.isArray(b.effects) ? b.effects : [b]
      for (const e of effects) {
        if (!e) continue
        const { scope } = normalizeScope(e.scope, e.scopeDetail)
        if (!scopeMatches(e)) continue
        if (e.effectType === 'extra_damage_dice') {
          if (!hasAutoGain('extraDice')) {
            const raw = e.value
            let diceStr = ''
            if (typeof raw === 'string') diceStr = raw.trim()
            else if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
              diceStr = formatDamageForAttack(raw)
            }
            if (diceStr) pushOnce('extraDice', { dice: diceStr })
          }
        } else if (e.effectType === 'damage_bonus') {
          totalDamageBonus += Number(e.value) || 0
        } else if (e.effectType === 'attack_bonus') {
          totalAttackBonus += Number(e.value) || 0
        } else if (e.effectType === 'per_die_bonus') {
          totalPerDieBonus += Number(e.value) || 0
        } else if (e.effectType === 'advantage') {
          if (!advantageValue) advantageValue = e.value || 'advantage'
        } else if (e.effectType === 'dice_floor_2') {
          if (!hasAutoGain('diceFloor2')) pushOnce('diceFloor2', {})
        }
      }
    }
  }
  if (totalAttackBonus !== 0 && !hasAutoGain('attackBonus')) pushOnce('attackBonus', { value: totalAttackBonus })
  if (totalDamageBonus !== 0 && !hasAutoGain('damageBonus')) pushOnce('damageBonus', { value: totalDamageBonus })
  if (totalPerDieBonus !== 0 && !hasAutoGain('perDieBonus')) pushOnce('perDieBonus', { value: totalPerDieBonus })
  if (advantageValue && !hasAutoGain('advantage')) pushOnce('advantage', { advantage: advantageValue })
  return gains
}

/** 保留手动增益，替换旧 auto 增益 */
export function mergeAutoGains(currentGains, autoGains) {
  const manual = (currentGains || []).filter((g) => !g.auto)
  return [...autoGains, ...manual]
}

function gainsNormalize(g) {
  if (!g) return g
  const { id, ...rest } = g
  return rest
}

/** 比较增益内容是否相同（忽略 id） */
export function gainsContentEqual(a, b) {
  const na = (a || []).map(gainsNormalize).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)))
  const nb = (b || []).map(gainsNormalize).sort((x, y) => JSON.stringify(x).localeCompare(JSON.stringify(y)))
  if (na.length !== nb.length) return false
  for (let i = 0; i < na.length; i++) {
    if (JSON.stringify(na[i]) !== JSON.stringify(nb[i])) return false
  }
  return true
}
