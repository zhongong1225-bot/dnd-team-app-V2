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
    description: '在整个多元宇宙中，人类因其数量庞大而各具特色。\n\n人类是多元宇宙中最年轻的主要种族之一。虽然他们建立的城市和帝国绵延千古，但人类个体的寿命却远短于精灵、龙裔等其他种族。人类在多元宇宙中分布最广，几乎在所有文明中都占据主导地位。\n\n人类的文化和外貌千差万别。他们的服饰、建筑、法律和风俗各不相同，反映出极强的适应力和多样性。人类的体型差异也很大，从矮小粗壮到高大瘦长，肤色从深棕到苍白，头发和眼睛的颜色更是五花八门。许多人类男性会留各种风格的胡须。\n\n人类的服饰风格从简朴的农装到华丽的宫廷礼服应有尽有，但他们普遍喜欢在衣着上点缀能展示个人成就或家族纹章的饰品。',
    source: '',
    creatureType: 'humanoid',
    sizeOptions: ['Medium', 'Small'],
    sizeDefault: 'Medium',
    speed: { walk: 30, climb: null, swim: null, fly: null, burrow: null },
    darkvision: null,
    abilityScoreBonuses: [],
    traits: [
      {
        id: 'human_adaptability',
        name: '适应力',
        description: '你获得两项技能熟练。此外，你获得以下一项实用技能：额外生命骰（+1 生命骰）、一项你选择语言的熟练、或两项工具熟练。',
        cards: [],
      },
      {
        id: 'human_skills',
        name: '技能熟练',
        description: '你的技能熟练加值获得 +2 加值。',
        cards: [],
      },
      {
        id: 'human_versatility',
        description: '你获得以下两项加值，每项可选不同类别：技能熟练加值 +1、工具熟练加值 +1、豁免熟练加值 +1、或武器与徒手攻击伤害 +1。',
        name: '多才多艺',
        cards: [],
      },
    ],
    tables: [],
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

/** 获取完整种族列表（内置 + 自定义） */
export function getAllRaces() {
  return [...RACES, ...getCustomRaces()]
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
