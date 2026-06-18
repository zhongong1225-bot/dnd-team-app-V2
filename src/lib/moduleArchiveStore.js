/**
 * 模组存档系统（Dashboard 专用）
 * - 手动存档：每个模组保留最新 30 条，仅 DM 可操作
 * - 自动存档：内容修改时触发，每个模组保留最新 5 条
 * - GitHub 备份：手动存档支持上传到 GitHub（独立，不与本地同步）
 */
import { getAllCharacters } from './characterStore'
import { getTeamVault } from './currencyStore'
import { getWarehouseSnapshot } from './warehouseStore'
import { isSupabaseEnabled } from './supabase'
import * as td from './teamDataSupabase'

const DB_NAME = 'dnd_module_archives'
const DB_VERSION = 1
const STORE_NAME = 'archives'

const MANUAL_MAX = 30
const AUTO_MAX = 5

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('moduleId', 'moduleId', { unique: false })
        store.createIndex('moduleType', ['moduleId', 'type'], { unique: false })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function txGetAll(store) {
  return new Promise((resolve, reject) => {
    const r = store.getAll()
    r.onsuccess = () => resolve(r.result || [])
    r.onerror = () => reject(r.error)
  })
}

function txGet(store, id) {
  return new Promise((resolve, reject) => {
    const r = store.get(id)
    r.onsuccess = () => resolve(r.result || null)
    r.onerror = () => reject(r.error)
  })
}

function txPut(store, data) {
  return new Promise((resolve, reject) => {
    const r = store.put(data)
    r.onsuccess = () => resolve()
    r.onerror = () => reject(r.error)
  })
}

function txDelete(store, id) {
  return new Promise((resolve, reject) => {
    const r = store.delete(id)
    r.onsuccess = () => resolve()
    r.onerror = () => reject(r.error)
  })
}

// ─── 数据收集 ───

async function collectModuleArchiveData(moduleId) {
  const mod = moduleId ?? 'default'
  const characters = getAllCharacters(mod).map(c => JSON.parse(JSON.stringify(c)))
  const teamVault = { ...getTeamVault(mod) }
  const warehouse = getWarehouseSnapshot(mod)
  let craftingProjects = []
  if (isSupabaseEnabled()) {
    try {
      craftingProjects = await td.fetchCraftingRow(mod)
    } catch { /* ignore */ }
  }
  // 同时备份 localStorage 中的自定义物品/法术（非 Supabase 时尤为重要）
  let customItems = []
  let customSpells = []
  try {
    const rawItems = localStorage.getItem('starlight_custom_items')
    if (rawItems) customItems = JSON.parse(rawItems)
  } catch { }
  try {
    const rawSpells = localStorage.getItem('starlight_custom_spells')
    if (rawSpells) customSpells = JSON.parse(rawSpells)
  } catch { }

  return {
    characters,
    teamVault,
    warehouse,
    craftingProjects,
    customItems,
    customSpells,
  }
}

// ─── 公共 API ───

/**
 * 保存手动存档
 * @param {string} moduleId
 * @param {string} [label]
 * @returns {Promise<{id: string, timestamp: string}>}
 */
export async function saveManualArchive(moduleId, label) {
  const data = await collectModuleArchiveData(moduleId)
  const now = new Date()
  const archive = {
    id: `arch_manual_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
    moduleId: moduleId ?? 'default',
    type: 'manual',
    timestamp: now.toISOString(),
    label: label || `手动存档 ${now.toLocaleDateString('zh-CN')} ${now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
    data,
  }

  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  await txPut(store, archive)

  // 清理：只保留最新 MANUAL_MAX 条手动存档
  const all = await txGetAll(store)
  const manualForModule = all
    .filter(s => s.moduleId === (moduleId ?? 'default') && s.type === 'manual')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  const toDelete = manualForModule.slice(MANUAL_MAX)
  for (const s of toDelete) {
    await txDelete(store, s.id)
  }

  db.close()
  return { id: archive.id, timestamp: archive.timestamp }
}

/**
 * 保存自动存档（内容修改触发）
 * @param {string} moduleId
 * @returns {Promise<{id: string, timestamp: string} | null>}
 */
export async function saveAutoArchive(moduleId) {
  const mod = moduleId ?? 'default'
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)

  // 检查最近1分钟内是否已有自动存档，避免过于频繁
  const all = await txGetAll(store)
  const oneMinuteAgo = Date.now() - 60 * 1000
  const recent = all.find(s =>
    s.moduleId === mod &&
    s.type === 'auto' &&
    new Date(s.timestamp).getTime() > oneMinuteAgo
  )
  if (recent) {
    db.close()
    return null
  }

  db.close()

  const data = await collectModuleArchiveData(mod)
  const now = new Date()
  const archive = {
    id: `arch_auto_${now.getTime()}_${Math.random().toString(36).slice(2, 8)}`,
    moduleId: mod,
    type: 'auto',
    timestamp: now.toISOString(),
    label: `自动存档 ${now.toLocaleDateString('zh-CN')} ${now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}`,
    data,
  }

  const db2 = await openDB()
  const tx2 = db2.transaction(STORE_NAME, 'readwrite')
  const store2 = tx2.objectStore(STORE_NAME)
  await txPut(store2, archive)

  // 清理：只保留最新 AUTO_MAX 条自动存档
  const all2 = await txGetAll(store2)
  const autoForModule = all2
    .filter(s => s.moduleId === mod && s.type === 'auto')
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  const toDelete = autoForModule.slice(AUTO_MAX)
  for (const s of toDelete) {
    await txDelete(store2, s.id)
  }

  db2.close()
  return { id: archive.id, timestamp: archive.timestamp }
}

