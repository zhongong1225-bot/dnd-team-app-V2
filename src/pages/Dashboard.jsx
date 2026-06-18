import { useState, useEffect, useRef } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { BookOpen, ChevronDown, ChevronRight, Plus, Pencil, Star, Trash2, Save, RotateCcw, X } from 'lucide-react'
import DragHandleIcon from '../components/DragHandleIcon'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { getAllCharacters, getDefaultCharacterId } from '../lib/characterStore'
import { getModules, addModule, updateModule, reorderModules, deleteModule } from '../lib/moduleStore'
import { loadTeamActivities } from '../lib/activityLog'
import { isSupabaseEnabled } from '../lib/supabase'
import { saveManualSnapshot, listSnapshots, restoreFromSnapshot } from '../lib/moduleSnapshotStore'
import { inputClass } from '../lib/inputStyles'
import Characters from './Characters'
import ModuleArchivePanel from '../components/ModuleArchivePanel'

export default function Dashboard() {
  const { user, isAdmin } = useAuth()
  const { setCurrentModuleId, modules, refreshModules } = useModule()
  const location = useLocation()
  const [, setRealtimeTick] = useState(0)
  const [activities, setActivities] = useState([])
  const [newModuleName, setNewModuleName] = useState('')
  const [showAddModule, setShowAddModule] = useState(false)
  const [editingModuleId, setEditingModuleId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [expandedModuleIds, setExpandedModuleIds] = useState(() => new Set())
  const [snapshottingId, setSnapshottingId] = useState(null)
  const [restoreModuleId, setRestoreModuleId] = useState(null)
  const [snapshotList, setSnapshotList] = useState([])
  const [loadingSnapshots, setLoadingSnapshots] = useState(false)
  const [restoringId, setRestoringId] = useState(null)
  const moduleNameInputRef = useRef(null)
  const editingModuleIdRef = useRef(null)
  const savingModuleRef = useRef(false)

  const moduleCounts = modules.map((m) => ({
    ...m,
    count: getAllCharacters(m.id).length,
  }))

  useEffect(() => {
    const h = () => setRealtimeTick((t) => t + 1)
    window.addEventListener('dnd-realtime-characters', h)
    return () => window.removeEventListener('dnd-realtime-characters', h)
  }, [])

  const refreshActivities = () => {
    loadTeamActivities(35).then(setActivities)
  }

  useEffect(() => {
    refreshActivities()
  }, [])

  useEffect(() => {
    const h = () => refreshActivities()
    window.addEventListener('dnd-realtime-activity', h)
    return () => window.removeEventListener('dnd-realtime-activity', h)
  }, [])

  const toggleExpand = (moduleId) => {
    setExpandedModuleIds((prev) => {
      const next = new Set(prev)
      if (next.has(moduleId)) next.delete(moduleId)
      else {
        next.add(moduleId)
        setCurrentModuleId(moduleId)
      }
      return next
    })
  }

  const handleDeleteModule = (e, m) => {
    e.stopPropagation()
    if (m.id === 'default') {
      alert('默认模组不可删除')
      return
    }
    if (moduleCounts.length <= 1) {
      alert('至少需要保留一个模组')
      return
    }
    if (
      !confirm(
        `确定删除模组「${m.name}」？\n角色数据不会从云端删除，但该模组将从列表移除；相关角色仍可在「我的角色」中查看。`
      )
    )
      return
    Promise.resolve(deleteModule(m.id, user?.name))
      .then((ok) => {
        if (ok) {
          refreshModules()
          setExpandedModuleIds((prev) => {
            const next = new Set(prev)
            next.delete(m.id)
            return next
          })
        } else alert('无法删除该模组')
      })
      .catch((err) => {
        console.warn(err)
        alert(err?.message ? `删除失败：${err.message}` : '删除失败')
      })
  }

  const handleAddModule = () => {
    const name = newModuleName?.trim()
    if (!name) return
    Promise.resolve(addModule(name))
      .then((created) => {
        refreshModules()
        const mods = getModules()
        const added = created?.id ? created : mods.find((m) => m.name === name) ?? mods[mods.length - 1]
        if (added?.id) setCurrentModuleId(added.id)
        setNewModuleName('')
        setShowAddModule(false)
      })
      .catch((e) => {
        console.warn(e)
        alert(e?.message ? `添加模组失败：${e.message}` : '添加模组失败，请检查 Supabase 与 campaign_modules 表')
      })
  }

  const startEditModule = (e, m) => {
    e.stopPropagation()
    editingModuleIdRef.current = m.id
    setEditingModuleId(m.id)
    setEditingName(m.name)
  }

  const cancelEditModule = () => {
    editingModuleIdRef.current = null
    setEditingModuleId(null)
    setEditingName('')
  }

  /** nameOverride 用输入框 DOM 当前值，避免 onBlur 时 React state 尚未提交导致保存旧名 */
  const saveEditModule = (nameOverride, moduleIdExplicit) => {
    const id = moduleIdExplicit ?? editingModuleIdRef.current ?? editingModuleId
    if (id == null || savingModuleRef.current) return
    const raw =
      nameOverride !== undefined && nameOverride !== null
        ? String(nameOverride)
        : (moduleNameInputRef.current?.value ?? editingName)
    const trimmed = raw.trim()
    if (!trimmed) {
      cancelEditModule()
      return
    }
    savingModuleRef.current = true
    Promise.resolve(updateModule(id, trimmed))
      .then((result) => {
        if (result != null) refreshModules()
        else alert('无法保存模组名称，请刷新页面后重试')
        cancelEditModule()
      })
      .catch((e) => {
        console.warn(e)
        const msg = e?.message || e?.error_description || String(e)
        alert(msg ? `保存失败：${msg}` : '保存失败，请检查网络与 Supabase 配置')
      })
      .finally(() => {
        savingModuleRef.current = false
      })
  }

  const handleDragStart = (e, index) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(index))
  }
  const handleDragOver = (e) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }
  const handleDrop = (e, dropIndex) => {
    e.preventDefault()
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10)
    if (Number.isNaN(fromIndex) || fromIndex === dropIndex) return
    const next = [...moduleCounts]
    const [removed] = next.splice(fromIndex, 1)
    next.splice(dropIndex, 0, removed)
    Promise.resolve(reorderModules(next.map(({ id, name }) => ({ id, name })))).then(() => refreshModules())
  }
  const formatDateTime = (iso) => {
    if (!iso) return '—'
    const d = new Date(iso)
    return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }

  const handleOpenRestore = async (e, m) => {
    e.stopPropagation()
    setRestoreModuleId(m.id)
    setLoadingSnapshots(true)
    setSnapshotList([])
    try {
      const list = await listSnapshots(m.id)
      setSnapshotList(list)
    } catch (err) {
      console.warn('加载快照失败', err)
      alert('加载快照失败：' + (err?.message || String(err)))
      setRestoreModuleId(null)
    } finally {
      setLoadingSnapshots(false)
    }
  }

  const handleRestore = async (snapshotId) => {
    if (restoringId) return
    if (!confirm('确定从此快照恢复？当前数据会先备份一份，然后被快照数据覆盖。')) return
    setRestoringId(snapshotId)
    try {
      const result = await restoreFromSnapshot(snapshotId)
      if (result.success) {
        alert('恢复成功！页面数据已更新，可以浏览角色。')
        setRestoreModuleId(null)
      } else {
        alert('恢复失败：' + (result.error || '未知错误'))
      }
    } catch (err) {
      alert('恢复出错：' + (err?.message || String(err)))
    } finally {
      setRestoringId(null)
    }
  }

  const handleSnapshot = async (e, m) => {
    e.stopPropagation()
    if (snapshottingId) return
    setSnapshottingId(m.id)
    try {
      await saveManualSnapshot(m.id)
    } catch (err) {
      console.warn('快照保存失败', err)
      alert('快照保存失败：' + (err?.message || String(err)))
    } finally {
      setSnapshottingId(null)
    }
  }

  useEffect(() => {
    if (location.pathname !== '/characters') return
    const t = window.setTimeout(() => {
      const el = document.getElementById('my-characters-section')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 80)
    return () => window.clearTimeout(t)
  }, [location.pathname])

  return (
    <div className="p-4 pb-24 min-h-screen" style={{ backgroundColor: 'var(--page-bg)' }}>
      <h1 className="font-display text-xl font-semibold text-white mb-4 section-title">
        欢迎，玩家 {user?.name}
      </h1>

      {isSupabaseEnabled() && (
        <section className="mb-6 rounded-xl border border-white/10 bg-gradient-to-b from-[#2a3952]/24 to-[#222f45]/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] overflow-hidden">
          <div className="px-4 py-2 border-b border-white/10 bg-black/15">
            <h2 className="text-dnd-gold-light text-xs font-bold uppercase tracking-wider">团队动态</h2>
            <p className="text-dnd-text-muted text-[10px] mt-0.5">仓库、背包等操作会记录在此（需已执行 supabase-activity-log.sql）</p>
          </div>
          <ul className="max-h-52 overflow-y-auto divide-y divide-white/5">
            {activities.length === 0 ? (
              <li className="px-4 py-3 text-dnd-text-muted text-sm">暂无记录。仓库/背包流转与制作完成后会出现在这里。</li>
            ) : (
              activities.map((a) => (
                <li key={a.id} className="px-4 py-2.5 text-sm">
                  <span className="text-dnd-text-muted text-xs font-mono tabular-nums">{formatDateTime(a.created_at)}</span>
                  <p className="text-dnd-text-body mt-0.5 leading-snug">{a.summary}</p>
                  <p className="text-[10px] text-dnd-text-muted mt-0.5">
                    模组 {modules.find((m) => m.id === a.module_id)?.name || a.module_id}
                  </p>
                </li>
              ))
            )}
          </ul>
        </section>
      )}

      <div id="my-characters-section" className="scroll-mt-4">
      <h2 className="section-subtitle mb-3">
        模组
      </h2>
      <div className="space-y-3">
        {moduleCounts.map((m, index) => {
          const isExpanded = expandedModuleIds.has(m.id)
          const isEditing = editingModuleId === m.id
          const charList = getAllCharacters(m.id)
          const defaultCharId = getDefaultCharacterId(user?.name, m.id)
          return (
            <div
              key={m.id}
              draggable={!isEditing}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
              className="rounded-xl border border-white/10 bg-gradient-to-b from-[#2a3952]/24 to-[#222f45]/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
            >
              <div
                role="button"
                tabIndex={0}
                onClick={() => !isEditing && toggleExpand(m.id)}
                onKeyDown={(e) => e.key === 'Enter' && !isEditing && toggleExpand(m.id)}
                className={`flex items-center justify-between gap-3 p-4 text-left transition-colors cursor-pointer hover:bg-[#24344d]/55 ${
                  isExpanded ? 'border-l border-l-dnd-gold/50 bg-[#1b2536]/70' : ''
                }`}
              >
                <div className="flex items-center gap-2 shrink-0">
                  {!isEditing && (
                    <span className="cursor-grab active:cursor-grabbing text-dnd-text-muted hover:text-dnd-gold-light" title="拖动排序" onClick={(e) => e.stopPropagation()}>
                      <DragHandleIcon className="w-5 h-5" />
                    </span>
                  )}
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-black/30 border border-white/10">
                    <BookOpen className="w-5 h-5 text-dnd-gold-light" />
                  </span>
                </div>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="min-w-0 flex-1">
                    {isEditing ? (
                      <div
                        className="relative z-20 flex flex-wrap items-center gap-2 py-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          ref={moduleNameInputRef}
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => {
                            e.stopPropagation()
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              saveEditModule(e.currentTarget.value, m.id)
                            }
                            if (e.key === 'Escape') cancelEditModule()
                          }}
                          className={inputClass + ' flex-1 min-w-[8rem] h-9 text-sm font-semibold touch-manipulation'}
                          autoFocus
                        />
                        {/* 勿对按钮 mousedown preventDefault，否则会阻止 click（尤其手机浏览器），表现为点保存没反应 */}
                        <button
                          type="button"
                          data-module-save="1"
                          onClick={(e) => {
                            e.stopPropagation()
                            saveEditModule(moduleNameInputRef.current?.value, m.id)
                          }}
                          className="shrink-0 min-h-9 min-w-[4.5rem] px-3 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white text-xs font-bold touch-manipulation"
                        >
                          保存
                        </button>
                        <button
                          type="button"
                          data-module-cancel="1"
                          onClick={(e) => {
                            e.stopPropagation()
                            cancelEditModule()
                          }}
                          className="shrink-0 min-h-9 min-w-[4.5rem] px-3 rounded-lg bg-gray-600 hover:bg-gray-500 text-white text-xs touch-manipulation"
                        >
                          取消
                        </button>
                        <p className="w-full text-[10px] text-dnd-text-muted">点「保存」或按回车生效</p>
                      </div>
                    ) : (
                      <p className="font-semibold text-white truncate flex items-center gap-1.5">
                        {m.name}
                        {defaultCharId && (
                          <Star className="w-4 h-4 text-dnd-gold-light shrink-0" fill="currentColor" title="已设常用角色" />
                        )}
                      </p>
                    )}
                    <p className="text-dnd-text-muted text-sm">{m.count} 个角色</p>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 shrink-0">
                  {!isEditing && (
                    <>
                      <button
                        type="button"
                        onClick={(e) => handleOpenRestore(e, m)}
                        title="从快照恢复数据"
                        className="p-1.5 rounded-lg text-dnd-text-muted hover:text-blue-400 hover:bg-blue-500/15 transition-colors"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                      {isAdmin && (
                        <button
                        type="button"
                        onClick={(e) => handleSnapshot(e, m)}
                        title={snapshottingId === m.id ? '正在保存快照...' : '保存数据快照'}
                        disabled={snapshottingId === m.id}
                        className="p-1.5 rounded-lg text-dnd-text-muted hover:text-emerald-400 hover:bg-emerald-500/15 transition-colors disabled:opacity-50"
                      >
                        <Save className="w-4 h-4" />
                      </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => startEditModule(e, m)}
                        title="编辑模组名"
                        className="p-1.5 rounded-lg text-dnd-text-muted hover:text-dnd-gold-light hover:bg-white/10 transition-colors"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      {moduleCounts.length > 1 && m.id !== 'default' && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteModule(e, m)}
                          title="删除模组"
                          className="p-1.5 rounded-lg text-dnd-text-muted hover:text-red-400 hover:bg-red-500/15 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}
                  {isExpanded ? (
                    <ChevronDown className="w-5 h-5 text-dnd-text-muted" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-dnd-text-muted" />
                  )}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t border-white/10 bg-[#1a2435]/45">
                  {/* 存档面板 */}
                  {isAdmin && (
                    <div className="px-4 py-3 border-b border-white/5">
                      <ModuleArchivePanel moduleId={m.id} moduleName={m.name} isAdmin={isAdmin} />
                    </div>
                  )}
                  {charList.length === 0 ? (
                    <div className="px-4 py-4 flex flex-col gap-3">
                      <p className="text-dnd-text-muted text-sm">该模组暂无角色。</p>
                      <Link
                        to={`/characters/new?moduleId=${encodeURIComponent(m.id)}`}
                        onClick={() => setCurrentModuleId(m.id)}
                        className="inline-flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-medium text-sm transition-colors w-fit"
                      >
                        <Plus className="w-4 h-4" />
                        新增角色
                      </Link>
                    </div>
                  ) : (
                    <div className="px-2 pb-3 pt-2">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
                        <p className="text-[11px] text-dnd-text-muted">
                          共 <span className="text-dnd-gold-light/90 font-medium tabular-nums">{charList.length}</span> 个角色 · 归属、分组、模组说明等均在下方列表中操作
                        </p>
                        <Link
                          to={`/characters/new?moduleId=${encodeURIComponent(m.id)}`}
                          onClick={() => setCurrentModuleId(m.id)}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-dnd-red/90 hover:bg-dnd-red px-3 py-1.5 text-white text-xs font-medium"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          新增角色
                        </Link>
                      </div>
                      <Characters embedded embeddedModuleId={m.id} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      </div>

      <div className="mt-6">
        {showAddModule ? (
          <div className="rounded-xl bg-dnd-card border border-dashed border-gray-500 p-4 flex flex-col gap-2">
            <input
              type="text"
              value={newModuleName}
              onChange={(e) => setNewModuleName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAddModule()}
              placeholder="新模组名称"
              className={inputClass + ' w-full h-10 text-sm'}
              autoFocus
            />
            <div className="flex gap-2">
              <button type="button" onClick={() => { setShowAddModule(false); setNewModuleName(''); }} className="flex-1 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white text-sm">
                取消
              </button>
              <button type="button" onClick={handleAddModule} className="flex-1 py-2 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white text-sm font-medium">
                添加
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowAddModule(true)}
            className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-500 bg-dnd-card/50 p-4 text-dnd-text-muted hover:border-gray-400 hover:text-white transition-colors"
          >
            <Plus className="w-5 h-5" />
            <span className="text-sm font-medium">新建模组</span>
          </button>
        )}
      </div>

      {/* 快照恢复弹窗 -- 注意：作为 portal 用 fixed 定位，在最外层div内 */}
      {restoreModuleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4" onClick={() => setRestoreModuleId(null)}>
          <div className="w-full max-w-md rounded-xl bg-gray-900 border border-white/15 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-white font-semibold text-sm">从快照恢复数据</h3>
              <button type="button" onClick={() => setRestoreModuleId(null)} className="p-1 rounded text-gray-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-4 py-3 max-h-96 overflow-y-auto">
              {loadingSnapshots ? (
                <p className="text-dnd-text-muted text-sm py-4 text-center">加载中...</p>
              ) : snapshotList.length === 0 ? (
                <p className="text-dnd-text-muted text-sm py-4 text-center">该模组暂无本地快照</p>
              ) : (
                <ul className="space-y-2">
                  {snapshotList.map((snap) => (
                    <li key={snap.id} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-white text-sm font-medium truncate">{snap.label}</p>
                        <p className="text-dnd-text-muted text-xs mt-0.5">{snap.type === 'auto' ? '自动备份' : '手动备份'} · {new Date(snap.timestamp).toLocaleString('zh-CN')}</p>
                      </div>
                      <button
                        type="button"
                        disabled={!!restoringId}
                        onClick={() => handleRestore(snap.id)}
                        className="shrink-0 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-medium transition-colors"
                      >
                        {restoringId === snap.id ? '恢复中...' : '恢复'}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="px-4 py-3 border-t border-white/10">
              <p className="text-dnd-text-muted text-xs">恢复前会自动保存当前状态。恢复后刷新页面可看到最新数据。</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
