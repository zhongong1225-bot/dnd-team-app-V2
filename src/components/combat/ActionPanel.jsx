/**
 * 主动技能面板
 * 分组展示角色所有可用主动技能（按动作类型分组）
 * 按钮状态：可用=亮色、已用=灰色、条件不满足=红色
 */
import { useMemo } from 'react'
import { getAbilitiesForCharacter, canUseAbility } from '../../lib/activeAbilityEngine'
import * as Icons from 'lucide-react'

const ICON_SIZE = 14

const ACTION_TYPE_ORDER = ['bonus_action', 'action', 'reaction', 'special']
const ACTION_TYPE_LABEL = {
  action: '主动作',
  bonus_action: '附赠动作',
  reaction: '反应',
  special: '特殊',
}
const ACTION_TYPE_COLOR = {
  action: { badge: 'bg-blue-500/20 text-blue-300', header: 'text-blue-300' },
  bonus_action: { badge: 'bg-green-500/20 text-green-300', header: 'text-green-300' },
  reaction: { badge: 'bg-purple-500/20 text-purple-300', header: 'text-purple-300' },
  special: { badge: 'bg-gray-500/20 text-gray-400', header: 'text-gray-400' },
}

/**
 * @param {Object} props
 * @param {Object} props.char - 角色数据
 * @param {Function} props.onExecute - 执行技能回调 (ability, context) => void
 */
export default function ActionPanel({ char, onExecute, moduleId }) {
  const grouped = useMemo(() => {
    const all = getAbilitiesForCharacter(char, moduleId)
    if (!all.length) return null
    const groups = {}
    for (const entry of all) {
      const at = entry.ability.actionType || 'special'
      if (!groups[at]) groups[at] = []
      groups[at].push(entry)
    }
    // 按动作类型排序
    const sorted = {}
    for (const key of ACTION_TYPE_ORDER) {
      if (groups[key]) sorted[key] = groups[key]
    }
    return sorted
  }, [char, moduleId])

  if (!grouped || Object.keys(grouped).length === 0) return null

  return (
    <div className="rounded-lg border border-dnd-gold/20 bg-gray-800/40 p-2">
      <h3 className="text-dnd-gold-light text-[10px] font-bold uppercase tracking-wider mb-1.5">
        主动技能
      </h3>
      <div className="flex flex-col gap-2">
        {Object.entries(grouped).map(([actionType, entries]) => (
          <div key={actionType}>
            <div className={`text-[9px] font-medium mb-1 ${ACTION_TYPE_COLOR[actionType]?.header || 'text-gray-400'}`}>
              {ACTION_TYPE_LABEL[actionType] || actionType}
            </div>
            <div className="flex flex-wrap gap-1">
              {entries.map(({ ability, context }) => (
                <AbilityButton
                  key={ability.id}
                  ability={ability}
                  char={char}
                  onExecute={() => onExecute(ability, context)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function AbilityButton({ ability, char, onExecute }) {
  const check = canUseAbility(ability, char)
  const IconComp = Icons[ability.icon] || Icons.Zap

  // 状态判定
  const usable = check.usable
  const stateClass = usable
    ? 'border-dnd-gold/40 bg-dnd-gold/10 text-dnd-gold-light hover:bg-dnd-gold/20 hover:border-dnd-gold active:scale-95'
    : 'border-red-900/40 bg-red-950/20 text-red-400/60 cursor-not-allowed'

  const costText = formatCost(ability)

  return (
    <button
      type="button"
      disabled={!usable}
      onClick={onExecute}
      className={`
        group relative flex items-center gap-1 px-1.5 py-1 rounded-md text-[11px] font-medium
        transition-all border
        ${stateClass}
      `}
      title={`${ability.name}${ability.description ? '\n' + ability.description : ''}\n${usable ? '点击使用' : check.reason}`}
    >
      <IconComp size={ICON_SIZE} className={usable ? 'text-dnd-gold-light' : 'text-red-400/40'} />
      <span className="truncate max-w-[4.5rem]">{ability.name}</span>
      {costText && (
        <span className={`text-[9px] ${usable ? 'text-dnd-gold/60' : 'text-red-400/30'}`}>
          {costText}
        </span>
      )}
    </button>
  )
}

function formatCost(ability) {
  if (ability.cost.type === 'class_resource') {
    return `${ability.cost.amount}${getResourceSymbol(ability.cost.resourceKey)}`
  }
  if (ability.cost.type === 'none') {
    if (ability.cooldown !== 'none') return '免费'
    return ''
  }
  return ''
}

function getResourceSymbol(resourceKey) {
  switch (resourceKey) {
    case 'star_points': return '星'
    case 'wild_shape': return '变'
    case 'second_wind': return '气'
    case 'lay_on_hands': return '疗'
    case 'focus_points': return '专'
    default: return ''
  }
}
