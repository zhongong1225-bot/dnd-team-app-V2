/**
 * 模块级默认 BUFF 补丁存储
 * DM 可在此预填专长、魔能祈唤、战斗风格等的默认 BUFF 效果，
 * 其他用户选择后自动将默认效果写入该角色的对应补丁。
 *
 * 专长 BUFF 统一存入模组库（buffTemplates, sourceKind='feat'），
 * 与模组库 BUFF 模板为同一数据源。魔能祈唤/战斗风格仍用独立 localStorage。
 */

const STORAGE_PREFIX = 'dnd-default-buff-patches-v1-'
const MODULE_LIB_PREFIX = 'dnd_module_library_v1_'

export const DEFAULT_BUFF_PATCHES_EVENT = 'dnd-default-buff-patches-changed'

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
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('dnd-realtime-module-library'))
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

function saveRaw(moduleId, entries) {
  try {
    localStorage.setItem(
      defaultBuffPatchesStorageKey(moduleId),
      JSON.stringify({ entries, updatedAt: Date.now() }),
    )
  } catch { /* ignore */ }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(DEFAULT_BUFF_PATCHES_EVENT, { detail: { moduleId } }),
    )
  }
}

export function buildDefaultBuffPatchKey(kind, id) {
  return `${kind}|${id}`
}

/** 职业特性 BUFF 复合 key：classFeature|{sourceClass}|{sourceSubclass}|{featureId} */
export function buildClassFeatureBuffKey(sourceClass, sourceSubclass, featureId) {
  return `${sourceClass}|${sourceSubclass || ''}|${featureId}`
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
 * @returns {{ effects: Array, duration?: string, enabled?: boolean } | null}
 */
export function loadDefaultBuffPatch(moduleId, kind, id) {
  if (!id) return null

  if (kind === 'feat') {
    const library = loadLib(moduleId)
    const idx = findFeatTemplate(library, id)
    if (idx === -1) return null
    const t = library.buffTemplates[idx]
    return {
      effects: Array.isArray(t.effects) ? t.effects : [],
      ...(t.duration != null && String(t.duration).trim() !== ''
        ? { duration: String(t.duration).trim() }
        : {}),
      ...(t.enabled === false ? { enabled: false } : {}),
    }
  }

  const map = loadRaw(moduleId)
  const patch = map[buildDefaultBuffPatchKey(kind, id)]
  if (!patch || typeof patch !== 'object') return null
  return {
    effects: Array.isArray(patch.effects) ? patch.effects : [],
    ...(patch.duration != null && String(patch.duration).trim() !== ''
      ? { duration: String(patch.duration).trim() }
      : {}),
    ...(patch.enabled === false ? { enabled: false } : {}),
    ...(patch.cardScope && typeof patch.cardScope === 'object' ? { cardScope: patch.cardScope } : {}),
    ...(patch.cardName ? { cardName: patch.cardName } : {}),
    ...(patch.cardDescription ? { cardDescription: patch.cardDescription } : {}),
  }
}

/**
 * 保存默认 BUFF 补丁（空效果且无持续时间则删除）
 * 专长类型写入模组库 buffTemplates（sourceKind='feat'），其他类型写入独立存储。
 * @param {string} moduleId
 * @param {'feat'|'invocation'|'fightingStyle'|'classFeature'} kind
 * @param {string} id
 * @param {{ effects?: Array, duration?: string, enabled?: boolean, sourceName?: string } | null} patch
 */
export function saveDefaultBuffPatch(moduleId, kind, id, patch) {
  if (!id) return

  if (kind === 'feat') {
    const library = loadLib(moduleId)
    const idx = findFeatTemplate(library, id)
    const effects = patch && Array.isArray(patch.effects) ? patch.effects : []
    const duration = patch?.duration != null ? String(patch.duration).trim() : ''
    const enabled = patch?.enabled !== false
    const sourceName = patch?.sourceName || id

    if (effects.length === 0 && !duration && enabled) {
      // 删除
      if (idx !== -1) library.buffTemplates.splice(idx, 1)
    } else {
      const tpl = {
        id: idx !== -1 ? library.buffTemplates[idx].id : generateId('bufftpl'),
        source: sourceName,
        sourceKind: 'feat',
        featId: id,
        effects: effects.map((e) => ({ ...e })),
        enabled,
      }
      if (duration) tpl.duration = duration
      if (idx !== -1) {
        library.buffTemplates[idx] = tpl
      } else {
        library.buffTemplates.push(tpl)
      }
    }
    saveLib(moduleId, library)
    return
  }

  const map = { ...loadRaw(moduleId) }
  const key = buildDefaultBuffPatchKey(kind, id)
  const effects = patch && Array.isArray(patch.effects) ? patch.effects : []
  const duration = patch?.duration != null ? String(patch.duration).trim() : ''
  const enabled = patch?.enabled !== false
  if (effects.length === 0 && !duration && enabled && !patch?.cardName && !patch?.cardDescription
    && !(patch?.cardScope && typeof patch.cardScope === 'object' && patch.cardScope.type && patch.cardScope.type !== 'global')) {
    delete map[key]
  } else {
    map[key] = {
      effects: effects.map((e) => ({ ...e })),
      ...(duration ? { duration } : {}),
      ...(enabled ? {} : { enabled: false }),
      ...(patch?.cardScope && typeof patch.cardScope === 'object' && patch.cardScope.type && patch.cardScope.type !== 'global'
        ? { cardScope: { ...patch.cardScope } }
        : {}),
      ...(patch?.cardName ? { cardName: patch.cardName } : {}),
      ...(patch?.cardDescription ? { cardDescription: patch.cardDescription } : {}),
    }
  }
  saveRaw(moduleId, map)
}

export function clearDefaultBuffPatch(moduleId, kind, id) {
  if (!id) return
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

  const duration = defaultPatch.duration != null && String(defaultPatch.duration).trim() !== ''
    ? defaultPatch.duration
    : personalPatch.duration
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
    const duration = patch.duration != null ? String(patch.duration).trim() : ''
    if (effects.length === 0 && !duration) continue
    library.buffTemplates.push({
      id: generateId('bufftpl'),
      source: featId,
      sourceKind: 'feat',
      featId,
      effects: effects.map((e) => ({ ...e })),
      ...(duration ? { duration } : {}),
      ...(patch.enabled === false ? { enabled: false } : {}),
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
