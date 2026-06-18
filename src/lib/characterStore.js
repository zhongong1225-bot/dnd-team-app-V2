import { isSupabaseEnabled } from './supabase'
import * as charSupabase from './characterStoreSupabase'
import { getDefaultCharIdFromPrefs, setDefaultCharInPrefs } from './moduleStore'
import { CURRENCY_CONFIG, getCurrencyById, getCurrencyDisplayName } from '../data/currencyConfig'

const STORAGE_KEY = 'starlight_characters'

function normalizeWalletAmount(currencyId, value) {
  const n = Math.max(0, Number(value) || 0)
  if (currencyId === 'gem_lb') return n
  return Math.floor(n)
}

/**
 * 钱包数字 -> 背包货币堆（walletCurrencyId，且不在次元袋）。
 * 目标：货币始终可作为有重量的实体条目参与拖拽/负重。
 */
function syncWalletCurrencyEntries(wallet, inventory) {
  const inv = Array.isArray(inventory) ? inventory : []
  const nextWallet = wallet && typeof wallet === 'object' ? wallet : {}
  const kept = inv.filter((e) => !(e?.walletCurrencyId && !e?.inBagOfHolding))
  const out = [...kept]

  for (const cfg of CURRENCY_CONFIG) {
    const cid = cfg.id
    const qty = normalizeWalletAmount(cid, nextWallet[cid])
    if (qty <= 0) continue
    const existing = inv.find((e) => e?.walletCurrencyId === cid && !e?.inBagOfHolding)
    const label = getCurrencyDisplayName(getCurrencyById(cid)) || cfg.name || cid
    out.push({
      id: existing?.id || `inv_${crypto.randomUUID()}`,
      name: label,
      walletCurrencyId: cid,
      qty,
      inBagOfHolding: false,
      bagModuleId: undefined,
      bagSlotId: undefined,
    })
  }
  return out
}

function normalizeCharacterCurrencyInventory(character) {
  if (!character || typeof character !== 'object') return character
  const wallet = character.wallet ?? {}
  const inventory = character.inventory ?? []
  return {
    ...character,
    inventory: syncWalletCurrencyEntries(wallet, inventory),
  }
}

/** Supabase 启用时的内存缓存（按当前加载的 owner/module 过滤后列表） */
let charactersCache = []

/** 常用角色 ID 的 localStorage 键（按用户名 + 模组） */
function defaultCharKey(ownerName, moduleId) {
  const mod = moduleId ?? 'default'
  return `starlight_default_character_${ownerName || ''}_${mod}`
}

/** 属性调整值 */
export function abilityModifier(value) {
  return Math.floor(((Number(value) || 10) - 10) / 2)
}

/** D&D 5e 熟练加值：按等级 1–20 查表 */
const PROFICIENCY_BY_LEVEL = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6]
export function proficiencyBonus(level) {
  const L = Math.max(1, Math.min(20, Math.floor(Number(level) || 1)))
  return PROFICIENCY_BY_LEVEL[L - 1] ?? 2
}

const defaultAbilities = () => ({ str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 })

/** 从 Supabase 拉取角色并写入缓存（启用 Supabase 时由页面在 useEffect 中调用） */
export async function loadCharactersIntoCache(ownerName, isAdmin, moduleId) {
  if (!isSupabaseEnabled()) return
  const list = await charSupabase.fetchCharacters(ownerName, isAdmin, moduleId)
  charactersCache = list
}

/** 拉取当前用户可见的全部角色（跨模组），写入缓存 — 登录后 / Realtime 用 */
export async function loadAllCharactersIntoCache(ownerName, isAdmin) {
  if (!isSupabaseEnabled()) return
  const list = await charSupabase.fetchAllCharacters(ownerName, isAdmin)
  charactersCache = list
}

