/**
 * 卡适配器 — 从旧数据模型生成统一 Card 视图
 *
 * Phase 1 核心：保留旧字段存储，通过适配器将各来源（职业特性、专长、祈唤、
 * 战斗风格、装备、手动 BUFF）统一为 Card 数组。
 *
 * 数据流：
 *   旧字段 → buildCardsFromCharacter() → Card[] → getMergedBuffsViaCards() → BUFF 格式
 *
 * 这样 BUFF 栏和计算器都从同一份 Card 数组读取，确保数据一致。
 */

import {
  getBuffsFromSelectedFeats,
  getBuffsFromSelectedInvocations,
  getBuffsFromSelectedFightingStyles,
  getBuffsFromEquipmentAndInventory,
  getBuffsFromClassFeatures,
} from './effects/effectMapping'
import { createCard, normalizeCard, SLOT_KIND } from './cardModel'

/* ── BUFF 条目 → Card 映射 ───────────────────────────────────────── */

/**
 * 根据 BUFF 条目的来源标记推断 slotKind。
 */
function inferSlotKind(buffEntry) {
  if (buffEntry.fromClassFeature) return SLOT_KIND.class
  if (buffEntry.fromFeat) return SLOT_KIND.feat
  if (buffEntry.fromInvocation) return SLOT_KIND.feat    // 魔能祈唤归入专长槽
  if (buffEntry.fromFightingStyle) return SLOT_KIND.class // 战斗风格归入职业槽
  if (buffEntry.fromItem) return SLOT_KIND.equipment
  if (buffEntry.fromShield) return SLOT_KIND.shield
  return SLOT_KIND.buff
}

/**
 * 推断 sourceType（精确来源类型，用于反向映射恢复标记）。
 */
function inferSourceType(buffEntry) {
  if (buffEntry.fromClassFeature) return 'classFeature'
  if (buffEntry.fromInvocation) return 'invocation'
  if (buffEntry.fromFightingStyle) return 'fightingStyle'
  if (buffEntry.fromFeat) return 'feat'
  if (buffEntry.fromItem) return 'item'
  if (buffEntry.fromShield) return 'shield'
  return 'manual'
}

/**
 * 从 BUFF 条目推导 sourceKey。
 */
function inferSourceKey(buffEntry) {
  if (buffEntry.fromClassFeature) {
    const sub = buffEntry.sourceSubclass || ''
    return `${buffEntry.sourceClass || ''}|${sub}|${buffEntry.featureId || ''}`
  }
  if (buffEntry.fromFeat) return buffEntry.featId || ''
  if (buffEntry.fromInvocation) return buffEntry.invocationId || ''
  if (buffEntry.fromFightingStyle) return buffEntry.styleId || ''
  if (buffEntry.fromItem) return buffEntry.itemInventoryId || ''
  return ''
}

/**
 * 将单个 BUFF 条目转为 Card 结构。
 * @param {object} buffEntry - getBuffsFrom* 系列函数的输出
 * @returns {object} Card 对象
 */
function buffEntryToCard(buffEntry) {
  const slotKind = inferSlotKind(buffEntry)
  const sourceType = inferSourceType(buffEntry)
  const sourceKey = inferSourceKey(buffEntry)
  const effects = Array.isArray(buffEntry.effects) ? buffEntry.effects : []
  
  // 从 effects 中提取 charge_item 效果作为主动技能（新系统）
  const chargeEffect = effects.find(e => e.effectType === 'charge_item' && e.value && typeof e.value === 'object')
  let activeAbility = null
  
  if (chargeEffect) {
    const chargeValue = chargeEffect.value
    const allEffects = Array.isArray(chargeValue.effects) && chargeValue.effects.length > 0 
      ? chargeValue.effects
      : null
    
    if (allEffects) {
      activeAbility = {
        id: `${sourceKey}_active`,
        name: buffEntry.source || '主动技能',
        actionType: chargeValue.actionCost || 'action',
        cost: chargeValue.resourceType === 'none' 
          ? { type: 'none' }
          : { type: 'class_resource', resourceKey: chargeValue.resourceType || 'charges', amount: chargeValue.charges || 1 },
        cooldown: chargeValue.recovery?.method === 'long_rest' ? 'long_rest' 
                  : chargeValue.recovery?.method === 'short_rest' ? 'short_rest'
                  : 'none',
        description: '',
        needsInteraction: 'confirm',
        effects: allEffects.map((eff) => ({
          type: eff.type,
          value: eff.value,
          description: eff.value?.description || eff.text || '',
        })),
      }
    }
  }
  
  // 优先使用编辑器配置的主动技能，其次使用旧的 activeAbilities 字段
  const finalActiveAbility = activeAbility || (Array.isArray(buffEntry.activeAbilities) && buffEntry.activeAbilities.length
    ? buffEntry.activeAbilities[0]
    : null)

  return normalizeCard(createCard(slotKind, {
    id: buffEntry.id,
    name: buffEntry.source || '',
    slotKind,
    sourceType,
    sourceKey,
    buffEffects: effects,
    enabled: buffEntry.enabled !== false,
    // 职业特性附加字段
    ...(buffEntry.fromClassFeature ? {
      level: buffEntry.level,
      subclass: buffEntry.sourceSubclass || undefined,
    } : {}),
    // 主动技能
    ...(finalActiveAbility ? { activeAbility: finalActiveAbility } : {}),
  }))
}

