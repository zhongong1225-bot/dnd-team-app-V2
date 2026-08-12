import { useState, useCallback, useMemo } from 'react'
import { Plus, Pencil, Trash2, ArrowDownToLine } from 'lucide-react'
import { getBuffSummaryLine } from './BuffListItem'
import BuffForm from './BuffForm'
import BuffColumnBoard from './BuffColumnBoard'
import {
  normalizeBuffSourceKindKey,
  getColumnKeyForBuff,
  BUFF_ENTRY_DRAG_MIME,
  BUFF_COLUMN_DRAG_MIME,
} from '../lib/buffSourceKind'
import { dataTransferHasType } from '../lib/dndTransferTypes'
import { computeSuppressedEffects } from '../hooks/useBuffCalculator'

const STASH_DRAG_MIME = 'application/x-dnd-team-buff-stash'

/** 最外框：与 shadow-dnd-card 同款黑系外投影，但去掉顶部白色 inset（圆角处易看成一圈外发光） */
const BUFF_PANEL_OUTER_SHADOW =
  'shadow-[0_6px_22px_rgba(0,0,0,0.48),0_2px_6px_rgba(0,0,0,0.28),inset_0_-1px_0_rgba(0,0,0,0.22)]'

export default function BuffManager({
  buffs = [],
  baseAbilities = {},
  onSave,
  canEdit,
  stashBuffs = [],
  onStashChange,
  onApplyStashTemplate,
  buffColumnOrder,
  onBuffColumnOrderChange,
  referenceData,
  baseReferenceData,
  formulaContext = {},
  sourceNameOptions = [],
}) {
  const [formState, setFormState] = useState(null)
  /** null | { mode: 'active'|'stash', id: string|null } */
  const [dragOverActive, setDragOverActive] = useState(false)

  const list = Array.isArray(buffs) ? buffs : []
  const stash = Array.isArray(stashBuffs) ? stashBuffs : []
  const stashEditable = typeof onStashChange === 'function' && typeof onApplyStashTemplate === 'function'
  const showStashSection = stashEditable || stash.length > 0

  const handleAddActive = () => {
    setFormState({ mode: 'active', id: null })
  }

  const handleSaveActive = (buff) => {
    const source = buff.source?.trim() ?? ''
    const isEdit = !!formState?.id
    const duplicate = source
      ? list.find((b) => b.source?.trim() === source && b.id !== formState?.id)
      : null
    if (!isEdit && duplicate) {
      // 同名 BUFF 已存在，不重复挂载
      setFormState(null)
      return
    }
    const next = isEdit
      ? list.map((b) => (b.id === formState.id ? { ...buff, id: b.id } : b))
      : [...list, { ...buff, id: String(Date.now()) }]
    onSave(next)
    setFormState(null)
  }

  const handleEdit = (id) => {
    const b = list.find((x) => x.id === id)
    if (b?.fromItem) return
    if (b) setFormState({ mode: 'active', id })
  }

  const handleDelete = (id) => {
    const b = list.find((x) => x.id === id)
    if (b?.fromItem || b?.fromFeat || b?.fromInvocation || b?.fromFightingStyle) return
    const next = list.filter((x) => x.id !== id)
    onSave(next)
  }

  const handleAddStash = () => {
    setFormState({ mode: 'stash', id: null })
  }

  const handleEditStash = (id) => {
    setFormState({ mode: 'stash', id })
  }

  const handleSaveStash = (buff) => {
    const clean = {
      source: buff.source,
      duration: buff.duration,
      effects: buff.effects,
      enabled: buff.enabled !== false,
      sourceKind: normalizeBuffSourceKindKey(buff.sourceKind ?? 'temporary'),
    }
    const next = formState?.id
      ? stash.map((b) => (b.id === formState.id ? { ...clean, id: b.id } : b))
      : [...stash, { ...clean, id: String(Date.now()) }]
    onStashChange(next)
    setFormState(null)
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

  const buffBuckets = useMemo(() => {
    const m = { feat: [], adventure: [], class_race: [], equipment: [], temporary: [] }
    for (const b of list) {
      const k = getColumnKeyForBuff(b)
      if (!m[k]) m[k] = []
      m[k].push(b)
    }
    return m
  }, [list])

  // 计算被抑制的效果（DC和法术攻击加值取最高值，非最高标记为抑制）
  const suppressedMap = useMemo(() => computeSuppressedEffects(list, formulaContext), [list, formulaContext])

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
    <div
      className={`rounded-xl border border-white/[0.11] bg-gradient-to-b from-[#2c384c] via-[#242f42] to-[#1b2433] p-2 ${BUFF_PANEL_OUTER_SHADOW}`}
    >
      {showStashSection && (
        <div className="mb-3 rounded-lg border border-white/10 bg-[#1a2333]/60 p-2">
          <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0 flex-1">
              <span className="text-dnd-gold-light text-[10px] font-bold tracking-wide shrink-0">临时 BUFF</span>
              <span className="text-gray-500 text-[10px] min-w-0 leading-snug">
                {stashEditable
                  ? '制作模板放在上方；需要时拖到下方「当前 Buff」区域，或点击下方「应用到当前 Buff」图标。'
                  : '已保存的临时 BUFF（只读）。'}
              </span>
            </div>
            {stashEditable && canEdit && (
              <button
                type="button"
                onClick={handleAddStash}
                className="flex items-center gap-1 px-2 py-0.5 rounded-lg border border-gray-600/80 text-gray-200 hover:bg-gray-700/50 text-xs font-medium transition-colors shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                添加临时BUFF
              </button>
            )}
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

      <div className="flex items-center justify-between mb-1 gap-2">
        <p className="text-gray-500 text-[10px] shrink-0 min-w-0 leading-snug">
          当前 Buff
          {stashEditable ? '（可从上方拖入临时模板至任一类分区）' : ''}
          {canEdit ? ' · 左侧分类名可拖动调整上下顺序；冒险/职业&种族/临时之间可拖动词条改归类' : ''}
        </p>
        {canEdit && (
          <button
            type="button"
            onClick={handleAddActive}
            className="flex items-center gap-1 px-2 py-0.5 rounded-lg border border-dnd-red text-dnd-red hover:bg-dnd-red hover:text-white text-xs font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            添加增益/减值
          </button>
        )}
      </div>

      <div className="rounded-lg min-w-0 min-h-[2.5rem]" onDragLeave={onDragLeaveActive}>
        <BuffColumnBoard
          columnOrder={buffColumnOrder}
          onColumnOrderChange={canEdit ? onBuffColumnOrderChange : undefined}
          buckets={buffBuckets}
          baseAbilities={baseAbilities}
          canEdit={canEdit}
          onEdit={handleEdit}
          onDelete={handleDelete}
          onMoveBuffToColumn={handleMoveBuffToColumn}
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

      {formState && (
        <>
          <div
            className="fixed inset-0 z-[200] bg-black/50"
            onClick={() => setFormState(null)}
            aria-hidden
          />
          <div
            className="fixed inset-0 z-[201] flex items-center justify-center p-4 sm:p-8 overflow-auto"
            onClick={() => setFormState(null)}
          >
            <div
              className="w-full max-w-3xl max-h-[90vh] overflow-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <BuffForm
                key={`${formState.mode}-${formState.id ?? 'new'}`}
                initial={formInitial}
                defaultSourceKind={formState.mode === 'stash' ? 'temporary' : 'adventure'}
                onSave={formOnSave}
                onCancel={() => setFormState(null)}
                referenceData={referenceData}
                baseReferenceData={baseReferenceData}
                sourceNameOptions={sourceNameOptions}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