/** 按 id 拉取单条角色并写入缓存（用于直接打开角色页时） */
export async function loadCharacterById(id) {
  if (!isSupabaseEnabled() || !id) return null
  const character = await charSupabase.fetchCharacterById(id)
  if (character) {
    const idx = charactersCache.findIndex((c) => c.id === id)
    if (idx >= 0) charactersCache[idx] = character
    else charactersCache.push(character)
  }
  return character
}

/** 拉取指定模组内全部角色并合并进缓存（非 DM 可见模组内所有角色） */
export async function loadCharactersInModule(moduleId) {
  if (!isSupabaseEnabled()) return
  const list = await charSupabase.fetchCharactersInModule(moduleId)
  const mod = moduleId ?? 'default'
  const rest = charactersCache.filter((c) => (c.moduleId ?? 'default') !== mod)
  charactersCache = [...rest, ...list]
}

/** 返回指定模组内全部角色（先需 loadCharactersInModule 或 loadAllCharactersIntoCache） */
export function getCharactersInModule(moduleId) {
  const mod = moduleId ?? 'default'
  if (isSupabaseEnabled()) {
    return charactersCache.filter((c) => (c.moduleId ?? 'default') === mod)
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    return list.filter((c) => (c.moduleId ?? 'default') === mod)
  } catch {
    return []
  }
}

/** 指定模组内的主卡（无 parentId，用于附属卡的下拉选择） */
export function getMainCharactersInModule(moduleId) {
  return getCharactersInModule(moduleId).filter((c) => !c.parentId)
}

/** @param {string} [moduleId] 模组 id，传入则只返回该模组下的角色 */
export function getCharacters(ownerName, isAdmin, moduleId) {
  if (isSupabaseEnabled()) {
    let out = charactersCache
    if (!isAdmin && ownerName) out = out.filter((c) => c.owner === ownerName)
    if (moduleId != null && moduleId !== '') out = out.filter((c) => (c.moduleId ?? 'default') === moduleId)
    return out.map((c) => normalizeCharacterCurrencyInventory(c))
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    let out = isAdmin ? list : list.filter((c) => c.owner === ownerName)
    if (moduleId != null && moduleId !== '') {
      out = out.filter((c) => (c.moduleId ?? 'default') === moduleId)
    }
    return out.map((c) => normalizeCharacterCurrencyInventory(c))
  } catch {
    return []
  }
}

/** 获取所有角色（可按模组过滤） */
export function getAllCharacters(moduleId) {
  if (isSupabaseEnabled()) {
    if (moduleId != null && moduleId !== '') {
      return charactersCache.filter((c) => (c.moduleId ?? 'default') === moduleId).map((c) => normalizeCharacterCurrencyInventory(c))
    }
    return charactersCache.map((c) => normalizeCharacterCurrencyInventory(c))
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    if (moduleId != null && moduleId !== '') {
      return list.filter((c) => (c.moduleId ?? 'default') === moduleId).map((c) => normalizeCharacterCurrencyInventory(c))
    }
    return list.map((c) => normalizeCharacterCurrencyInventory(c))
  } catch {
    return []
  }
}

export function getCharacter(id) {
  if (isSupabaseEnabled()) {
    const c = charactersCache.find((x) => x.id === id) ?? null
    return c ? normalizeCharacterCurrencyInventory(c) : null
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    const list = raw ? JSON.parse(raw) : []
    const c = list.find((x) => x.id === id) ?? null
    return c ? normalizeCharacterCurrencyInventory(c) : null
  } catch {
    return null
  }
}

/** 获取当前用户在指定模组下的常用角色 ID（不传 moduleId 时用 'default'） */
export function getDefaultCharacterId(ownerName, moduleId) {
  if (!ownerName) return null
  if (isSupabaseEnabled()) {
    return getDefaultCharIdFromPrefs(ownerName, moduleId)
  }
  try {
    return localStorage.getItem(defaultCharKey(ownerName, moduleId ?? 'default')) || null
  } catch {
    return null
  }
}

