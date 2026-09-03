/**
 * 种族数据层
 *
 * 所有种族均由用户手动创建，无内置预设。
 * 自定义种族通过 localStorage + Supabase custom_library 双模式存储。
 *
 * 新版种族数据结构（见 raceModel.js）：
 * {
 *   id, name, description, source, creatureType,
 *   sizeOptions, sizeDefault, speed, darkvision,
 *   traits: [{ id, name, description, cards }],
 *   tables: [{ id, name, dice, rows }],
 *   subraces: [{ id, name, description, traits }],
 * }
 *
 * 旧版格式 { id, name, subraces:[{id,name}], traits:string } 通过 normalizeRace 自动迁移。
 */

import { isSupabaseEnabled } from '../lib/supabase'
import * as teamData from '../lib/teamDataSupabase'
import { DEFAULT_RACE, normalizeRace, migrateOldRace } from './raceModel'

/** 内置种族列表 */
export const RACES = [
  {
    id: 'human',
    name: '人类',
    description: '人类的外貌就像地球上的人一样多样，他们也同样信奉许多的神祇。学者们对人类的起源争议不休，但据说已知最早的人类聚居地是在印记城，那座位于多元宇宙中心的环形城市，那座通用语诞生的城市。从那里开始，人类带着门之城的世界主义走到了多元宇宙的每个角落。',
    source: '',
    creatureType: 'humanoid',
    sizeOptions: ['Medium', 'Small'],
    sizeDefault: 'Medium',
    speed: { walk: 30, climb: null, swim: null, fly: null, burrow: null },
    darkvision: null,
    abilityScoreBonuses: [],
    traits: [
      {
        id: 'human_resourceful',
        name: '适应力',
        description: '每当你完成长休时，你都会获得英雄激励。',
        cards: [],
      },
      {
        id: 'human_skillful',
        name: '技能熟练',
        description: '你获得一项自选技能的熟练。',
        cards: [],
      },
      {
        id: 'human_versatile',
        name: '多才多艺',
        description: '你获得一项自选的起源专长。推荐选择熟习（Skilled）专长。',
        cards: [],
      },
    ],
    tables: [],
    subraces: [],
  },
  {
    id: 'dragonborn',
    name: '龙裔',
    description: '龙裔的先祖由金属龙和色彩龙的龙蛋孵化而来。有故事传言，这些龙蛋乃是得到了龙神巴哈姆特或提亚马特的祝福，应两位希望让多元宇宙布满自己造物的愿景而生。但也有故事称，最初的龙裔是由巨龙们独立制造，与神无关。无论起源如何，龙裔都已经在物质位面中扎根落地，繁衍生息。\n\n龙裔看起来就如同双足行走的无翼巨龙——明亮而灼热的眼瞳，头顶细长的骨角，其独有的色泽和其他特征更是彰显着其龙类先祖。',
    source: '',
    creatureType: 'humanoid',
    sizeOptions: ['Medium'],
    sizeDefault: 'Medium',
    speed: { walk: 30, climb: null, swim: null, fly: null, burrow: null },
    darkvision: 60,
    abilityScoreBonuses: [],
    traits: [
      {
        id: 'dragonborn_draconic_ancestry',
        name: '龙族血统',
        description: '你的血脉可以追溯到某种巨龙祖先。从龙族血统表格中选择一种龙。你选择的龙种将会影响你的吐息武器和伤害抗性特质，以及你的外表。',
        cards: [],
        choiceOptions: [
          { id: 'white', label: '白龙', description: '寒冷伤害', cards: [{ effectType: 'damage_type_relation', value: { types: ['cold'], relation: 'resist' } }] },
          { id: 'black', label: '黑龙', description: '强酸伤害', cards: [{ effectType: 'damage_type_relation', value: { types: ['acid'], relation: 'resist' } }] },
          { id: 'green', label: '绿龙', description: '毒素伤害', cards: [{ effectType: 'damage_type_relation', value: { types: ['poison'], relation: 'resist' } }] },
          { id: 'blue', label: '蓝龙', description: '闪电伤害', cards: [{ effectType: 'damage_type_relation', value: { types: ['lightning'], relation: 'resist' } }] },
          { id: 'red', label: '红龙', description: '火焰伤害', cards: [{ effectType: 'damage_type_relation', value: { types: ['fire'], relation: 'resist' } }] },
          { id: 'brass', label: '黄铜龙', description: '火焰伤害', cards: [{ effectType: 'damage_type_relation', value: { types: ['fire'], relation: 'resist' } }] },
          { id: 'copper', label: '赤铜龙', description: '强酸伤害', cards: [{ effectType: 'damage_type_relation', value: { types: ['acid'], relation: 'resist' } }] },
          { id: 'bronze', label: '青铜龙', description: '闪电伤害', cards: [{ effectType: 'damage_type_relation', value: { types: ['lightning'], relation: 'resist' } }] },
          { id: 'silver', label: '银龙', description: '寒冷伤害', cards: [{ effectType: 'damage_type_relation', value: { types: ['cold'], relation: 'resist' } }] },
          { id: 'gold', label: '金龙', description: '火焰伤害', cards: [{ effectType: 'damage_type_relation', value: { types: ['fire'], relation: 'resist' } }] },
        ],
      },
      {
        id: 'dragonborn_breath_weapon',
        name: '吐息武器',
        description: '每当你在自己回合内进行攻击动作时，你可以将其中一次攻击替换为释放魔法性的能量，覆盖15尺锥状区域或30尺长5尺宽的线状区域（每次吐息时选择其范围）。区域内的生物必须进行一次敏捷豁免检定（DC=8+你的体质调整值+你的熟练加值）。豁免失败的生物受到1d10伤害，伤害类型为你龙族血统特质所选龙种对应的类型。豁免成功的生物只受到一半伤害。此伤害会在你达到5级（2d10），11级（3d10）和17级（4d10）时提升1d10。\n\n你可以使用此吐息武器的次数等于你的熟练加值，完成一次长休后，你重获全部已消耗的使用次数。',
        cards: [
          {
            effectType: 'charge_item',
            category: 'active_release',
            scope: 'global',
            scopeDetail: [],
            value: {
              resourceType: 'charges',
              charges: 1, // 实际使用时会被角色熟练加值覆盖
              actionCost: 'action',
              movementFeet: 0,
              recovery: { method: 'long_rest', kind: 'full' },
              effects: [
                {
                  type: 'custom_logic',
                  value: {
                    title: '吐息武器',
                    description: '15尺锥状或30尺线状区域，敏捷豁免 DC=8+体质调整值+熟练加值。豁免失败受到{damageDice}伤害，成功减半。伤害类型由龙族血统决定。',
                    triggerCondition: 'on_use',
                  },
                },
              ],
              // 伤害骰子会随等级自动调整：1-4级1d10，5-10级2d10，11-16级3d10，17+级4d10
              damageDice: '1d10',
              damageTypeFromAncestry: true, // 标记：伤害类型从龙族血统选择继承
            },
          },
        ],
      },
      {
        id: 'dragonborn_damage_resistance',
        name: '伤害抗性',
        description: '根据你龙族血统特质所选龙种，你获得对应的伤害类型的伤害抗性。',
        cards: [],
      },
      {
        id: 'dragonborn_draconic_flight',
        name: '龙族飞翼',
        description: '到达5级后，你可以引导体内龙之魔法的能力，让自己暂时获得飞行能力。以一个附赠动作，你的后背临时伸出两片灵体飞翼，持续10分钟，陷入失能状态时或你主动收起它时（无需动作）它将提前消失。飞翼存在期间，你获得等于你速度的飞行速度。你的翅膀看起来像是和你吐息武器相同的能量凝聚而成。使用此特质后，直到你完成一次长休为止你都不能再次使用它。',
        cards: [
          {
            effectType: 'charge_item',
            category: 'active_release',
            scope: 'global',
            scopeDetail: [],
            value: {
              resourceType: 'charges',
              charges: 1,
              actionCost: 'bonus',
              movementFeet: 0,
              recovery: { method: 'long_rest', kind: 'full' },
              effects: [
                {
                  type: 'custom_logic',
                  value: {
                    title: '龙族飞翼',
                    description: '5级后可用。附赠动作激活，获得飞行速度(等于行走速度)，持续10分钟。失能时或主动收起时提前结束。长休后恢复使用次数。',
                    triggerCondition: 'on_use',
                  },
                },
              ],
              // 持续时间：10分钟
              duration: { type: 'minutes', value: 10 },
              // 等级要求标记
              minLevel: 5,
            },
          },
        ],
      },
    ],
    tables: [
      {
        id: 'draconic_ancestry',
        name: '龙族血统',
        dice: 'd10',
        rows: [
          { roll: '1', text: '白龙 - 寒冷' },
          { roll: '2', text: '黑龙 - 强酸' },
          { roll: '3', text: '绿龙 - 毒素' },
          { roll: '4', text: '蓝龙 - 闪电' },
          { roll: '5', text: '红龙 - 火焰' },
          { roll: '6', text: '黄铜龙 - 火焰' },
          { roll: '7', text: '赤铜龙 - 强酸' },
          { roll: '8', text: '青铜龙 - 闪电' },
          { roll: '9', text: '银龙 - 寒冷' },
          { roll: '10', text: '金龙 - 火焰' },
        ],
      },
    ],
    subraces: [],
  },
]

