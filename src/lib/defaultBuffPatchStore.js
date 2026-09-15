/**
 * 模块级默认 BUFF 补丁存储
 * DM 可在此预填专长、魔能祈唤、战斗风格等的默认 BUFF 效果，
 * 其他用户选择后自动将默认效果写入该角色的对应补丁。
 *
 * 专长 BUFF 统一存入模组库（buffTemplates, sourceKind='feat'），
 * 与模组库 BUFF 模板为同一数据源。魔能祈唤/战斗风格仍用独立 localStorage。
 */

import { isSupabaseEnabled } from './supabase'
import * as teamData from './teamDataSupabase'
import { cloneDurationRaw } from './durationModel'

const STORAGE_PREFIX = 'dnd-default-buff-patches-v1-'
const MODULE_LIB_PREFIX = 'dnd_module_library_v1_'

export const DEFAULT_BUFF_PATCHES_EVENT = 'dnd-default-buff-patches-changed'

function normMod(moduleId) {
  return moduleId && String(moduleId).trim() ? String(moduleId).trim() : 'default'
}

// Supabase 启动期 currentModuleId 会短暂落到 'default'，此时写入会进错桶导致配置"丢失"。
// 默认 true：localStorage 模式与无 ModuleProvider 的上下文一律不拦截。
let cloudReady = true
export function setDefaultBuffPatchesReady(ready) {
  cloudReady = !!ready
}
function blockBootstrapWrite(op) {
  if (isSupabaseEnabled() && !cloudReady) {
    console.warn(`[defaultBuffPatch] 云端数据同步中，已忽略${op}（避免写入错误的模组桶）`)
    return true
  }
  return false
}

export function defaultBuffPatchesStorageKey(moduleId) {
  const m = moduleId && String(moduleId).trim() ? String(moduleId).trim() : 'default'
  return `${STORAGE_PREFIX}${m}`
}

function libKey(moduleId) {
  const m = moduleId && String(moduleId).trim() ? String(moduleId).trim() : 'default'
  return `${MODULE_LIB_PREFIX}${m}`
}

function loadLib(moduleId) {
  try {
    const raw = localStorage.getItem(libKey(moduleId))
    const parsed = raw ? JSON.parse(raw) : null
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return {
        buffTemplates: Array.isArray(parsed.buffTemplates) ? parsed.buffTemplates : [],
        itemTemplates: Array.isArray(parsed.itemTemplates) ? parsed.itemTemplates : [],
      }
    }
  } catch { /* ignore */ }
  return { buffTemplates: [], itemTemplates: [] }
}

function saveLib(moduleId, library) {
  try {
    localStorage.setItem(libKey(moduleId), JSON.stringify(library))
  } catch { /* ignore */ }
  if (isSupabaseEnabled() && cloudReady) {
    const mod = normMod(moduleId)
    const normalized = {
      buffTemplates: Array.isArray(library.buffTemplates) ? library.buffTemplates : [],
      itemTemplates: Array.isArray(library.itemTemplates) ? library.itemTemplates : [],
    }
    teamData.saveModuleLibrary(mod, normalized).catch((e) => console.warn('[defaultBuffPatch] 专长云端保存失败', e))
    // 动态导入避免静态循环依赖；同步内存缓存，防止后续 persistModuleLibrary 用陈旧缓存覆盖专长
    import('./moduleLibraryStore').then((m) => m.primeModuleLibraryCache?.(mod, normalized)).catch(() => {})
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dnd-realtime-module-library'))
    // 专长配置存在模组库而非独立补丁表，须同样通知 BUFF 重算，否则保存后卡片停留在旧数值
    window.dispatchEvent(
      new CustomEvent(DEFAULT_BUFF_PATCHES_EVENT, { detail: { moduleId: normMod(moduleId) } }),
    )
  }
}

function generateId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

/* ---- 非专长类型：沿用独立 localStorage ---- */