/** 设置或清除常用角色 ID；传 null 表示清除。moduleId 不传时用 'default' */
export function setDefaultCharacterId(ownerName, characterId, moduleId) {
  if (!ownerName) return
  if (isSupabaseEnabled()) {
    setDefaultCharInPrefs(ownerName, moduleId, characterId || null)
    return
  }
  try {
    const key = defaultCharKey(ownerName, moduleId ?? 'default')
    if (characterId) {
      localStorage.setItem(key, characterId)
    } else {
      localStorage.removeItem(key)
    }
  } catch (_) {}
}

/** 获取最后编辑的角色 ID（按 updatedAt 排序，取最新） */
export function getLastEditedCharacterId(ownerName, isAdmin, moduleId) {
  const list = getCharacters(ownerName, isAdmin, moduleId)
  if (list.length === 0) return null
  const sorted = [...list].sort((a, b) => {
    const ta = new Date(a.updatedAt || a.createdAt || 0).getTime()
    const tb = new Date(b.updatedAt || b.createdAt || 0).getTime()
    return tb - ta
  })
  return sorted[0]?.id ?? null
}

function saveCharacters(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

export function addCharacter(ownerName, data = {}) {
  const id = crypto.randomUUID()
  const now = new Date().toISOString()
  const cardType = data.cardType ?? 'main'
  const character = {
    id,
    owner: ownerName,
    moduleId: data.moduleId ?? 'default',
    cardType,
    parentId: data.parentId ?? undefined,
    subordinateTemplate: data.subordinateTemplate ?? undefined,
    name: data.name?.trim() || '未命名',
    'class': data['class']?.trim() || '',
    classLevel: typeof data.classLevel === 'number' ? data.classLevel : 1,
    multiclass: Array.isArray(data.multiclass) ? data.multiclass : [],
    prestige: Array.isArray(data.prestige) ? data.prestige : [],
    level: 1,
    xp: 0,
    hp: { current: 0, max: 0, temp: 0 },
    abilities: data.abilities ?? defaultAbilities(),
    savingThrows: data.savingThrows ?? { str: false, dex: false, con: false, int: false, wis: false, cha: false },
    skills: data.skills ?? {},
    proficiencies: data.proficiencies ?? { weapons: [], tools: [], armors: [], languages: [] },
    avatar: data.avatar ?? null,
    appearance: data.appearance ?? {},
    inventory: data.inventory ?? [],
    /** 次元袋模块：{ id, bagCount, visibility }[]，默认可空 */
    bagOfHoldingModules: Array.isArray(data.bagOfHoldingModules) ? data.bagOfHoldingModules : [],
    bagOfHoldingCount: typeof data.bagOfHoldingCount === 'number' ? data.bagOfHoldingCount : 0,
    wallet: data.wallet ?? {},
    equipment: data.equipment ?? {},
    buffs: data.buffs ?? [],
    notes: data.notes ?? '',
    createdAt: now,
    updatedAt: now,
  }
  character.inventory = syncWalletCurrencyEntries(character.wallet, character.inventory)
  if (isSupabaseEnabled()) {
    return charSupabase.insertCharacter(character).then((inserted) => {
      charactersCache.push(inserted)
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('dnd-archive-trigger', { detail: { moduleId: inserted?.moduleId ?? character.moduleId } }))
      }, 0)
      return inserted
    })
  }
  const raw = localStorage.getItem(STORAGE_KEY)
  const list = raw ? JSON.parse(raw) : []
  list.push(character)
  saveCharacters(list)
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('dnd-archive-trigger', { detail: { moduleId: character.moduleId } }))
  }, 0)
  return character
}