/** 旧版硬编码种族兼容表（仅用于回退显示，不会出现在选择列表中） */
const LEGACY_RACES = {
  'dwarf':        { id: 'dwarf',        name: '矮人',     subraces: [{ id: 'hill', name: '丘陵矮人' }, { id: 'mountain', name: '山地矮人' }], traits: '黑暗视觉 60 尺；毒素抗性；矮人坚韧；石工工具熟练' },
  'elf':          { id: 'elf',          name: '精灵',     subraces: [{ id: 'high', name: '高精灵' }, { id: 'wood', name: '木精灵' }, { id: 'drow', name: '暗精灵' }], traits: '黑暗视觉 60 尺；敏锐感官；妖精血统' },
  'halfling':     { id: 'halfling',     name: '半身人',   subraces: [{ id: 'lightfoot', name: '轻足半身人' }, { id: 'stout', name: '健壮半身人' }], traits: '幸运；勇敢；半身人敏捷' },
  'human':        { id: 'human',        name: '人类',     subraces: [{ id: 'standard', name: '标准人类' }, { id: 'variant', name: '变体人类' }], traits: '全属性 +1 或自选两项 +1 加一项技能/专长' },
  'dragonborn':   { id: 'dragonborn',   name: '龙裔',     subraces: [], traits: '龙息武器；伤害抗性；龙语者' },
  'gnome':        { id: 'gnome',        name: '侏儒',     subraces: [{ id: 'forest', name: '森林侏儒' }, { id: 'rock', name: '岩石侏儒' }], traits: '黑暗视觉 60 尺；侏儒狡诈' },
  'half-elf':     { id: 'half-elf',     name: '半精灵',   subraces: [{ id: 'standard', name: '标准半精灵' }, { id: 'wood', name: '木精灵血统' }, { id: 'drow', name: '卓尔血统' }], traits: '黑暗视觉 60 尺；妖精血统；两项自选属性 +1；两项自选技能熟练' },
  'half-orc':     { id: 'half-orc',     name: '半兽人',   subraces: [], traits: '黑暗视觉 60 尺；不屈；凶猛攻击；兽人耐力' },
  'tiefling':     { id: 'tiefling',     name: '提夫林',   subraces: [{ id: 'standard', name: '标准提夫林' }, { id: 'variant', name: '变体提夫林' }], traits: '黑暗视觉 60 尺；地狱抗性；炼狱遗产' },
}