/* ── 种族基础信息 → BUFF 效果 ──────────────────────────────────── */

/**
 * 从 raceBaseInfo 生成 BUFF 效果数组
 * 将结构化的种族基础信息转换为 BUFF 系统可消费的 effect 对象
 */
function buildRaceBaseInfoEffects(raceBaseInfo) {
  if (!raceBaseInfo || typeof raceBaseInfo !== 'object') return []
  const effects = []

  // 移速 → base_speed_increment（存储差值，默认 30）
  const speed = Number(raceBaseInfo.speed)
  if (!Number.isNaN(speed) && speed > 0 && speed !== 30) {
    effects.push({ effectType: 'base_speed_increment', value: speed - 30 })
  }

  // 视觉 → special_senses
  if (raceBaseInfo.vision && raceBaseInfo.vision.type) {
    effects.push({
      effectType: 'special_senses',
      value: {
        senses: [raceBaseInfo.vision.type],
        range: Number(raceBaseInfo.vision.range) || 0,
      },
    })
  }

  // 属性提高 → ability_score_uncapped
  const asi = raceBaseInfo.abilityScoreIncrease
  if (asi && typeof asi === 'object') {
    const hasAny = Object.values(asi).some((v) => Number(v) > 0)
    if (hasAny) {
      effects.push({
        effectType: 'ability_score_uncapped',
        value: {
          str: Number(asi.str) || 0,
          dex: Number(asi.dex) || 0,
          con: Number(asi.con) || 0,
          int: Number(asi.int) || 0,
          wis: Number(asi.wis) || 0,
          cha: Number(asi.cha) || 0,
        },
      })
    }
  }

  return effects
}

/* ── 主入口：从角色构建 Card 数组 ──────────────────────────────────── */

/**
 * 从角色的旧数据字段构建统一 Card 数组。
 * 这是适配层的核心函数——所有面板和计算器都从这里获取数据。
 *
 * @param {object} character - 角色对象
 * @param {string} [moduleId] - 规则模组 ID
 * @returns {Array<object>} Card 数组
 */
