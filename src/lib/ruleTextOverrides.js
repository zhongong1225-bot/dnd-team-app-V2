/**
 * 规则收录 / 角色卡 共用的「名称与正文覆盖」：按战役 moduleId 存储，便于 DM 在网页上改职业/子职特性名称与正文、专长等而不立刻改代码。
 * 不替代代码库数据；仅在有覆盖键时替换展示文案。
 * 存储双通道：localStorage 立即生效；启用 Supabase 时镜像到 custom_library（lib_key=rule_text_overrides_<moduleId>），
 * 启动 / 切换战役 / 实时推送时按「保存时间新者赢」合并，使覆盖随战役跨设备同步。
 */
import { canonicalClassName } from '../data/classDatabase'
import { isSupabaseEnabled } from './supabase'
import {
  fetchRuleTextOverrides as fetchRemoteRecord,
  saveRuleTextOverridesRow,
} from './teamDataSupabase'

const STORAGE_PREFIX = 'dnd-rule-text-overrides-v1-'

export const RULE_TEXT_OVERRIDES_EVENT = 'dnd-rule-text-overrides-changed'

export function ruleTextOverridesStorageKey(moduleId) {
  const m = moduleId && String(moduleId).trim() ? String(moduleId).trim() : 'default'
  return `${STORAGE_PREFIX}${m}`
}

function normalizeRecord(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null
  if (!payload.entries || typeof payload.entries !== 'object' || Array.isArray(payload.entries)) return null
  return { entries: { ...payload.entries }, updatedAt: Number(payload.updatedAt) || 0 }
}

function readLocalRecord(moduleId) {
  try {
    const raw = localStorage.getItem(ruleTextOverridesStorageKey(moduleId))
    if (!raw) return null
    return normalizeRecord(JSON.parse(raw))
  } catch {
    return null
  }
}

function writeLocalRecord(moduleId, record) {
  try {
    localStorage.setItem(ruleTextOverridesStorageKey(moduleId), JSON.stringify(record))
  } catch {
    /* ignore */
  }
}

function emitChanged(moduleId) {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(RULE_TEXT_OVERRIDES_EVENT, { detail: { moduleId } }))
  }
}

export function loadRuleTextOverrides(moduleId) {
  return readLocalRecord(moduleId)?.entries ?? {}
}

export function saveRuleTextOverrides(moduleId, entries, updatedAt = Date.now()) {
  const record = { entries, updatedAt }
  writeLocalRecord(moduleId, record)
  emitChanged(moduleId)
  if (isSupabaseEnabled()) {
    saveRuleTextOverridesRow(moduleId, record).catch((e) => {
      console.warn('[ruleTextOverrides] 云端保存失败', e)
    })
  }
}

/**
 * 纯合并：保存时间新者赢；时间相同不动。
 * 云端无有效记录且本地有内容 → 首连上传；本地无记录而云端有 → 落地本地。
 * @returns {{ winner: {entries: object, updatedAt: number}|null, replaceLocal: boolean, upload: boolean }}
 */
export function mergeRuleTextOverrideRecords(local, remote) {
  const l = normalizeRecord(local)
  const r = normalizeRecord(remote)
  if (!r) {
    const hasLocal = !!l && Object.keys(l.entries).length > 0
    return { winner: l, replaceLocal: false, upload: hasLocal }
  }
  if (!l) return { winner: r, replaceLocal: true, upload: false }
  if (r.updatedAt > l.updatedAt) return { winner: r, replaceLocal: true, upload: false }
  if (l.updatedAt > r.updatedAt) return { winner: l, replaceLocal: false, upload: true }
  return { winner: l, replaceLocal: false, upload: false }
}

/** 从云端拉取并与本地合并；赢方回写另一方。本地被替换时派发事件驱动界面刷新。 */
export async function hydrateRuleTextOverridesFromSupabase(moduleId) {
  if (!isSupabaseEnabled()) return loadRuleTextOverrides(moduleId)
  try {
    const remote = normalizeRecord(await fetchRemoteRecord(moduleId))
    const { winner, replaceLocal, upload } = mergeRuleTextOverrideRecords(readLocalRecord(moduleId), remote)
    if (replaceLocal && winner) {
      writeLocalRecord(moduleId, winner)
      emitChanged(moduleId)
    } else if (upload && winner) {
      await saveRuleTextOverridesRow(moduleId, winner).catch((e) => {
        console.warn('[ruleTextOverrides] 云端首连上传失败', e)
      })
    }
  } catch (e) {
    console.warn('[ruleTextOverrides] 云端合并失败', e)
  }
  return loadRuleTextOverrides(moduleId)
}

export function buildClassFeatureKey(className, featureId) {
  const c = canonicalClassName(className)
  return `cf|${c}|${featureId}|d`
}

/** 职业特性 · 显示名称（与 |d 正文独立） */
export function buildClassFeatureNameKey(className, featureId) {
  const c = canonicalClassName(className)
  return `cf|${c}|${featureId}|n`
}

export function buildSubclassFeatureKey(className, subclassName, featureId) {
  const c = canonicalClassName(className)
  const sub = encodeURIComponent(String(subclassName ?? '').trim() || '_')
  return `sf|${c}|${sub}|${featureId}|d`
}

/** 子职特性 · 显示名称 */
export function buildSubclassFeatureNameKey(className, subclassName, featureId) {
  const c = canonicalClassName(className)
  const sub = encodeURIComponent(String(subclassName ?? '').trim() || '_')
  return `sf|${c}|${sub}|${featureId}|n`
}

export function buildFeatDescriptionKey(featId) {
  return `feat|${featId}|d`
}

/** 专长 · 显示名称（与 |d 正文独立） */
export function buildFeatNameKey(featId) {
  return `feat|${featId}|n`
}

export function buildInvocationKey(id, field) {
  return `inv|${id}|${field === 'p' ? 'p' : 'd'}`
}

export function buildMartialKey(id) {
  return `mt|${id}|d`
}

export function buildFocusAbilityKey(className, rowId) {
  return `fa|${canonicalClassName(className)}|${rowId}|e`
}

/** @param {Record<string, string>} map */
export function resolveRuleText(map, key, fallback) {
  if (!map || !key) return fallback ?? ''
  const v = map[key]
  if (v != null && String(v).length > 0) return String(v)
  return fallback ?? ''
}

export function setRuleTextEntry(moduleId, key, value, originalText) {
  const map = { ...loadRuleTextOverrides(moduleId) }
  const next = String(value ?? '').trimEnd()
  const orig = String(originalText ?? '').trimEnd()
  if (next === '' || next === orig) {
    delete map[key]
  } else {
    map[key] = value
  }
  saveRuleTextOverrides(moduleId, map)
}

export function clearRuleTextEntry(moduleId, key) {
  const map = { ...loadRuleTextOverrides(moduleId) }
  delete map[key]
  saveRuleTextOverrides(moduleId, map)
}