function loadRaw(moduleId) {
  try {
    const raw = localStorage.getItem(defaultBuffPatchesStorageKey(moduleId))
    if (!raw) return {}
    const j = JSON.parse(raw)
    if (j && typeof j.entries === 'object' && j.entries !== null) return { ...j.entries }
  } catch { /* ignore */ }
  return {}
}

function writeRawLocal(moduleId, entries) {
  try {
    localStorage.setItem(
      defaultBuffPatchesStorageKey(moduleId),
      JSON.stringify({ entries, updatedAt: Date.now() }),
    )
  } catch { /* ignore */ }
}

function saveRaw(moduleId, entries) {
  writeRawLocal(moduleId, entries)
  if (isSupabaseEnabled() && cloudReady) {
    teamData.saveDefaultBuffPatches(normMod(moduleId), entries)
      .catch((e) => console.warn('[defaultBuffPatch] 云端保存失败', e))
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(DEFAULT_BUFF_PATCHES_EVENT, { detail: { moduleId } }),
    )
  }
}

/**
 * 从云端加载本模组的默认 BUFF 补丁并与本地合并。
 * 云端有数据 → 按 key 合并（云端优先）写回本地并广播重算；
 * 云端为空但本地有数据 → 把本地首次上云播种。
 */
export async function loadDefaultBuffPatchesFromSupabase(moduleId) {
  if (!isSupabaseEnabled()) return
  const mod = normMod(moduleId)
  try {
    const cloud = await teamData.fetchDefaultBuffPatches(mod)
    const local = loadRaw(mod)
    if (cloud && typeof cloud === 'object' && Object.keys(cloud).length) {
      writeRawLocal(mod, { ...local, ...cloud })
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent(DEFAULT_BUFF_PATCHES_EVENT, { detail: { moduleId: mod } }))
      }
    } else if (Object.keys(local).length) {
      await teamData.saveDefaultBuffPatches(mod, local)
    }
  } catch (e) {
    console.warn('[defaultBuffPatch] 云端加载失败', e)
  }
}

export function buildDefaultBuffPatchKey(kind, id) {
  return `${kind}|${id}`
}

/** 职业特性 BUFF 复合 key：classFeature|{sourceClass}|{sourceSubclass}|{featureId} */
export function buildClassFeatureBuffKey(sourceClass, sourceSubclass, featureId) {
  return `${sourceClass}|${sourceSubclass || ''}|${featureId}`
}

/**
 * 卡级生效范围归一：效果编辑器（BuffForm）产出 {scopeType, scopeDetail}，
 * 存储与展示端历史约定为 {type}。两侧别名同时落库，任一侧读取都不会落空。
 * global 视为无范围，返回 null。
 */
function normalizeCardScope(cardScope) {
  if (!cardScope || typeof cardScope !== 'object') return null
  const type = cardScope.type || cardScope.scopeType
  if (!type || type === 'global') return null
  return { ...cardScope, type, scopeType: type }
}

/* ---- 专长 BUFF：读写模组库 ---- */

function findFeatTemplate(library, featId) {
  return library.buffTemplates.findIndex(
    (t) => t && t.sourceKind === 'feat' && t.featId === featId,
  )
}

/**
 * 读取默认 BUFF 补丁
 * 专长类型从模组库读取，其他类型从独立存储读取。
 * @param {string} moduleId
 * @param {'feat'|'invocation'|'fightingStyle'|'classFeature'} kind
 * @param {string} id - 对 classFeature 使用 buildClassFeatureBuffKey() 生成的复合 key
 * @returns {{ effects: Array, duration?: string, enabled?: boolean, tombstone?: true, cardScope?: object } | null}
 */
