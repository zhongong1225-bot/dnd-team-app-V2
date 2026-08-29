import { useCallback, useMemo } from 'react'
import BuffListItem from './BuffListItem'
import {
  BUFF_COLUMN_DRAG_MIME,
  BUFF_ENTRY_DRAG_MIME,
  getBuffColumnLabel,
  normalizeBuffColumnOrder,
  reorderBuffColumns,
} from '../lib/buffSourceKind'
import { dataTransferHasType } from '../lib/dndTransferTypes'

/** 与 BuffManager 临时模板拖放一致 */
const STASH_TEMPLATE_DRAG_MIME = 'application/x-dnd-team-buff-stash'

/** 可跨区拖动的归类（专长/装备不可作为落点改 sourceKind） */
const MOVABLE_TARGET_KEYS = new Set(['adventure', 'class', 'race', 'temporary'])

function setBuffEntryDragData(e, buffId) {
  e.dataTransfer.setData(BUFF_ENTRY_DRAG_MIME, buffId)
  e.dataTransfer.setData('text/plain', `buffentry:${buffId}`)
  e.dataTransfer.effectAllowed = 'move'
}

function getBuffEntryDragId(e) {
  let id = e.dataTransfer.getData(BUFF_ENTRY_DRAG_MIME)
  if (id) return id
  const plain = e.dataTransfer.getData('text/plain')
  const m = /^buffentry:(.+)$/.exec(plain)
  return m ? m[1] : ''
}

