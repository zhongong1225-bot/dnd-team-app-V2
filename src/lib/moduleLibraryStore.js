/**
 * 模组级统一库：每个模组保存一套 BUFF 模板与物品模板，供同一模组下多角色快速复用。
 * localStorage 键：dnd_module_library_v1_<moduleId>
 * Supabase 键：custom_library.lib_key = 'module_library_<moduleId>'
 */
import { isSupabaseEnabled } from './supabase'
import * as teamData from './teamDataSupabase'
import { getAllCharacters } from './characterStore'
import { getMergedBuffsForCalculator } from './effects/effectMapping'
import { normalizeBuffSourceKindKey } from './buffSourceKind'
import { getItemById, getItemDisplayName } from '../data/itemDatabase'

const LS_KEY_PREFIX = 'dnd_module_library_v1_'

/** @type {Record<string, { buffTemplates: any[], itemTemplates: any[] }>} */
const cache = {}

function getKey(moduleId) {
  return `${LS_KEY_PREFIX}${moduleId ?? 'default'}`
}

function getEmptyLibrary() {
  return { buffTemplates: [], itemTemplates: [] }
}

function readLocal(moduleId) {
  try {
    const raw = localStorage.getItem(getKey(moduleId))
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        buffTemplates: Array.isArray(parsed.buffTemplates) ? parsed.buffTemplates : [],
        itemTemplates: Array.isArray(parsed.itemTemplates) ? parsed.itemTemplates : [],
      }
    }
  } catch (_) {}
  return getEmptyLibrary()
}

function writeLocal(moduleId, library) {
  try {
    localStorage.setItem(getKey(moduleId), JSON.stringify(library))
  } catch (_) {}
}

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function getModuleLibrary(moduleId) {
  const mod = moduleId ?? 'default'
  if (!cache[mod]) {
    cache[mod] = readLocal(mod)
  }
  return {
    buffTemplates: cache[mod].buffTemplates.map((x) => ({ ...x })),
    itemTemplates: cache[mod].itemTemplates.map((x) => ({ ...x })),
  }
}

export async function loadModuleLibraryFromSupabase(moduleId) {
  const mod = moduleId ?? 'default'
  if (!isSupabaseEnabled()) return getModuleLibrary(mod)
  try {
    const data = await teamData.fetchModuleLibrary(mod)
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      const library = {
        buffTemplates: Array.isArray(data.buffTemplates) ? data.buffTemplates : [],
        itemTemplates: Array.isArray(data.itemTemplates) ? data.itemTemplates : [],
      }
      cache[mod] = library
      writeLocal(mod, library)
      return getModuleLibrary(mod)
    }
  } catch (e) {
    console.warn('[moduleLibrary] 云端加载失败', e)
  }
  return getModuleLibrary(mod)
}

export async function persistModuleLibrary(moduleId, library) {
  const mod = moduleId ?? 'default'
  const normalized = {
    buffTemplates: Array.isArray(library.buffTemplates) ? library.buffTemplates : [],
    itemTemplates: Array.isArray(library.itemTemplates) ? library.itemTemplates : [],
  }
  cache[mod] = normalized
  writeLocal(mod, normalized)
  if (isSupabaseEnabled()) {
    try {
      await teamData.saveModuleLibrary(mod, normalized)
    } catch (e) {
      console.warn('[moduleLibrary] 云端保存失败', e)
    }
  }
  window.dispatchEvent(new CustomEvent('dnd-realtime-module-library'))
}

export async function addBuffTemplate(moduleId, template) {
  const library = getModuleLibrary(moduleId)
  const item = {
    ...template,
    id: template?.id || generateId('bufftpl'),
    source: String(template?.source ?? '').trim() || '未命名 Buff',
    effects: Array.isArray(template?.effects) ? template.effects : [],
    enabled: template?.enabled !== false,
  }
  library.buffTemplates.push(item)
  await persistModuleLibrary(moduleId, library)
  return item
}

