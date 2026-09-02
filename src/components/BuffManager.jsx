import React, { useState, useCallback, useMemo, useRef, useEffect, useLayoutEffect } from 'react'
import { Plus, Pencil, Trash2, ArrowDownToLine, Library, Search, ChevronDown, Minus, Maximize2, Minimize2, Zap } from 'lucide-react'
import { getBuffSummaryLine } from './BuffListItem'
import BuffForm from './BuffForm'
import BuffColumnBoard from './BuffColumnBoard'
import AbilityUseModal from './AbilityUseModal'
import {
  normalizeBuffSourceKindKey,
  getColumnKeyForBuff,
  BUFF_ENTRY_DRAG_MIME,
  BUFF_COLUMN_DRAG_MIME,
  BUFF_SOURCE_KIND_OPTIONS,
} from '../lib/buffSourceKind'
import { dataTransferHasType } from '../lib/dndTransferTypes'
import { formatDurationBrief } from '../lib/durationModel'
import { computeSuppressedEffects } from '../hooks/useBuffCalculator'
import { useModule } from '../contexts/ModuleContext'
import { clearDefaultBuffPatch, buildClassFeatureBuffKey } from '../lib/defaultBuffPatchStore'
import { inputClass } from '../lib/inputStyles'
import { BUFF_TYPES } from '../data/buffTypes'

const STASH_DRAG_MIME = 'application/x-dnd-team-buff-stash'

/** 最外框：与 shadow-dnd-card 同款黑系外投影，但去掉顶部白色 inset（圆角处易看成一圈外发光） */
const BUFF_PANEL_OUTER_SHADOW =
  'shadow-[0_6px_22px_rgba(0,0,0,0.48),0_2px_6px_rgba(0,0,0,0.28),inset_0_-1px_0_rgba(0,0,0,0.22)]'