export function updateCharacter(id, patch) {
  const buildNormalizedPatch = (base, p) => {
    const nextPatch = { ...p }
    if ('wallet' in p || 'inventory' in p) {
      const wallet = p.wallet ?? base?.wallet ?? {}
      const inventory = p.inventory ?? base?.inventory ?? []
      nextPatch.inventory = syncWalletCurrencyEntries(wallet, inventory)
    }
    return nextPatch
  }

  if (isSupabaseEnabled()) {
    const base = charactersCache.find((c) => c.id === id) ?? null
    const normalizedPatch = buildNormalizedPatch(base, patch)
    return charSupabase.updateCharacterRow(id, normalizedPatch).then((updated) => {
      if (updated) {
        const idx = charactersCache.findIndex((c) => c.id === id)
        if (idx >= 0) charactersCache[idx] = updated
      }
      const moduleId = updated?.moduleId ?? base?.moduleId ?? patch?.moduleId
      if (moduleId) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('dnd-archive-trigger', { detail: { moduleId } }))
        }, 0)
      }
      return updated
    })
  }
  const raw = localStorage.getItem(STORAGE_KEY)
  const list = raw ? JSON.parse(raw) : []
  const idx = list.findIndex((c) => c.id === id)
  if (idx === -1) return null
  const normalizedPatch = buildNormalizedPatch(list[idx], patch)
  list[idx] = { ...list[idx], ...normalizedPatch, updatedAt: new Date().toISOString() }
  saveCharacters(list)
  const moduleId = list[idx]?.moduleId ?? patch?.moduleId
  if (moduleId) {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('dnd-archive-trigger', { detail: { moduleId } }))
    }, 0)
  }
  return list[idx]
}

export function deleteCharacter(id) {
  if (isSupabaseEnabled()) {
    const deletedChar = charactersCache.find((c) => c.id === id)
    const clearDefault =
      deletedChar?.owner &&
      getDefaultCharacterId(deletedChar.owner, deletedChar.moduleId ?? 'default') === id
    return charSupabase.deleteCharacterRow(id).then(async () => {
      if (clearDefault && deletedChar.owner) {
        await setDefaultCharInPrefs(deletedChar.owner, deletedChar.moduleId ?? 'default', null)
      }
      charactersCache = charactersCache.filter((c) => c.id !== id)
      const moduleId = deletedChar?.moduleId
      if (moduleId) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('dnd-archive-trigger', { detail: { moduleId } }))
        }, 0)
      }
      return true
    })
  }
  const raw = localStorage.getItem(STORAGE_KEY)
  const list = raw ? JSON.parse(raw) : []
  const next = list.filter((c) => c.id !== id)
  if (next.length === list.length) return false
  const deletedChar = list.find((c) => c.id === id)
  if (deletedChar && deletedChar.owner && getDefaultCharacterId(deletedChar.owner, deletedChar.moduleId ?? 'default') === id) {
    setDefaultCharacterId(deletedChar.owner, null, deletedChar.moduleId ?? 'default')
  }
  saveCharacters(next)
  const moduleId = deletedChar?.moduleId
  if (moduleId) {
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('dnd-archive-trigger', { detail: { moduleId } }))
    }, 0)
  }
  return true
}

/** 复制角色：深拷贝并生成新 ID，保留原所有者 */
export function duplicateCharacter(id) {
  const src = (isSupabaseEnabled() ? charactersCache : (() => { try { const raw = localStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : [] } catch { return [] } })()).find((c) => c.id === id)
  if (!src) return isSupabaseEnabled() ? Promise.resolve(null) : null
  const copy = JSON.parse(JSON.stringify(src))
  copy.id = crypto.randomUUID()
  copy.createdAt = new Date().toISOString()
  copy.updatedAt = new Date().toISOString()
  if (isSupabaseEnabled()) {
    return charSupabase.insertCharacter(copy).then((inserted) => {
      charactersCache.push(inserted)
      return inserted
    })
  }
  const raw = localStorage.getItem(STORAGE_KEY)
  const list = raw ? JSON.parse(raw) : []
  list.push(copy)
  saveCharacters(list)
  return copy
}