export function buildCardsFromCharacter(character, moduleId) {
  if (!character) return []

  // 如果角色已有 cards 数组且非空，直接使用（新数据模型优先）
  if (Array.isArray(character.cards) && character.cards.length > 0) {
    return character.cards.map(normalizeCard)
  }

  // ── 从旧字段生成 ──
  const cards = []

  // 1. 装备附魔 → equipment 卡
  const itemBuffs = getBuffsFromEquipmentAndInventory(character)
  for (const b of itemBuffs) {
    cards.push(buffEntryToCard(b))
  }

  // 2. 专长 → feat 卡
  const featBuffs = getBuffsFromSelectedFeats(character, moduleId)
  for (const b of featBuffs) {
    cards.push(buffEntryToCard(b))
  }

  // 3. 魔能祈唤 → feat 卡
  const invocationBuffs = getBuffsFromSelectedInvocations(character, moduleId)
  for (const b of invocationBuffs) {
    cards.push(buffEntryToCard(b))
  }

  // 4. 战斗风格 → class 卡
  const styleBuffs = getBuffsFromSelectedFightingStyles(character, moduleId)
  for (const b of styleBuffs) {
    cards.push(buffEntryToCard(b))
  }

  // 5. 职业特性 → class 卡
  const classFeatureBuffs = getBuffsFromClassFeatures(character, moduleId)
  for (const b of classFeatureBuffs) {
    cards.push(buffEntryToCard(b))
  }

  // 5.5 种族 → race 卡
  const raceCard = character.raceCard
  if (raceCard?.raceId) {
    // 从 raceBaseInfo 自动生成 BUFF 效果
    const autoEffects = buildRaceBaseInfoEffects(raceCard.raceBaseInfo)
    // 手动编辑的 BUFF 效果（优先级更高，放在后面）
    const manualEffects = Array.isArray(raceCard.raceBuffPatch?.effects) ? raceCard.raceBuffPatch.effects : []
    const allEffects = [...autoEffects, ...manualEffects]

    if (allEffects.length > 0) {
      const raceName = raceCard.customName || (raceCard.raceId === 'custom' ? 'custom-race' : raceCard.raceId)
      cards.push(normalizeCard(createCard(SLOT_KIND.race, {
        id: `race-${raceCard.raceId}`,
        name: raceName,
        sourceType: 'race',
        sourceKey: raceCard.raceId,
        buffEffects: allEffects,
        enabled: raceCard.raceBuffPatch?.enabled !== false,
      })))
    }
  }

  // 5.6 背景 → buff 卡
  const backgroundCard = character.backgroundCard
  if (backgroundCard?.backgroundId && Array.isArray(backgroundCard.backgroundBuffPatch?.effects) && backgroundCard.backgroundBuffPatch.effects.length > 0) {
    const backgroundName = backgroundCard.customName || (backgroundCard.backgroundId === 'custom' ? 'custom-background' : backgroundCard.backgroundId)
    cards.push(normalizeCard(createCard(SLOT_KIND.buff, {
      id: `background-${backgroundCard.backgroundId}`,
      name: backgroundName,
      sourceType: 'background',
      sourceKey: backgroundCard.backgroundId,
      buffEffects: backgroundCard.backgroundBuffPatch.effects,
      enabled: backgroundCard.backgroundBuffPatch?.enabled !== false,
    })))
  }

  // 6. 手动 BUFF → buff 卡（排除 fromClassFeature 条目，它们是虚拟的）
  const manualBuffs = (character.buffs ?? []).filter((b) => !b.fromClassFeature)
  for (const b of manualBuffs) {
    cards.push(normalizeCard(createCard(SLOT_KIND.buff, {
      id: b.id,
      name: b.source || '',
      sourceType: 'manual',
      buffEffects: Array.isArray(b.effects) ? b.effects : [],
      enabled: b.enabled !== false,
      sourceKey: b.sourceKey || '',
    })))
  }

  // 7. 护盾 → shield 卡（从 char.shields 提取）
  const shields = Array.isArray(character.shields) ? character.shields : []
  for (const s of shields) {
    cards.push(normalizeCard(createCard(SLOT_KIND.shield, {
      id: s.id,
      name: s.name || '',
      sourceType: 'shield',
      sourceKey: s.id || '',
      buffEffects: Array.isArray(s.effects) ? s.effects : [],
      shield: {
        shieldType: s.shieldType || 'charged',
        activationMode: s.activationMode || 'active',
        charges: s.charges,
        maxCharges: s.maxCharges,
        duration: s.duration,
        maxDuration: s.maxDuration,
        active: s.active,
        recovery: s.recovery || 'none',
      },
      enabled: s.enabled !== false,
    })))
  }

  return cards
}

/* ── Card 数组 → BUFF 格式（供计算器使用） ────────────────────────── */

/**
 * 将 Card 数组转为 getMergedBuffsForCalculator 兼容的 BUFF 格式。
 * 通过 sourceType 精确恢复来源标记，确保下游管线无需修改。
 *
 * @param {Array} cards - Card 数组
 * @returns {Array} BUFF 格式数组
 */