export function loadDefaultBuffPatch(moduleId, kind, id) {
  if (!id) return null

  if (kind === 'feat') {
    const library = loadLib(moduleId)
    const idx = findFeatTemplate(library, id)
    if (idx === -1) return null
    const t = library.buffTemplates[idx]
    const duration = cloneDurationRaw(t.duration)
    const cardScope = normalizeCardScope(t.cardScope)
    return {
      effects: Array.isArray(t.effects) ? t.effects : [],
      ...(t.tombstone ? { tombstone: true } : {}),
      ...(duration ? { duration } : {}),
      ...(t.enabled === false ? { enabled: false } : {}),
      ...(cardScope ? { cardScope } : {}),
    }
  }

  const map = loadRaw(moduleId)
  const patch = map[buildDefaultBuffPatchKey(kind, id)]
  if (!patch || typeof patch !== 'object') return null
  const duration = cloneDurationRaw(patch.duration)
  const cardScope = normalizeCardScope(patch.cardScope)
  return {
    effects: Array.isArray(patch.effects) ? patch.effects : [],
    ...(patch.tombstone ? { tombstone: true } : {}),
    ...(duration ? { duration } : {}),
    ...(patch.enabled === false ? { enabled: false } : {}),
    ...(cardScope ? { cardScope } : {}),
    ...(patch.cardName ? { cardName: patch.cardName } : {}),
    ...(patch.cardDescription ? { cardDescription: patch.cardDescription } : {}),
  }
}

/**
 * 保存默认 BUFF 补丁（效果为空一律写墓碑模板，附加字段随模板保留；不再删除）
 * 专长类型写入模组库 buffTemplates（sourceKind='feat'），其他类型写入独立存储。
 * @param {string} moduleId
 * @param {'feat'|'invocation'|'fightingStyle'|'classFeature'} kind
 * @param {string} id
 * @param {{ effects?: Array, duration?: string, enabled?: boolean, sourceName?: string, cardScope?: {type?: string, scopeType?: string, scopeDetail?: Array}, cardName?: string, cardDescription?: string } | null} patch
 */
export function saveDefaultBuffPatch(moduleId, kind, id, patch) {
  if (!id) return
  if (blockBootstrapWrite('保存')) return

  if (kind === 'feat') {
    const library = loadLib(moduleId)
    const idx = findFeatTemplate(library, id)
    const effects = patch && Array.isArray(patch.effects) ? patch.effects : []
    const duration = cloneDurationRaw(patch?.duration)
    const enabled = patch?.enabled !== false
    const sourceName = patch?.sourceName || id
    const cardScope = normalizeCardScope(patch?.cardScope)
    const tplId = idx !== -1 ? library.buffTemplates[idx].id : generateId('bufftpl')

    let tpl
    if (effects.length === 0) {
      // 墓碑：DM 显式清空须与「从未配置」区分，否则读取端回退硬编码模板使清空复活
      tpl = { id: tplId, source: sourceName, sourceKind: 'feat', featId: id, effects: [], enabled, tombstone: true }
      if (duration) tpl.duration = duration
      if (cardScope) tpl.cardScope = cardScope
    } else {
      tpl = {
        id: tplId,
        source: sourceName,
        sourceKind: 'feat',
        featId: id,
        effects: effects.map((e) => ({ ...e })),
        enabled,
      }
      if (duration) tpl.duration = duration
      if (cardScope) tpl.cardScope = cardScope
    }

    if (idx !== -1) library.buffTemplates[idx] = tpl
    else library.buffTemplates.push(tpl)

    saveLib(moduleId, library)
    return
  }

  const map = { ...loadRaw(moduleId) }
  const key = buildDefaultBuffPatchKey(kind, id)
  const effects = patch && Array.isArray(patch.effects) ? patch.effects : []
  const duration = cloneDurationRaw(patch?.duration)
  const enabled = patch?.enabled !== false
  const cardScope = normalizeCardScope(patch?.cardScope)
  const extra = {
    ...(duration ? { duration } : {}),
    ...(enabled ? {} : { enabled: false }),
    ...(cardScope ? { cardScope } : {}),
    ...(patch?.cardName ? { cardName: patch.cardName } : {}),
    ...(patch?.cardDescription ? { cardDescription: patch.cardDescription } : {}),
  }
  map[key] = effects.length === 0
    // 墓碑：DM 显式清空效果，须与「从未配置」区分，否则读取端会回退硬编码默认使清空复活
    ? { effects: [], tombstone: true, ...extra }
    : { effects: effects.map((e) => ({ ...e })), ...extra }
  saveRaw(moduleId, map)
}

