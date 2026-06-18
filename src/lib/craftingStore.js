/**
 * 魔法物品制作：Supabase 存 crafting_projects；否则 localStorage
 */
import { isSupabaseEnabled } from './supabase'
import * as td from './teamDataSupabase'

const CRAFTING_KEY_PREFIX = 'dnd_magic_crafting_'
const craftingCache = {}

function craftingKey(moduleId) {
  return CRAFTING_KEY_PREFIX + (moduleId || 'default')
}

export async function loadCraftingIntoCache(moduleId) {
  if (!isSupabaseEnabled()) return
  const mod = moduleId ?? 'default'
  try {
    craftingCache[mod] = await td.fetchCraftingRow(mod)
  } catch {
    craftingCache[mod] = []
  }
}

function getRawLocal(moduleId) {
  try {
    const raw = localStorage.getItem(craftingKey(moduleId))
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function saveLocal(moduleId, list) {
  try {
    localStorage.setItem(craftingKey(moduleId), JSON.stringify(list))
  } catch (_) {}
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('dnd-archive-trigger', { detail: { moduleId: moduleId ?? 'default' } }))
  }, 0)
}

export const MAGIC_ITEM_TYPES = [
  { id: 'weapon_armor', label: '武器&盔甲', formula: 'manual' },
  { id: 'wand', label: '魔杖', formula: 'wand', maxSl: 4 },
  { id: 'staff', label: '法杖', formula: 'staff' },
  { id: 'rod', label: '权杖', formula: 'manual' },
  { id: 'wondrous', label: '奇物', formula: 'manual' },
  { id: 'ring', label: '戒指', formula: 'manual' },
  { id: 'scroll', label: '卷轴', formula: 'scroll' },
  { id: 'potion', label: '药水', formula: 'potion', maxSl: 4 },
]

export function getCraftingProjects(moduleId) {
  const mod = moduleId ?? 'default'
  if (isSupabaseEnabled()) {
    return Array.isArray(craftingCache[mod]) ? [...craftingCache[mod]] : []
  }
  return getRawLocal(moduleId)
}

export function addCraftingProject(moduleId, project) {
  const list = getCraftingProjects(moduleId)
  const id = 'craft_' + Date.now()
  const days = Math.max(0, Number(project.制作天数) || 0)
  const entry = {
    id,
    类型: project.类型 ?? MAGIC_ITEM_TYPES[0].id,
    物品名称: project.物品名称?.trim() ?? '',
    详细介绍: project.详细介绍?.trim() ?? '',
    制作天数: days,
    已制作天数: 0,
    消耗金额: project.消耗金额?.trim() ?? '',
    材料费用: project.材料费用?.trim() ?? '',
    消耗经验: Math.max(0, Number(project.消耗经验) || 0),
    制作需求人: project.制作需求人?.trim() ?? '',
    /** 委托/需求方角色（用于非 DM 可见性过滤） */
    委托角色: project.委托角色?.trim() ?? '',
    状态: 'IN_PROGRESS',
    ...(project.所含法术环级 != null ? { 所含法术环级: Number(project.所含法术环级) || 0 } : {}),
    ...(project.充能次数 != null ? { 充能次数: Number(project.充能次数) || 50 } : {}),
    ...(project.单次材料费 != null ? { 单次材料费: Number(project.单次材料费) || 0 } : {}),
    ...(project.法术数量 != null ? { 法术数量: Number(project.法术数量) || 1 } : {}),
    ...(project.数量 != null ? { 数量: Math.max(1, Number(project.数量) || 1) } : {}),
    ...(project.内含法术 != null && typeof project.内含法术 === 'object'
      ? { 内含法术: { ...project.内含法术 } }
      : {}),
    ...(Array.isArray(project.内含法术列表)
      ? { 内含法术列表: project.内含法术列表.map((x) => (x && typeof x === 'object' ? { ...x } : x)) }
      : {}),
  }
  list.push(entry)
  const mod = moduleId ?? 'default'
  if (isSupabaseEnabled()) {
    craftingCache[mod] = list
    return td.saveCraftingRow(mod, list).then(() => {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('dnd-archive-trigger', { detail: { moduleId: mod } }))
      }, 0)
      return list
    })
  }
  saveLocal(moduleId, list)
  return Promise.resolve(list)
}

export function updateCraftingProject(moduleId, index, updates) {
  const list = getCraftingProjects(moduleId)
  if (index < 0 || index >= list.length) return Promise.resolve(list)
  const next = [...list]
  const cur = next[index]
  const patch = { ...updates }
  if (patch.制作天数 != null) patch.制作天数 = Math.max(0, Number(patch.制作天数) || 0)
  if (patch.消耗经验 != null) patch.消耗经验 = Math.max(0, Number(patch.消耗经验) || 0)
  next[index] = { ...cur, ...patch }
  const mod = moduleId ?? 'default'
  if (isSupabaseEnabled()) {
    craftingCache[mod] = next
    return td.saveCraftingRow(mod, next).then(() => {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('dnd-archive-trigger', { detail: { moduleId: mod } }))
      }, 0)
      return next
    })
  }
  saveLocal(moduleId, next)
  return Promise.resolve(next)
}

export function removeCraftingProject(moduleId, index) {
  const list = getCraftingProjects(moduleId)
  if (index < 0 || index >= list.length) return Promise.resolve(list)
  const next = list.filter((_, i) => i !== index)
  const mod = moduleId ?? 'default'
  if (isSupabaseEnabled()) {
    craftingCache[mod] = next
    return td.saveCraftingRow(mod, next).then(() => {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('dnd-archive-trigger', { detail: { moduleId: mod } }))
      }, 0)
      return next
    })
  }
  saveLocal(moduleId, next)
  return Promise.resolve(next)
}

export function reorderCraftingProjects(moduleId, fromIndex, toIndex) {
  const list = getCraftingProjects(moduleId)
  if (fromIndex < 0 || fromIndex >= list.length || toIndex < 0 || toIndex >= list.length) {
    return Promise.resolve(list)
  }
  const next = [...list]
  const [removed] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, removed)
  const mod = moduleId ?? 'default'
  if (isSupabaseEnabled()) {
    craftingCache[mod] = next
    return td.saveCraftingRow(mod, next).then(() => {
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('dnd-archive-trigger', { detail: { moduleId: mod } }))
      }, 0)
      return next
    })
  }
  saveLocal(moduleId, next)
  return Promise.resolve(next)
}
