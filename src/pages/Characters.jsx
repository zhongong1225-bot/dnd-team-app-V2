import { useState, useEffect, useMemo, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, User, Star, Trash2, Copy, ChevronDown, ChevronRight, Unlink, Layers } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useModule } from '../contexts/ModuleContext'
import { getModules } from '../lib/moduleStore'
import { getCharacters, getCharactersInModule, loadCharactersInModule, getDefaultCharacterId, setDefaultCharacterId, deleteCharacter, duplicateCharacter, updateCharacter } from '../lib/characterStore'
import { isSupabaseEnabled } from '../lib/supabase'

function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }) + ' ' + d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
}
import { getClassDisplayName } from '../data/classDatabase'
import { levelFromXP } from '../lib/xp5e'

/** 角色等级显示：优先经验换算，否则职业等级之和 */
function displayLevel(c) {
  const xp = Number(c.xp)
  if (xp > 0) return levelFromXP(xp)
  const main = Math.max(1, Math.min(20, Number(c.classLevel) ?? 1))
  const multi = Array.isArray(c.multiclass) ? c.multiclass.reduce((s, m) => s + (Number(m?.level) || 0), 0) : 0
  const prestige = Array.isArray(c.prestige) ? c.prestige.reduce((s, p) => s + (Number(p?.level) || 0), 0) : 0
  return Math.max(1, Math.min(20, main + multi + prestige))
}

/** 职业与等级简述，如 "战士 5" 或 "战士 5 / 法师 3"（邪术师显示为魔契师） */
function displayClassLevel(c) {
  const parts = []
  if (c.class) {
    const mainLevel = Math.max(0, Math.min(20, Number(c.classLevel) ?? 1))
    const sub = c.subclass ? `（${c.subclass}）` : ''
    parts.push(`${getClassDisplayName(c.class)}${sub} ${mainLevel}`)
  }
  if (Array.isArray(c.multiclass) && c.multiclass.length) {
    c.multiclass.forEach((m) => {
      if (m?.['class']) {
        const sub = m.subclass ? `（${m.subclass}）` : ''
        parts.push(`${getClassDisplayName(m['class'])}${sub} ${Math.max(0, Number(m.level) || 0)}`)
      }
    })
  }
  if (Array.isArray(c.prestige) && c.prestige.length) {
    c.prestige.forEach((p) => {
      if (p?.['class']) parts.push(`${getClassDisplayName(p['class'])} ${Math.max(0, Number(p.level) || 0)}`)
    })
  }
  if (parts.length === 0) return '—'
  return parts.join(' / ')
}

function moduleLabel(moduleId) {
  const m = getModules().find((x) => x.id === moduleId)
  return m?.name || moduleId || 'default'
}

function sortByUpdatedDesc(a, b) {
  return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)
}

function buildTreeMaps(list) {
  const byId = new Map(list.map((c) => [c.id, c]))
  const childrenByParent = {}
  list.forEach((c) => {
    if (!c.parentId) return
    if (!childrenByParent[c.parentId]) childrenByParent[c.parentId] = []
    childrenByParent[c.parentId].push(c)
  })
  Object.keys(childrenByParent).forEach((pid) => {
    childrenByParent[pid].sort(sortByUpdatedDesc)
  })
  const roots = list
    .filter((c) => !c.parentId || !byId.has(c.parentId))
    .sort(sortByUpdatedDesc)
  return { byId, childrenByParent, roots }
}

