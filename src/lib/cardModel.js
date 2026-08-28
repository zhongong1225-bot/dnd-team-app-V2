/**
 * 卡（Card）数据模型 — 最小功能单位
 *
 * 卡-卡槽架构的核心数据结构。每张卡是一个功能单元，放入不同卡槽即获得对应分类。
 * 此文件定义卡的结构、类型常量和工具函数。
 */

/* ── 卡槽类型 ─────────────────────────────────────────────────────── */

export const SLOT_KIND = {
  /** 职业特性（从职业数据库按等级自动推导） */
  class: 'class',
  /** 专长（用户从专长列表选择） */
  feat: 'feat',
  /** 种族特性（从种族数据自动推导） */
  race: 'race',
  /** 装备（用户添加/拖拽） */
  equipment: 'equipment',
  /** 手动 BUFF（用户创建的纯效果卡） */
  buff: 'buff',
  /** 护盾（具有护盾属性的卡） */
  shield: 'shield',
}

export const SLOT_KIND_OPTIONS = [
  { value: SLOT_KIND.class, label: '职业特性' },
  { value: SLOT_KIND.feat, label: '专长' },
  { value: SLOT_KIND.race, label: '种族特性' },
  { value: SLOT_KIND.equipment, label: '装备' },
  { value: SLOT_KIND.buff, label: '增益' },
  { value: SLOT_KIND.shield, label: '护盾' },
]

/** 卡槽显示顺序 */
export const DEFAULT_SLOT_ORDER = ['class', 'feat', 'race', 'equipment', 'buff', 'shield']

/* ── 卡数据结构 ───────────────────────────────────────────────────── */

/**
 * 创建一张空白卡。
 * @param {string} slotKind - 卡槽类型（SLOT_KIND 中的值）
 * @param {object} [overrides] - 覆盖默认值的字段
 * @returns {object} Card 对象
 */
export function createCard(slotKind, overrides = {}) {
  return {
    id: overrides.id || `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: '',
    description: '',
    slotKind: slotKind || SLOT_KIND.buff,
    sourceKey: '',          // 来源键（职业名/专长ID/装备ID等）
    sourceType: '',         // 原始来源类型（classFeature/feat/invocation/fightingStyle/item/manual）
    level: undefined,       // 适用等级（职业特性用）
    subclass: undefined,    // 子职标记

    // BUFF 效果定义（由 BUFF 编辑器产出）
    buffEffects: [],

    // 主动技能定义（可选）
    activeAbility: undefined,

    // 护盾属性（可选）
    shield: undefined,

    // 启用状态
    enabled: true,

    ...overrides,
  }
}

/**
 * 规范化卡对象，确保所有字段存在。
 * 兼容旧数据和部分填充的卡。
 * @param {object} card - 原始卡对象
 * @returns {object} 规范化后的卡
 */
export function normalizeCard(card) {
  if (!card || typeof card !== 'object') return createCard(SLOT_KIND.buff)

  const slotKind = Object.values(SLOT_KIND).includes(card.slotKind)
    ? card.slotKind
    : SLOT_KIND.buff

  return {
    id: card.id || `card_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name: card.name ?? '',
    description: card.description ?? '',
    slotKind,
    sourceKey: card.sourceKey ?? '',
    sourceType: card.sourceType ?? '',
    level: card.level != null ? Number(card.level) : undefined,
    subclass: card.subclass || undefined,
    buffEffects: Array.isArray(card.buffEffects) ? card.buffEffects : [],
    activeAbility: card.activeAbility || undefined,
    shield: card.shield || undefined,
    enabled: card.enabled !== false,
  }
}

/* ── 卡 → BUFF 格式转换 ──────────────────────────────────────────── */

/**
 * 将卡转为 BUFF 栏兼容格式（与现有 getMergedBuffsForCalculator 输出一致）。
 * 这是适配层的核心：旧管线无需改动，只是数据来源从 cards 提供。
 *
 * @param {object} card - 规范化后的 Card 对象
 * @returns {object|null} BUFF 格式对象，或 null（无效果时）
 */
export function cardToBuffEntry(card) {
  if (!card || !card.enabled) return null
  const effects = Array.isArray(card.buffEffects) ? card.buffEffects : []
  const hasActiveAbility = card.activeAbility != null
  // 无效果且无主动技能 → 不生成 BUFF 条目
  if (effects.length === 0 && !hasActiveAbility) return null

  const entry = {
    id: card.id,
    source: card.name,
    effects,
    enabled: true,
  }

  // 保留来源标记（兼容现有分栏/过滤逻辑）
  if (card.slotKind === SLOT_KIND.class) {
    entry.fromClassFeature = true
    entry.featureId = card.sourceKey
    entry.sourceClass = card.sourceKey // 职业名存在 sourceKey
    entry.sourceSubclass = card.subclass || ''
  } else if (card.slotKind === SLOT_KIND.feat) {
    entry.fromFeat = true
    entry.featId = card.sourceKey
  } else if (card.slotKind === SLOT_KIND.equipment) {
    entry.fromItem = true
    entry.itemInventoryId = card.sourceKey
  } else if (card.slotKind === SLOT_KIND.shield) {
    entry.fromShield = true
  }
  // buff / race 不设特殊标记

  if (hasActiveAbility) {
    entry.activeAbilities = [card.activeAbility]
  }

  return entry
}

/**
 * 从卡数组生成 BUFF 列表（等价于旧 getMergedBuffsForCalculator 的输出格式）。
 * @param {Array} cards - Card 数组
 * @returns {Array} BUFF 格式数组
 */
export function getMergedBuffsFromCards(cards) {
  if (!Array.isArray(cards)) return []
  return cards.map(cardToBuffEntry).filter(Boolean)
}

/* ── 辅助函数 ─────────────────────────────────────────────────────── */

/**
 * 获取卡槽类型的中文标签。
 * @param {string} slotKind
 * @returns {string}
 */
export function getSlotKindLabel(slotKind) {
  const found = SLOT_KIND_OPTIONS.find((o) => o.value === slotKind)
  return found ? found.label : slotKind
}

/**
 * 判断卡是否具有被动 BUFF 效果。
 */
export function cardHasBuffEffects(card) {
  return Array.isArray(card?.buffEffects) && card.buffEffects.length > 0
}

/**
 * 判断卡是否具有主动技能。
 */
export function cardHasActiveAbility(card) {
  return card?.activeAbility != null
}

/**
 * 判断卡是否具有护盾属性。
 */
export function cardHasShield(card) {
  return card?.shield != null
}