/** 将旧版兼容种族迁移为自定义种族（保留原 ID），已迁移则直接返回 */
export function migrateLegacyRace(id) {
  const legacy = LEGACY_RACES[id]
  if (!legacy) return null
  const list = getCustomRaces()
  const existing = list.find((r) => r.id === id)
  if (existing) return existing
  const entry = normalizeRace(migrateOldRace({ ...legacy, subraces: [...legacy.subraces] }))
  list.push(entry)
  persistCustomRaces(list)
  return entry
}

/** 判断是否为旧版兼容种族（不在自定义列表中） */
export function isLegacyRace(id) {
  if (!LEGACY_RACES[id]) return false
  return !getCustomRaces().some((r) => r.id === id)
}

const CUSTOM_RACES_KEY = 'dnd_custom_races'
let customRacesRemoteCache = null

function generateUniqueRaceId(usedIds) {
  const used = usedIds instanceof Set ? usedIds : new Set()
  let id
  do {
    id = `race_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  } while (used.has(id))
  used.add(id)
  return id
}

function saveCustomRacesLocal(list) {
  try {
    localStorage.setItem(CUSTOM_RACES_KEY, JSON.stringify(list))
  } catch (_) {}
}

function persistCustomRaces(list) {
  if (isSupabaseEnabled()) {
    customRacesRemoteCache = [...list]
    return teamData.saveCustomLibrary('custom_races', customRacesRemoteCache)
  }
  saveCustomRacesLocal(list)
  return Promise.resolve()
}

/** 从 Supabase 加载自定义种族到远程缓存；若 Supabase 无数据则回退到 localStorage */
export async function loadCustomRacesFromSupabase() {
  if (!isSupabaseEnabled()) return
  try {
    const list = await teamData.fetchCustomLibrary('custom_races')
    if (Array.isArray(list) && list.length > 0) {
      customRacesRemoteCache = list
    } else {
      // Supabase 无数据，回退到 localStorage
      try {
        const raw = localStorage.getItem(CUSTOM_RACES_KEY)
        const localList = raw ? JSON.parse(raw) : []
        customRacesRemoteCache = Array.isArray(localList) ? localList : []
      } catch {
        customRacesRemoteCache = []
      }
    }
  } catch {
    customRacesRemoteCache = []
  }
}

/** 获取所有自定义种族（自动 normalize 为新版格式） */
export function getCustomRaces() {
  let list
  if (isSupabaseEnabled()) {
    list = Array.isArray(customRacesRemoteCache) ? [...customRacesRemoteCache] : []
  } else {
    try {
      const raw = localStorage.getItem(CUSTOM_RACES_KEY)
      const listRaw = raw ? JSON.parse(raw) : []
      list = Array.isArray(listRaw) ? listRaw : []
    } catch {
      list = []
    }
  }
  return list.map(normalizeRace)
}

/** 获取完整种族列表（内置 + 自定义，按 id 去重，内置优先） */
export function getAllRaces() {
  const custom = getCustomRaces()
  const builtInIds = new Set(RACES.map(r => r.id))
  // 过滤掉自定义中与内置同 id 的旧数据
  const uniqueCustom = custom.filter(r => !builtInIds.has(r.id))
  return [...RACES, ...uniqueCustom]
}

/** 按 ID 查找种族（自定义 + 旧版兼容回退），返回 normalize 后的数据 */
export function getRaceById(id) {
  const found = getAllRaces().find((r) => r.id === id)
  if (found) return normalizeRace(found)
  if (LEGACY_RACES[id]) return normalizeRace(migrateOldRace(LEGACY_RACES[id]))
  return null
}

/** 按种族 ID + 亚种 ID 查找亚种 */
export function getSubraceById(raceId, subraceId) {
  const race = getRaceById(raceId)
  if (!race) return null
  return race.subraces.find((s) => s.id === subraceId) || null
}

/** 新增自定义种族（支持新版完整格式） */
export function addCustomRace(race) {
  const list = getCustomRaces()
  const usedIds = new Set(list.map((x) => x?.id).filter(Boolean))
  const id = race?.id || generateUniqueRaceId(usedIds)
  const newRace = normalizeRace({
    ...DEFAULT_RACE,
    ...race,
    id,
    name: race?.name?.trim() || '新种族',
  })
  list.push(newRace)
  if (race?.id) {
    persistCustomRaces(list)
    return newRace
  }
  const p = persistCustomRaces(list)
  if (p && typeof p.then === 'function') return p.then(() => newRace)
  return newRace
}

/** 更新自定义种族 */
export function updateCustomRace(id, patch) {
  const list = getCustomRaces()
  const idx = list.findIndex((x) => x.id === id)
  if (idx === -1) return null
  list[idx] = { ...list[idx], ...patch }
  const pr = persistCustomRaces(list)
  if (pr && typeof pr.then === 'function') return pr.then(() => list[idx])
  return list[idx]
}

/** 删除自定义种族 */
export function removeCustomRace(id) {
  const list = getCustomRaces().filter((x) => x.id !== id)
  const pr = persistCustomRaces(list)
  if (pr && typeof pr.then === 'function') return pr.then(() => true)
  return Promise.resolve(true)
}
