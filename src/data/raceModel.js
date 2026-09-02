/**
 * 种族数据模型 — 默认模板 + 辅助函数
 *
 * 新版种族数据结构（扩展自旧版 { id, name, subraces, traits:string }）：
 * {
 *   id: string,
 *   name: string,
 *   description: string,          // 背景故事 / 风味文字
 *   source: string,               // 来源书籍
 *   creatureType: string,         // 'humanoid' 等
 *   sizeOptions: string[],        // ['Medium', 'Small']
 *   sizeDefault: string,          // 'Medium'
 *   speed: { walk, climb, swim, fly, burrow },
 *   darkvision: number | null,    // 黑暗视觉距离（尺）
 *   spellcastingAbility: 'int' | 'wis' | 'cha' | null,  // 天生施法关键属性
 *   traits: [RaceTrait],         // 结构化特性列表
 *   tables: [RaceTable],         // 参考表格（纯展示）
 *   subraces: [RaceSubrace],     // 亚种
 * }
 *
 * RaceTrait:
 * {
 *   id: string,
 *   name: string,
 *   description: string,
 *   cards: [],                    // Card[] — 与 BuffForm 产出的格式一致
 *   spells: [],                   // RaceSpell[] — 该特性赋予的天生法术
 *   choiceOptions?: [             // 可选：互斥选择选项（有此项 = 选择型特性）
 *     { id, label, description, cards: [], spells: [] }
 *   ],
 * }
 *
 * RaceSpell:
 * {
 *   name: string,
 *   castMode: 'at-will' | 'per-day' | 'slot',
 *   timesPerDay?: number,         // castMode='per-day' 时
 *   slotLevel?: number,           // castMode='slot' 时
 *   description?: string,
 * }
 *
 * raceCard (角色上的种族选择):
 * {
 *   raceId, customName, subraceId, asiAssignments, raceBuffPatch, raceBaseInfo,
 *   sizeSelected: string | null,           // 玩家选择的体型
 *   traitChoices: { [traitId]: optionId }  // 选择型特性的玩家选择
 * }
 *
 * RaceTable:
 * {
 *   id: string,
 *   name: string,
 *   dice: string,                 // 'd6', 'd8' 等
 *   rows: [{ roll: string, text: string }]
 * }
 *
 * RaceSubrace:
 * {
 *   id: string,
 *   name: string,
 *   description: string,
 *   traits: [RaceTrait],
 *   abilityScoreBonuses: [{ amount: number }],  // 属性加值槽
 * }
 *
 * abilityScoreBonuses (种族和子种族都有):
 * 每个元素是一个加值槽 { amount: number }，正数或负数
 * 例如精灵父种族: [{ amount: 2 }, { amount: 1 }]
 */

export const RACE_SIZES = [
  { value: 'Tiny', label: '超小型' },
  { value: 'Small', label: '小型' },
  { value: 'Medium', label: '中型' },
  { value: 'Large', label: '大型' },
]

export const CREATURE_TYPE_OPTIONS = [
  { value: 'humanoid', label: '类人生物' },
  { value: 'fey', label: '精类' },
  { value: 'celestial', label: '天界生物' },
  { value: 'fiend', label: '邪魔' },
  { value: 'undead', label: '不死生物' },
  { value: 'monstrosity', label: '怪兽' },
  { value: 'dragon', label: '龙' },
  { value: 'elemental', label: '元素' },
  { value: 'construct', label: '构装体' },
  { value: 'aberration', label: '异怪' },
  { value: 'ooze', label: '泥怪' },
  { value: 'plant', label: '植物' },
]

/** 空特性模板 */
export function createEmptyTrait() {
  return {
    id: `trait_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    description: '',
    cards: [],
    spells: [],
  }
}

/** 空选择型特性选项模板 */
export function createEmptyChoiceOption() {
  return {
    id: `opt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    label: '',
    description: '',
    cards: [],
    spells: [],
  }
}

/** 空天生法术模板 */
export function createEmptyRaceSpell() {
  return {
    name: '',
    castMode: 'at-will',
    timesPerDay: 1,
    slotLevel: 1,
    description: '',
  }
}

/** 空参考表格模板 */
export function createEmptyTable() {
  return {
    id: `table_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    dice: 'd6',
    rows: [{ roll: '1', text: '' }],
  }
}

/** 空亚种模板 */
export function createEmptySubrace() {
  return {
    id: `subrace_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: '',
    description: '',
    traits: [],
    abilityScoreBonuses: [],
  }
}

/** 默认种族模板 */
export const DEFAULT_RACE = {
  id: '',
  name: '',
  description: '',
  source: '',
  creatureType: 'humanoid',
  sizeOptions: ['Medium'],
  sizeDefault: 'Medium',
  speed: {
    walk: 30,
    climb: null,
    swim: null,
    fly: null,
    burrow: null,
  },
  darkvision: null,
  spellcastingAbility: null,
  abilityScoreBonuses: [{ amount: 2 }, { amount: 1 }],
  traits: [],
  tables: [],
  subraces: [],
}

/** 确保属性加值槽数组格式正确 */
export function normalizeAbilityScoreBonuses(raw, fallback) {
  if (!Array.isArray(raw)) return fallback.map(b => ({ ...b }))
  return raw
    .filter(b => b && typeof b === 'object' && Number.isFinite(Number(b.amount)))
    .map(b => ({ amount: Number(b.amount) }))
}

/**
 * 从旧版 abilityScoreIncrease 推断 asiAssignments
 * 旧数据: { str: 0, dex: 2, con: 0, int: 0, wis: 1, cha: 0 }
 * 种族加值槽: [{ amount: 2 }, { amount: 1 }]
 * 匹配逻辑：非零属性按值降序，与加值槽按 amount 降序一一对应
 * 匹配成功 → [{ source:'race', ability:'dex' }, { source:'race', ability:'wis' }]
 * 匹配失败 → null（玩家需重新分配）
 */
