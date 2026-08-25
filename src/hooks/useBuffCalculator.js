import { useMemo } from 'react'
import { abilityModifier, getAC, proficiencyBonus, evaluateBuffValue, isFormulaValue, calcMaxHP, getHPBuffSum } from '../lib/formulas'
import { getPrimarySpellcastingAbility, getCharacterClasses } from '../data/classDatabase'
import { levelFromXP } from '../lib/xp5e'
import {
  ABILITY_KEYS,
  getDamageTypeValue,
  weaponProtoMatchesBuffWeaponCategories,
  protoMatchesWeaponBuffKey,
  SCOPE_KIND,
  normalizeScope,
  scopeMatchesCombatMean,
} from '../data/buffTypes'
import { getFlatEffectEntries } from '../lib/effects/effectMapping'
import { loadCreatureLibrary, getCreatureById, parseHpFormula } from '../data/creatureLibrary'

/**
 * BUFF 计算引擎
 * 输入：character, activeBuffs (已过滤 enabled=true)
 * 输出：finalStats (AC、攻击加值、豁免、优势/劣势等)
 * 支持单条 buff 与多效果 buff（buff.effects 数组）
 */
/** 自由填写类效果仅作展示，不参与 AC/攻击/豁免等数值计算 */
const DISPLAY_ONLY_EFFECT_TYPES = ['custom_condition']

/** 解析「18-20」「19-20」等暴击威胁范围，返回自然骰下限（含）；无法识别时返回 null */
export function parseCritRangeThreatMin(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const m = s.match(/(\d{1,2})\s*[-～~−－]\s*20\b/i)
  if (m) {
    const lo = parseInt(m[1], 10)
    if (lo >= 1 && lo <= 20) return lo
  }
  if (/^20$/i.test(s.replace(/\s/g, ''))) return 20
  return null
}

/** 仅从单件背包/装备条目的 effects 读取重击伤害骰倍数（规则默认 2；多件武器互不串用） */
export function getCritDamageDiceMultiplierFromItemEntry(entry, context = {}) {
  let mult = 2
  const arr = entry?.effects
  if (!Array.isArray(arr)) return mult
  for (const e of arr) {
    if (e?.effectType === 'crit_extra_dice') {
      const n = evaluateBuffValue(e.value, context)
      if (!Number.isNaN(n) && n >= 2) mult = Math.max(mult, Math.floor(n))
    }
  }
  return mult
}

/** 按武器 proto 累加「分武器加值」条目（categoryRows 每行单独数值；兼容旧 weaponCategories + 统一 val） */
export function sumWeaponCategoryAttackDamageBonus(entries, proto, context = {}) {
  if (!Array.isArray(entries) || entries.length === 0 || !proto) return 0
  let sum = 0
  for (const e of entries) {
    const rows = Array.isArray(e.categoryRows) ? e.categoryRows : []
    if (rows.length > 0) {
      for (const r of rows) {
        if (protoMatchesWeaponBuffKey(proto, r.key)) {
          const n = evaluateBuffValue(r.val, context)
          if (!Number.isNaN(n)) sum += n
        }
      }
    } else {
      const cats = Array.isArray(e.weaponCategories) ? e.weaponCategories : []
      if (weaponProtoMatchesBuffWeaponCategories(proto, cats)) {
        const n = evaluateBuffValue(e.val, context)
        if (!Number.isNaN(n)) sum += n
      }
    }
  }
  return sum
}

/** 仅从单件物品 effects 读取重击威胁下限（含）；默认仅自然 20 */
export function getCritThreatMinNaturalFromItemEntry(entry) {
  let min = 20
  const arr = entry?.effects
  if (!Array.isArray(arr)) return min
  for (const e of arr) {
    if (e?.effectType === 'crit_range_expand') {
      const mn = parseCritRangeThreatMin(e.value)
      if (mn != null) min = Math.min(min, mn)
    }
  }
  return min
}

/** 解析「施法距离延伸」的倍率与固定增量，兼容旧文本/纯数字/公式/对象 */
function parseSpellRangeExtension(raw, evalVal) {
  let multiplier = 1
  let bonus = 0
  if (raw == null) return { multiplier, bonus }
  if (typeof raw === 'number' || isFormulaValue(raw)) {
    const n = evalVal(raw)
    if (!Number.isNaN(n)) bonus += n
  } else if (typeof raw === 'object' && !Array.isArray(raw)) {
    const m = raw.multiplier ?? raw.mult
    if (m === 2 || m === '2' || (typeof m === 'string' && /x\s*2|2\s*倍|×\s*2/i.test(m))) multiplier = 2
    const val = raw.bonus ?? raw.val ?? raw.value
    const n = evalVal(val)
    if (!Number.isNaN(n)) bonus += n
  } else if (typeof raw === 'string') {
    const s = String(raw)
    if (/x\s*2|2\s*倍|×\s*2/i.test(s)) multiplier = 2
    const plusMatch = s.match(/[+＋]?(\d+)/)
    if (plusMatch) bonus += (parseInt(plusMatch[1], 10) || 0)
  }
  return { multiplier, bonus }
}

