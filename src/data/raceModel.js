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
 * }
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
  traits: [],
  tables: [],
  subraces: [],
}

/**
 * 将旧版种族数据迁移为新版格式
 * 旧版: { id, name, subraces: [{id, name}], traits: string }
 * 新版: 完整结构化
 */
export function migrateOldRace(old) {
  if (!old) return { ...DEFAULT_RACE }
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
    traits: typeof old.traits === 'string' && old.traits.trim()
      ? [{ ...createEmptyTrait(), name: '种族特性', description: old.traits }]
      : [],
    tables: [],
    subraces: Array.isArray(old.subraces)
      ? old.subraces.map((s) => ({
          id: s.id || `subrace_${Math.random().toString(36).slice(2, 6)}`,
          name: s.name || '',
          description: s.description || '',
          traits: Array.isArray(s.traits) ? s.traits : [],
        }))
      : [],
  }
}

/** 确保种族数据完整（兜底默认值） */
export function normalizeRace(race) {
  if (!race) return { ...DEFAULT_RACE }
  return {
    ...DEFAULT_RACE,
    ...race,
    speed: { ...DEFAULT_RACE.speed, ...(race.speed || {}) },
    traits: Array.isArray(race.traits) ? race.traits : [],
    tables: Array.isArray(race.tables) ? race.tables : [],
    subraces: Array.isArray(race.subraces) ? race.subraces.map((s) => ({
      ...createEmptySubrace(),
      ...s,
      traits: Array.isArray(s?.traits) ? s.traits : [],
    })) : [],
  }
}