export default function Characters({ embedded = false, embeddedModuleId = null }) {
  const { user, isAdmin } = useAuth()
  const { currentModuleId } = useModule()
  const navigate = useNavigate()
  const [list, setList] = useState([])
  /** 管理员：false=看全服全部模组角色，true=只看当前模组 */
  const [adminModuleOnly, setAdminModuleOnly] = useState(false)
  const dataModuleId = embeddedModuleId || currentModuleId
  const defaultId = user?.name ? getDefaultCharacterId(user.name, dataModuleId) : null

  const refresh = () => {
    if (embeddedModuleId) {
      setList(getCharactersInModule(embeddedModuleId))
      return
    }
    if (isAdmin && !adminModuleOnly) {
      setList(getCharacters(user?.name, true, null))
    } else {
      setList(getCharactersInModule(currentModuleId))
    }
  }

  useEffect(() => {
    if (embeddedModuleId) {
      if (isSupabaseEnabled() && user?.name && embeddedModuleId) {
        loadCharactersInModule(embeddedModuleId).then(refresh)
      } else {
        refresh()
      }
      return
    }
    if (isSupabaseEnabled() && user?.name && currentModuleId && !(isAdmin && !adminModuleOnly)) {
      loadCharactersInModule(currentModuleId).then(refresh)
    } else {
      refresh()
    }
  }, [user?.name, isAdmin, currentModuleId, adminModuleOnly, embeddedModuleId])

  useEffect(() => {
    const h = () => refresh()
    window.addEventListener('dnd-realtime-characters', h)
    return () => window.removeEventListener('dnd-realtime-characters', h)
  }, [user?.name, isAdmin, currentModuleId, adminModuleOnly, embeddedModuleId])

  const handleSetDefault = (e, c) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user?.name) return
    const isCurrent = defaultId === c.id
    setDefaultCharacterId(user.name, isCurrent ? null : c.id, dataModuleId)
    refresh()
  }

  const handleDelete = (e, c) => {
    e.preventDefault()
    e.stopPropagation()
    if (!window.confirm(`确定要删除角色「${c.name || '未命名'}」吗？此操作不可恢复。`)) return
    deleteCharacter(c.id)
    refresh()
    if (defaultId === c.id) setDefaultCharacterId(user?.name, null, dataModuleId)
  }

  const handleDuplicate = (e, c) => {
    e.preventDefault()
    e.stopPropagation()
    const copyOrP = duplicateCharacter(c.id)
    const done = (copy) => {
      if (copy) {
        refresh()
        navigate(`/characters/${copy.id}`)
      }
    }
    if (copyOrP && typeof copyOrP.then === 'function') copyOrP.then(done)
    else done(copyOrP)
  }

  const [compactSubs, setCompactSubs] = useState(true)

  const [assigningSubId, setAssigningSubId] = useState(null)
  const [assignSearch, setAssignSearch] = useState('')
  const [groupingSubId, setGroupingSubId] = useState(null)
  const [groupDraftName, setGroupDraftName] = useState('')
  const [openActionId, setOpenActionId] = useState(null)
  const actionMenuRef = useRef(null)
  const [collapsedGroups, setCollapsedGroups] = useState(() => new Set())
  const [undoAction, setUndoAction] = useState(null)
  const [undoTimer, setUndoTimer] = useState(null)
  const { childrenByParent, roots } = useMemo(() => buildTreeMaps(list), [list])
  const moduleOrder = useMemo(() => getModules().map((m) => m.id), [list])

  useEffect(() => {
    if (!openActionId) return
    const onPointerDown = (e) => {
      if (actionMenuRef.current && !actionMenuRef.current.contains(e.target)) {
        setOpenActionId(null)
      }
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpenActionId(null)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [openActionId])

  const getSubGroups = (parent) => {
    const arr = Array.isArray(parent?.subordinateGroups) ? parent.subordinateGroups : []
    return arr
      .filter((g) => g && typeof g === 'object')
      .map((g) => ({ id: String(g.id || '').trim(), name: String(g.name || '').trim() }))
      .filter((g) => g.id && g.name)
  }

  const saveParentGroups = (parentId, groups) => {
    const next = updateCharacter(parentId, { subordinateGroups: groups })
    if (next && typeof next.then === 'function') next.then(() => { refresh(); window.dispatchEvent(new CustomEvent('dnd-realtime-characters')) })
    else { refresh(); window.dispatchEvent(new CustomEvent('dnd-realtime-characters')) }
  }

  /** 「未分组」区域显示名（存 subordinateUngroupedLabel，默认 未分组） */
  const getUngroupedLabel = (parent) => {
    if (!parent) return '未分组'
    const s = parent.subordinateUngroupedLabel
    const t = s != null && String(s).trim()
    return t || '未分组'
  }

  const addGroupToParent = (parent, name) => {
    const n = String(name || '').trim()
    if (!parent || !n) return null
    const groups = getSubGroups(parent)
    if (groups.some((g) => g.name === n)) return groups.find((g) => g.name === n)
    if (n === getUngroupedLabel(parent)) {
      window.alert('与「未分组」区域显示名重名')
      return null
    }
    const id = `grp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const nextGroups = [...groups, { id, name: n }]
    saveParentGroups(parent.id, nextGroups)
    return { id, name: n }
  }

  /** 直接改名（用于输入框）；成功返回 true，失败返回 false 且不保存 */
  const renameGroupWithName = (parent, groupId, newName) => {
    if (!parent || !groupId) return false
    const n = String(newName ?? '').trim()
    const groups = getSubGroups(parent)
    const target = groups.find((g) => g.id === groupId)
    if (!target) return false
    if (n === target.name) return true
    if (!n) return false
    if (groups.some((g) => g.id !== groupId && g.name === n)) {
      window.alert('已存在同名分组')
      return false
    }
    if (n === getUngroupedLabel(parent)) {
      window.alert('与「未分组」区域显示名重名')
      return false
    }
    const nextGroups = groups.map((g) => (g.id === groupId ? { ...g, name: n } : g))
    saveParentGroups(parent.id, nextGroups)
    return true
  }

  const saveUngroupedLabel = (parent, newName) => {
    if (!parent) return false
    const groups = getSubGroups(parent)
    const n = String(newName ?? '').trim()
    const current = getUngroupedLabel(parent)
    if (n === current) return true
    if (!n) {
      const next = updateCharacter(parent.id, { subordinateUngroupedLabel: undefined })
      if (next && typeof next.then === 'function') next.then(() => { refresh(); window.dispatchEvent(new CustomEvent('dnd-realtime-characters')) })
      else { refresh(); window.dispatchEvent(new CustomEvent('dnd-realtime-characters')) }
      return true
    }
    if (groups.some((g) => g.name === n)) {
      window.alert('与已有分组重名')
      return false
    }
    const next = updateCharacter(parent.id, { subordinateUngroupedLabel: n })
    if (next && typeof next.then === 'function') next.then(() => { refresh(); window.dispatchEvent(new CustomEvent('dnd-realtime-characters')) })
    else { refresh(); window.dispatchEvent(new CustomEvent('dnd-realtime-characters')) }
    return true
  }

  const groupNameInputClass =
    'min-w-[4.5rem] max-w-[12rem] px-2.5 py-0.5 rounded text-[10px] border border-white/15 bg-[#1a2438]/90 text-gray-200 placeholder:text-gray-500 focus:border-dnd-gold/50 focus:outline-none focus:ring-1 focus:ring-dnd-gold/25 disabled:opacity-50 disabled:cursor-not-allowed'

  const setSubGroup = (sub, groupId) => {
    if (!sub) return
    const next = updateCharacter(sub.id, { subordinateGroupId: groupId || undefined })
    if (next && typeof next.then === 'function') next.then(() => { refresh(); window.dispatchEvent(new CustomEvent('dnd-realtime-characters')) })
    else { refresh(); window.dispatchEvent(new CustomEvent('dnd-realtime-characters')) }
  }
  const toggleGroupCollapse = (parentId, groupId) => {
    const key = `${parentId}::${groupId}`
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const pushUndo = (payload) => {
    if (undoTimer) clearTimeout(undoTimer)
    setUndoAction(payload)
    const t = setTimeout(() => setUndoAction(null), 5000)
    setUndoTimer(t)
  }

  const applyAttach = (sub, targetMain) => {
    if (!sub || !targetMain || sub.id === targetMain.id) return
    const canEditSub = isAdmin || sub.owner === user?.name
    if (!canEditSub) return
    const prevParentId = sub.parentId
    const next = updateCharacter(sub.id, {
      parentId: targetMain.id,
      cardType: 'subordinate',
      subordinateTemplate: sub.subordinateTemplate || 'class',
    })
    const done = () => {
      refresh()
      window.dispatchEvent(new CustomEvent('dnd-realtime-characters'))
      pushUndo({
        label: `已将「${sub.codename || sub.name || '未命名'}」归属到「${targetMain.codename || targetMain.name || '未命名'}」`,
        rollback: () => {
          const prev = updateCharacter(sub.id, {
            parentId: prevParentId || undefined,
            cardType: prevParentId ? 'subordinate' : 'main',
            subordinateTemplate: prevParentId ? (sub.subordinateTemplate || 'class') : undefined,
          })
          if (prev && typeof prev.then === 'function') prev.then(() => { refresh(); window.dispatchEvent(new CustomEvent('dnd-realtime-characters')) })
          else { refresh(); window.dispatchEvent(new CustomEvent('dnd-realtime-characters')) }
        },
      })
    }
    if (next && typeof next.then === 'function') next.then(done)
    else done()
  }

  const applyUnattach = (sub) => {
    if (!sub?.parentId) return
    const canEditSub = isAdmin || sub.owner === user?.name
    if (!canEditSub) return
    const prevParentId = sub.parentId
    const next = updateCharacter(sub.id, { parentId: undefined, cardType: 'main', subordinateTemplate: undefined })
    const done = () => {
      refresh()
      window.dispatchEvent(new CustomEvent('dnd-realtime-characters'))
      pushUndo({
        label: `已解除「${sub.codename || sub.name || '未命名'}」的归属`,
        rollback: () => {
          const prev = updateCharacter(sub.id, {
            parentId: prevParentId,
            cardType: 'subordinate',
            subordinateTemplate: sub.subordinateTemplate || 'class',
          })
          if (prev && typeof prev.then === 'function') prev.then(() => { refresh(); window.dispatchEvent(new CustomEvent('dnd-realtime-characters')) })
          else { refresh(); window.dispatchEvent(new CustomEvent('dnd-realtime-characters')) }
        },
      })
    }
    if (next && typeof next.then === 'function') next.then(done)
    else done()
  }

  const handleUndo = () => {
    if (!undoAction?.rollback) return
    if (undoTimer) clearTimeout(undoTimer)
    setUndoTimer(null)
    const rb = undoAction.rollback
    setUndoAction(null)
    rb()
  }

  return (
    <div
      className={embedded ? '' : 'p-4 pb-24 min-h-screen'}
      style={embedded ? undefined : { backgroundColor: 'var(--page-bg)' }}
    >
      {!embedded && (
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-xl font-semibold text-white">
              {isAdmin && !adminModuleOnly ? '全部角色（管理员）' : '我的角色'}
            </h1>
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => setAdminModuleOnly(false)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${!adminModuleOnly ? 'bg-dnd-gold-light/25 text-dnd-gold-light' : 'bg-white/10 text-dnd-text-muted hover:text-white'}`}
                >
                  查看全部玩家 · 全部模组
                </button>
                <button
                  type="button"
                  onClick={() => setAdminModuleOnly(true)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${adminModuleOnly ? 'bg-dnd-gold-light/25 text-dnd-gold-light' : 'bg-white/10 text-dnd-text-muted hover:text-white'}`}
                >
                  仅当前模组
                </button>
                <span className="text-dnd-text-muted text-xs">（与顶部选中的模组一致）</span>
              </>
            )}
            <button
              type="button"
              onClick={() => setCompactSubs((v) => !v)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${compactSubs ? 'bg-dnd-gold-light/25 text-dnd-gold-light' : 'bg-white/10 text-dnd-text-muted hover:text-white'}`}
              title="切换附属卡紧凑显示"
            >
              附属紧凑视图
            </button>
      </div>
          <Link
            to="/characters/new"
            className="flex shrink-0 items-center gap-2 py-2 px-4 rounded-lg bg-dnd-red hover:bg-dnd-red-hover text-white font-medium uppercase text-xs tracking-label transition-colors"
          >
            <Plus className="w-5 h-5" />
            新角色
          </Link>
        </div>
      )}

      {list.length === 0 ? (
        <div className="rounded-xl bg-dnd-card border border-white/10 shadow-dnd-card p-6 text-center">
          <p className="text-dnd-text-muted text-base">
            {isAdmin ? (adminModuleOnly ? '当前模组下暂无角色。' : '数据库中暂无任何角色。') : '你还没有角色，点击「新角色」创建第一张角色卡。'}
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-2.5">
          {(() => {
            const renderNode = (c, depth = 0) => {
              const children = childrenByParent[c.id] || []
              const hasSubs = children.length > 0
              const isSubordinate = depth > 0
              const compactSubordinate = isSubordinate && compactSubs
              const hp = c.hp || {}
              const max = hp.max || 1
              const cur = hp.current ?? 0
              const pct = Math.max(0, Math.min(100, (cur / max) * 100))
              const isLowHp = max > 0 && pct < 25
              const isMidHp = max > 0 && pct >= 25 && pct < 50
              const barColor = isLowHp ? 'bg-dnd-red' : isMidHp ? 'bg-dnd-warning' : 'bg-dnd-success'
              const level = displayLevel(c)
              const classLevelText = displayClassLevel(c)
              const isDefault = defaultId === c.id
              const canEdit = isAdmin || c.owner === user?.name
              const groups = getSubGroups(c)
              const groupedChildren = (() => {
                if (!hasSubs) return []
                const byGroup = new Map()
                const ungrouped = []
                children.forEach((ch) => {
                  const gid = ch.subordinateGroupId
                  if (!gid || !groups.some((g) => g.id === gid)) {
                    ungrouped.push(ch)
                    return
                  }
                  if (!byGroup.has(gid)) byGroup.set(gid, [])
                  byGroup.get(gid).push(ch)
                })
                const out = []
                if (ungrouped.length) out.push({ id: 'ungrouped', name: getUngroupedLabel(c), items: ungrouped })
                groups.forEach((g) => {
                  const items = byGroup.get(g.id) || []
                  if (items.length) out.push({ id: g.id, name: g.name, items })
                })
                return out
              })()

              const totalTemp = Math.max(hp.temp || 0, hp.buffTemp || 0)
              const hpLine = (
                <p
                  className={`font-mono font-semibold shrink-0 tabular-nums ${compactSubordinate ? 'text-[10px]' : isSubordinate ? 'text-[10px]' : 'text-xs'} ${isLowHp ? 'text-dnd-red' : 'text-dnd-text-muted'}`}
                  title={`生命值 ${cur}/${max}${totalTemp ? `，临时 ${totalTemp}` : ''}`}
                >
                  HP {cur}/{max}
                  {totalTemp ? ` +${totalTemp} 临时` : ''}
                </p>
              )
              const summaryBlock = (
                <>
                  <div className="min-w-0 flex-1">
                    {compactSubordinate ? (
                      <>
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          <p className="font-semibold text-white truncate flex-1 min-w-0 text-[11px]">
                            {c.codename || c.name || '未命名'}
                          </p>
                          {hpLine}
                        </div>
                        {c.codename ? (
                          <p className="text-dnd-text-muted text-[10px] truncate mt-0.5">{c.name || '未命名'}</p>
                        ) : null}
                      </>
                    ) : isSubordinate ? (
                      <>
                        <div className="flex items-center justify-between gap-2 min-w-0">
                          {c.codename ? (
                            <p className="font-semibold text-white truncate flex-1 min-w-0 text-xs">{c.codename}</p>
                          ) : (
                            <p className="text-dnd-text-muted text-[11px] truncate flex-1 min-w-0">{c.name || '未命名'}</p>
                          )}
                          {hpLine}
                        </div>
                        {c.codename ? (
                          <p className="text-dnd-text-muted text-[11px] truncate min-w-0 mt-0.5">{c.name || '未命名'}</p>
                        ) : null}
                        <div className={`rounded-full bg-black/30 overflow-hidden mt-1 h-1`}>
                          <div
                            className={`h-full rounded-full transition-all ${barColor}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-dnd-text-muted truncate min-w-0 text-[10px] mt-0.5">
                          {isAdmin && !adminModuleOnly ? (
                            <>
                              玩家 <span className="text-dnd-gold-light/90 font-medium">{c.owner ?? '—'}</span>
                              {' · 模组 '}
                              <span className="text-emerald-400/90">{moduleLabel(c.moduleId)}</span>
                              {' · 修改 '}
                              {formatDateTime(c.updatedAt ?? c.createdAt)}
                            </>
                          ) : (
                            <>创建 {c.owner ?? '—'} · 修改 {formatDateTime(c.updatedAt ?? c.createdAt)}</>
                          )}
                        </p>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2 min-w-0 mb-0.5">
                          {c.codename ? (
                            <p className="font-semibold text-white truncate flex-1 min-w-0 text-[15px]">{c.codename}</p>
                          ) : (
                            <p className="text-[11px] text-dnd-text-muted truncate flex-1 min-w-0">{c.name || '未命名'}</p>
                          )}
                          {hpLine}
                        </div>
                        {c.codename ? (
                          <>
                            <p className="text-[11px] text-dnd-text-muted truncate">{c.name || '未命名'}</p>
                            <p className="text-dnd-text-muted text-[13px]">
                              {classLevelText} · 等级 {level}
                            </p>
                          </>
                        ) : (
                          <p className="text-dnd-text-muted text-[13px]">
                            {classLevelText} · 等级 {level}
                          </p>
                        )}
                        <div className="rounded-full bg-black/30 overflow-hidden mt-1 h-1.5">
                          <div
                            className={`h-full rounded-full transition-all ${barColor}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-dnd-text-muted truncate min-w-0 text-xs mt-0.5">
                          {isAdmin && !adminModuleOnly ? (
                            <>
                              玩家 <span className="text-dnd-gold-light/90 font-medium">{c.owner ?? '—'}</span>
                              {' · 模组 '}
                              <span className="text-emerald-400/90">{moduleLabel(c.moduleId)}</span>
                              {' · 修改 '}
                              {formatDateTime(c.updatedAt ?? c.createdAt)}
                            </>
                          ) : (
                            <>创建 {c.owner ?? '—'} · 修改 {formatDateTime(c.updatedAt ?? c.createdAt)}</>
                          )}
                        </p>
                      </>
                    )}
                  </div>
                </>
              )
              const rowToolbar = (
                <>
                  {!isSubordinate && (
                    <div className="relative shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-black/30 border border-white/10">
                      <Link to={`/characters/${c.id}`} className="absolute inset-0 block" onClick={(e) => e.stopPropagation()} aria-hidden />
                      {c.avatar ? (
                        <img src={c.avatar} alt="" className="absolute inset-0 w-full h-full object-cover object-center" />
                      ) : (
                        <span className="absolute inset-0 flex items-center justify-center">
                          <User className="w-8 h-8 text-dnd-text-muted" />
                        </span>
                      )}
                    </div>
                  )}
                  <Link to={`/characters/${c.id}`} className="flex min-w-0 flex-1 items-center gap-3" onClick={(e) => e.stopPropagation()}>
                    {summaryBlock}
                  </Link>
                  {canEdit && (
                    <div className={`relative flex shrink-0 items-center gap-1 ${isSubordinate ? 'gap-0.5' : ''}`}>
                      {isSubordinate && !compactSubordinate && (
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setGroupingSubId(c.id); setGroupDraftName('') }}
                          title="设置分组：调整此附属卡所在分组"
                          aria-label="设置分组"
                          className="rounded-lg p-2 text-dnd-gold-light bg-dnd-gold/15 hover:bg-dnd-gold/25 border border-dnd-gold/35 transition-colors"
                        >
                          <Layers className="w-5 h-5" strokeWidth={2} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpenActionId((id) => (id === c.id ? null : c.id)) }}
                        title="更多操作"
                        className={`rounded-lg text-dnd-text-muted hover:text-emerald-400 hover:bg-emerald-400/20 transition-colors ${isSubordinate ? 'p-1.5' : 'p-2'}`}
                      >
                        <span className={isSubordinate ? 'w-4 h-4 inline-flex items-center justify-center text-[14px]' : 'w-5 h-5 inline-flex items-center justify-center text-[16px]'}>⋯</span>
                      </button>
                      {openActionId === c.id && (
                        <div ref={actionMenuRef} className="absolute right-0 top-full mt-1 z-50 rounded-lg border border-white/10 bg-[#1b2738] p-1.5 flex flex-wrap items-center justify-end gap-1 max-w-[min(100vw-1rem,20rem)] shadow-xl">
                          {isSubordinate && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                applyUnattach(c)
                                setOpenActionId(null)
                              }}
                              title="解除归属：将此附属卡从主卡分离"
                              aria-label="解除归属"
                              className="rounded-lg p-1.5 text-gray-300 border border-gray-600 bg-gray-700/50 hover:text-white hover:bg-gray-700 transition-colors"
                            >
                              <Unlink className="w-4 h-4" strokeWidth={2} />
                            </button>
                          )}
                          {(!isSubordinate || !compactSubordinate) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault()
                                e.stopPropagation()
                                setAssigningSubId(c.id)
                                setAssignSearch('')
                                setOpenActionId(null)
                              }}
                              title="选择归属主卡"
                              className="px-2 py-1 rounded-md text-[10px] text-dnd-gold-light bg-dnd-gold/15 hover:bg-dnd-gold/25 border border-dnd-gold/35"
                            >
                              归属
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => { handleDuplicate(e, c); setOpenActionId(null) }}
                            title="复制角色"
                            className={`rounded-lg text-dnd-text-muted hover:text-emerald-400 hover:bg-emerald-400/20 transition-colors ${isSubordinate ? 'p-1.5' : 'p-2'}`}
                          >
                            <Copy className={isSubordinate ? 'w-4 h-4' : 'w-5 h-5'} />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => { handleSetDefault(e, c); setOpenActionId(null) }}
                            title={isDefault ? '取消常用' : '设为常用（我的角色/角色法术默认选此角色）'}
                            className={`rounded-lg transition-colors ${isSubordinate ? 'p-1.5' : 'p-2'} ${isDefault ? 'text-dnd-gold-light bg-dnd-gold-light/20' : 'text-dnd-text-muted hover:text-dnd-gold-light hover:bg-white/10'}`}
                            aria-pressed={isDefault}
                          >
                            <Star className={isSubordinate ? 'w-4 h-4' : 'w-5 h-5'} fill={isDefault ? 'currentColor' : 'none'} strokeWidth={2} />
                          </button>
                          {isSubordinate && (
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); e.stopPropagation(); setGroupingSubId(c.id); setGroupDraftName(''); setOpenActionId(null) }}
                              title="设置分组：调整此附属卡所在分组"
                              aria-label="设置分组"
                              className="rounded-lg p-1.5 text-dnd-gold-light bg-dnd-gold/15 hover:bg-dnd-gold/25 border border-dnd-gold/35 transition-colors"
                            >
                              <Layers className="w-4 h-4" strokeWidth={2} />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={(e) => { handleDelete(e, c); setOpenActionId(null) }}
                            title="删除角色"
                            className={`rounded-lg text-dnd-text-muted hover:text-dnd-red hover:bg-dnd-red/20 transition-colors ${isSubordinate ? 'p-1.5' : 'p-2'}`}
                          >
                            <Trash2 className={isSubordinate ? 'w-4 h-4' : 'w-5 h-5'} />
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )
              const subsSectionHeaderClass = !isSubordinate
                ? 'flex w-full items-center border-t border-white/10 bg-black/25 px-3 py-2.5'
                : 'mt-1.5 ml-1 flex w-full max-w-full items-center rounded-lg border border-white/10 bg-[#141c2a]/80 px-3 py-2'
              const subsDetailBoxClass = !isSubordinate
                ? 'space-y-1 border-t border-white/10 bg-[#0a0f18]/40 px-3 pb-3 pt-2'
                : 'space-y-1 mt-1.5 rounded-lg border border-white/10 bg-black/15 p-2'
              const subsDetailInner = (
                <>
                  {!isSubordinate && (
                    <div className="flex flex-wrap items-center gap-1.5 px-0.5">
                      <span className="text-[10px] text-dnd-text-muted/80">附属分组</span>
                      <button
                        type="button"
                        onClick={() => {
                          const n = window.prompt('新分组名', '')
                          if (n == null) return
                          addGroupToParent(c, n)
                        }}
                        className="px-2 py-0.5 rounded text-[10px] border border-dnd-gold/40 text-dnd-gold-light hover:bg-dnd-gold/15"
                      >
                        + 分组
                      </button>
                      {groups.map((g) => {
                        const cnt = children.filter((x) => x.subordinateGroupId === g.id).length
                        return (
                          <label key={`${c.id}-${g.id}-${g.name}`} className="inline-flex items-center gap-1.5 rounded border border-white/10 bg-black/20 px-1.5 py-0.5">
                            <input
                              type="text"
                              defaultValue={g.name}
                              disabled={!canEdit}
                              title="点击输入分组名"
                              className={groupNameInputClass + ' border-0 bg-transparent !px-1.5 py-0 focus:ring-0'}
                              onBlur={(e) => {
                                const v = e.target.value.trim()
                                if (v === g.name) return
                                if (!v) {
                                  e.target.value = g.name
                                  return
                                }
                                if (!renameGroupWithName(c, g.id, v)) e.target.value = g.name
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur()
                                if (e.key === 'Escape') {
                                  e.currentTarget.value = g.name
                                  e.currentTarget.blur()
                                }
                              }}
                            />
                            <span className="text-[10px] text-dnd-text-muted tabular-nums shrink-0">· {cnt}</span>
                          </label>
                        )
                      })}
                    </div>
                  )}
                  <div className="space-y-1">
                    {(groupedChildren.length ? groupedChildren : [{ id: 'raw', name: '', items: children }]).map((grp) => (
                      <div key={grp.id} className="space-y-1">
                        {grp.name ? (
                          <div className="pl-1 flex items-center gap-1.5 flex-wrap min-w-0">
                            {grp.id !== 'raw' ? (
                              <button
                                type="button"
                                onClick={() => toggleGroupCollapse(c.id, grp.id)}
                                className="shrink-0 p-0.5 rounded text-dnd-gold-light/85 hover:bg-white/10 hover:text-dnd-gold-light"
                                title={collapsedGroups.has(`${c.id}::${grp.id}`) ? '展开' : '收起'}
                              >
                                {collapsedGroups.has(`${c.id}::${grp.id}`) ? (
                                  <ChevronRight className="w-3 h-3" />
                                ) : (
                                  <ChevronDown className="w-3 h-3" />
                                )}
                              </button>
                            ) : null}
                            <input
                              type="text"
                              key={`${c.id}-${grp.id}-${grp.name}`}
                              defaultValue={grp.name}
                              disabled={!canEdit}
                              title={grp.id === 'ungrouped' ? '未分组区域显示名' : '分组名'}
                              className={groupNameInputClass + ' flex-1 min-w-[4.5rem] max-w-full'}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={(e) => {
                                const v = e.target.value.trim()
                                if (v === grp.name) return
                                if (grp.id === 'ungrouped') {
                                  if (!v) {
                                    if (!saveUngroupedLabel(c, '')) e.target.value = grp.name
                                    return
                                  }
                                  if (!saveUngroupedLabel(c, v)) e.target.value = grp.name
                                  return
                                }
                                if (!v) {
                                  e.target.value = grp.name
                                  return
                                }
                                if (!renameGroupWithName(c, grp.id, v)) e.target.value = grp.name
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') e.currentTarget.blur()
                                if (e.key === 'Escape') {
                                  e.currentTarget.value = grp.name
                                  e.currentTarget.blur()
                                }
                              }}
                            />
                            <span className="text-[10px] text-dnd-text-muted tabular-nums shrink-0">
                              （{grp.items.length}）
                            </span>
                          </div>
                        ) : null}
                        {(grp.id !== 'raw' && collapsedGroups.has(`${c.id}::${grp.id}`))
                          ? null
                          : (
                            <div className={depth === 0 ? 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1.5 ml-1' : 'space-y-1'}>
                              {grp.items.map((ch) => (
                                <div key={ch.id} className="min-w-0">
                                  {renderNode(ch, depth + 1)}
                                </div>
                              ))}
                            </div>
                          )}
                      </div>
                    ))}
                  </div>
                </>
              )
              const subsFoldBlock = hasSubs && (
                <>
                  <div className={subsSectionHeaderClass}>
                    <span className="text-xs text-dnd-gold-light/95 font-medium">
                      附属卡
                      <span className="tabular-nums font-normal">（{children.length}）</span>
                    </span>
                  </div>
                  <div className={subsDetailBoxClass}>
                    {subsDetailInner}
                  </div>
                </>
              )
              return (
                <div key={c.id} className={depth > 0 ? (compactSubordinate ? 'mt-0.5' : 'mt-1') : ''} style={{ marginLeft: depth > 1 ? `${(depth - 1) * (compactSubs ? 10 : 14)}px` : 0 }}>
                  {!isSubordinate ? (
                    <div
                      className="flex flex-col rounded-xl shadow-dnd-card transition-shadow bg-dnd-card border border-white/10 hover:shadow-dnd-card-hover"
                    >
                      <div className="flex items-center gap-3 p-3">
                        {rowToolbar}
                      </div>
                      {subsFoldBlock}
                    </div>
                  ) : (
                    <>
                      <div
                        className={`flex items-center gap-3 rounded-xl shadow-dnd-card transition-shadow ${compactSubordinate ? 'p-1.5 gap-1.5' : 'p-2 gap-2'} bg-[#1a2538]/90 border border-white/10 hover:border-dnd-gold/30`}
                      >
                        {rowToolbar}
                      </div>
                      {subsFoldBlock}
                    </>
                  )}
                </div>
              )
            }
            const groupedRoots = new Map()
            roots.forEach((r) => {
              const moduleId = r.moduleId || 'default'
              const arr = groupedRoots.get(moduleId) || []
              arr.push(r)
              groupedRoots.set(moduleId, arr)
            })
            const sortedModuleIds = Array.from(groupedRoots.keys()).sort((a, b) => {
              const ia = moduleOrder.indexOf(a)
              const ib = moduleOrder.indexOf(b)
              if (ia === -1 && ib === -1) return a.localeCompare(b)
              if (ia === -1) return 1
              if (ib === -1) return -1
              return ia - ib
            })

            const moduleIdsToShow = embeddedModuleId
              ? sortedModuleIds.filter((id) => id === embeddedModuleId)
              : sortedModuleIds

            return moduleIdsToShow.map((moduleId) => {
              const moduleRoots = groupedRoots.get(moduleId) || []
              if (embeddedModuleId) {
                return (
                  <li key={moduleId} className="list-none">
                    <div className="space-y-1.5">
                      {moduleRoots.map((r) => (
                        <div key={r.id}>{renderNode(r, 0)}</div>
                      ))}
                    </div>
                  </li>
                )
              }
              return (
                <li key={moduleId} className="rounded-xl border border-white/10 bg-gradient-to-b from-[#2a3952]/20 to-[#222f45]/16">
                  <div className="px-3 py-2 border-b border-white/10 bg-black/20 flex items-center justify-between">
                    <p className="text-dnd-gold-light text-xs font-semibold tracking-wide">模组 · {moduleLabel(moduleId)}</p>
                    <span className="text-[10px] text-dnd-text-muted">{moduleRoots.length} 张主卡</span>
                  </div>
                  <div className="p-2 space-y-1.5">
                    {moduleRoots.map((r) => (
                      <div key={r.id}>{renderNode(r, 0)}</div>
                    ))}
                  </div>
                </li>
              )
            })
          })()}
          </ul>
        </>
      )}
      {assigningSubId && (() => {
        const sub = list.find((x) => x.id === assigningSubId)
        if (!sub) return null
        const mains = list
          .filter((x) => !x.parentId && x.id !== sub.id)
          .filter((x) => {
            const q = assignSearch.trim()
            if (!q) return true
            const s = `${x.codename || ''} ${x.name || ''}`.toLowerCase()
            return s.includes(q.toLowerCase())
          })
          .sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0))
        return (
          <div className="fixed inset-0 z-[120] bg-black/60 flex items-center justify-center p-4" onClick={() => setAssigningSubId(null)}>
            <div className="w-full max-w-md rounded-xl bg-dnd-card border border-white/10 p-3" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm font-semibold text-dnd-gold-light mb-2">选择归属主卡</p>
              <p className="text-xs text-dnd-text-muted mb-2">当前：{sub.codename || sub.name || '未命名'}</p>
              <input
                type="text"
                value={assignSearch}
                onChange={(e) => setAssignSearch(e.target.value)}
                placeholder="搜索主卡名或代号"
                className="w-full h-9 rounded-lg bg-gray-800 border border-gray-600 px-2 text-sm text-white mb-2"
              />
              <div className="max-h-64 overflow-auto space-y-1 pr-1">
                {mains.length === 0 ? (
                  <div className="text-xs text-dnd-text-muted py-4 text-center">没有可归属的主卡</div>
                ) : mains.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { applyAttach(sub, m); setAssigningSubId(null) }}
                    className="w-full text-left px-2 py-2 rounded-lg border border-gray-700 hover:border-dnd-gold/50 hover:bg-white/5"
                  >
                    <p className="text-sm text-white truncate">{m.codename || m.name || '未命名'}</p>
                    <p className="text-[11px] text-dnd-text-muted truncate">{m.name || '—'}</p>
                  </button>
                ))}
              </div>
              <div className="mt-2 flex justify-end">
                <button type="button" onClick={() => setAssigningSubId(null)} className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs text-white">取消</button>
              </div>
            </div>
          </div>
        )
      })()}
      {groupingSubId && (() => {
        const sub = list.find((x) => x.id === groupingSubId)
        if (!sub || !sub.parentId) return null
        const parent = list.find((x) => x.id === sub.parentId)
        if (!parent) return null
        const groups = getSubGroups(parent)
        return (
          <div className="fixed inset-0 z-[125] bg-black/60 flex items-center justify-center p-4" onClick={() => setGroupingSubId(null)}>
            <div className="w-full max-w-md rounded-xl bg-dnd-card border border-white/10 p-3" onClick={(e) => e.stopPropagation()}>
              <p className="text-sm font-semibold text-dnd-gold-light mb-2">设置附属分组</p>
              <p className="text-xs text-dnd-text-muted mb-2">附属：{sub.codename || sub.name || '未命名'}</p>
              <div className="space-y-1.5 max-h-56 overflow-auto pr-1">
                <button
                  type="button"
                  onClick={() => { setSubGroup(sub, undefined); setGroupingSubId(null) }}
                  className={`w-full text-left px-2 py-1.5 rounded border ${!sub.subordinateGroupId ? 'border-dnd-gold/50 bg-dnd-gold/10 text-dnd-gold-light' : 'border-gray-700 text-gray-300 hover:bg-white/5'}`}
                >
                  未分组
                </button>
                {groups.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => { setSubGroup(sub, g.id); setGroupingSubId(null) }}
                    className={`w-full text-left px-2 py-1.5 rounded border ${sub.subordinateGroupId === g.id ? 'border-dnd-gold/50 bg-dnd-gold/10 text-dnd-gold-light' : 'border-gray-700 text-gray-300 hover:bg-white/5'}`}
                  >
                    {g.name}
                  </button>
                ))}
              </div>
              <div className="mt-3 pt-2 border-t border-white/10">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={groupDraftName}
                    onChange={(e) => setGroupDraftName(e.target.value)}
                    placeholder="新分组名"
                    className="flex-1 h-9 rounded-lg bg-gray-800 border border-gray-600 px-2 text-sm text-white"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const g = addGroupToParent(parent, groupDraftName)
                      if (g) {
                        setSubGroup(sub, g.id)
                        setGroupingSubId(null)
                      }
                    }}
                    className="px-3 h-9 rounded-lg bg-dnd-gold/20 text-dnd-gold-light border border-dnd-gold/40 hover:bg-dnd-gold/30 text-xs"
                  >
                    新建并加入
                  </button>
                </div>
              </div>
              <div className="mt-2 flex justify-end">
                <button type="button" onClick={() => setGroupingSubId(null)} className="px-3 py-1.5 rounded-lg bg-gray-700 hover:bg-gray-600 text-xs text-white">关闭</button>
              </div>
            </div>
          </div>
        )
      })()}
      {undoAction && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[130]">
          <div className="rounded-lg border border-dnd-gold/40 bg-gray-900/95 px-3 py-2 shadow-xl flex items-center gap-3">
            <span className="text-xs text-dnd-gold-light">{undoAction.label}</span>
            <button type="button" onClick={handleUndo} className="px-2 py-1 rounded bg-dnd-gold/20 text-dnd-gold-light hover:bg-dnd-gold/30 text-xs">
              撤销
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

