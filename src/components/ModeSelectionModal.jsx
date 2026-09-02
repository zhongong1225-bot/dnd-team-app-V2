import React from 'react';
import { Zap, Infinity as InfinityIcon, Lightbulb } from 'lucide-react';

/**
 * 模式选择弹窗 - 首次配置BUFF时让用户选择效果类型
 * 统一使用 module-panel + panel-card-compact 设计体系
 * @param {Function} onSelect - 用户选择模式后的回调 (mode: 'active' | 'passive')
 * @param {Function} onCancel - 取消按钮回调
 */
export default function ModeSelectionModal({ onSelect, onCancel }) {
  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4 bg-black/60" onClick={onCancel}>
      <div
        className="module-panel w-full max-w-2xl !p-5"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题 */}
        <h3 className="text-lg font-bold text-dnd-gold text-center mb-1">
          请选择效果类型
        </h3>
        <p className="text-xs text-gray-500 text-center mb-5">
          这将决定该专长/特性在角色卡上的表现方式
        </p>

        {/* 两个选项卡片 */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          {/* 主动临时 */}
          <button
            onClick={() => onSelect('active')}
            className="panel-card-compact text-left p-4 hover:border-cyan-500/40 transition-colors group cursor-pointer"
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-md bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center shrink-0">
                <Zap className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <div className="text-sm font-bold text-cyan-400 group-hover:text-cyan-300 transition-colors">
                  主动临时
                </div>
                <div className="text-[10px] text-gray-500">Active & Temporary</div>
              </div>
            </div>

            <ul className="text-xs text-gray-400 space-y-1.5">
              <li className="flex items-start gap-1.5">
                <span className="text-cyan-500/60 mt-px shrink-0">•</span>
                <span>需要消耗资源（幸运点、星辰点等）</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-cyan-500/60 mt-px shrink-0">•</span>
                <span>手动释放（点击「使用」按钮触发）</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-cyan-500/60 mt-px shrink-0">•</span>
                <span>时效性效果（临时增益、伤害、召唤等）</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-cyan-500/60 mt-px shrink-0">•</span>
                <span>具有持续时间或一次性效果</span>
              </li>
            </ul>

            <div className="mt-3 pt-2.5 border-t border-gray-700/40">
              <div className="text-[10px] text-cyan-400/80 font-medium">
                适用场景：法术施放、变身、召唤、爆发增益、反击能力
              </div>
            </div>
          </button>

          {/* 被动常驻 */}
          <button
            onClick={() => onSelect('passive')}
            className="panel-card-compact text-left p-4 hover:border-dnd-gold/40 transition-colors group cursor-pointer"
          >
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-md bg-dnd-gold/15 border border-dnd-gold/30 flex items-center justify-center shrink-0">
                <InfinityIcon className="w-4 h-4 text-dnd-gold-light" />
              </div>
              <div>
                <div className="text-sm font-bold text-dnd-gold-light group-hover:text-yellow-300 transition-colors">
                  被动常驻
                </div>
                <div className="text-[10px] text-gray-500">Passive & Permanent</div>
              </div>
            </div>

            <ul className="text-xs text-gray-400 space-y-1.5">
              <li className="flex items-start gap-1.5">
                <span className="text-dnd-gold/60 mt-px shrink-0">•</span>
                <span>持续生效（无需任何操作）</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-dnd-gold/60 mt-px shrink-0">•</span>
                <span>属性加成、熟练项、抗性、豁免优势</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-dnd-gold/60 mt-px shrink-0">•</span>
                <span>永久增益（直到被移除或替换）</span>
              </li>
              <li className="flex items-start gap-1.5">
                <span className="text-dnd-gold/60 mt-px shrink-0">•</span>
                <span>自动计入角色各项数值计算</span>
              </li>
            </ul>

            <div className="mt-3 pt-2.5 border-t border-gray-700/40">
              <div className="text-[10px] text-dnd-gold/80 font-medium">
                适用场景：属性提升、技能熟练、装备加成、种族特性
              </div>
            </div>
          </button>
        </div>

        {/* 底部提示 */}
        <div className="panel-card-compact !p-2.5 mb-3 flex items-start gap-2">
          <Lightbulb className="w-3.5 h-3.5 text-dnd-gold/60 mt-px shrink-0" />
          <span className="text-[11px] text-gray-500 leading-relaxed">
            选择后仍可切换模式，但建议根据实际用途选择。主动模式会在卡片上显示「使用」按钮，被动模式则自动生效。
          </span>
        </div>

        {/* 取消按钮 */}
        <button
          onClick={onCancel}
          className="w-full py-2 rounded-md text-xs font-medium text-gray-400 border border-gray-700/60 hover:bg-gray-700/30 hover:text-gray-300 transition-colors active:scale-[0.99]"
        >
          取消
        </button>
      </div>
    </div>
  );
}
