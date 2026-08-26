/**
 * 主动技能快捷栏
 * 底部紧凑布局，显示用户固定的主动技能按钮
 */
import { useMemo } from 'react'
import { getAbilitiesForCharacter, canUseAbility } from '../../lib/activeAbilityEngine'
import * as Icons from 'lucide-react'
import { Pin } from 'lucide-react'

const ICON_SIZE = 16

/**
 * @param {Object} props
 * @param {Object} props.char - 角色数据
 * @param {string[]} props.quickBar - 快捷栏能力 ID 列表
 * @param {Function} props.onUpdateQuickBar - 更新快捷栏
 * @param {Function} props.onExecute - 执行技能回调 (ability, context) => void
 * @param {boolean} props.canEdit - 是否可编辑
 */
export default function ActiveAbilityQuickBar({ char, quickBar, onUpdateQuickBar, onExecute, canEdit }) {
  // 获取角色可用的所有主动技能
  const availableAbilities = useMemo(() => {
    return getAbilitiesForCharacter(char)
  }, [char])

  // 快捷栏中实际可用的技能（已安装且角色拥有）
  const quickBarAbilities = useMemo(() => {
    if (!quickBar?.length) return []
    const abilityMap = new Map(availableAbilities.map(({ ability, context }) => [ability.id, { ability, context }]))
    return quickBar
      .map((id) => abilityMap.get(id))
      .filter(Boolean)
  }, [quickBar, availableAbilities])

  if (!quickBarAbilities.length && !canEdit) return null

  return (
    <div className="mt-2 rounded-lg border border-dnd-gold/30 bg-dnd-gold/5 p-2">
      <div className="flex items-center justify-between mb-1.5">
        <h3 className="text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider">快捷技能</h3>
        {canEdit && (
          <span className="text-gray-500 text-[10px]">
            从职业特性/专长安装
          </span>
        )}
      </div>

      {quickBarAbilities.length === 0 ? (
        <p className="text-gray-500 text-xs py-1">
          {canEdit ? '暂无快捷技能，在职业特性或专长栏点击「📌」安装' : '无'}
        </p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {quickBarAbilities.map(({ ability, context }) => {
            const check = canUseAbility(ability, char)
            const IconComp = Icons[ability.icon] || Icons.Zap
            const costText = ability.cost.type === 'class_resource'
              ? `${ability.cost.amount}${getResourceSymbol(ability.cost.resourceKey)}`
              : ability.cost.type === 'none' ? '免费' : ''

            return (
              <button
                key={ability.id}
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
                {/* 动作类型标签 */}
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
          })}
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

/**
 * 安装/卸载按钮（放在职业特性/专长条目中）
 */
export function QuickBarPinButton({ abilityId, quickBar, onUpdateQuickBar }) {
  const isPinned = quickBar?.includes(abilityId)

  const toggle = () => {
    const next = isPinned
      ? quickBar.filter((id) => id !== abilityId)
      : [...(quickBar || []), abilityId]
    onUpdateQuickBar(next)
  }

  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); toggle() }}
      className={`
        w-8 h-8 flex items-center justify-center rounded-lg
        transition-all
        ${isPinned
          ? 'text-dnd-gold-light bg-dnd-gold/20 hover:bg-dnd-gold/30 border border-dnd-gold/50'
          : 'text-gray-500 hover:text-dnd-gold-light hover:bg-gray-700/40 border border-transparent'
        }
      `}
      title={isPinned ? '从快捷栏移除' : '添加到快捷栏'}
    >
      <Pin className="w-4 h-4" />
    </button>
  )
}
