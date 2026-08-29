/**
 * 卡（Card）数据模型 — 最小功能单位
 *
 * 卡-卡槽架构的核心数据结构。每张卡是一个功能单元，放入不同卡槽即获得对应分类。
 * 此文件定义卡的结构、类型常量和工具函数。
 *
 * 编辑卡（Card Editor）模型：
 *   主动卡 — 消耗 → 动作 → 效果 → 持续时间
 *   被动卡 — 效果 + 起效范围
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

/* ── 卡模式 / 动作类型 / 持续时间 / 范围 ─────────────────────────── */

/** 卡模式 */
export const CARD_MODE = {
  ACTIVE: 'active',
  PASSIVE: 'passive',
}

/** 主动卡动作类型 */
export const ACTION_TYPE = {
  ACTION: 'action',
  BONUS: 'bonus',
  REACTION: 'reaction',
  MOVEMENT: 'movement',
}

export const ACTION_TYPE_OPTIONS = [
  { value: ACTION_TYPE.ACTION, label: '主要动作' },
  { value: ACTION_TYPE.BONUS, label: '附赠动作' },
  { value: ACTION_TYPE.REACTION, label: '反应' },
  { value: ACTION_TYPE.MOVEMENT, label: '移动' },
]

/** 主动卡持续时间单位 */
export const DURATION_UNIT = {
  INSTANT: 'instant',       // 即刻
  ROUND: 'round',           // 回合
  MINUTE: 'minute',         // 分钟
  HOUR: 'hour',             // 小时
  DAY: 'day',               // 天
}

export const DURATION_UNIT_OPTIONS = [
  { value: DURATION_UNIT.INSTANT, label: '即刻' },
  { value: DURATION_UNIT.ROUND, label: '回合' },
  { value: DURATION_UNIT.MINUTE, label: '分钟' },
  { value: DURATION_UNIT.HOUR, label: '小时' },
  { value: DURATION_UNIT.DAY, label: '天' },
]

/** 被动卡起效范围类型 */
export const SCOPE_TYPE = {
  GLOBAL: 'global',                 // 全局（自动生效）
  WEAPON_TYPE: 'weapon_type',       // 武器类型
  DAMAGE_TYPE: 'damage_type',       // 伤害类型
  CREATURE_ITEM: 'creature_item',   // 对生物/物品
  CUSTOM: 'custom',                 // 自定义
}

export const SCOPE_TYPE_OPTIONS = [
  { value: SCOPE_TYPE.GLOBAL, label: '全局' },
  { value: SCOPE_TYPE.WEAPON_TYPE, label: '武器类型' },
  { value: SCOPE_TYPE.DAMAGE_TYPE, label: '伤害类型' },
  { value: SCOPE_TYPE.CREATURE_ITEM, label: '对生物/物品' },
  { value: SCOPE_TYPE.CUSTOM, label: '自定义' },
]

/* ── 卡数据结构（基础） ──────────────────────────────────────────── */