export default function BuffColumnBoard({
  columnOrder,
  onColumnOrderChange,
  buckets,
  baseAbilities,
  canEdit,
  onEdit,
  onDelete,
  onMoveBuffToColumn,
  onDragOverStash,
  onDropStash,
  dragOverStash,
  suppressedMap = new Map(),
  formulaContext = {},
}) {
  const order = useMemo(() => normalizeBuffColumnOrder(columnOrder), [columnOrder])

  /** 整板根节点勿对「词条/分栏」拖动调用 stash 的 dragover（与 BuffManager.onDragOverActive 一致） */
  const onBoardDragOver = useCallback(
    (e) => {
      const dt = e.dataTransfer
      if (dataTransferHasType(dt, BUFF_ENTRY_DRAG_MIME) || dataTransferHasType(dt, BUFF_COLUMN_DRAG_MIME)) {
        return
      }
      onDragOverStash?.(e)
    },
    [onDragOverStash],
  )

  const onColumnDragStart = useCallback((e, colKey) => {
    if (!canEdit) return
    e.dataTransfer.setData(BUFF_COLUMN_DRAG_MIME, colKey)
    e.dataTransfer.setData('text/plain', `buffcolumn:${colKey}`)
    e.dataTransfer.effectAllowed = 'move'
  }, [canEdit])

  const onColumnStripDragOver = useCallback(
    (e) => {
      onDragOverStash?.(e)
      const dt = e.dataTransfer
      if (dataTransferHasType(dt, STASH_TEMPLATE_DRAG_MIME)) {
        e.preventDefault()
        dt.dropEffect = 'copy'
        return
      }
      if (dataTransferHasType(dt, BUFF_COLUMN_DRAG_MIME)) {
        e.preventDefault()
        dt.dropEffect = 'move'
      }
    },
    [onDragOverStash],
  )

  const onColumnDropReorder = useCallback(
    (e, targetKey) => {
      e.preventDefault()
      e.stopPropagation()
      let dragKey = e.dataTransfer.getData(BUFF_COLUMN_DRAG_MIME)
      if (!dragKey) {
        const plain = e.dataTransfer.getData('text/plain')
        const m = /^buffcolumn:(.+)$/.exec(plain)
        if (m) dragKey = m[1]
      }
      if (!dragKey || dragKey === targetKey) return
      const next = reorderBuffColumns(order, dragKey, targetKey)
      onColumnOrderChange?.(next)
    },
    [order, onColumnOrderChange],
  )

  const onRowBodyDragOver = useCallback(
    (e, colKey) => {
      onDragOverStash?.(e)
      const dt = e.dataTransfer
      if (dataTransferHasType(dt, STASH_TEMPLATE_DRAG_MIME)) {
        e.preventDefault()
        dt.dropEffect = 'copy'
        return
      }
      if (!MOVABLE_TARGET_KEYS.has(colKey) || !canEdit) return
      /** 自定义 MIME 在部分浏览器 dragover 阶段不可见，需同时认 text/plain（与 setData 一致） */
      const looksLikeBuffDrag =
        dataTransferHasType(dt, BUFF_ENTRY_DRAG_MIME) || dataTransferHasType(dt, 'text/plain')
      if (looksLikeBuffDrag) {
        e.preventDefault()
        dt.dropEffect = 'move'
      }
    },
    [canEdit, onDragOverStash],
  )

  const onRowBodyDrop = useCallback(
    (e, colKey) => {
      const plain = e.dataTransfer.getData('text/plain')
      if (/^stash:/.test(plain)) {
        e.preventDefault()
        e.stopPropagation()
        onDropStash?.(e)
        return
      }
      if (!MOVABLE_TARGET_KEYS.has(colKey) || !canEdit) return
      const id = getBuffEntryDragId(e)
      if (!id) return
      e.preventDefault()
      e.stopPropagation()
      onMoveBuffToColumn?.(id, colKey)
    },
    [canEdit, onMoveBuffToColumn, onDropStash],
  )

  const onRowHeaderDrop = useCallback(
    (e, colKey) => {
      const plain = e.dataTransfer.getData('text/plain')
      if (/^stash:/.test(plain)) {
        e.preventDefault()
        e.stopPropagation()
        onDropStash?.(e)
        return
      }
      if (!canEdit) return
      onColumnDropReorder(e, colKey)
    },
    [canEdit, onColumnDropReorder, onDropStash],
  )

  return (
    <div
      className={`flex flex-col gap-1.5 w-full min-h-0 max-h-[min(62vh,42rem)] overflow-y-auto overflow-x-hidden ${dragOverStash ? 'ring-2 ring-dnd-gold/40 ring-offset-2 ring-offset-[#141c28] rounded-lg p-0.5' : ''}`}
      onDragOver={onDragOverStash}
      onDrop={onDropStash}
    >
      {order.map((colKey) => {
        const items = buckets[colKey] ?? []
        const label = getBuffColumnLabel(colKey)
        const isLockedTarget = !MOVABLE_TARGET_KEYS.has(colKey)
        const columnBodyHoverTitle =
          canEdit && colKey === 'equipment'
            ? '装备BUFF由装备所控'
            : canEdit && colKey === 'feat'
              ? '专长只能改数值不能改类别'
              : canEdit && !isLockedTarget
                ? '可通过拖动改变BUFF类型'
                : undefined

        return (
          <div
            key={colKey}
            className="flex min-h-0 min-w-0 rounded-lg border border-gray-500/50 bg-[#141c28]/90 overflow-hidden shadow-sm shadow-black/25"
          >
            <div
              draggable={!!canEdit}
              onDragStart={canEdit ? (e) => onColumnDragStart(e, colKey) : undefined}
              onDragOver={onColumnStripDragOver}
              onDrop={(e) => onRowHeaderDrop(e, colKey)}
              className={
                'buff-dnd-draggable-source shrink-0 w-14 sm:w-16 flex flex-row items-center justify-center border-r border-gray-600/50 bg-gray-800/45 py-1 px-0.5 sm:px-1 select-none ' +
                (canEdit ? 'cursor-grab active:cursor-grabbing hover:bg-gray-800/65' : '')
              }
              title={canEdit ? '拖动调整分类顺序（释放在另一行左侧标题上）' : label}
            >
              <span
                className={
                  'text-dnd-gold-light text-[10px] sm:text-[11px] font-bold leading-snug min-w-0 text-center whitespace-nowrap ' +
                  (canEdit ? 'flex-1' : '')
                }
              >
                {label}
              </span>
            </div>
            <div
              className={
                'flex-1 min-w-0 p-1.5 flex flex-col gap-1 content-start bg-[#1a2430]/35'
              }
              onDragOver={(e) => onRowBodyDragOver(e, colKey)}
              onDrop={(e) => onRowBodyDrop(e, colKey)}
              title={columnBodyHoverTitle}
            >
              {items.length === 0 ? (
                <div className="min-h-[2.5rem] flex items-center justify-center rounded border border-dashed border-gray-600/40 bg-[#1a2430]/25">
                  <span className="text-[10px] text-gray-600 px-1 text-center leading-snug">空</span>
                </div>
              ) : (
                items.map((buff) => {
                  const movable = canEdit && !buff.fromFeat && !buff.fromItem
                  return (
                    <div
                      key={buff.id}
                      draggable={movable}
                      onDragStart={movable ? (e) => setBuffEntryDragData(e, buff.id) : undefined}
                      className={
                        'anim-fade-slide-up buff-dnd-draggable-source min-w-0 rounded-md overflow-hidden border border-gray-600/50 bg-[#1a2430]/50 ' +
                        (movable ? 'cursor-grab active:cursor-grabbing' : '')
                      }
                    >
                      <BuffListItem
                        buff={buff}
                        baseAbilities={baseAbilities}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        canEdit={canEdit}
                        columnKey={colKey}
                        standalone
                        hideSourceTag
                        showDragHint={movable}
                        suppressedEffectTypes={suppressedMap.get(buff.id) || new Set()}
                        formulaContext={formulaContext}
                      />
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
