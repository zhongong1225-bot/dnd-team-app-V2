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

/** 内置种族列表（已清空，全部由用户手动创建） */
export const RACES = []

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