export function clearDefaultBuffPatch(moduleId, kind, id) {
  if (!id) return
  if (blockBootstrapWrite('清除')) return
  if (kind === 'feat') {
    const library = loadLib(moduleId)
    const idx = findFeatTemplate(library, id)
    if (idx !== -1) library.buffTemplates.splice(idx, 1)
    saveLib(moduleId, library)
    return
  }
  const map = { ...loadRaw(moduleId) }
  delete map[buildDefaultBuffPatchKey(kind, id)]
  saveRaw(moduleId, map)
}

/** 把一个补丁与默认补丁合并：DM默认效果优先，个人效果仅在DM未覆盖时补充 */
export function mergeWithDefaultPatch(personalPatch, defaultPatch) {
  if (!defaultPatch) return personalPatch
  if (!personalPatch || typeof personalPatch !== 'object') return defaultPatch

  const personalEffects = Array.isArray(personalPatch.effects) ? personalPatch.effects : []
  const defaultEffects = Array.isArray(defaultPatch.effects) ? defaultPatch.effects : []
  // DM默认效果优先：个人效果中 effectType 已被DM覆盖的跳过，防止重复叠加
  const defaultTypes = new Set(defaultEffects.map((e) => e.effectType).filter(Boolean))
  const mergedEffects = [
    ...defaultEffects,
    ...personalEffects.filter((e) => !e.effectType || !defaultTypes.has(e.effectType)),
  ]

  const defaultDuration = cloneDurationRaw(defaultPatch.duration)
  const duration = defaultDuration !== undefined ? defaultDuration : cloneDurationRaw(personalPatch.duration)
  const enabled = defaultPatch.enabled !== undefined ? defaultPatch.enabled : personalPatch.enabled

  return {
    effects: mergedEffects,
    ...(duration ? { duration } : {}),
    ...(enabled === false ? { enabled: false } : {}),
  }
}

/**
 * 迁移：将旧版独立存储中的专长 BUFF 迁入模组库。
 * 在应用启动时调用一次即可。
 */
export function migrateFeatBuffsToModuleLibrary(moduleId) {
  const map = loadRaw(moduleId)
  const featEntries = {}
  for (const [key, val] of Object.entries(map)) {
    if (key.startsWith('feat|') && val && typeof val === 'object') {
      const featId = key.slice(5)
      featEntries[featId] = val
    }
  }
  if (Object.keys(featEntries).length === 0) return

  const library = loadLib(moduleId)
  for (const [featId, patch] of Object.entries(featEntries)) {
    const exists = findFeatTemplate(library, featId)
    if (exists !== -1) continue
    const effects = Array.isArray(patch.effects) ? patch.effects : []
    const duration = cloneDurationRaw(patch.duration)
    const cardScope = normalizeCardScope(patch.cardScope)
    if (patch.tombstone) {
      // 旧 raw 存储里的显式清空：若不搬迁，随后的清理会不可逆地把它降级为「从未配置」→ 硬编码复活
      library.buffTemplates.push({
        id: generateId('bufftpl'),
        source: featId,
        sourceKind: 'feat',
        featId,
        effects: [],
        enabled: patch.enabled !== false,
        tombstone: true,
        ...(duration ? { duration } : {}),
        ...(cardScope ? { cardScope } : {}),
      })
      continue
    }
    if (effects.length === 0 && !duration) continue
    library.buffTemplates.push({
      id: generateId('bufftpl'),
      source: featId,
      sourceKind: 'feat',
      featId,
      effects: effects.map((e) => ({ ...e })),
      ...(duration ? { duration } : {}),
      ...(patch.enabled === false ? { enabled: false } : {}),
      ...(cardScope ? { cardScope } : {}),
    })
  }
  saveLib(moduleId, library)

  // 清理已迁移的专长条目
  const cleaned = { ...map }
  for (const key of Object.keys(cleaned)) {
    if (key.startsWith('feat|')) delete cleaned[key]
  }
  saveRaw(moduleId, cleaned)
}
