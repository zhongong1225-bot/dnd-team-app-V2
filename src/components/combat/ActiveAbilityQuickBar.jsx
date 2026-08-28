/**
 * 主动技能快捷栏
 * 底部紧凑布局，固定 5 格槽位
 * - 已安装：显示技能按钮，点击执行
 * - 空槽位：点击弹出选择 modal 安装技能
 */
import { useState, useMemo, useCallback } from 'react'
import { getAbilitiesForCharacter, canUseAbility } from '../../lib/activeAbilityEngine'
import * as Icons from 'lucide-react'
import { Plus, X } from 'lucide-react'

const ICON_SIZE = 16
const SLOT_COUNT = 5

/**
 * @param {Object} props
 * @param {Object} props.char - 角色数据
 * @param {string[]} props.quickBar - 快捷栏能力 ID 列表
 * @param {Function} props.onUpdateQuickBar - 更新快捷栏 (nextIds) => void
 * @param {Function} props.onExecute - 执行技能回调 (ability, context) => void
 * @param {boolean} props.canEdit - 是否可编辑
 */
export default function ActiveAbilityQuickBar({ char, quickBar, onUpdateQuickBar, onExecute, canEdit, moduleId }) {
  const [selectingSlot, setSelectingSlot] = useState(null)

  // 获取角色可用的所有主动技能
  const availableAbilities = useMemo(() => {
    return getAbilitiesForCharacter(char, moduleId)
  }, [char, moduleId])

  // 构建槽位列表（固定 SLOT_COUNT 格）
  const slots = useMemo(() => {
    const abilityMap = new Map(availableAbilities.map(({ ability, context }) => [ability.id, { ability, context }]))
    const result = []
    for (let i = 0; i < SLOT_COUNT; i++) {
      const id = quickBar?.[i]
      result.push(id ? abilityMap.get(id) || null : null)
    }
    return result
  }, [quickBar, availableAbilities])

  const handleSlotClick = useCallback((index) => {
    if (!canEdit) return
    if (slots[index]) {
      // 已安装 → 移除
      const next = [...(quickBar || [])]
      next.splice(index, 1)
      onUpdateQuickBar(next)
    } else {
      // 空槽 → 打开选择
      setSelectingSlot(index)
    }
  }, [canEdit, slots, quickBar, onUpdateQuickBar])

  const handleSelectAbility = useCallback((abilityId) => {
    if (selectingSlot === null) return
    const next = [...(quickBar || [])]
    // 确保数组长度足够
    while (next.length <= selectingSlot) next.push(null)
    next[selectingSlot] = abilityId
    onUpdateQuickBar(next)
    setSelectingSlot(null)
  }, [selectingSlot, quickBar, onUpdateQuickBar])

  const handleUninstall = useCallback((abilityId) => {
    const next = (quickBar || []).filter(id => id !== abilityId)
    onUpdateQuickBar(next)
  }, [quickBar, onUpdateQuickBar])

  const closeModal = useCallback(() => setSelectingSlot(null), [])

  // 已安装的技能数量
  const installedCount = slots.filter(Boolean).length
  if (installedCount === 0 && !canEdit) return null

  return (
    <div className="mt-2 rounded-lg border border-dnd-gold/30 bg-dnd-gold/5 p-2">
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider">快捷技能</h3>
        {canEdit && (
          <span className="text-gray-500 text-[10px]">
            点击空槽安装 · 点击已安装移除
          </span>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {slots.map((slot, i) => {
          if (slot) {
            const { ability, context } = slot
            const check = canUseAbility(ability, char)
            const IconComp = Icons[ability.icon] || Icons.Zap
            const costText = ability.cost.type === 'class_resource'
              ? `${ability.cost.amount}${getResourceSymbol(ability.cost.resourceKey)}`
              : ability.cost.type === 'none' ? '免费' : ''

            return (
              <button
                key={`slot-${i}-${ability.id}`}
                type="button"
                disabled={!check.usable}
                onClick={() => onExecute(ability, context)}
                className={`
                  group relative flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium
                  transition-all border
                  ${check.usable
                    ? 'border-dnd-gold/50 bg-dnd-gold/10 text-dnd-gold-light hover:bg-dnd-gold/20 hover:border-dnd-gold active:scale-95'
                    : 'border-gray-600/50 bg-gray-800/50 text-gray-500 cursor-not-allowed'
                  }
                `}
                title={`${ability.name}${ability.description ? '\n' + ability.description : ''}\n${check.usable ? '点击使用' : check.reason}`}
              >
                <IconComp size={ICON_SIZE} className={check.usable ? 'text-dnd-gold-light' : 'text-gray-600'} />
                <span>{ability.name}</span>
                {costText && (
                  <span className={`text-[10px] ${check.usable ? 'text-dnd-gold/70' : 'text-gray-600'}`}>
                    {costText}
                  </span>
                )}
                <span className={`
                  text-[9px] px-0.5 rounded
                  ${ability.actionType === 'action' ? 'bg-blue-500/20 text-blue-300' :
                    ability.actionType === 'bonus_action' ? 'bg-green-500/20 text-green-300' :
                    ability.actionType === 'reaction' ? 'bg-purple-500/20 text-purple-300' :
                    'bg-gray-500/20 text-gray-400'}
                `}>
                  {ability.actionType === 'action' ? '动' :
                   ability.actionType === 'bonus_action' ? '附' :
                   ability.actionType === 'reaction' ? '反' : '特'}
                </span>
              </button>
            )
          }

          // 空槽位
          return (
            <button
              key={`slot-${i}-empty`}
              type="button"
              onClick={() => handleSlotClick(i)}
              className={`
                w-9 h-9 flex items-center justify-center rounded-md border border-dashed
                transition-all active:scale-95
                ${canEdit
                  ? 'border-dnd-gold/30 text-dnd-gold/40 hover:border-dnd-gold/60 hover:text-dnd-gold/70 hover:bg-dnd-gold/5 cursor-pointer'
                  : 'border-gray-700/50 text-gray-700 cursor-default'
                }
              `}
              title={canEdit ? '点击安装主动技能' : ''}
            >
              <Plus className="w-4 h-4" />
            </button>
          )
        })}
      </div>

      {/* 选择技能 Modal */}
      {selectingSlot !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={closeModal}>
          <div
            className="bg-dnd-card border border-dnd-gold/30 rounded-xl shadow-2xl w-full max-w-md mx-4 max-h-[70vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700/50">
              <h3 className="text-dnd-gold-light text-sm font-bold">选择主动技能</h3>
              <button
                type="button"
                onClick={closeModal}
                className="w-7 h-7 flex items-center justify-center rounded-md text-gray-500 hover:text-white hover:bg-gray-700/50 transition-all"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="overflow-y-auto p-3 flex flex-col gap-1.5">
              {availableAbilities.length === 0 ? (
                <p className="text-gray-500 text-xs text-center py-4">该角色暂无可用主动技能</p>
              ) : (
                availableAbilities.map(({ ability }) => {
                  const alreadyInstalled = quickBar?.includes(ability.id)
                  return (
                    <button
                      key={ability.id}
                      type="button"
                      disabled={alreadyInstalled}
                      onClick={() => !alreadyInstalled && handleSelectAbility(ability.id)}
                      className={`
                        flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all border
                        ${alreadyInstalled
                          ? 'border-gray-700/30 bg-gray-800/30 text-gray-500 cursor-default'
                          : 'border-dnd-gold/20 bg-dnd-gold/5 text-white hover:bg-dnd-gold/15 hover:border-dnd-gold/40 active:scale-[0.99]'
                        }
                      `}
                    >
                      {(() => {
                        const IconComp = Icons[ability.icon] || Icons.Zap
                        return <IconComp size={ICON_SIZE} className={alreadyInstalled ? 'text-gray-600' : 'text-dnd-gold-light'} />
                      })()}
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-medium truncate">{ability.name}</div>
                        {ability.description && (
                          <div className="text-[10px] text-gray-500 truncate mt-0.5">{ability.description}</div>
                        )}
                      </div>
                      {alreadyInstalled ? (
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleUninstall(ability.id) }}
                          className="shrink-0 w-6 h-6 flex items-center justify-center rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/40 hover:text-red-300 transition-all active:scale-90"
                          title="取消安装"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="text-[10px] text-dnd-gold/50 shrink-0">点击安装</span>
                      )}
                    </button>
                  )
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** 资源符号简写 */
function getResourceSymbol(resourceKey) {
  switch (resourceKey) {
    case 'star_points': return '星'
    case 'wild_shape': return '变'
    case 'second_wind': return '气'
    case 'lay_on_hands': return '疗'
    default: return ''
  }
}
