/**
 * 攻击结果面板 — 展示一次完整攻击的命中骰 + 伤害骰结果
 * 命中与否由 DM 判定，本组件只做展示。
 */
import React from 'react'
import { Shield, Swords } from 'lucide-react'

const PANEL_BORDER = 'border border-gray-600 rounded-lg bg-gray-800/90 shadow-[0_2px_10px_rgba(0,0,0,0.42)]'

/** 骰值高亮（nat20 / nat1） */
function DiceHighlight({ value, max = 20 }) {
  if (value === max) return <span className="text-green-400 font-bold">{value}</span>
  if (value === 1) return <span className="text-red-400 font-bold">{value}</span>
  return <span className="text-white font-bold">{value}</span>
}

export default function AttackResultPanel({ attackResult, damageResult }) {
  if (!attackResult && !damageResult) return null

  return (
    <div className={PANEL_BORDER}>
      <div className="flex items-center gap-2 px-2 py-1.5">
        {/* 攻击骰部分 */}
        {attackResult && (
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Shield size={12} className="text-red-400 shrink-0" />
            <span className="text-[10px] text-dnd-text-muted shrink-0">命中</span>
            {attackResult.d20Result != null && (
              <>
                <span className="text-[10px] text-dnd-text-muted">[</span>
                <DiceHighlight value={attackResult.d20Result} />
                <span className="text-[10px] text-dnd-text-muted">]</span>
              </>
            )}
            <span className="text-white font-mono text-sm tabular-nums">
              {attackResult.total >= 0 ? '+' : ''}{attackResult.total}
            </span>
          </div>
        )}

        {/* 分隔线 */}
        {attackResult && damageResult && (
          <div className="h-4 w-px bg-gray-600 shrink-0" />
        )}

        {/* 伤害部分 */}
        {damageResult && (
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <Swords size={12} className="text-amber-400 shrink-0" />
            <span className="text-[10px] text-dnd-text-muted shrink-0">伤害</span>
            <span className="text-white font-mono text-sm tabular-nums">
              {damageResult.total}
            </span>
            <span className="text-[10px] text-dnd-text-muted truncate">
              {damageResult.formula}
            </span>
            {damageResult.damageType && (
              <span className="text-[10px] text-amber-300/80 shrink-0">{damageResult.damageType}</span>
            )}
          </div>
        )}
      </div>

      {/* 多类型伤害明细 */}
      {damageResult?.damageByType?.length > 0 && (
        <div className="flex items-center gap-1 px-2 pb-1.5 flex-wrap">
          {damageResult.damageByType.map((row, i) => (
            <span key={`${row.type}-${i}`} className="text-[10px] font-mono text-dnd-gold-light">
              {i > 0 && <span className="text-dnd-text-muted/60 mr-0.5">|</span>}
              {row.type}: {row.subtotal}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
