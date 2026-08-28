import React from 'react';

/**
 * 模式选择弹窗 - 首次配置BUFF时让用户选择效果类型
 * @param {Function} onSelect - 用户选择模式后的回调 (mode: 'active' | 'passive')
 * @param {Function} onCancel - 取消按钮回调
 */
export default function ModeSelectionModal({ onSelect, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-[9999]">
      <div className="bg-dnd-bg border-2 border-dnd-gold rounded-lg p-6 max-w-2xl w-full mx-4 shadow-2xl">
        {/* 标题 */}
        <h3 className="text-2xl font-bold text-dnd-gold mb-2 text-center">
          请选择效果类型
        </h3>
        <p className="text-gray-400 text-sm text-center mb-6">
          这将决定该专长/特性在角色卡上的表现方式
        </p>
        
        {/* 两个选项卡片 */}
        <div className="flex gap-6 mb-6">
          {/* 主动临时 */}
          <button 
            onClick={() => onSelect('active')}
            className="flex-1 p-5 border-2 border-cyan-400 rounded-lg hover:bg-cyan-400/10 transition-all duration-200 group text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">⚡</span>
              <div>
                <div className="text-cyan-400 font-bold text-xl group-hover:text-cyan-300">
                  主动临时
                </div>
                <div className="text-xs text-gray-400">Active & Temporary</div>
              </div>
            </div>
            
            <ul className="text-sm text-gray-300 space-y-2 ml-2">
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-0.5">•</span>
                <span>需要消耗资源（幸运点、星辰点等）</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-0.5">•</span>
                <span>手动释放（点击「使用」按钮触发）</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-0.5">•</span>
                <span>时效性效果（临时增益、伤害、召唤等）</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 mt-0.5">•</span>
                <span>具有持续时间或一次性效果</span>
              </li>
            </ul>
            
            <div className="mt-4 pt-3 border-t border-cyan-400/30">
              <div className="text-xs text-cyan-400 font-semibold">
                适用场景：法术施放、变身、召唤、爆发增益、反击能力
              </div>
            </div>
          </button>
          
          {/* 被动常驻 */}
          <button 
            onClick={() => onSelect('passive')}
            className="flex-1 p-5 border-2 border-dnd-gold rounded-lg hover:bg-dnd-gold/10 transition-all duration-200 group text-left"
          >
            <div className="flex items-center gap-3 mb-3">
              <span className="text-3xl">♾️</span>
              <div>
                <div className="text-dnd-gold font-bold text-xl group-hover:text-yellow-300">
                  被动常驻
                </div>
                <div className="text-xs text-gray-400">Passive & Permanent</div>
              </div>
            </div>
            
            <ul className="text-sm text-gray-300 space-y-2 ml-2">
              <li className="flex items-start gap-2">
                <span className="text-dnd-gold mt-0.5">•</span>
                <span>持续生效（无需任何操作）</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-dnd-gold mt-0.5">•</span>
                <span>属性加成、熟练项、抗性、豁免优势</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-dnd-gold mt-0.5">•</span>
                <span>永久增益（直到被移除或替换）</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-dnd-gold mt-0.5">•</span>
                <span>自动计入角色各项数值计算</span>
              </li>
            </ul>
            
            <div className="mt-4 pt-3 border-t border-dnd-gold/30">
              <div className="text-xs text-dnd-gold font-semibold">
                适用场景：属性提升、技能熟练、装备加成、种族特性
              </div>
            </div>
          </button>
        </div>
        
        {/* 底部提示 */}
        <div className="bg-gray-800/50 rounded p-3 mb-4">
          <div className="text-xs text-gray-400 flex items-start gap-2">
            <span className="text-yellow-400 mt-0.5">💡</span>
            <span>
              <strong>提示：</strong>选择后仍可切换模式，但建议根据实际用途选择。
              主动模式会在卡片上显示「使用」按钮，被动模式则自动生效。
            </span>
          </div>
        </div>
        
        {/* 取消按钮 */}
        <button 
          onClick={onCancel}
          className="w-full py-2.5 border border-gray-600 rounded hover:bg-gray-700 text-gray-300 transition-colors"
        >
          取消
        </button>
      </div>
    </div>
  );
}
