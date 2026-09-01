/**
 * 生物库系统 - 用于变身效果（Wild Shape、Polymorph 等）
 * 
 * 生物数据结构说明：
 * - id: 唯一标识符
 * - name: 生物名称
 * - size: 体型 (Tiny/Small/Medium/Large/Huge/Gargantuan)
 * - type: 生物类型 (beast/dragon/humanoid 等)
 * - cr: 挑战等级
 * - abilities: 六维属性 { str, dex, con, int, wis, cha }
 * - hp: 生命值（可以是数字或公式如 "2d8+4"）
 * - hitDice: 生命骰字符串（如 "2d8"）
 * - ac: 基础AC（不含敏捷调整值的部分）
 * - speed: 速度对象 { walk, fly, swim, climb }
 * - resistances: 抗性数组
 * - immunities: 免疫数组
 * - vulnerabilities: 易伤数组
 * - conditionImmunities: 状态免疫数组
 * - naturalWeapons: 天生武器数组 [{ name, attackBonus, damage }]
 * - traits: 特性描述数组
 * - actions: 动作描述数组
 * - reactions: 反应动作数组 [{ name, description }]
 * - legendaryActions: 传奇动作数组 [{ name, description, cost }]
 * - legendaryActionPoints: 传奇动作点数
 * - spellcastingAbility: 施法属性 ('int' | 'wis' | 'cha' | null)
 * - spellSaveDC: 法术豁免 DC
 * - spellAttackBonus: 法术攻击加值
 * - spells: 法术列表 [{ name, castMode, timesPerDay, slotLevel, description }]
 * 
 * 存储：Supabase custom_library (lib_key='creature_library') + localStorage 回退
 */

import { isSupabaseEnabled } from '../lib/supabase'
import * as teamData from '../lib/teamDataSupabase'

const CREATURE_LIB_KEY = 'creature_library'
let creatureRemoteCache = null

export const CREATURE_SIZES = [
  { value: 'tiny', label: '超小型' },
  { value: 'small', label: '小型' },
  { value: 'medium', label: '中型' },
  { value: 'large', label: '大型' },
  { value: 'huge', label: '超大型' },
  { value: 'gargantuan', label: '巨型' },
]

export const DEFAULT_CREATURE = {
  id: '',
  name: '',
  size: 'medium',
  type: 'beast',
  cr: 0,
  abilities: {
    str: 10,
    dex: 10,
    con: 10,
    int: 10,
    wis: 10,
    cha: 10,
  },
  hp: 10,
  hitDice: '1d8',
  ac: 10,
  speed: {
    walk: 30,
    fly: null,
    swim: null,
    climb: null,
  },
  resistances: [],
  immunities: [],
  vulnerabilities: [],
  conditionImmunities: [],
  naturalWeapons: [],
  traits: [],
  actions: [],
  reactions: [],  // [{ name, description }]
  legendaryActions: [],  // [{ name, description, cost }]
  legendaryActionPoints: 0,

  // 法术相关
  spellcastingAbility: null,  // 'int' | 'wis' | 'cha' | null
  spellSaveDC: 0,
  spellAttackBonus: 0,
  spells: [],  // [{ name, castMode: 'at-will' | 'per-day' | 'slot', timesPerDay, slotLevel, description }]
}

/** 从 Supabase 加载生物库（异步）；远程为空时自动从 localStorage 迁移 */
export async function loadCreatureLibraryFromSupabase() {
  if (!isSupabaseEnabled()) return
  try {
    const list = await teamData.fetchCustomLibrary(CREATURE_LIB_KEY)
    if (Array.isArray(list) && list.length > 0) {
      creatureRemoteCache = list
    } else {
      // 远程为空，尝试从 localStorage 一次性迁移
      let local = []
      try {
        const stored = localStorage.getItem('dnd_creature_library')
        if (stored) {
          const parsed = JSON.parse(stored)
          if (Array.isArray(parsed) && parsed.length > 0) local = parsed
        }
      } catch { /* ignore */ }
      if (local.length > 0) {
        await teamData.saveCustomLibrary(CREATURE_LIB_KEY, local)
        creatureRemoteCache = [...local]
      } else {
        creatureRemoteCache = []
      }
    }
  } catch {
    creatureRemoteCache = []
  }
}

