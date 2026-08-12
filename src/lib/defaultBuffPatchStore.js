/**
 * 模块级默认 BUFF 补丁存储
 * DM 可在此预填专长、魔能祈唤、战斗风格等的默认 BUFF 效果，
 * 其他用户选择后自动将默认效果写入该角色的对应补丁。
 */

const STORAGE_PREFIX = 'dnd-default-buff-patches-v1-'

export const DEFAULT_BUFF_PATCHES_EVENT = 'dnd-default-buff-patches-changed'

export function defaultBuffPatchesStorageKey(moduleId) {
  const m = moduleId && String(moduleId).trim() ? String(moduleId).trim() : 'default'
  return `${STORAGE_PREFIX}${m}`
}

function loadRaw(moduleId) {
  try {
    const raw = localStorage.getItem(defaultBuffPatchesStorageKey(moduleId))
    if (!raw) return {}
    const j = JSON.parse(raw)
    if (j && typeof j.entries === 'object' && j.entries !== null) return { ...j.entries }
  } catch {
    /* ignore */
  }
  return {}
}

function saveRaw(moduleId, entries) {
  try {
    localStorage.setItem(
      defaultBuffPatchesStorageKey(moduleId),
      JSON.stringify({ entries, updatedAt: Date.now() }),
    )
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(DEFAULT_BUFF_PATCHES_EVENT, { detail: { moduleId } }),
    )
  }
}

export function buildDefaultBuffPatchKey(kind, id) {
  return `${kind}|${id}`
}

/**
 * 读取默认 BUFF 补丁
 * @param {string} moduleId
 * @param {'feat'|'invocation'|'fightingStyle'} kind
 * @param {string} id
 * @returns {{ effects: Array, duration?: string, enabled?: boolean } | null}
 */
export function loadDefaultBuffPatch(moduleId, kind, id) {
  if (!id) return null
  const map = loadRaw(moduleId)
  const patch = map[buildDefaultBuffPatchKey(kind, id)]
  if (!patch || typeof patch !== 'object') return null
  return {
    effects: Array.isArray(patch.effects) ? patch.effects : [],
    ...(patch.duration != null && String(patch.duration).trim() !== ''
      ? { duration: String(patch.duration).trim() }
      : {}),
    ...(patch.enabled === false ? { enabled: false } : {}),
  }
}

/**
 * 保存默认 BUFF 补丁（空效果且无尽头时间则删除）
 * @param {string} moduleId
 * @param {'feat'|'invocation'|'fightingStyle'} kind
 * @param {string} id
 * @param {{ effects?: Array, duration?: string, enabled?: boolean } | null} patch
 */
export function saveDefaultBuffPatch(moduleId, kind, id, patch) {
  if (!id) return
  const map = { ...loadRaw(moduleId) }
  const key = buildDefaultBuffPatchKey(kind, id)
  const effects = patch && Array.isArray(patch.effects) ? patch.effects : []
  const duration = patch?.duration != null ? String(patch.duration).trim() : ''
  const enabled = patch?.enabled !== false
  if (effects.length === 0 && !duration && enabled) {
    delete map[key]
  } else {
    map[key] = {
      effects: effects.map((e) => ({ ...e })),
      ...(duration ? { duration } : {}),
      ...(enabled ? {} : { enabled: false }),
    }
  }
  saveRaw(moduleId, map)
}

export function clearDefaultBuffPatch(moduleId, kind, id) {
  if (!id) return
  const map = { ...loadRaw(moduleId) }
  delete map[buildDefaultBuffPatchKey(kind, id)]
  saveRaw(moduleId, map)
}

/** 把一个补丁与默认补丁合并：个人补丁优先，默认补丁补齐 */
export function mergeWithDefaultPatch(personalPatch, defaultPatch) {
  if (!defaultPatch) return personalPatch
  if (!personalPatch || typeof personalPatch !== 'object') return defaultPatch
  // 个人已填写效果、持续时间或明确禁用时，完全使用个人补丁
  const hasPersonalEffects = Array.isArray(personalPatch.effects) && personalPatch.effects.length > 0
  const hasPersonalDuration = personalPatch.duration != null && String(personalPatch.duration).trim() !== ''
  const hasPersonalEnabled = personalPatch.enabled === false
  if (hasPersonalEffects || hasPersonalDuration || hasPersonalEnabled) return personalPatch
  return defaultPatch
}