/** 解析「速度增加」为 { walk, fly, swim, climb }，兼容旧文本/对象/公式 */
function parseBaseSpeedIncrement(raw, evalVal) {
  const result = { walk: 0, fly: 0, swim: 0, climb: 0 }
  if (raw == null) return result
  if (typeof raw === 'number' || isFormulaValue(raw)) {
    const n = evalVal(raw)
    if (!Number.isNaN(n)) result.walk = n
    return result
  }
  if (typeof raw === 'object' && !Array.isArray(raw)) {
    const read = (key) => {
      const v = raw[key]
      if (v == null) return 0
      if (typeof v === 'number' || isFormulaValue(v)) {
        const n = evalVal(v)
        return Number.isNaN(n) ? 0 : n
      }
      const s = String(v)
      const m = s.match(/[+＋]?(\d+)/)
      return m ? parseInt(m[1], 10) || 0 : 0
    }
    result.walk = read('val') || read('speed') || read('walk') || 0
    result.fly = read('fly') || read('flight') || 0
    result.swim = read('swim') || 0
    result.climb = read('climb') || 0
    return result
  }
  if (typeof raw === 'string') {
    const s = String(raw)
    const typeRe = (word) => new RegExp(`${word}(?:速度)?\\s*[+＋]?\\s*(\\d+)`, 'i')
    const walkMatch = s.match(typeRe('行走'))
    const flyMatch = s.match(typeRe('飞行'))
    const swimMatch = s.match(typeRe('游泳'))
    const climbMatch = s.match(typeRe('攀爬'))
    if (walkMatch) result.walk = parseInt(walkMatch[1], 10) || 0
    if (flyMatch) result.fly = parseInt(flyMatch[1], 10) || 0
    if (swimMatch) result.swim = parseInt(swimMatch[1], 10) || 0
    if (climbMatch) result.climb = parseInt(climbMatch[1], 10) || 0
    if (result.walk === 0 && result.fly === 0 && result.swim === 0 && result.climb === 0) {
      const plainMatch = s.match(/[+＋]?(\d+)/)
      if (plainMatch) result.walk = parseInt(plainMatch[1], 10) || 0
    }
  }
  return result
}

/**
 * 纯函数版 BUFF 计算（与 useBuffCalculator 结果一致），供单元测试与效果覆盖校验。
 */
