/**
 * SummonedCreaturesPanel — 召唤物管理面板
 * 
 * 显示当前所有召唤物列表，支持删除、查看状态
 * 星辰替身特殊处理：HP = 角色最大HP的一半
 */

import { Trash2, Sparkles } from 'lucide-react'
import { calcMaxHP, getHPBuffSum } from '../../lib/formulas'

export default function SummonedCreaturesPanel({ char, onDelete, onSummon }) {
  const summons = Array.isArray(char.summonedCreatures) ? char.summonedCreatures : []
  const hasStellarDoubleFeat = (char?.selectedFeats ?? []).some(f => f?.featId === 'star_doppelganger')

  if (summons.length === 0 && !hasStellarDoubleFeat) {
    return null
  }

  return (
    <div className="mt-4 p-3 bg-gray-800/50 rounded-lg border border-gray-700">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wide">
          召唤物{summons.length > 0 ? ` (${summons.length})` : ''}
        </h3>
        {hasStellarDoubleFeat && onSummon && (
          <button
            type="button"
            onClick={onSummon}
            className="flex items-center gap-1 rounded border border-purple-500/40 bg-purple-500/10 px-2 py-1 text-[10px] font-medium text-purple-300 hover:bg-purple-500/20 transition-colors"
          >
            <Sparkles size={10} />
            召唤星辰分身
          </button>
        )}
      </div>
      
      {summons.length === 0 ? (
        <p className="text-xs text-gray-500 text-center py-2">暂无召唤物</p>
      ) : (
        <div className="space-y-2">
          {summons.map((summon, idx) => {
            const isStellarDouble = summon.type === 'stellar_double'
            
            return (
              <div key={summon.id || idx} className="p-2.5 bg-gray-900/60 rounded-md border border-gray-700 hover:border-gray-600 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    {/* 名称 + 类型标识 */}
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className={`text-sm font-medium ${isStellarDouble ? 'text-purple-300' : 'text-blue-300'}`}>
                        {summon.name}
                      </span>
                      {isStellarDouble && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                          星辰替身
                        </span>
                      )}
                    </div>
                    
                    {/* HP 条 */}
                    <div className="mb-1">
                      <div className="flex items-center justify-between text-[10px] text-gray-400 mb-0.5">
                        <span>HP</span>
                        <span>{summon.hp?.current ?? 0}/{summon.hp?.max ?? 0}</span>
                      </div>
                      <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all ${isStellarDouble ? 'bg-purple-500' : 'bg-blue-500'}`}
                          style={{ width: `${Math.min(100, ((summon.hp?.current || 0) / Math.max(1, summon.hp?.max || 1)) * 100)}%` }}
                        />
                      </div>
                    </div>
                    
                    {/* 额外信息 */}
                    {summon.createdAt && (
                      <div className="text-[9px] text-gray-500">
                        创建于 {new Date(summon.createdAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                  
                  {/* 删除按钮 */}
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => onDelete(summon.id)}
                      className="p-1.5 rounded-md text-gray-500 hover:text-red-400 hover:bg-red-900/20 transition-colors shrink-0"
                      title="移除召唤物"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
