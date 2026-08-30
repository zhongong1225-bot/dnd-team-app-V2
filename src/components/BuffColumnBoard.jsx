import { useMemo } from 'react'
import BuffListItem from './BuffListItem'
import {
  getBuffColumnLabel,
  normalizeBuffColumnOrder,
} from '../lib/buffSourceKind'

export default function BuffColumnBoard({
  columnOrder,
  buckets,
  baseAbilities,
  canEdit,
  onEdit,
  onDelete,
  onDragOverStash,
  onDropStash,
  dragOverStash,
  suppressedMap = new Map(),
  formulaContext = {},
}) {
  const order = useMemo(() => normalizeBuffColumnOrder(columnOrder), [columnOrder])

  return (
    <div
      className={`flex flex-col gap-1.5 w-full min-h-0 max-h-[min(62vh,42rem)] overflow-y-auto overflow-x-hidden ${dragOverStash ? 'ring-2 ring-dnd-gold/40 ring-offset-2 ring-offset-[#141c28] rounded-lg p-0.5' : ''}`}
      onDragOver={onDragOverStash}
      onDrop={onDropStash}
    >
      {order.map((colKey) => {
        const items = buckets[colKey] ?? []
        const label = getBuffColumnLabel(colKey)

        return (
          <div
            key={colKey}
            className="flex min-h-0 min-w-0 rounded-lg border border-gray-500/50 bg-[#141c28]/90 overflow-hidden shadow-sm shadow-black/25"
          >
            <div
              className={
                'shrink-0 w-14 sm:w-16 flex flex-row items-center justify-center border-r border-gray-600/50 bg-gray-800/45 py-1 px-0.5 sm:px-1 select-none'
              }
              title={label}
            >
              <span
                className="text-dnd-gold-light text-[10px] sm:text-[11px] font-bold leading-snug min-w-0 text-center whitespace-nowrap flex-1"
              >
                {label}
              </span>
            </div>
            <div
              className="flex-1 min-w-0 p-1.5 grid grid-cols-2 gap-1 content-start bg-[#1a2430]/35"
            >
              {items.length === 0 ? (
                <div className="min-h-[2.5rem] flex items-center justify-center rounded border border-dashed border-gray-600/40 bg-[#1a2430]/25">
                  <span className="text-[10px] text-gray-600 px-1 text-center leading-snug">空</span>
                </div>
              ) : (
                items.map((buff) => (
                  <div
                    key={buff.id}
                    className="anim-fade-slide-up min-w-0 rounded-md overflow-hidden border border-gray-600/50 bg-[#1a2430]/50"
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
                      suppressedEffectTypes={suppressedMap.get(buff.id) || new Set()}
                      formulaContext={formulaContext}
                    />
                  </div>
                ))
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