/**
 * 列出指定模组的存档
 * @param {string} moduleId
 * @param {'manual'|'auto'|'all'} [type='all']
 * @returns {Promise<Array<{id:string, moduleId:string, type:string, timestamp:string, label:string}>>}
 */
export async function listArchives(moduleId, type = 'all') {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  const all = await txGetAll(store)
  db.close()

  return all
    .filter(s => s.moduleId === (moduleId ?? 'default') && (type === 'all' || s.type === type))
    .map(s => ({ id: s.id, moduleId: s.moduleId, type: s.type, timestamp: s.timestamp, label: s.label }))
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
}

/**
 * 获取存档详情（含完整数据）
 * @param {string} archiveId
 * @returns {Promise<object|null>}
 */
export async function getArchive(archiveId) {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readonly')
  const store = tx.objectStore(STORE_NAME)
  const result = await txGet(store, archiveId)
  db.close()
  return result
}

/**
 * 删除单个存档
 * @param {string} archiveId
 */
export async function deleteArchive(archiveId) {
  const db = await openDB()
  const tx = db.transaction(STORE_NAME, 'readwrite')
  const store = tx.objectStore(STORE_NAME)
  await txDelete(store, archiveId)
  db.close()
}

/**
 * 导出存档为 JSON Blob（用于下载或上传）
 * @param {string} archiveId
 * @returns {Promise<{blob: Blob, filename: string}>}
 */
export async function exportArchiveAsBlob(archiveId) {
  const archive = await getArchive(archiveId)
  if (!archive) throw new Error('存档不存在')
  const mod = archive.moduleId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const safeTs = archive.timestamp.replace(/[:.]/g, '-')
  const filename = `dnd-archive_${mod}_${archive.type}_${safeTs}.json`
  const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json;charset=utf-8' })
  return { blob, filename }
}

// ─── GitHub 备份 ───

const GITHUB_CONFIG_KEY = 'dnd_github_backup_config'

export function getGitHubConfig() {
  try {
    const raw = localStorage.getItem(GITHUB_CONFIG_KEY)
    if (!raw) return null
    const config = JSON.parse(raw)
    // 自动迁移旧仓库地址到新账号
    if (config.owner === 'zhong184556267' && config.repo === 'dnd-team-app-V2') {
      config.owner = 'zhongong1225-bot'
      localStorage.setItem(GITHUB_CONFIG_KEY, JSON.stringify(config))
    }
    return config
  } catch {
    return null
  }
}

export function setGitHubConfig(config) {
  localStorage.setItem(GITHUB_CONFIG_KEY, JSON.stringify(config))
}

/**
 * 上传存档到 GitHub（创建新文件）
 * @param {string} archiveId
 * @returns {Promise<{success: boolean, url?: string, error?: string}>}
 */
export async function uploadArchiveToGitHub(archiveId) {
  const config = getGitHubConfig()
  if (!config?.token || !config?.owner || !config?.repo) {
    return { success: false, error: '未配置 GitHub 备份参数（请在设置中填写 Token / 仓库）' }
  }

  const archive = await getArchive(archiveId)
  if (!archive) return { success: false, error: '存档不存在' }

  const mod = archive.moduleId.replace(/[^a-zA-Z0-9_-]/g, '_')
  const safeTs = archive.timestamp.replace(/[:.]/g, '-').replace(/T/g, '_')
  const path = `${config.pathPrefix || 'dnd-backups'}/${mod}/${archive.type}_${safeTs}.json`
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(archive, null, 2))))

  const url = `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${path}`
  const body = {
    message: `D&D archive backup: ${mod} ${archive.type} ${archive.timestamp}`,
    content,
    branch: config.branch || 'main',
  }

  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `token ${config.token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { success: false, error: err.message || `HTTP ${res.status}` }
    }
    const data = await res.json()
    return { success: true, url: data.content?.html_url }
  } catch (e) {
    return { success: false, error: e?.message || String(e) }
  }
}

// ─── 自动存档调度 ───

let autoArchiveDebounceTimer = null
const DEBOUNCE_MS = 3000

/**
 * 触发自动存档（带防抖）
 * @param {string} moduleId
 */
export function triggerAutoArchive(moduleId) {
  if (autoArchiveDebounceTimer) {
    clearTimeout(autoArchiveDebounceTimer)
  }
  autoArchiveDebounceTimer = setTimeout(() => {
    saveAutoArchive(moduleId).catch(() => {})
    autoArchiveDebounceTimer = null
  }, DEBOUNCE_MS)
}

/**
 * 启动全局自动存档监听
 * 监听各种数据变更事件，触发对应模组的自动存档
 */
export function startAutoArchiveListener() {
  const handler = (e) => {
    const moduleId = e?.detail?.moduleId
    if (moduleId) triggerAutoArchive(moduleId)
  }
  window.addEventListener('dnd-archive-trigger', handler)
  return () => window.removeEventListener('dnd-archive-trigger', handler)
}