export function computeBuffStats(character, activeBuffs) {
  const buffs = (activeBuffs || []).filter((b) => b.enabled !== false)
    const rawEntries = getFlatEffectEntries(buffs)
    const entries = rawEntries.filter((e) => !DISPLAY_ONLY_EFFECT_TYPES.includes(e.effectType))
    
    // ── 生物变身效果：收集所有 creature_transform，只取第一个有效的（不叠加）──
    let creatureTransformData = null
    const creatureLibrary = loadCreatureLibrary()
    
    for (const b of entries) {
      if (b.effectType === 'creature_transform' && b.value && typeof b.value === 'object' && !Array.isArray(b.value)) {
        const ct = b.value
        console.log('[useBuffCalculator] creature_transform entry:', ct)
        if (ct.creatureId) {
          const creature = getCreatureById(ct.creatureId)
          console.log('[useBuffCalculator] creature found:', creature)
          if (creature) {
            creatureTransformData = { creature, acMode: ct.acMode || 'replace', hpMode: ct.hpMode || 'replace' }
            console.log('[useBuffCalculator] creatureTransformData:', creatureTransformData)
            break // 只取第一个有效的变身效果
          }
        }
      }
    }
    
    // 如果存在变身效果，使用生物的六维属性作为基础；否则用角色原始属性
    const baseAbilities = creatureTransformData?.creature?.abilities 
      ? { ...creatureTransformData.creature.abilities }
      : (character?.abilities ?? { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 })

    const xpVal = character?.xp
    const charLevel = xpVal != null && Number(xpVal) >= 0
      ? levelFromXP(xpVal)
      : Math.max(1, Math.min(20, Number(character?.level) || 1))
    const baseProf = proficiencyBonus(charLevel)
    const spellAbility = getPrimarySpellcastingAbility(character)
    const characterClasses = getCharacterClasses(character)
    const classLevels = {}
    for (const c of characterClasses) classLevels[c.name] = c.level

    // 预先扫描 proficiency_override，供后续公式上下文使用
    let profOverride = null
    const minimalContext = { level: charLevel, abilities: baseAbilities, prof: baseProf, spellDC: 0, spellAttack: 0, classLevels, speed: character?.speed ?? 30 }
    for (const b of entries) {
      if (b.effectType === 'proficiency_override') {
        const v = evaluateBuffValue(b.value, minimalContext)
        if (!Number.isNaN(v)) profOverride = v
      }
    }
    const contextProf = profOverride != null ? profOverride : baseProf

    const baseSpellMod = spellAbility ? abilityModifier(baseAbilities[spellAbility] ?? 10) : 0
    const baseFormulaContext = {
      level: charLevel,
      abilities: baseAbilities,
      prof: contextProf,
      spellDC: spellAbility ? 8 + contextProf + baseSpellMod : 0,
      spellAttack: spellAbility ? contextProf + baseSpellMod : 0,
      classLevels,
      speed: character?.speed ?? 30,
    }
    const baseEvalVal = (raw) => evaluateBuffValue(raw, baseFormulaContext)

    // 1. 属性：override 优先，否则 base + ability_score_uncapped
    // ability_score 现在表示「属性熟练调整」：授予豁免熟练，不再修改属性值
    let hasAbilityOverride = false
    const abilityOverride = {}
    const abilityBonus = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }
    const abilityBreak20 = { str: false, dex: false, con: false, int: false, wis: false, cha: false }
    const saveProficiencyGranted = { str: false, dex: false, con: false, int: false, wis: false, cha: false }

    for (const b of entries) {
      if (b.effectType === 'ability_override' && b.value && typeof b.value === 'object') {
        hasAbilityOverride = true
        for (const k of ABILITY_KEYS) {
          if (!(k in b.value)) continue
          const v = baseEvalVal(b.value[k])
          if (!Number.isNaN(v)) abilityOverride[k] = v
        }
      }
      // ability_score_uncapped：累加属性值（默认上限 20，勾选 break20 后可到 30）
      if (b.effectType === 'ability_score_uncapped' && b.value && typeof b.value === 'object') {
        for (const k of ABILITY_KEYS) {
          const v = baseEvalVal(b.value[k])
          if (!Number.isNaN(v)) abilityBonus[k] = (abilityBonus[k] || 0) + v
          if (b.break20 && b.break20[k]) abilityBreak20[k] = true
        }
      }
      // ability_score：授予豁免熟练（值为 true 或非零数字时生效）
      if (b.effectType === 'ability_score' && b.value && typeof b.value === 'object') {
        for (const k of ABILITY_KEYS) {
          const v = b.value[k]
          // 支持布尔值或旧数字值（非零视为 true）
          const granted = typeof v === 'boolean' ? v : (typeof v === 'number' ? v !== 0 : !!v)
          if (granted) saveProficiencyGranted[k] = true
        }
      }
    }

    const finalAbilities = {}
    for (const k of ABILITY_KEYS) {
      let score
      // override 设定基础值，uncapped 增量仍然叠加
      if (abilityOverride[k] != null) {
        score = abilityOverride[k] + (abilityBonus[k] || 0)
      } else {
        score = (baseAbilities[k] ?? 10) + (abilityBonus[k] || 0)
      }
      // 默认属性增加不能超过 20；仅勾选了「可突破20」的属性才能到达 30
      const cap = abilityBreak20[k] ? 30 : 20
      finalAbilities[k] = Math.max(1, Math.min(cap, score))
    }

    // 后续 AC 加值、豁免/技能/法术等公式统一使用 BUFF 后有效属性求值
    const finalSpellMod = spellAbility ? abilityModifier(finalAbilities[spellAbility] ?? 10) : 0
    const formulaContext = {
      level: charLevel,
      abilities: finalAbilities,
      prof: contextProf,
      spellDC: spellAbility ? 8 + contextProf + finalSpellMod : 0,
      spellAttack: spellAbility ? contextProf + finalSpellMod : 0,
      classLevels,
    }
    const evalVal = (raw) => evaluateBuffValue(raw, formulaContext)

    // 2. 攻击加值：全局 vs 条件范围分离。
    //    命中/伤害加值只有 scope === 'global' 时才聚合到全局 all；
    //    条件范围（本武器/某类生物/某类伤害类型/某类武器）由 CombatStatus 按具体战斗手段匹配后追加。
    let attackMelee = 0
    let attackRanged = 0
    let attackAll = 0
    let dmgMelee = 0
    let dmgRanged = 0
    let dmgAll = 0
    const weaponCategoryAttackDamageBonuses = []

    for (const b of entries) {
      const raw = b.value
      const { scope } = normalizeScope(b.scope, b.scopeDetail)
      const isGlobal = scope === SCOPE_KIND.global || scope === ''

      if (b.effectType === 'attack_damage_bonus' && typeof raw === 'string') {
        const attackMatch = raw.match(/攻击\s*[+＋]?\s*(\d+)/i)
        const dmgMatch = raw.match(/伤害\s*[+＋]?\s*(\d+)/i)
        if (isGlobal) {
          if (attackMatch) attackAll += (parseInt(attackMatch[1], 10) || 0)
          if (dmgMatch) dmgAll += (parseInt(dmgMatch[1], 10) || 0)
        }
        continue
      }
      if (b.effectType === 'attack_damage_bonus' && raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const adv = raw.advantage === 'advantage' || raw.advantage === 'disadvantage' ? raw.advantage : ''
        const gv = evalVal(raw.val)
        const globalVal = Number.isNaN(gv) ? 0 : gv
        const rows = Array.isArray(raw.categoryRows)
          ? raw.categoryRows
              .map((r) => ({ key: String(r.key ?? '').trim(), val: evalVal(r.val) || 0 }))
              .filter((r) => r.key)
          : []
        const cats = Array.isArray(raw.weaponCategories) ? raw.weaponCategories.filter(Boolean) : []
        const legacyScopedOnly =
          raw.weaponScope === 'weapon_category' &&
          cats.length > 0 &&
          rows.length === 0
        if (legacyScopedOnly) {
          if (!Number.isNaN(globalVal)) {
            weaponCategoryAttackDamageBonuses.push({
              val: globalVal,
              weaponCategories: cats,
              advantage: adv,
            })
          }
          continue
        }
        if (isGlobal && globalVal !== 0) {
          attackAll += globalVal
          dmgAll += globalVal
        }
        if (rows.length > 0) {
          weaponCategoryAttackDamageBonuses.push({ categoryRows: rows, advantage: adv })
        }
        continue
      }
      const v = evalVal(typeof raw === 'object' && raw && 'val' in raw ? raw.val : raw)
      if (!Number.isNaN(v)) {
        if (b.effectType === 'attack_melee') attackMelee += v
        else if (b.effectType === 'attack_ranged') attackRanged += v
        else if (b.effectType === 'attack_all') attackAll += v
        else if (b.effectType === 'attack_bonus') {
          if (isGlobal) attackAll += v
        }
        else if (b.effectType === 'dmg_bonus_melee') dmgMelee += v
        else if (b.effectType === 'dmg_bonus_ranged') dmgRanged += v
        else if (b.effectType === 'dmg_bonus_all') dmgAll += v
        else if (b.effectType === 'damage_bonus') {
          if (isGlobal) dmgAll += v
        }
        // 新表：命中/伤害加值（数字输入），数值同时加到命中与伤害；仅全局生效
        else if (b.effectType === 'attack_damage_bonus') {
          if (isGlobal) { attackAll += v; dmgAll += v }
        }
      }
    }

    const meleeAttackBonus = attackMelee + attackAll
    const rangedAttackBonus = attackRanged + attackAll
    const meleeDamageBonus = dmgMelee + dmgAll
    const rangedDamageBonus = dmgRanged + dmgAll

    // 3. 优势/劣势（含 numberAndAdvantage 等对象中的 advantage）
    let advMelee = 0
    let advRanged = 0
    let advAllAttack = 0
    let advSave = 0
    let advSkill = 0
    let disadvAll = 0
    let disadvSave = 0
    let disadvSkill = 0

    for (const b of entries) {
      const objAdv = typeof b.value === 'object' && b.value && b.value.advantage
      if (b.effectType === 'save_bonus') {
        if (objAdv === 'advantage') advSave++
        else if (objAdv === 'disadvantage') disadvSave++
      } else if (b.effectType === 'skill_bonus') {
        // 仅全局范围的技能增强计入全局优势/劣势；带限定范围的（自定义/生物类型/武器类别等）仅作展示
        const { scope: skillScope } = normalizeScope(b.scope, b.scopeDetail)
        if (skillScope === SCOPE_KIND.global || skillScope === '') {
          if (objAdv === 'advantage') advSkill++
          else if (objAdv === 'disadvantage') disadvSkill++
        }
      }
      // 命中/伤害加值上的优势/劣势：视为所有攻击的优势/劣势来源（「武器类别」限定的不计入全局，由武器行单独处理时可扩展）
      if (b.effectType === 'attack_damage_bonus' || b.effectType === 'attack_bonus' || b.effectType === 'damage_bonus') {
        const rawA = b.value
        if (rawA && typeof rawA === 'object' && !Array.isArray(rawA)) {
          const gv = evalVal(rawA.val)
          const globalVal = Number.isNaN(gv) ? 0 : gv
          const rowsHaveKeys =
            Array.isArray(rawA.categoryRows) &&
            rawA.categoryRows.some((r) => String(r.key ?? '').trim())
          const legacyScopedOnly =
            rawA.weaponScope === 'weapon_category' &&
            (Array.isArray(rawA.weaponCategories) ? rawA.weaponCategories.filter(Boolean).length : 0) > 0 &&
            !rowsHaveKeys
          const skipGlobalAdv = legacyScopedOnly || (globalVal === 0 && rowsHaveKeys)
          if (!skipGlobalAdv) {
            if (objAdv === 'advantage') advAllAttack++
            else if (objAdv === 'disadvantage') disadvAll++
          }
        } else {
          if (objAdv === 'advantage') advAllAttack++
          else if (objAdv === 'disadvantage') disadvAll++
        }
      }
      if (b.value !== true && b.value !== 'true' && b.value !== 1 && !objAdv) continue
      if (b.effectType === 'adv_melee') advMelee++
      else if (b.effectType === 'adv_ranged') advRanged++
      else if (b.effectType === 'adv_all_attack') advAllAttack++
      else if (b.effectType === 'adv_save') advSave++
      else if (b.effectType === 'adv_skill') advSkill++
      else if (b.effectType === 'disadv_all') disadvAll++
    }

    let advantage = {
      melee: disadvAll > 0 ? 'disadvantage' : advMelee + advAllAttack > 0 ? 'advantage' : 'normal',
      ranged: disadvAll > 0 ? 'disadvantage' : advRanged + advAllAttack > 0 ? 'advantage' : 'normal',
      save: disadvAll > 0 || disadvSave > 0 ? 'disadvantage' : advSave > 0 ? 'advantage' : 'normal',
      skill: disadvAll > 0 || disadvSkill > 0 ? 'disadvantage' : advSkill > 0 ? 'advantage' : 'normal',
    }

    // 7. 状态效果与力竭的减益（力竭规则参考 D&D 2024）
    const conditions = Array.isArray(character?.conditions) ? character.conditions : []
    const exhaustionLevel = Math.max(0, Math.min(6, Number(character?.exhaustionLevel) || 0))
    let speedMultiplier = 1
    let maxHpMultiplier = 1
    const disadvantageKeys = new Set()
    // D&D 2024 力竭：d20 检定 -2×等级，速度 -5尺×等级，6级死亡（不再用劣势/生命减半）
    const d20ExhaustionPenalty = exhaustionLevel >= 6 ? -12 : -2 * exhaustionLevel
    const speedExhaustionPenalty = exhaustionLevel >= 6 ? 999 : 5 * exhaustionLevel
    if (conditions.includes('poisoned')) { disadvantageKeys.add('melee'); disadvantageKeys.add('ranged'); disadvantageKeys.add('skill') }
    if (conditions.includes('blinded')) { disadvantageKeys.add('melee'); disadvantageKeys.add('ranged') }
    if (conditions.includes('frightened')) disadvantageKeys.add('skill')
    if (['stunned', 'paralyzed', 'unconscious'].some((c) => conditions.includes(c))) speedMultiplier = 0
    if (disadvantageKeys.size) {
      advantage = { ...advantage, ...Object.fromEntries([...disadvantageKeys].map((k) => [k, 'disadvantage'])) }
    }

    // 4. AC（使用增益后的属性，使敏捷等加成正确）、速度、先攻、DC、熟练
    // Base AC should be computed from equipment + buffed abilities only.
    // Do not re-read character.buffs here, otherwise legacy buff fields can be double-counted.
    const charWithBuffedAbilities = character
      ? { ...character, abilities: finalAbilities, buffs: [] }
      : { abilities: finalAbilities, buffs: [] }

    // ── 护甲覆盖效果：收集所有 armor_override，取最高值（不叠加）──
    let armorOverrideBase = null
    let armorOverrideApplyDexMod = true
    let armorOverrideMaxDexBonus = null
    let armorOverrideExtra = 0
    let armorOverrideShieldCompatible = false

    for (const b of entries) {
      if (b.effectType === 'armor_override' && b.value && typeof b.value === 'object' && !Array.isArray(b.value)) {
        const ov = b.value
        const baseVal = evaluateBuffValue(ov.base ?? 10, formulaContext)
        if (!Number.isNaN(baseVal)) {
          if (armorOverrideBase === null || baseVal > armorOverrideBase) {
            armorOverrideBase = baseVal
            armorOverrideApplyDexMod = ov.applyDexMod !== false
            armorOverrideMaxDexBonus = Number(ov.maxDexBonus) || null
            armorOverrideExtra = Number(ov.extra) || 0
            armorOverrideShieldCompatible = !!ov.shieldCompatible
          }
        }
      }
    }

    // 计算基础AC：变身效果 → armor_override → 默认 getAC
    let baseAC
    if (creatureTransformData && creatureTransformData.acMode === 'replace') {
      // 变身替换模式：直接使用生物的 AC
      baseAC = creatureTransformData.creature.ac ?? 10
    } else if (creatureTransformData && creatureTransformData.acMode === 'add') {
      // 变身叠加模式：生物 AC 作为加值叠加到现有 AC 上
      const creatureAC = creatureTransformData.creature.ac ?? 0
      if (armorOverrideBase !== null) {
        const dexMod = abilityModifier(finalAbilities.dex ?? 10)
        let acFromDex = 0
        if (armorOverrideApplyDexMod) {
          acFromDex = armorOverrideMaxDexBonus != null
            ? Math.min(dexMod, armorOverrideMaxDexBonus)
            : dexMod
        }
        baseAC = armorOverrideBase + acFromDex + armorOverrideExtra + creatureAC
      } else {
        const equipmentAC = getAC(charWithBuffedAbilities)
        baseAC = (equipmentAC?.total ?? 10) + creatureAC
      }
    } else if (armorOverrideBase !== null) {
      const dexMod = abilityModifier(finalAbilities.dex ?? 10)
      let acFromDex = 0
      if (armorOverrideApplyDexMod) {
        acFromDex = armorOverrideMaxDexBonus != null
          ? Math.min(dexMod, armorOverrideMaxDexBonus)
          : dexMod
      }
      baseAC = armorOverrideBase + acFromDex + armorOverrideExtra
    } else {
      baseAC = getAC(charWithBuffedAbilities)
    }

    let acBonus = 0
    const acCapStoneLayerValues = []
    let speedBonus = 0
    let swimSpeedBonus = 0
    let climbSpeedBonus = 0
    let reachBonus = 0
    let initBonus = 0
    const saveDcValues = []
    const spellAttackValues = []
    const spellDamageBonuses = [] // { type, diceFloor, perDieBonus, extraDice, flatBonus }
    let flightSpeed = 0
    let flightHover = false
    const saveBonusPerAbility = { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 }
    const skillBonusPerSkill = {}
    let concentrationBonus = 0
    let concentrationAdvantage = null
    let ignoreDifficultTerrain = false
    let spellRangeMultiplier = 1
    let spellRangeBonus = 0
    const ignoreResistanceTypes = []
    let damageReduction = 0

    const initiativeProfBonus = proficiencyBonus(charLevel)

    for (const b of entries) {
      const raw = b.value
      const v = evalVal(typeof raw === 'object' && raw && 'val' in raw ? raw.val : raw)
      if (b.effectType === 'ac_bonus') {
        // 如果存在不兼容盾牌的 armor_override，忽略来自装备的盾牌AC加值
        // 这里简化处理：ac_bonus 通常来自BUFF，不是装备；装备AC已在 getAC 中计算
        acBonus += evalVal(raw) || 0
      }
      else if (b.effectType === 'damage_reduction') {
        const dr = evalVal(typeof raw === 'object' && raw && 'val' in raw ? raw.val : raw)
        if (!Number.isNaN(dr)) damageReduction += dr
      }
      else if (b.effectType === 'ac_cap_stone_layer') {
        const y = evalVal(raw)
        if (!Number.isNaN(y)) acCapStoneLayerValues.push(y)
      }
      else if (b.effectType === 'speed_bonus') speedBonus += evalVal(raw) || 0
      else if (b.effectType === 'reach_bonus') reachBonus += v
      else if (b.effectType === 'init_bonus') initBonus += v
      else if (b.effectType === 'initiative_buff' && raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const bon = evalVal(raw.bonus)
        if (!Number.isNaN(bon)) initBonus += bon
        if (raw.proficient === true || raw.proficient === 'true' || raw.proficient === 1) {
          initBonus += initiativeProfBonus
        }
      }
      else if (b.effectType === 'save_dc_bonus') { const dv = evalVal(typeof raw === 'object' && raw && 'val' in raw ? raw.val : raw) || 0; saveDcValues.push(dv) }
      else if (b.effectType === 'spell_attack_bonus') { const sv = evalVal(typeof raw === 'object' && raw && 'val' in raw ? raw.val : raw) || 0; spellAttackValues.push(sv) }
      else if (b.effectType === 'spell_damage_bonus' && raw && typeof raw === 'object' && !Array.isArray(raw)) {
        const sdb = {
          type: raw.type ? String(raw.type).trim() : '',
          diceFloor: Number(raw.diceFloor) > 1 ? Number(raw.diceFloor) : null,
          perDieBonus: Number(raw.perDieBonus) || 0,
          extraDice: raw.extraDice ? String(raw.extraDice).trim() : '',
          flatBonus: raw.flatBonus != null && raw.flatBonus !== '' ? raw.flatBonus : 0,
        }
        spellDamageBonuses.push(sdb)
      }
      else if (b.effectType === 'flight_speed' && raw && typeof raw === 'object') {
        const sp = evalVal(raw.speed)
        if (!Number.isNaN(sp) && sp > flightSpeed) flightSpeed = sp
        if (raw.hover) flightHover = true
      } else if (b.effectType === 'concentration' && raw && typeof raw === 'object') {
        const cb = evalVal(raw.val)
        if (!Number.isNaN(cb)) concentrationBonus += cb
        if (raw.advantage === 'advantage') concentrationAdvantage = 'advantage'
        else if (raw.advantage === 'disadvantage') concentrationAdvantage = 'disadvantage'
      } else if (b.effectType === 'save_bonus' && raw && typeof raw === 'object') {
        for (const k of ABILITY_KEYS) {
          const n = evalVal(raw[k])
          if (!Number.isNaN(n)) saveBonusPerAbility[k] = (saveBonusPerAbility[k] || 0) + n
        }
      } else if (b.effectType === 'skill_bonus' && raw && typeof raw === 'object' && !Array.isArray(raw)) {
        // 仅全局范围的技能数值加值计入全局聚合；限定范围（自定义等）仅作展示
        const { scope: skillScope } = normalizeScope(b.scope, b.scopeDetail)
        if (skillScope === SCOPE_KIND.global || skillScope === '') {
          for (const [k, val] of Object.entries(raw)) {
            if (k === 'advantage' || ['ref', 'ability', 'mult', 'add'].includes(k)) continue
            if (val == null) continue
            const n = evalVal(val)
            if (!Number.isNaN(n)) skillBonusPerSkill[k] = (skillBonusPerSkill[k] || 0) + n
          }
        }
      }
      // 新表：无视伤害抗性（防御与生存）
      else if (b.effectType === 'ignore_resistance' && Array.isArray(raw)) {
        ignoreResistanceTypes.push(...raw.map((t) => getDamageTypeValue(t) || String(t).toLowerCase()).filter(Boolean))
      }
      // 新表：伤害穿透特性 → 忽略伤害抗性（元素+光/暗 合并为 pierce 数组）
      else if (b.effectType === 'damage_piercing_traits') {
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          const pierce = Array.isArray(raw.pierce)
            ? raw.pierce
            : [...(Array.isArray(raw.element) ? raw.element : []), ...(Array.isArray(raw.alignment) ? raw.alignment : [])]
          ignoreResistanceTypes.push(...pierce.map((t) => getDamageTypeValue(t) || String(t).toLowerCase()))
        } else if (Array.isArray(raw)) {
          if (raw.includes('element')) ignoreResistanceTypes.push('fire', 'cold', 'lightning', 'acid', 'poison')
          if (raw.includes('alignment')) ignoreResistanceTypes.push('radiant', 'necrotic')
        }
      }
      // 新表：地形无视（移动与施法）
      else if (b.effectType === 'terrain_ignore' && (raw === true || raw === 'true' || raw === 1)) {
        ignoreDifficultTerrain = true
      }
      // 新表：专注增强（对象：val + advantage；兼容旧文本/纯数字/公式）
      else if (b.effectType === 'concentration_save_enhance') {
        if (typeof raw === 'number' || isFormulaValue(raw)) {
          const cb = evalVal(raw)
          if (!Number.isNaN(cb)) concentrationBonus += cb
        } else if (raw && typeof raw === 'object') {
          const cb = evalVal(raw.val)
          if (!Number.isNaN(cb)) concentrationBonus += cb
          if (raw.advantage === 'advantage') concentrationAdvantage = 'advantage'
          else if (raw.advantage === 'disadvantage') concentrationAdvantage = 'disadvantage'
        } else if (typeof raw === 'string') {
          const s = String(raw).trim()
          if (/优势/i.test(s)) concentrationAdvantage = 'advantage'
          else if (/劣势/i.test(s)) concentrationAdvantage = 'disadvantage'
          const numMatch = s.match(/[+＋]?(\d+)/)
          if (numMatch) concentrationBonus += (parseInt(numMatch[1], 10) || 0)
        }
      }
      // 新表：施法距离延伸（x2 或 +N；兼容旧文本/纯数字/公式/对象）
      else if (b.effectType === 'spell_range_extension') {
        const parsed = parseSpellRangeExtension(raw, evalVal)
        if (parsed.multiplier > 1) spellRangeMultiplier = Math.max(spellRangeMultiplier, parsed.multiplier)
        spellRangeBonus += parsed.bonus
      }
      // 新表：速度增加（统一数值，默认为地面速度 +X；兼容旧文本/对象/公式）
      else if (b.effectType === 'base_speed_increment') {
        const spd = parseBaseSpeedIncrement(raw, evalVal)
        speedBonus += spd.walk
        swimSpeedBonus += spd.swim
        climbSpeedBonus += spd.climb
        if (spd.fly > flightSpeed) flightSpeed = spd.fly
      }
    }

    // 5. 生命：temp_hp 取最大，max_hp_bonus 累加；变身效果 HP 处理
    let tempHp = 0
    let maxHpBonus = 0
    let regeneration = 0

    for (const b of entries) {
      const v = evalVal(b.value)
      if (b.effectType === 'temp_hp' && !Number.isNaN(v)) tempHp = Math.max(tempHp, v)
      else if (b.effectType === 'max_hp_bonus') maxHpBonus += v
      else if (b.effectType === 'regeneration') regeneration += v
    }
    
    // 变身效果 HP 处理
    if (creatureTransformData) {
      const creatureHP = parseHpFormula(creatureTransformData.creature.hp)
      console.log('[useBuffCalculator] creatureTransform HP:', { creatureHP, hpMode: creatureTransformData.hpMode })
      if (creatureTransformData.hpMode === 'replace') {
        // 替换模式：计算差值，通过 maxHpBonus 调整实现 HP 替换
        // CombatStatus 公式：calcMaxHP + getHPBuffSum + maxHpBonus
        // 需要减去 getHPBuffSum 避免重复计算
        const charBaseHP = calcMaxHP(character, baseAbilities)
        const hpBuffSum = getHPBuffSum(character)
        console.log('[useBuffCalculator] HP replace:', { creatureHP, charBaseHP, hpBuffSum, diff: creatureHP - charBaseHP - hpBuffSum })
        maxHpBonus += creatureHP - charBaseHP - hpBuffSum
      } else if (creatureTransformData.hpMode === 'add') {
        // 叠加模式：生物 HP 作为临时 HP
        tempHp = Math.max(tempHp, creatureHP)
      }
    }

    // 6. 抗性/免疫/易伤（收集数组）；变身效果会替换或叠加这些属性
    const resistTypes = []
    const immuneTypes = []
    const vulnerableTypes = []
    const dmgTypeBonus = {} // { fire: 2, cold: -1, ... }

    for (const b of entries) {
      const arr = Array.isArray(b.value) ? b.value : (b.value && b.value.types) ? b.value.types : []
      const toValue = (t) => getDamageTypeValue(t) || String(t).toLowerCase()
      if (b.effectType === 'resist_type') resistTypes.push(...arr.map(toValue).filter(Boolean))
      else if (b.effectType === 'immune_type') immuneTypes.push(...arr.map(toValue).filter(Boolean))
      else if (b.effectType === 'vulnerable_type') vulnerableTypes.push(...arr.map(toValue).filter(Boolean))
      else if (b.effectType === 'dmg_type_specific' && b.value && typeof b.value === 'object' && b.value.type) {
        const t = toValue(b.value.type)
        const v = evalVal(b.value.val)
        if (!Number.isNaN(v) && t) dmgTypeBonus[t] = (dmgTypeBonus[t] || 0) + v
      }
    }
    
    // 变身效果的抗性/免疫处理
    if (creatureTransformData) {
      const creature = creatureTransformData.creature
      // 变身模式下，生物的抗性/免疫完全替换角色的（replace 模式）或合并（add 模式暂未实现，当前都按 replace 处理）
      if (Array.isArray(creature.resistances) && creature.resistances.length > 0) {
        resistTypes.length = 0 // 清空之前的
        resistTypes.push(...creature.resistances.map(getDamageTypeValue).filter(Boolean))
      }
      if (Array.isArray(creature.immunities) && creature.immunities.length > 0) {
        immuneTypes.length = 0
        immuneTypes.push(...creature.immunities.map(getDamageTypeValue).filter(Boolean))
      }
      if (Array.isArray(creature.vulnerabilities) && creature.vulnerabilities.length > 0) {
        vulnerableTypes.length = 0
        vulnerableTypes.push(...creature.vulnerabilities.map(getDamageTypeValue).filter(Boolean))
      }
      // 状态免疫也合并
      if (Array.isArray(creature.conditionImmunities) && creature.conditionImmunities.length > 0) {
        // conditionImmunities 需要特殊处理，这里先简单记录
      }
    }

    const baseACTotal = (typeof baseAC === 'object' && baseAC !== null) ? (baseAC.total ?? 10) : (baseAC ?? 10)
    let ac = baseACTotal + acBonus
    if (acCapStoneLayerValues.length > 0) {
      const cap = baseACTotal + Math.min(...acCapStoneLayerValues)
      ac = Math.min(ac, cap)
    }

    // DC 和法术攻击加值：不能累加，只取最高值
    const saveDcBonus = saveDcValues.length ? Math.max(...saveDcValues) : 0
    const spellAttackBonus = spellAttackValues.length ? Math.max(...spellAttackValues) : 0

    return {
      abilities: finalAbilities,
      saveProficiencyGranted,
      meleeAttackBonus,
      rangedAttackBonus,
      meleeDamageBonus,
      rangedDamageBonus,
      advantage,
      ac,
      acBonus,
      speedBonus,
      swimSpeedBonus,
      climbSpeedBonus,
      reachBonus,
      initBonus,
      saveDcBonus,
      spellAttackBonus,
      spellDamageBonuses,
      proficiencyOverride: profOverride,
      flightSpeed,
      flightHover,
      saveBonusPerAbility,
      skillBonusPerSkill,
      concentrationBonus,
      concentrationAdvantage,
      ignoreDifficultTerrain,
      spellRangeMultiplier,
      spellRangeBonus,
      ignoreResistanceTypes,
      damageReduction,
      tempHp,
      maxHpBonus,
      regeneration,
      resistTypes,
      immuneTypes,
      vulnerableTypes,
      dmgTypeBonus,
      speedMultiplier,
      maxHpMultiplier,
      d20ExhaustionPenalty,
      speedExhaustionPenalty,
      weaponCategoryAttackDamageBonuses,
      // 变身效果相关信息
      creatureTransform: creatureTransformData ? {
        creatureId: creatureTransformData.creature.id,
        creatureName: creatureTransformData.creature.name,
        acMode: creatureTransformData.acMode,
        hpMode: creatureTransformData.hpMode,
        creatureHP: parseHpFormula(creatureTransformData.creature.hp),
        creatureAC: creatureTransformData.creature.ac,
        creatureSpeed: creatureTransformData.creature.speed,
        creatureResistances: creatureTransformData.creature.resistances,
        creatureImmunities: creatureTransformData.creature.immunities,
        creatureVulnerabilities: creatureTransformData.creature.vulnerabilities,
        creatureConditionImmunities: creatureTransformData.creature.conditionImmunities,
      } : null,
    }
}