export default function BuffManager({
  buffs = [],
  cards = [],
  char,
  baseAbilities = {},
  onSave,
  onUseAbility,
  canEdit,
  stashBuffs = [],
  onStashChange,
  onApplyStashTemplate,
  buffColumnOrder,
  referenceData,
  baseReferenceData,
  formulaContext = {},
  sourceNameOptions = [],
  subordinates = [],
  onEditRace,
  onEditBackground,
  charClasses = [],
}) {
  const { moduleLibrary, currentModuleId } = useModule()
  const [formState, setFormState] = useState(null)
  const [useAbilityCard, setUseAbilityCard] = useState(null) // 正在使用的主动卡

  // 包装 setFormState，记录所有调用
  const setFormStateTracked = (value) => {
    console.trace('[BuffManager] setFormState called with:', value)
    setFormState(value)
  }
  const [editorFullscreen, setEditorFullscreen] = useState(false)
  const [showModuleLibrary, setShowModuleLibrary] = useState(false)
  const [importSearch, setImportSearch] = useState('')
  /** null | { template, isDuplicate } */
  const [confirmImport, setConfirmImport] = useState(null)
  /** null | { mode: 'active'|'stash', id: string|null } */
  const [dragOverActive, setDragOverActive] = useState(false)
  const [collapsedGroups, setCollapsedGroups] = useState(new Set())
  const [expandedIds, setExpandedIds] = useState(new Set())

  // ─ 下拉面板基于 BUFF 面板定位 ──
  const panelRef = useRef(null)
  const editorPanelRef = useRef(null)
  const editorOpenTimeRef = useRef(0)
  const [editorPos, setEditorPos] = useState({ top: 0, left: 0, width: 0, maxHeight: 400 })

  useLayoutEffect(() => {
    if (!formState || !panelRef.current) return
    const rect = panelRef.current.getBoundingClientRect()
    const vh = window.innerHeight
    const spaceAbove = rect.top - 16
    const spaceBelow = vh - rect.bottom - 16
    // 优先在面板右侧，空间不够则左侧
    const panelW = Math.min(448, rect.width * 1.2) // 28rem ≈ 448px
    const preferRight = rect.right + panelW + 24 < window.innerWidth
    setEditorPos({
      top: Math.max(16, rect.top),
      left: preferRight ? rect.right + 12 : rect.left - panelW - 12,
      width: panelW,
      maxHeight: Math.max(300, Math.max(spaceAbove, spaceBelow)),
    })
  }, [formState])

  const list = Array.isArray(buffs) ? buffs : []
  const stash = Array.isArray(stashBuffs) ? stashBuffs : []
  const stashEditable = typeof onStashChange === 'function' && typeof onApplyStashTemplate === 'function'
  const showStashSection = stashEditable || stash.length > 0


  const handleAddActive = () => {
    editorOpenTimeRef.current = Date.now()
    setFormStateTracked({ mode: 'active', id: null })
  }

  const handleSaveActive = (buff) => {
    const source = buff.source?.trim() ?? ''
    const isEdit = !!formState?.id
    
    // 查找原始 BUFF 以检查来源类型
    const originalBuff = formState?.id ? list.find((b) => b.id === formState.id) : null
    const isVirtualBuff = originalBuff && (originalBuff.fromItem || originalBuff.fromFeat || originalBuff.fromInvocation || originalBuff.fromFightingStyle || originalBuff.fromClassFeature || originalBuff.fromRace || originalBuff.fromBackground)
    
    // 虚拟 BUFF（职业特性/专长/装备等）不应保存到 character.buffs，直接返回
    if (isVirtualBuff) {
      console.log('[BuffManager] Skipping save for virtual buff:', originalBuff?.source)
      return
    }
    
    const duplicate = source
      ? list.find((b) => b.source?.trim() === source && b.id !== formState?.id)
      : null
    console.log('[BuffManager] handleSaveActive', { isEdit, duplicate: !!duplicate, source, formStateId: formState?.id })
    if (!isEdit && duplicate) {
      // 同名 BUFF 已存在，不重复挂载
      console.log('[BuffManager] Closing editor due to duplicate')
      // setFormStateTracked(null)  // 暂时注释，调试用
      return
    }
    const next = isEdit
      ? list.map((b) => (b.id === formState.id ? { ...buff, id: b.id } : b))
      : [...list, { ...buff, id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }]
    onSave(next)
    // console.log('[BuffManager] Closing editor after save')
    // setFormStateTracked(null)  // 暂时注释，让编辑器保持打开
  }

  const handleEdit = (id) => {
    const b = list.find((x) => x.id === id)
    if (b?.fromItem) return
    // 冒险/临时栏中的 buff 直接打开编辑器（用户可见即可编辑）
    const col = getColumnKeyForBuff(b)
    if (col === 'adventure' || col === 'temporary') {
      if (b) {
        editorOpenTimeRef.current = Date.now()
        setFormStateTracked({ mode: 'active', id })
      }
      return
    }
    if (b?.fromRace) {
      onEditRace?.()
      return
    }
    if (b?.fromBackground) {
      onEditBackground?.()
      return
    }
    if (b) {
      editorOpenTimeRef.current = Date.now()
      setFormStateTracked({ mode: 'active', id })
    }
  }

  const handleDelete = (id) => {
    const b = list.find((x) => x.id === id)
    // 冒险/临时栏中的 buff 直接删除（用户可见即可删除）
    const col = getColumnKeyForBuff(b)
    if (col !== 'adventure' && col !== 'temporary') {
      if (b?.fromItem || b?.fromFeat || b?.fromInvocation || b?.fromFightingStyle || b?.fromRace || b?.fromBackground) return
      // 子职/职业特性 BUFF：清除默认效果补丁，触发重算后自动消失
      if (b?.fromClassFeature) {
        const key = buildClassFeatureBuffKey(b.sourceClass, b.sourceSubclass, b.featureId)
        clearDefaultBuffPatch(currentModuleId, 'classFeature', key)
        return
      }
    }
    const next = list.filter((x) => x.id !== id)
    onSave(next)
  }

  const handleAddStash = () => {
    editorOpenTimeRef.current = Date.now()
    setFormStateTracked({ mode: 'stash', id: null })
  }

  const handleEditStash = (id) => {
    editorOpenTimeRef.current = Date.now()
    setFormStateTracked({ mode: 'stash', id })
  }

  const handleSaveStash = (buff) => {
    const clean = {
      source: buff.source,
      duration: buff.duration,
      effects: buff.effects,
      enabled: buff.enabled !== false,
      sourceKind: normalizeBuffSourceKindKey(buff.sourceKind ?? 'temporary'),
      cardScope: buff.cardScope,
    }
    const next = formState?.id
      ? stash.map((b) => (b.id === formState.id ? { ...clean, id: b.id } : b))
      : [...stash, { ...clean, id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }]
    onStashChange(next)
    setFormStateTracked(null)
  }

  const handleDeleteStash = (id) => {
    onStashChange(stash.filter((x) => x.id !== id))
  }

  const onDragStartStash = useCallback(
    (e, id) => {
      e.dataTransfer.setData(STASH_DRAG_MIME, id)
      e.dataTransfer.setData('text/plain', `stash:${id}`)
      e.dataTransfer.effectAllowed = 'copy'
    },
    [],
  )

  const onDragOverActive = useCallback((e) => {
    if (!stashEditable) return
    const dt = e.dataTransfer
    /** 词条/分栏排序同样带 text/plain，若祖先对 text/plain 一律 preventDefault，会导致拖动无法开始或异常 */
    if (dataTransferHasType(dt, BUFF_ENTRY_DRAG_MIME) || dataTransferHasType(dt, BUFF_COLUMN_DRAG_MIME)) {
      return
    }
    if (dataTransferHasType(dt, STASH_DRAG_MIME)) {
      e.preventDefault()
      dt.dropEffect = 'copy'
      setDragOverActive(true)
    }
  }, [stashEditable])

  const onDragLeaveActive = useCallback((e) => {
    if (e.currentTarget.contains(e.relatedTarget)) return
    setDragOverActive(false)
  }, [])

  const onDropActive = useCallback(
    (e) => {
      setDragOverActive(false)
      if (!stashEditable) return
      e.preventDefault()
      let id = e.dataTransfer.getData(STASH_DRAG_MIME)
      if (!id) {
        const plain = e.dataTransfer.getData('text/plain')
        const m = /^stash:(.+)$/.exec(plain)
        if (m) id = m[1]
      }
      if (!id) return
      const t = stash.find((x) => x.id === id)
      if (t) onApplyStashTemplate(t)
    },
    [stashEditable, stash, onApplyStashTemplate],
  )

  const applyStashById = (id) => {
    if (!stashEditable) return
    const t = stash.find((x) => x.id === id)
    if (t) onApplyStashTemplate(t)
  }

  const formInitial =
    formState?.mode === 'stash'
      ? formState.id
        ? stash.find((b) => b.id === formState.id)
        : undefined
      : formState?.mode === 'active'
        ? formState.id
          ? list.find((b) => b.id === formState.id)
          : undefined
        : undefined

  const formOnSave = formState?.mode === 'stash' ? handleSaveStash : handleSaveActive

  /** 自动保存：只同步数据到父组件，不关闭编辑器 */
  const formOnAutoSave = useCallback((buff) => {
    if (!formState) return
    
    // 检查是否为虚拟BUFF（职业特性/专长/装备等），虚拟BUFF不应触发自动保存到character.buffs
    const originalBuff = formState.id ? list.find((b) => b.id === formState.id) : null
    const isVirtualBuff = originalBuff && (originalBuff.fromItem || originalBuff.fromFeat || originalBuff.fromInvocation || originalBuff.fromFightingStyle || originalBuff.fromClassFeature || originalBuff.fromRace || originalBuff.fromBackground)
    if (isVirtualBuff) {
      console.log('[BuffManager] Skipping auto-save for virtual buff:', originalBuff?.source)
      return
    }
    
    if (formState.mode === 'stash') {
      const clean = {
        source: buff.source,
        duration: buff.duration,
        effects: buff.effects,
        enabled: buff.enabled !== false,
        sourceKind: normalizeBuffSourceKindKey(buff.sourceKind ?? 'temporary'),
        cardScope: buff.cardScope,
      }
      const next = formState.id
        ? stash.map((b) => (b.id === formState.id ? { ...clean, id: b.id } : b))
        : [...stash, { ...clean, id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }]
      onStashChange(next)
    } else {
      const source = buff.source?.trim() ?? ''
      const isEdit = !!formState.id
      const duplicate = source
        ? list.find((b) => b.source?.trim() === source && b.id !== formState.id)
        : null
      if (!isEdit && duplicate) return
      const next = isEdit
        ? list.map((b) => (b.id === formState.id ? { ...buff, id: b.id } : b))
        : [...list, { ...buff, id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}` }]
      onSave(next)
    }
  }, [formState, list, stash, onSave, onStashChange])

  const buffBuckets = useMemo(() => {
    const m = { feat: [], adventure: [], class: [], race: [], equipment: [], temporary: [] }
    for (const b of list) {
      // 纯主动释放（charge_item）条目不出现在 BUFF 状态栏——主动技能通过卡片系统独立运作
      const effs = Array.isArray(b.effects) ? b.effects : []
      if (effs.length > 0 && effs.every((e) => e.effectType === 'charge_item')) continue
      const k = getColumnKeyForBuff(b)
      if (!m[k]) m[k] = []
      m[k].push(b)
    }
    return m
  }, [list])

  // 计算被抑制的效果（DC和法术攻击加值取最高值，非最高标记为抑制）
  const suppressedMap = useMemo(() => computeSuppressedEffects(list, formulaContext), [list, formulaContext])

  const importableBuffTemplates = useMemo(() => {
    const q = importSearch.trim().toLowerCase()
    const all = moduleLibrary?.buffTemplates ?? []
    const excluded = new Set(['equipment', 'adventure'])
    return all.filter((t) => {
      if (excluded.has(t.sourceKind)) return false
      if (!q) return true
      return String(t.source ?? '').toLowerCase().includes(q)
    })
  }, [moduleLibrary, importSearch])

  const groupedImportableBuffTemplates = useMemo(() => {
    const persistent = []
    const temporary = []
    for (const t of importableBuffTemplates) {
      if (normalizeBuffSourceKindKey(t.sourceKind ?? 'temporary') === 'temporary') {
        temporary.push(t)
      } else {
        persistent.push(t)
      }
    }
    const sortBySource = (a, b) =>
      String(a.source ?? '').localeCompare(String(b.source ?? ''), 'zh-CN')
    persistent.sort(sortBySource)
    temporary.sort(sortBySource)
    const groups = []
    if (persistent.length > 0) {
      groups.push({ key: 'persistent', label: '持续 Buff', items: persistent })
    }
    if (temporary.length > 0) {
      groups.push({ key: 'temporary', label: '临时 Buff', items: temporary })
    }
    return groups
  }, [importableBuffTemplates])

  const toggleGroup = useCallback((key) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleExpand = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const handleImportTemplate = useCallback(
    (t) => {
      const source = String(t.source ?? '').trim() || '未命名 Buff'
      const isDuplicate = list.some((b) => b.source?.trim() === source) || stash.some((b) => b.source?.trim() === source)
      setConfirmImport({ template: t, isDuplicate })
    },
    [list, stash],
  )

  const doImportTemplate = useCallback(
    (t) => {
      const isTemporary = normalizeBuffSourceKindKey(t.sourceKind ?? 'temporary') === 'temporary'
      const source = String(t.source ?? '').trim() || '未命名 Buff'
      const duration =
        t.duration != null && (typeof t.duration === 'string' ? t.duration.trim() !== '' : t.duration.type)
          ? t.duration
          : undefined
      const effects = Array.isArray(t.effects) ? t.effects.map((e) => ({ ...e })) : []
      if (isTemporary) {
        onStashChange([
          ...stash,
          {
            id: `stash_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            source,
            duration,
            effects,
            enabled: true,
            sourceKind: 'temporary',
          },
        ])
      } else {
        onSave([
          ...list,
          {
            id: String(Date.now()),
            source,
            duration,
            effects,
            enabled: true,
            sourceKind: normalizeBuffSourceKindKey(t.sourceKind),
          },
        ])
      }
      setConfirmImport(null)
    },
    [list, onSave, onStashChange, stash],
  )

  const handleMoveBuffToColumn = useCallback(
    (buffId, columnKey) => {
      if (columnKey === 'feat' || columnKey === 'equipment') return
      const next = list.map((b) => {
        if (b.id !== buffId) return b
        if (b.fromFeat || b.fromItem || b.fromInvocation || b.fromFightingStyle) return b
        return { ...b, sourceKind: normalizeBuffSourceKindKey(columnKey) }
      })
      onSave(next)
    },
    [list, onSave],
  )

  return (
    <>
    <div
      ref={panelRef}
      className={`rounded-xl border border-white/[0.11] bg-gradient-to-b from-[#2c384c] via-[#242f42] to-[#1b2433] p-2 ${BUFF_PANEL_OUTER_SHADOW}`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-dnd-gold-light text-xs font-bold uppercase tracking-wide shrink-0">BUFF</h3>
        {canEdit && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setImportSearch('')
                setShowModuleLibrary(true)
              }}
              className="flex items-center gap-1 px-2 py-0.5 rounded-lg border border-dnd-gold text-dnd-gold-light hover:bg-dnd-gold/20 text-xs font-medium transition-colors shrink-0"
            >
              <Library className="w-3.5 h-3.5" />
              从库中导入
            </button>
          </div>
        )}
      </div>

      {/* ── 主动卡列表 ── */}
      {cards.length > 0 && (
        <div className="mb-3 rounded-lg border border-white/10 bg-[#1a2333]/60 p-2">
          <div className="flex items-center gap-x-2 gap-y-0.5 mb-1.5 min-w-0">
            <span className="text-dnd-gold-light text-[10px] font-bold tracking-wide shrink-0">主动卡</span>
            <span className="text-gray-500 text-[10px] min-w-0 leading-snug">点击「使用」按钮释放技能</span>
          </div>
          <div className="space-y-1.5">
            {cards.map((card) => {
              const chargeItemEffect = card.effects?.find(e => e.effectType === 'charge_item')
              const actionType = card.actionType || 'action'
              const actionLabel = {
                action: '主要动作',
                bonus: '附赠动作',
                reaction: '反应',
                movement: '移动',
              }[actionType] || '主要动作'
              
              // 提取消耗信息
              let consumptionText = ''
              if (chargeItemEffect?.value) {
                const val = chargeItemEffect.value
                if (val.consumeSpellSlot && val.spellLevel) {
                  consumptionText = `${val.spellLevel}环法术位`
                } else if (val.chargeCost) {
                  consumptionText = `${val.chargeCost}充能`
                } else if (val.resourceType && val.resourceAmount) {
                  consumptionText = `${val.resourceAmount}${val.resourceType}`
                }
              }
              
              return (
                <div
                  key={card.id}
                  className="flex items-center gap-2 min-w-0 max-w-full rounded-md border border-white/10 bg-[#243147]/50 pl-2 pr-1.5 py-1"
                >
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <Zap className="w-3.5 h-3.5 text-yellow-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-gray-200 font-medium truncate">
                        {card.source || '未命名'}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] text-gray-500 px-1 py-0.5 rounded bg-white/5">
                          {actionLabel}
                        </span>
                        {consumptionText && (
                          <span className="text-[9px] text-gray-500 px-1 py-0.5 rounded bg-white/5">
                            {consumptionText}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUseAbilityCard(card)}
                    className="shrink-0 px-2 py-0.5 rounded-md bg-yellow-600/20 border border-yellow-600/40 text-yellow-400 hover:bg-yellow-600/30 text-[10px] font-medium transition-colors"
                  >
                    使用
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        editorOpenTimeRef.current = Date.now()
                        setFormStateTracked({ mode: 'active', id: card.id })
                      }}
                      className="shrink-0 p-1 rounded-md text-gray-400 hover:bg-gray-700/80 hover:text-dnd-gold-light transition-colors"
                      title="编辑"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {showStashSection && (
        <div className="mb-3 rounded-lg border border-white/10 bg-[#1a2333]/60 p-2">
          <div className="flex items-center gap-x-2 gap-y-0.5 mb-1.5 min-w-0">
            <span className="text-dnd-gold-light text-[10px] font-bold tracking-wide shrink-0">临时 BUFF</span>
            <span className="text-gray-500 text-[10px] min-w-0 leading-snug">
              {stashEditable
                ? '模板放这里；需要时拖到下方区域，或点击「应用」图标。'
                : '已保存的临时 BUFF（只读）。'}
            </span>
          </div>
          {stash.length === 0 ? (
            <p className="text-gray-500 text-xs py-1 text-center">{stashEditable ? '暂无临时 BUFF' : '—'}</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {stash.map((b) => (
                <div
                  key={b.id}
                  draggable={!!(stashEditable && canEdit)}
                  onDragStart={stashEditable && canEdit ? (e) => onDragStartStash(e, b.id) : undefined}
                  className={`flex items-center gap-1.5 min-w-0 max-w-full rounded-md border border-white/10 bg-[#243147]/50 pl-1 pr-1 py-0.5 ${stashEditable && canEdit ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  title={stashEditable && canEdit ? '拖到下方当前 Buff 区域以应用模板' : undefined}
                >
                  <span className="text-xs text-gray-200 truncate min-w-0 max-w-[14rem]" title={getBuffSummaryLine(b, baseAbilities, formulaContext)}>
                    {getBuffSummaryLine(b, baseAbilities, formulaContext)}
                  </span>
                  {stashEditable && canEdit && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => applyStashById(b.id)}
                        className="p-1 rounded-md border border-gray-600/80 text-gray-400 hover:bg-gray-700/60 hover:text-dnd-gold-light transition-colors"
                        title="应用到当前 Buff"
                        aria-label="应用到当前 Buff"
                      >
                        <ArrowDownToLine className="w-3.5 h-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleEditStash(b.id)}
                        className="p-1 rounded-md text-gray-400 hover:bg-gray-700/80 hover:text-dnd-gold-light transition-colors"
                        title="编辑模板"
                        aria-label="编辑模板"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteStash(b.id)}
                        className="p-1 rounded-md text-gray-500 hover:bg-red-900/50 hover:text-red-400 transition-colors"
                        title="删除模板"
                        aria-label="删除模板"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center mb-1 gap-2">
        <p className="text-gray-500 text-[10px] shrink-0 min-w-0 leading-snug">
          当前 Buff
          {stashEditable ? '（可从上方拖入临时模板至任一类分区）' : ''}
        </p>
      </div>

      <div className="rounded-lg min-w-0 min-h-[2.5rem]" onDragLeave={onDragLeaveActive}>
        <BuffColumnBoard
          columnOrder={buffColumnOrder}
          buckets={buffBuckets}
          baseAbilities={baseAbilities}
          canEdit={canEdit}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onDragOverStash={stashEditable ? onDragOverActive : undefined}
          onDropStash={stashEditable ? onDropActive : undefined}
          dragOverStash={stashEditable && dragOverActive}
          suppressedMap={suppressedMap}
          formulaContext={formulaContext}
        />
      </div>

      <p className="text-gray-600 text-[10px] mt-1.5 leading-snug">
        ※ DC 与法术攻击加值不累加，只取最高值生效；被覆盖的词条显示为灰色删除线。
      </p>
    </div>

    {/* ── 悬浮 BUFF 编辑器按钮 + 下拉面板 ── */}
    {canEdit && formState && (
      <>
        {/* 点击外部关闭 - 已禁用，避免原生 select 交互误触 */}
        <div 
          className="fixed inset-0 z-[9998]" 
          aria-hidden 
        />
        {/* 下拉面板（基于 BUFF 面板定位） */}
        <div 
          ref={editorPanelRef}
          className={`fixed z-[9999] border border-dnd-gold/30 bg-gradient-to-b from-[#2c384c] via-[#242f42] to-[#1b2433] shadow-[0_12px_40px_rgba(0,0,0,0.6)] overflow-hidden flex flex-col transition-all ${
          editorFullscreen
            ? 'inset-0'
            : 'rounded-xl'
        }`}
        style={!editorFullscreen ? {
          top: editorPos.top,
          left: editorPos.left,
          width: editorPos.width || 'auto',
          maxHeight: editorPos.maxHeight,
        } : undefined}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        >
              <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditorFullscreen((v) => !v)}
                    className="p-1 rounded-md text-gray-500 hover:text-gray-300 hover:bg-white/5 transition-colors"
                    title={editorFullscreen ? '退出全屏' : '全屏'}
                  >
                    {editorFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setFormStateTracked(null); setEditorFullscreen(false) }}
                    className="text-gray-500 hover:text-gray-300 text-xs transition-colors"
                  >
                    关闭
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto min-h-0 p-3">
                <BuffForm
                  key={`${formState.mode}-${formState.id ?? 'new'}`}
                  initial={formInitial}
                  defaultSourceKind={formState.mode === 'stash' ? 'temporary' : 'adventure'}
                  onSave={formOnSave}
                  onAutoSave={formOnAutoSave}
                  onCancel={() => { setFormStateTracked(null); setEditorFullscreen(false) }}
                  referenceData={referenceData}
                  baseReferenceData={baseReferenceData}
                  sourceNameOptions={sourceNameOptions}
                  subordinates={subordinates}
                  charClasses={charClasses}
                />
              </div>
            </div>
      </>
    )}

      {showModuleLibrary && (
        <>
          <div
            className="fixed inset-0 z-[200] bg-black/50"
            onClick={() => setShowModuleLibrary(false)}
            aria-hidden
          />
          <div
            className="fixed inset-0 z-[201] flex items-center justify-center p-4 sm:p-8 overflow-auto"
            onClick={() => setShowModuleLibrary(false)}
          >
            <div
              className="w-full max-w-lg max-h-[80vh] overflow-auto bg-gray-800 rounded-xl border border-gray-600 p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 bg-gray-800 pb-3">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-dnd-gold-light text-sm font-bold uppercase tracking-wide">从模组库导入 BUFF</h3>
                  <button
                    type="button"
                    onClick={() => setShowModuleLibrary(false)}
                    className="text-gray-400 hover:text-gray-200 text-xs"
                  >
                    关闭
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
                    <input
                      type="text"
                      value={importSearch}
                      onChange={(e) => setImportSearch(e.target.value)}
                      placeholder="搜索 BUFF 名称"
                      className={`${inputClass} pl-7 text-xs w-full`}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowModuleLibrary(false)
                      handleAddStash()
                    }}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg border border-dnd-gold/70 text-dnd-gold-light hover:bg-dnd-gold/20 text-xs font-medium transition-colors shrink-0"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    新增 BUFF
                  </button>
                </div>
              </div>
              {(moduleLibrary?.buffTemplates ?? []).length === 0 ? (
                <p className="text-gray-500 text-xs text-center py-4">
                  当前模组暂无 BUFF 模板，请先到「更多 → 模组库」添加。
                </p>
              ) : importableBuffTemplates.length === 0 ? (
                <p className="text-gray-500 text-xs text-center py-4">没有匹配的 BUFF</p>
              ) : (
                <div className="space-y-2">
                  {groupedImportableBuffTemplates.map((g) => {
                    const collapsed = collapsedGroups.has(g.key)
                    return (
                      <div key={g.key} className="rounded-lg border border-white/10 overflow-hidden">
                        <button
                          type="button"
                          onClick={() => toggleGroup(g.key)}
                          className="w-full flex items-center justify-between gap-2 px-2 py-1.5 bg-[#1a2333]/60 hover:bg-[#1a2333]/80 transition-colors"
                        >
                          <span className="text-xs font-bold text-dnd-gold-light">
                            {g.label}
                            <span className="ml-1.5 text-[10px] font-normal text-gray-500">{g.items.length}</span>
                          </span>
                          <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${collapsed ? '-rotate-90' : ''}`} />
                        </button>
                        {!collapsed && (
                          <div className="p-1.5 space-y-1 bg-[#141c28]/40">
                            {g.items.map((t) => {
                              const effectCount = Array.isArray(t.effects) ? t.effects.length : 0
                              const expanded = expandedIds.has(t.id)
                              const sourceKindLabel =
                                BUFF_SOURCE_KIND_OPTIONS.find((o) => o.key === t.sourceKind)?.label ?? '其他'
                              return (
                                <div
                                  key={t.id}
                                  className="rounded-md border border-white/5 bg-[#1a2333]/40 overflow-hidden"
                                >
                                  <div className="flex items-center justify-between gap-2 px-2 py-1">
                                    <button
                                      type="button"
                                      onClick={() => toggleExpand(t.id)}
                                      className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
                                      title={expanded ? '收起详情' : '展开详情'}
                                    >
                                      <ChevronDown
                                        className={`w-3 h-3 text-gray-500 transition-transform shrink-0 ${
                                          expanded ? '' : '-rotate-90'
                                        }`}
                                      />
                                      <span className="text-xs text-gray-200 truncate" title={t.source}>
                                        {t.source}
                                      </span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleImportTemplate(t)}
                                      className="p-1 rounded-md border border-dnd-gold/70 text-dnd-gold-light hover:bg-dnd-gold/20 transition-colors shrink-0"
                                      title="添加"
                                      aria-label="添加"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  {expanded && (
                                    <div className="px-2 pb-1.5 pl-7 text-[10px] text-gray-500 space-y-0.5">
                                      {t.duration ? <div>持续 {formatDurationBrief(t.duration)}</div> : null}
                                      <div>
                                        {effectCount} 个效果 · 分类 {sourceKindLabel}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {confirmImport && (
        <>
          <div
            className="fixed inset-0 z-[210] bg-black/50"
            onClick={() => setConfirmImport(null)}
            aria-hidden
          />
          <div
            className="fixed inset-0 z-[211] flex items-center justify-center p-4"
            onClick={() => setConfirmImport(null)}
          >
            <div
              className="w-full max-w-sm rounded-xl border border-gray-600 bg-gray-800 p-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h4 className="text-dnd-gold-light text-sm font-bold mb-2">
                {confirmImport.isDuplicate ? '⚠ 同名 BUFF 已存在' : '确认添加 BUFF'}
              </h4>
              <p className="text-gray-300 text-xs mb-1">
                名称：<span className="text-white font-medium">{confirmImport.template.source || '未命名 Buff'}</span>
              </p>
              {confirmImport.isDuplicate && (
                <p className="text-dnd-red text-xs mb-2">
                  当前已有同名 BUFF，添加后将产生重复条目。
                </p>
              )}
              <div className="flex justify-end gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setConfirmImport(null)}
                  className="px-3 py-1 rounded-lg border border-gray-600 text-gray-400 hover:bg-gray-700 text-xs transition-colors"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => doImportTemplate(confirmImport.template)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
                    confirmImport.isDuplicate
                      ? 'border border-dnd-red/70 text-dnd-red hover:bg-dnd-red/20'
                      : 'border border-dnd-gold/70 text-dnd-gold-light hover:bg-dnd-gold/20'
                  }`}
                >
                  {confirmImport.isDuplicate ? '仍然添加' : '确认添加'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── 主动卡使用弹窗 ── */}
      {useAbilityCard && char && (
        <AbilityUseModal
          activeAbility={useAbilityCard}
          char={char}
          featureName={useAbilityCard.source || '主动技能'}
          onConfirm={(patch, lines) => {
            if (onUseAbility) {
              onUseAbility(useAbilityCard, patch, lines)
            }
          }}
          onClose={() => setUseAbilityCard(null)}
        />
      )}
    </>
  )
}