/** 读取生物库（同步：Supabase 用缓存，否则 localStorage） */
export function loadCreatureLibrary() {
  if (isSupabaseEnabled()) {
    return Array.isArray(creatureRemoteCache) ? [...creatureRemoteCache] : []
  }
  try {
    const stored = localStorage.getItem('dnd_creature_library')
    if (!stored) return []
    const parsed = JSON.parse(stored)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

/** 保存生物库 */
function persistCreatureLibrary(creatures) {
  if (isSupabaseEnabled()) {
    creatureRemoteCache = [...creatures]
    return teamData.saveCustomLibrary(CREATURE_LIB_KEY, creatureRemoteCache)
  }
  try {
    localStorage.setItem('dnd_creature_library', JSON.stringify(creatures))
    return Promise.resolve()
  } catch {
    return Promise.resolve()
  }
}

/** 添加新生物 */
export function addCreature(creature) {
  const library = loadCreatureLibrary()
  const newCreature = {
    ...DEFAULT_CREATURE,
    ...creature,
    id: creature.id || `creature_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  }
  library.push(newCreature)
  const p = persistCreatureLibrary(library)
  if (p && typeof p.then === 'function') return p.then(() => newCreature)
  return newCreature
}

/** 更新生物 */
export function updateCreature(id, updates) {
  const library = loadCreatureLibrary()
  const index = library.findIndex(c => c.id === id)
  if (index === -1) return null
  library[index] = { ...library[index], ...updates }
  const p = persistCreatureLibrary(library)
  if (p && typeof p.then === 'function') return p.then(() => library[index])
  return library[index]
}

/** 删除生物 */
export function deleteCreature(id) {
  const library = loadCreatureLibrary()
  const filtered = library.filter(c => c.id !== id)
  if (filtered.length === library.length) return false
  const p = persistCreatureLibrary(filtered)
  if (p && typeof p.then === 'function') return p.then(() => true)
  return true
}

/** 根据 ID 获取生物 */
export function getCreatureById(id) {
  const library = loadCreatureLibrary()
  return library.find(c => c.id === id) || null
}

/** 列出所有生物（可按类型/CR 筛选） */
export function listCreatures(filters = {}) {
  let library = loadCreatureLibrary()
  
  if (filters.type) {
    library = library.filter(c => c.type === filters.type)
  }
  if (filters.minCr != null) {
    library = library.filter(c => c.cr >= filters.minCr)
  }
  if (filters.maxCr != null) {
    library = library.filter(c => c.cr <= filters.maxCr)
  }
  if (filters.size) {
    library = library.filter(c => c.size === filters.size)
  }
  if (filters.keyword) {
    const kw = filters.keyword.toLowerCase()
    library = library.filter(c =>
      c.name.toLowerCase().includes(kw) ||
      (c.traits && c.traits.some(t => {
        const text = typeof t === 'string' ? t : (t.name || '') + ' ' + (t.description || '')
        return text.toLowerCase().includes(kw)
      }))
    )
  }
  
  return library
}

/** 解析 HP 公式为数值（简化版，仅支持 NdX+Y 格式） */
export function parseHpFormula(hp) {
  if (typeof hp === 'number') return hp
  if (!hp || typeof hp !== 'string') return 10
  
  // 匹配 NdX+Y 或 NdX-Y 格式
  const match = hp.match(/^(\d+)d(\d+)([+-]\d+)?$/i)
  if (!match) return parseInt(hp, 10) || 10
  
  const diceCount = parseInt(match[1], 10)
  const diceSides = parseInt(match[2], 10)
  const modifier = match[3] ? parseInt(match[3], 10) : 0
  
  // 返回平均值（向上取整）
  const averagePerDie = Math.ceil(diceSides / 2)
  return diceCount * averagePerDie + modifier
}

/** 通用 HP 解析：兼容 数字 / 公式字符串 / { formula | max } 对象 三种格式 */
export function parseCreatureHp(hp) {
  if (typeof hp === 'number') return hp
  if (typeof hp === 'string') {
    return parseHpFormula(hp)
  }
  if (hp && typeof hp === 'object') {
    if (hp.formula) return parseHpFormula(hp.formula)
    if (hp.max) return hp.max
  }
  return 10
}

/** 将生物数据转换为角色卡可应用的格式 */
export function transformCreatureToCharacterData(creature, options = {}) {
  const {
    acMode = 'replace',  // 'replace' | 'add'
    hpMode = 'replace',  // 'replace' | 'add'
  } = options
  
  const result = {
    // 六维属性完全替换
    abilities: { ...creature.abilities },
    
    // AC 处理
    ac: acMode === 'replace' 
      ? creature.ac 
      : undefined,  // add 模式由计算器叠加
    
    // HP 处理
    hp: hpMode === 'replace'
      ? parseHpFormula(creature.hp)
      : undefined,  // add 模式由计算器叠加
    
    // 生命骰替换
    hitDice: creature.hitDice,
    
    // 速度替换
    speed: { ...creature.speed },
    
    // 抗性/免疫/易伤
    resistances: creature.resistances || [],
    immunities: creature.immunities || [],
    vulnerabilities: creature.vulnerabilities || [],
    conditionImmunities: creature.conditionImmunities || [],
    
    // 天生武器
    naturalWeapons: creature.naturalWeapons || [],
    
    // 元数据
    creatureId: creature.id,
    creatureName: creature.name,
    creatureType: creature.type,
    creatureSize: creature.size,
  }
  
  return result
}

/** 生成唯一 ID */
function uid() {
  return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6)
}

/** 规范化特质：兼容旧版 string[] 和新版 object[] */
export function normalizeTraits(traits) {
  if (!Array.isArray(traits)) return []
  return traits.map(t => {
    if (typeof t === 'string') return { id: uid(), name: t, description: '', effects: [] }
    if (t && typeof t === 'object') return { id: t.id || uid(), name: t.name || '', description: t.description || '', effects: Array.isArray(t.effects) ? t.effects : [] }
    return null
  }).filter(Boolean)
}

/** 规范化动作：兼容旧版 string[] 和新版 object[] */
export function normalizeActions(actions) {
  if (!Array.isArray(actions)) return []
  return actions.map(a => {
    if (typeof a === 'string') return { id: uid(), name: a, description: '' }
    if (a && typeof a === 'object') return { id: a.id || uid(), name: a.name || '', description: a.description || '' }
    return null
  }).filter(Boolean)
}

/** 创建一个空特质 */
export function createEmptyTrait(name = '') {
  return { id: uid(), name, description: '', effects: [] }
}

/** 创建一个空动作 */
export function createEmptyAction(name = '') {
  return { id: uid(), name, description: '' }
}