export function useBuffCalculator(character, activeBuffs) {
  return useMemo(() => computeBuffStats(character, activeBuffs), [character, activeBuffs])
}

/**
 * 伤害计算辅助：根据抗性/免疫/易伤修正
 */
export function calculateDamage(baseRoll, damageType, buffStats) {
  if (!buffStats) return baseRoll
  const {
    resistTypes = [],
    immuneTypes = [],
    vulnerableTypes = [],
    dmgTypeBonus = {},
    ignoreResistanceTypes = [],
    damageReduction: flatDr = 0,
  } = buffStats
  const type = getDamageTypeValue(damageType) || String(damageType || '').toLowerCase()
  const typeBonus = dmgTypeBonus[type] || 0
  let result = baseRoll + typeBonus

  if (immuneTypes.includes(type)) return 0
  if (vulnerableTypes.includes(type)) result *= 2
  if (resistTypes.includes(type) && !ignoreResistanceTypes.includes(type)) result = Math.floor(result / 2)
  const dr = Number(flatDr) || 0
  if (dr !== 0) result = Math.max(0, result - dr)
  return result
}

/**
 * 计算 DC 和法术攻击加值中被抑制的 buff 效果
 * 规则：DC 和法术攻击加值不能累加，只能取最高值；非最高值的效果标记为抑制
 * @param {Array} buffs - 所有 buff 列表
 * @returns {Map<string, Set<string>>} buffId → 被抑制的 effectType 集合
 */