let _cardIdCounter = 0
function genCardId() {
  return `card_${Date.now()}_${(++_cardIdCounter).toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/**
 * 创建一张空白卡（通用）。
 * @param {string} slotKind - 卡槽类型（SLOT_KIND 中的值）
 * @param {object} [overrides] - 覆盖默认值的字段
 * @returns {object} Card 对象
 */
export function createCard(slotKind, overrides = {}) {
  return {
    id: overrides.id || genCardId(),
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

/* ── 主动卡工厂 ─────────────────────────────────────────────────── */

/**
 * 创建一张主动卡。
 *
 * 主动卡结构：消耗 → 动作 → 效果 → 持续时间
 *
 * @param {object} [overrides] - 覆盖默认值
 * @returns {object} 主动卡对象
 */
export function createActiveCard(overrides = {}) {
  const base = {
    id: genCardId(),
    name: '',
    description: '',
    slotKind: SLOT_KIND.buff,
    sourceKey: '',
    sourceType: 'manual',
    mode: CARD_MODE.ACTIVE,

    // ── 消耗 ──
    cost: {
      type: 'charges',        // 资源类型（charges / rage / spell_slot_1 / ...）
      resourceKey: '',        // 备用资源键
      amount: 1,              // 消耗数量
    },
    multiCost: false,         // 是否多资源
    costs: [],                // 多资源时：[{ type, resourceKey, amount }]

    // ── 恢复 ──
    recovery: {
      method: 'long_rest',    // short_rest / long_rest / dawn / none / absorb_energy
      kind: 'full',           // full / fixed / dice
      fixed: 1,
      diceCount: 1,
      diceSides: 6,
      diceBonus: 0,
    },

    // ── 动作 ──
    actionType: 'action',     // action / bonus / reaction / movement
    movementDistance: 0,      // 仅 movement 时使用

    // ── 效果 ──
    effects: [],              // 释放效果数组（charge_effect 条目）

    // ── 持续时间 ──
    duration: {
      unit: 'instant',        // instant / round / minute / hour / day
      amount: 1,
    },

    // ── 兼容 ──
    buffEffects: [],          // 保持管线兼容（主动卡通常为空）
    enabled: true,
  }

  if (overrides) {
    // 深度合并 cost / recovery / duration
    if (overrides.cost) base.cost = { ...base.cost, ...overrides.cost }
    if (overrides.recovery) base.recovery = { ...base.recovery, ...overrides.recovery }
    if (overrides.duration) base.duration = { ...base.duration, ...overrides.duration }
    // 其余字段直接覆盖
    const { cost: _c, recovery: _r, duration: _d, ...rest } = overrides
    Object.assign(base, rest)
  }

  return base
}

/* ── 被动卡工厂 ─────────────────────────────────────────────────── */

/**
 * 创建一张被动卡。
 *
 * 被动卡结构：效果 + 起效范围
 *
 * @param {object} [overrides] - 覆盖默认值
 * @returns {object} 被动卡对象
 */
export function createPassiveCard(overrides = {}) {
  const base = {
    id: genCardId(),
    name: '',
    description: '',
    slotKind: SLOT_KIND.buff,
    sourceKey: '',
    sourceType: 'manual',
    mode: CARD_MODE.PASSIVE,

    // ── 效果 ──
    effects: [],              // 被动效果数组（与 buffEffects 同步）

    // ── 起效范围 ──
    scope: {
      type: 'global',         // global / weapon_type / damage_type / creature_item / custom
      weapons: [],             // 武器类型列表（scope.type === 'weapon_type' 时）
      damageTypes: [],         // 伤害类型列表（scope.type === 'damage_type' 时）
      custom: '',              // 自定义描述（scope.type === 'creature_item' 或 'custom' 时）
    },

    // ── 兼容 ──
    buffEffects: [],           // 与 effects 同步，供旧管线使用
    enabled: true,
  }

  if (overrides) {
    if (overrides.scope) base.scope = { ...base.scope, ...overrides.scope }
    const { scope: _s, ...rest } = overrides
    Object.assign(base, rest)
  }

  return base
}

/* ── 规范化 ─────────────────────────────────────────────────────── */

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

  const mode = card.mode === CARD_MODE.ACTIVE ? CARD_MODE.ACTIVE
    : card.mode === CARD_MODE.PASSIVE ? CARD_MODE.PASSIVE
    : undefined  // 旧卡无 mode 字段

  const base = {
    id: card.id || genCardId(),
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

  // ── 主动卡字段 ──
  if (mode === CARD_MODE.ACTIVE || card.cost || card.actionType || card.duration) {
    base.mode = CARD_MODE.ACTIVE
    base.cost = normalizeCost(card.cost)
    base.multiCost = !!card.multiCost
    base.costs = Array.isArray(card.costs) ? card.costs.map(normalizeCost) : []
    base.recovery = normalizeRecovery(card.recovery)
    base.actionType = normalizeActionType(card.actionType)
    base.movementDistance = Math.max(0, Number(card.movementDistance) || 0)
    base.effects = Array.isArray(card.effects) ? card.effects : []
    base.duration = normalizeDuration(card.duration)
  }

  // ── 被动卡字段 ──
  if (mode === CARD_MODE.PASSIVE || card.scope) {
    base.mode = CARD_MODE.PASSIVE
    base.effects = Array.isArray(card.effects) ? card.effects : []
    base.scope = normalizeScope(card.scope)
  }

  // 旧卡无 mode → 不设 mode 字段，保持兼容
  if (!mode) {
    // 有 activeAbility 的旧卡视为主动
    if (card.activeAbility) {
      base.mode = CARD_MODE.ACTIVE
      if (!base.cost) base.cost = normalizeCost(null)
      if (!base.recovery) base.recovery = normalizeRecovery(null)
      if (!base.actionType) base.actionType = 'action'
      if (base.movementDistance == null) base.movementDistance = 0
      if (!base.effects) base.effects = []
      if (!base.duration) base.duration = normalizeDuration(null)
    }
  }

  return base
}

function normalizeCost(cost) {
  if (!cost || typeof cost !== 'object') return { type: 'charges', resourceKey: '', amount: 1 }
  return {
    type: cost.type || 'charges',
    resourceKey: cost.resourceKey || '',
    amount: Math.max(1, Number(cost.amount) || 1),
  }
}

function normalizeRecovery(rec) {
  if (!rec || typeof rec !== 'object') return { method: 'long_rest', kind: 'full', fixed: 1, diceCount: 1, diceSides: 6, diceBonus: 0 }
  return {
    method: rec.method || 'long_rest',
    kind: rec.kind || 'full',
    fixed: Math.max(0, Number(rec.fixed) || 0),
    diceCount: Math.max(1, Number(rec.diceCount) || 1),
    diceSides: Math.max(1, Number(rec.diceSides) || 6),
    diceBonus: Math.max(0, Number(rec.diceBonus) || 0),
  }
}

function normalizeActionType(at) {
  return ['action', 'bonus', 'reaction', 'movement'].includes(at) ? at : 'action'
}

function normalizeDuration(dur) {
  if (!dur || typeof dur !== 'object') return { unit: 'instant', amount: 1 }
  return {
    unit: ['instant', 'round', 'minute', 'hour', 'day'].includes(dur.unit) ? dur.unit : 'instant',
    amount: Math.max(1, Number(dur.amount) || 1),
  }
}

function normalizeScope(scope) {
  if (!scope || typeof scope !== 'object') return { type: 'global', weapons: [], damageTypes: [], custom: '' }
  return {
    type: ['global', 'weapon_type', 'damage_type', 'creature_item', 'custom'].includes(scope.type) ? scope.type : 'global',
    weapons: Array.isArray(scope.weapons) ? scope.weapons : [],
    damageTypes: Array.isArray(scope.damageTypes) ? scope.damageTypes : [],
    custom: typeof scope.custom === 'string' ? scope.custom : '',
  }
}

/* ── 序列化 / 反序列化 ──────────────────────────────────────────── */

/**
 * 将卡序列化为纯 JSON 对象（去除 undefined，确保可存储）。
 * @param {object} card - Card 对象
 * @returns {object} 可 JSON.stringify 的纯对象
 */
export function cardToJSON(card) {
  if (!card || typeof card !== 'object') return null

  const json = {
    id: card.id,
    name: card.name ?? '',
    description: card.description ?? '',
    slotKind: card.slotKind ?? SLOT_KIND.buff,
    sourceKey: card.sourceKey ?? '',
    sourceType: card.sourceType ?? '',
    enabled: card.enabled !== false,
  }

  // 可选基础字段
  if (card.level != null) json.level = Number(card.level)
  if (card.subclass) json.subclass = card.subclass
  if (card.mode) json.mode = card.mode

  // 兼容字段
  if (Array.isArray(card.buffEffects) && card.buffEffects.length > 0) {
    json.buffEffects = card.buffEffects
  }
  if (card.activeAbility) json.activeAbility = card.activeAbility
  if (card.shield) json.shield = card.shield

  // 主动卡专属字段
  if (card.mode === CARD_MODE.ACTIVE) {
    json.cost = card.cost ? { ...card.cost } : { type: 'charges', resourceKey: '', amount: 1 }
    if (card.multiCost) {
      json.multiCost = true
      json.costs = Array.isArray(card.costs) ? card.costs.map(c => ({ ...c })) : []
    }
    json.recovery = card.recovery ? { ...card.recovery } : { method: 'long_rest', kind: 'full', fixed: 1, diceCount: 1, diceSides: 6, diceBonus: 0 }
    json.actionType = card.actionType || 'action'
    if (card.actionType === 'movement') json.movementDistance = card.movementDistance || 0
    json.effects = Array.isArray(card.effects) ? [...card.effects] : []
    json.duration = card.duration ? { ...card.duration } : { unit: 'instant', amount: 1 }
  }

  // 被动卡专属字段
  if (card.mode === CARD_MODE.PASSIVE) {
    json.effects = Array.isArray(card.effects) ? [...card.effects] : []
    if (card.scope && card.scope.type !== 'global') {
      json.scope = { ...card.scope }
      if (Array.isArray(card.scope.weapons)) json.scope.weapons = [...card.scope.weapons]
      if (Array.isArray(card.scope.damageTypes)) json.scope.damageTypes = [...card.scope.damageTypes]
    }
  }

  return json
}

/**
 * 从 JSON 对象反序列化为 Card。
 * @param {object} json - 存储的 JSON 对象
 * @returns {object} Card 对象（经 normalizeCard 处理）
 */
export function cardFromJSON(json) {
  if (!json || typeof json !== 'object') return createCard(SLOT_KIND.buff)
  return normalizeCard({ ...json })
}

/* ── 迁移：旧 BUFF → 新 Card 格式 ──────────────────────────────── */

/**
 * 将旧 BUFF 条目迁移为新 Card 格式。
 *
 * - 含 charge_item 效果的 BUFF → 主动卡
 * - 其余 → 被动卡
 *
 * @param {object} buffEntry - 旧 BUFF 格式对象（{ source, effects[], ... }）
 * @returns {object} 新 Card 对象
 */
export function migrateBuffToCard(buffEntry) {
  if (!buffEntry) return createPassiveCard()

  const effects = Array.isArray(buffEntry.effects) ? buffEntry.effects : []

  // 查找 charge_item 效果
  const chargeEffect = effects.find(e =>
    e && e.effectType === 'charge_item' && e.value && typeof e.value === 'object'
  )

  if (chargeEffect) {
    return _migrateChargeItemToActiveCard(buffEntry, chargeEffect)
  }

  // 普通被动 BUFF
  return _migratePassiveBuff(buffEntry)
}

/**
 * 将含 charge_item 的 BUFF 迁移为主动卡。
 */
function _migrateChargeItemToActiveCard(buffEntry, chargeEffect) {
  const cv = chargeEffect.value
  const effects = Array.isArray(buffEntry.effects) ? buffEntry.effects : []

  // 提取消耗信息
  const cost = {
    type: cv.resourceType || 'charges',
    resourceKey: '',
    amount: Math.max(1, Number(cv.charges) || 1),
  }

  // 提取动作类型
  const actionType = cv.actionCost || 'action'

  // 提取恢复信息
  const recovery = cv.recovery ? {
    method: cv.recovery.method || 'long_rest',
    kind: cv.recovery.kind || 'full',
    fixed: Math.max(0, Number(cv.recovery.fixed) || 0),
    diceCount: Math.max(1, Number(cv.recovery.diceCount) || 1),
    diceSides: Math.max(1, Number(cv.recovery.diceSides) || 6),
    diceBonus: Math.max(0, Number(cv.recovery.diceBonus) || 0),
  } : { method: 'long_rest', kind: 'full', fixed: 1, diceCount: 1, diceSides: 6, diceBonus: 0 }

  // 提取子效果（spell / ability / shield / temp_buff 等）
  const subEffects = Array.isArray(cv.effects) ? cv.effects : []

  // 持续时间（从 BUFF 条目获取）
  const duration = buffEntry.duration
    ? { unit: 'minute', amount: Number(buffEntry.duration) || 1 }
    : { unit: 'instant', amount: 1 }

  // 除 charge_item 外的其他效果保留在 buffEffects
  const otherEffects = effects.filter(e => e !== chargeEffect)

  return createActiveCard({
    id: buffEntry.id,
    name: buffEntry.source || '',
    slotKind: SLOT_KIND.buff,
    sourceType: 'manual',
    cost,
    recovery,
    actionType,
    movementDistance: Math.max(0, Number(cv.movementFeet) || 0),
    effects: subEffects,
    duration,
    buffEffects: otherEffects,
    enabled: buffEntry.enabled !== false,
  })
}

/**
 * 将普通被动 BUFF 迁移为被动卡。
 */
function _migratePassiveBuff(buffEntry) {
  const effects = Array.isArray(buffEntry.effects) ? buffEntry.effects : []

  return createPassiveCard({
    id: buffEntry.id,
    name: buffEntry.source || '',
    slotKind: SLOT_KIND.buff,
    sourceType: 'manual',
    effects: [...effects],
    buffEffects: [...effects],  // 同步到兼容字段
    scope: { type: 'global', weapons: [], damageTypes: [], custom: '' },
    enabled: buffEntry.enabled !== false,
  })
}

/**
 * 批量迁移旧 buffs[] 数组为新 Card 数组。
 * 仅迁移手动 BUFF（过滤掉 fromClassFeature 虚拟条目）。
 *
 * @param {Array} buffs - 旧 char.buffs 数组
 * @returns {Array} 新 Card 数组
 */
export function migrateBuffsArray(buffs) {
  if (!Array.isArray(buffs)) return []
  return buffs
    .filter(b => !b.fromClassFeature)  // 跳过虚拟条目
    .map(migrateBuffToCard)
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

/**
 * 判断卡是否为主动卡。
 */
export function cardIsActive(card) {
  return card?.mode === CARD_MODE.ACTIVE
}

/**
 * 判断卡是否为被动卡。
 */
export function cardIsPassive(card) {
  return card?.mode === CARD_MODE.PASSIVE
}

/**
 * 获取卡的模式标签。
 * @param {string|undefined} mode
 * @returns {string}
 */
export function getCardModeLabel(mode) {
  if (mode === CARD_MODE.ACTIVE) return '主动'
  if (mode === CARD_MODE.PASSIVE) return '被动'
  return '未分类'
}