export async function updateBuffTemplate(moduleId, id, patch) {
  const library = getModuleLibrary(moduleId)
  const idx = library.buffTemplates.findIndex((x) => x.id === id)
  if (idx === -1) return null
  library.buffTemplates[idx] = { ...library.buffTemplates[idx], ...patch, id }
  await persistModuleLibrary(moduleId, library)
  return library.buffTemplates[idx]
}

export async function removeBuffTemplate(moduleId, id) {
  const library = getModuleLibrary(moduleId)
  const next = library.buffTemplates.filter((x) => x.id !== id)
  if (next.length === library.buffTemplates.length) return false
  library.buffTemplates = next
  await persistModuleLibrary(moduleId, library)
  return true
}

export async function addItemTemplate(moduleId, template) {
  const library = getModuleLibrary(moduleId)
  const item = {
    ...template,
    id: template?.id || generateId('itemtpl'),
    itemId: String(template?.itemId ?? '').trim(),
    name: String(template?.name ?? '').trim() || undefined,
    qty: Number(template?.qty) || 1,
    isAttuned: !!template?.isAttuned,
    rarity: template?.rarity ?? '',
    effects: Array.isArray(template?.effects) ? template.effects.map((e) => ({ ...e })) : [],
  }
  library.itemTemplates.push(item)
  await persistModuleLibrary(moduleId, library)
  return item
}

export async function updateItemTemplate(moduleId, id, patch) {
  const library = getModuleLibrary(moduleId)
  const idx = library.itemTemplates.findIndex((x) => x.id === id)
  if (idx === -1) return null
  library.itemTemplates[idx] = {
    ...library.itemTemplates[idx],
    ...patch,
    id,
    itemId: patch?.itemId !== undefined ? String(patch.itemId).trim() : library.itemTemplates[idx].itemId,
    qty: patch?.qty !== undefined ? Number(patch.qty) || 1 : library.itemTemplates[idx].qty,
    isAttuned: patch?.isAttuned !== undefined ? !!patch.isAttuned : library.itemTemplates[idx].isAttuned,
    rarity: patch?.rarity !== undefined ? patch.rarity : library.itemTemplates[idx].rarity,
    effects: patch?.effects !== undefined
      ? (Array.isArray(patch.effects) ? patch.effects.map((e) => ({ ...e })) : [])
      : library.itemTemplates[idx].effects ?? [],
  }
  await persistModuleLibrary(moduleId, library)
  return library.itemTemplates[idx]
}

export async function removeItemTemplate(moduleId, id) {
  const library = getModuleLibrary(moduleId)
  const next = library.itemTemplates.filter((x) => x.id !== id)
  if (next.length === library.itemTemplates.length) return false
  library.itemTemplates = next
  await persistModuleLibrary(moduleId, library)
  return true
}

function getBuffSourceKindForSync(buff) {
  if (buff.fromFeat) return 'feat'
  if (buff.fromInvocation || buff.fromFightingStyle) return 'class_race'
  if (buff.fromItem) return 'equipment'
  return normalizeBuffSourceKindKey(buff.sourceKind)
}

function normalizeBuffTemplateForLibrary(buff) {
  return {
    source: String(buff.source ?? '').trim() || '未命名 Buff',
    duration: buff.duration != null && String(buff.duration).trim() !== '' ? String(buff.duration).trim() : undefined,
    effects: Array.isArray(buff.effects) ? buff.effects.map((e) => ({ ...e })) : [],
    enabled: buff.enabled !== false,
    sourceKind: getBuffSourceKindForSync(buff),
  }
}

/** 不进入 BUFF 库的来源：装备跟随物品，冒险随机性大 */
const EXCLUDED_BUFF_LIBRARY_KINDS = new Set(['equipment', 'adventure'])

/**
 * 从当前模组所有角色卡中自动汇总 BUFF 模板，按来源名称去重（已有库模板优先保留）。
 * 装备与冒险类 BUFF 不进入库。
 * @param {string} moduleId
 */