export function computeSuppressedEffects(buffs, context = {}) {
  const result = new Map()
  const enabledBuffs = (buffs || []).filter(b => b.enabled !== false)

  const dcEntries = []
  const spellAtkEntries = []

  for (const buff of enabledBuffs) {
    const effects = Array.isArray(buff.effects) && buff.effects.length
      ? buff.effects
      : [{ effectType: buff.effectType, value: buff.value }]

    for (const e of effects) {
      if (e.effectType === 'save_dc_bonus') {
        const raw = e.value
        const inner = typeof raw === 'object' && raw && 'val' in raw ? raw.val : raw
        const v = evaluateBuffValue(inner, context)
        dcEntries.push({ buffId: buff.id, value: v })
      }
      if (e.effectType === 'spell_attack_bonus') {
        const raw = e.value
        const inner = typeof raw === 'object' && raw && 'val' in raw ? raw.val : raw
        const v = evaluateBuffValue(inner, context)
        spellAtkEntries.push({ buffId: buff.id, value: v })
      }
    }
  }

  // 仅当存在 2 个及以上同类效果时，才需抑制判定
  const maxDc = dcEntries.length > 1 ? Math.max(...dcEntries.map(e => e.value)) : null
  const maxSpellAtk = spellAtkEntries.length > 1 ? Math.max(...spellAtkEntries.map(e => e.value)) : null

  if (maxDc !== null) {
    for (const entry of dcEntries) {
      if (entry.value < maxDc) {
        if (!result.has(entry.buffId)) result.set(entry.buffId, new Set())
        result.get(entry.buffId).add('save_dc_bonus')
      }
    }
  }
  if (maxSpellAtk !== null) {
    for (const entry of spellAtkEntries) {
      if (entry.value < maxSpellAtk) {
        if (!result.has(entry.buffId)) result.set(entry.buffId, new Set())
        result.get(entry.buffId).add('spell_attack_bonus')
      }
    }
  }

  return result
}