export function cardsToBuffEntries(cards) {
  if (!Array.isArray(cards)) return []

  return cards.map((card) => {
    if (!card || !card.enabled) return null
    const effects = Array.isArray(card.buffEffects) ? card.buffEffects : []
    const hasAbility = card.activeAbility != null
    if (effects.length === 0) return null

    const entry = {
      id: card.id,
      source: card.name,
      effects,
      enabled: true,
    }

    // 通过 sourceType 精确恢复来源标记
    const st = card.sourceType
    if (st === 'classFeature') {
      entry.fromClassFeature = true
      const parts = (card.sourceKey || '').split('|')
      entry.sourceClass = parts[0] || ''
      entry.sourceSubclass = parts[1] || ''
      entry.featureId = parts[2] || ''
    } else if (st === 'feat') {
      entry.fromFeat = true
      entry.featId = card.sourceKey || ''
    } else if (st === 'invocation') {
      entry.fromInvocation = true
      entry.invocationId = card.sourceKey || ''
    } else if (st === 'fightingStyle') {
      entry.fromFightingStyle = true
      entry.styleId = card.sourceKey || ''
    } else if (st === 'item') {
      entry.fromItem = true
      entry.itemInventoryId = card.sourceKey || ''
    } else if (st === 'race') {
      entry.fromRace = true
      entry.raceId = card.sourceKey || ''
    } else if (st === 'background') {
      entry.fromBackground = true
      entry.backgroundId = card.sourceKey || ''
    }
    // sourceType === 'shield' 或 'manual' 不设特殊标记

    if (hasAbility) {
      entry.activeAbilities = [card.activeAbility]
    }

    return entry
  }).filter(Boolean)
}

/**
 * 通过卡管线生成合并 BUFF 列表（替代直接调用各 getBuffsFrom* 函数）。
 * 输出格式与 getMergedBuffsForCalculator 完全一致。
 *
 * @param {object} character - 角色对象
 * @param {string} [moduleId] - 规则模组 ID
 * @returns {Array} BUFF 格式数组
 */
export function getMergedBuffsViaCards(character, moduleId) {
  const cards = buildCardsFromCharacter(character, moduleId)
  return cardsToBuffEntries(cards)
}

/* ── 从卡查找主动技能 ─────────────────────────────────────────────── */

/**
 * 从卡数组中查找指定专长的主动技能。
 * @param {Array} cards - Card 数组
 * @param {string} featId - 专长 ID
 * @returns {object|null} 主动技能定义，或 null
 */
export function findActiveAbilityInCards(cards, featId) {
  if (!Array.isArray(cards) || !featId) return null
  const card = cards.find(c => c.slotKind === SLOT_KIND.feat && c.sourceKey === featId && c.activeAbility)
  return card?.activeAbility || null
}

/**
 * 从卡数组中查找指定职业特性下所有主动技能。
 * 一个特性可能对应多个技能（如专注点）。
 * @param {Array} cards - Card 数组
 * @param {string} sourceClass - 职业名
 * @param {string} featureId - 特性 ID
 * @param {object} [context] - 过滤上下文 { level, subclass }
 * @returns {Array} 主动技能定义数组
 */
export function findAllActiveAbilitiesInCards(cards, sourceClass, featureId, context = {}) {
  if (!Array.isArray(cards)) return []
  const results = []
  for (const card of cards) {
    if (card.slotKind !== SLOT_KIND.class) continue
    // sourceKey 格式：职业|子职|featureId
    const parts = (card.sourceKey || '').split('|')
    const cardClass = parts[0] || ''
    const cardSubclass = parts[1] || ''
    const cardFeatureId = parts[2] || ''
    if (cardClass !== sourceClass || cardFeatureId !== featureId) continue
    if (!card.activeAbility) continue
    // 等级过滤
    if (context.level && card.activeAbility.minLevel && context.level < card.activeAbility.minLevel) continue
    // 子职过滤
    if (context.subclass && card.activeAbility.subclassFilter && cardSubclass !== card.activeAbility.subclassFilter) continue
    results.push({ ...card.activeAbility, sourceKey: cardClass })
  }
  return results
}

/**
 * 从卡数组中提取所有护盾卡，还原为 shieldEngine 兼容格式。
 * @param {Array} cards - Card 数组
 * @returns {Array} 护盾数组（兼容 char.shields 格式）
 */
export function extractShieldsFromCards(cards) {
  if (!Array.isArray(cards)) return []
  return cards
    .filter(c => c.slotKind === SLOT_KIND.shield && c.shield)
    .map(c => ({
      id: c.id,
      name: c.name,
      shieldType: c.shield.shieldType,
      activationMode: c.shield.activationMode,
      charges: c.shield.charges,
      maxCharges: c.shield.maxCharges,
      duration: c.shield.duration,
      maxDuration: c.shield.maxDuration,
      active: c.shield.active,
      effects: Array.isArray(c.buffEffects) ? c.buffEffects : [],
      recovery: c.shield.recovery,
      enabled: c.enabled !== false,
    }))
}