export async function syncBuffTemplatesFromCharacters(moduleId) {
  const mod = moduleId ?? 'default'
  const library = getModuleLibrary(mod)
  const existing = Array.isArray(library.buffTemplates) ? library.buffTemplates : []
  const seen = new Set()
  const next = []

  // 保留已有库模板，但清理掉装备/冒险类
  for (const t of existing) {
    if (!t || typeof t !== 'object') continue
    if (EXCLUDED_BUFF_LIBRARY_KINDS.has(t.sourceKind)) continue
    const key = String(t.source ?? '').trim()
    if (!key) continue
    seen.add(key)
    next.push({ ...t })
  }

  const chars = getAllCharacters(mod)
  if (!Array.isArray(chars)) return next

  for (const char of chars) {
    if (!char || typeof char !== 'object') continue

    const stash = Array.isArray(char.buffStash) ? char.buffStash : []
    for (const b of stash) {
      if (!b || typeof b !== 'object') continue
      const normalized = normalizeBuffTemplateForLibrary({ ...b, sourceKind: 'temporary' })
      if (EXCLUDED_BUFF_LIBRARY_KINDS.has(normalized.sourceKind)) continue
      const key = normalized.source.trim()
      if (!key || seen.has(key)) continue
      seen.add(key)
      next.push({ ...normalized, id: generateId('bufftpl') })
    }

    const merged = getMergedBuffsForCalculator(char, mod)
    for (const b of merged) {
      if (!b || typeof b !== 'object') continue
      const normalized = normalizeBuffTemplateForLibrary(b)
      if (EXCLUDED_BUFF_LIBRARY_KINDS.has(normalized.sourceKind)) continue
      const key = normalized.source.trim()
      if (!key || seen.has(key)) continue
      seen.add(key)
      next.push({ ...normalized, id: generateId('bufftpl') })
    }
  }

  library.buffTemplates = next
  await persistModuleLibrary(mod, library)
  return next
}

/**
 * 从当前模组所有角色卡中自动汇总物品模板，按 itemId 去重（同名/同物保留第一次）。
 * 货币（walletCurrencyId）与无 itemId 的条目会被过滤。
 * 手动维护的模板优先保留；自动模板会标 source='character'。
 * @param {string} moduleId
 */
export async function syncItemTemplatesFromCharacters(moduleId) {
  const mod = moduleId ?? 'default'
  const library = getModuleLibrary(mod)
  const existing = Array.isArray(library.itemTemplates) ? library.itemTemplates : []

  // 保留手动模板；以 itemId 为键避免与自动模板重复
  const manualTemplates = existing.filter((t) => t.source !== 'character')
  const manualItemIds = new Set(manualTemplates.map((t) => String(t.itemId ?? '')).filter(Boolean))

  const chars = getAllCharacters(mod)
  if (!Array.isArray(chars)) return existing

  const seen = new Set()
  const autoTemplates = []

  for (const char of chars) {
    if (!char || typeof char !== 'object') continue
    const inv = Array.isArray(char.inventory) ? char.inventory : []
    for (const entry of inv) {
      if (!entry || typeof entry !== 'object') continue
      const itemId = String(entry.itemId ?? '').trim()
      if (!itemId || entry.walletCurrencyId) continue
      if (manualItemIds.has(itemId)) continue
      if (seen.has(itemId)) continue
      const proto = getItemById(itemId)
      if (!proto) continue
      seen.add(itemId)
      autoTemplates.push({
        id: generateId('itemtpl'),
        itemId,
        name: entry.name?.trim() || undefined,
        qty: Math.max(1, Number(entry.qty) || 1),
        rarity: entry.rarity ?? '',
        isAttuned: !!entry.isAttuned,
        source: 'character',
        characterIds: [char.id],
      })
    }
  }

  library.itemTemplates = [...manualTemplates, ...autoTemplates]
  await persistModuleLibrary(mod, library)
  return library.itemTemplates
}