export function inferAsiAssignmentsFromLegacy(raceDef, subrace, oldASI) {
  if (!oldASI || typeof oldASI !== 'object') return null
  const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha']

  const nonZero = ABILITY_KEYS
    .map(k => ({ ability: k, value: Number(oldASI[k]) || 0 }))
    .filter(e => e.value !== 0)
    .sort((a, b) => b.value - a.value)

  if (nonZero.length === 0) return []

  const raceBonuses = normalizeAbilityScoreBonuses(raceDef?.abilityScoreBonuses, DEFAULT_RACE.abilityScoreBonuses)
  const subraceBonuses = subrace ? normalizeAbilityScoreBonuses(subrace.abilityScoreBonuses, []) : []
  const allBonuses = [
    ...raceBonuses.map(b => ({ ...b, source: 'race' })),
    ...subraceBonuses.map(b => ({ ...b, source: 'subrace' })),
  ]
  allBonuses.sort((a, b) => b.amount - a.amount)

  if (nonZero.length !== allBonuses.length) return null

  for (let i = 0; i < nonZero.length; i++) {
    if (nonZero[i].value !== allBonuses[i].amount) return null
  }

  return allBonuses.map((b, i) => ({ source: b.source, ability: nonZero[i].ability }))
}

/** 判断种族定义是否缺少关键配置（用于提示用户补全） */
export function isRaceDefinitionIncomplete(race) {
  if (!race) return true
  const speed = race.speed || {}
  const hasSpeed = (speed.walk && speed.walk !== 30) || speed.climb || speed.swim || speed.fly
  const hasDarkvision = Number(race.darkvision) > 0
  const bonuses = normalizeAbilityScoreBonuses(race.abilityScoreBonuses, [])
  const hasBonuses = bonuses.length > 0
  const hasTraits = Array.isArray(race.traits) && race.traits.length > 0
  const hasTables = Array.isArray(race.tables) && race.tables.length > 0
  return !hasSpeed && !hasDarkvision && !hasBonuses && !hasTraits && !hasTables
}

/**
 * 将旧版种族数据迁移为新版格式
 * 旧版: { id, name, subraces: [{id, name}], traits: string }
 * 新版: 完整结构化
 */
export function migrateOldRace(old) {
  if (!old) return { ...DEFAULT_RACE, abilityScoreBonuses: DEFAULT_RACE.abilityScoreBonuses.map(b => ({ ...b })) }
  // 已经是新版格式（有 traits 数组）
  if (Array.isArray(old.traits)) return old
  // 旧版格式迁移
  return {
    ...DEFAULT_RACE,
    id: old.id || '',
    name: old.name || '',
    description: typeof old.traits === 'string' ? old.traits : '',
    source: old.source || '',
    creatureType: old.creatureType || 'humanoid',
    sizeOptions: old.sizeOptions || ['Medium'],
    sizeDefault: old.sizeDefault || 'Medium',
    speed: old.speed || { ...DEFAULT_RACE.speed },
    darkvision: old.darkvision ?? null,
    abilityScoreBonuses: DEFAULT_RACE.abilityScoreBonuses.map(b => ({ ...b })),
    traits: typeof old.traits === 'string' && old.traits.trim()
      ? [{ ...createEmptyTrait(), name: '种族特性', description: old.traits }]
      : [],
    tables: [],
    subraces: Array.isArray(old.subraces)
      ? old.subraces.map((s) => ({
          ...createEmptySubrace(),
          id: s.id || `subrace_${Math.random().toString(36).slice(2, 6)}`,
          name: s.name || '',
          description: s.description || '',
          traits: Array.isArray(s.traits) ? s.traits : [],
        }))
      : [],
  }
}

/** 确保单个特性数据完整 */
function normalizeTrait(t) {
  if (!t || typeof t !== 'object') return createEmptyTrait()
  return {
    ...t,
    cards: Array.isArray(t.cards) ? t.cards : [],
    spells: Array.isArray(t.spells) ? t.spells : [],
    choiceOptions: Array.isArray(t.choiceOptions)
      ? t.choiceOptions.map(o => ({
          ...(o && typeof o === 'object' ? o : {}),
          id: o?.id || `opt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          label: o?.label || '',
          description: o?.description || '',
          cards: Array.isArray(o?.cards) ? o.cards : [],
          spells: Array.isArray(o?.spells) ? o.spells : [],
        }))
      : undefined,
  }
}

/** 确保种族数据完整（兜底默认值） */
export function normalizeRace(race) {
  if (!race) return { ...DEFAULT_RACE, abilityScoreBonuses: DEFAULT_RACE.abilityScoreBonuses.map(b => ({ ...b })) }
  return {
    ...DEFAULT_RACE,
    ...race,
    spellcastingAbility: race.spellcastingAbility || null,
    speed: { ...DEFAULT_RACE.speed, ...(race.speed || {}) },
    abilityScoreBonuses: normalizeAbilityScoreBonuses(race.abilityScoreBonuses, DEFAULT_RACE.abilityScoreBonuses),
    traits: Array.isArray(race.traits) ? race.traits.map(normalizeTrait) : [],
    tables: Array.isArray(race.tables) ? race.tables : [],
    subraces: Array.isArray(race.subraces) ? race.subraces.map((s) => ({
      ...createEmptySubrace(),
      ...s,
      traits: Array.isArray(s?.traits) ? s.traits.map(normalizeTrait) : [],
      abilityScoreBonuses: normalizeAbilityScoreBonuses(s?.abilityScoreBonuses, []),
    })) : [],
  }
}
