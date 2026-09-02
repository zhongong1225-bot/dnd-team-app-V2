/**
 * CreatureSelectorModal — 生物库选择弹窗
 * 
 * 用于德鲁伊变身等需要动态选择生物的场景。
 * 点击变身按钮时弹出，用户从生物库中选择目标生物后确认。
 */

import { useState, useMemo } from 'react'
import { X, Search } from 'lucide-react'
import { listCreatures, CREATURE_SIZES, CREATURE_TYPES } from '../data/creatureLibrary'

export default function CreatureSelectorModal({ onSelect, onClose, filterCR = null }) {
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedSize, setSelectedSize] = useState('')
  const [selectedType, setSelectedType] = useState('')

  // 获取所有生物并应用筛选
  const allCreatures = useMemo(() => {
    return listCreatures({ type: selectedType || undefined })
  }, [selectedType])

  const filteredCreatures = useMemo(() => {
    let result = allCreatures

    // CR 筛选（用于德鲁伊等级限制）
    if (filterCR !== null) {
      result = result.filter(c => c.cr <= filterCR)
    }

    // 体型筛选
    if (selectedSize) {
      result = result.filter(c => c.size === selectedSize)
    }

    // 搜索筛选
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      result = result.filter(c => 
        c.name.toLowerCase().includes(term) ||
        c.type?.toLowerCase().includes(term)
      )
    }

    return result.sort((a, b) => a.name.localeCompare(b.name))
  }, [allCreatures, filterCR, selectedSize, searchTerm])

  const handleSelect = (creature) => {
    onSelect(creature)
    onClose()
  }

  return (
    <>
      <div className="fixed inset-0 z-[500] bg-black/60" onClick={onClose} aria-hidden />
      <div className="fixed inset-0 z-[501] flex items-center justify-center p-4" onClick={onClose}>
        <div
          className="bg-gray-800 border border-gray-700 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* 标题栏 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
            <h3 className="text-sm font-medium text-white">选择变身生物</h3>
            <button type="button" onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
              <X size={16} />
            </button>
          </div>

          {/* 筛选栏 */}
          <div className="px-4 py-2 border-b border-gray-700 space-y-2">
            {/* 搜索框 */}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索生物名称..."
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-700 border border-gray-600 rounded text-gray-200 placeholder-gray-500 focus:outline-none focus:border-gray-500"
              />
            </div>

            {/* 体型和类型筛选 */}
            <div className="flex gap-2">
              <select
                value={selectedSize}
                onChange={(e) => setSelectedSize(e.target.value)}
                className="flex-1 px-2 py-1.5 text-xs bg-gray-700 border border-gray-600 rounded text-gray-200 focus:outline-none focus:border-gray-500"
              >
                <option value="">所有体型</option>
                {CREATURE_SIZES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value)}
                className="flex-1 px-2 py-1.5 text-xs bg-gray-700 border border-gray-600 rounded text-gray-200 focus:outline-none focus:border-gray-500"
              >
                <option value="">所有类型</option>
                {CREATURE_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* 生物列表 */}
          <div className="overflow-y-auto max-h-[50vh] p-2">
            {filteredCreatures.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-xs">
                {allCreatures.length === 0 ? '生物库为空，请先在生物库管理页面添加生物' : '没有符合条件的生物'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {filteredCreatures.map(creature => (
                  <button
                    key={creature.id}
                    onClick={() => handleSelect(creature)}
                    className="p-2 rounded border border-gray-700 bg-gray-700/50 hover:bg-gray-700 hover:border-gray-600 transition-colors text-left"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-white">{creature.name}</span>
                      <span className="text-[10px] text-gray-400">CR {creature.cr}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] text-gray-400">
                      <span>{CREATURE_SIZES.find(s => s.value === creature.size)?.label || creature.size}</span>
                      <span>•</span>
                      <span className="capitalize">{creature.type || '未知'}</span>
                      {creature.speed?.walk && (
                        <>
                          <span>•</span>
                          <span>速度 {creature.speed.walk}</span>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 底部提示 */}
          <div className="px-4 py-2 border-t border-gray-700 text-[10px] text-gray-500 text-center">
            点击生物卡片即可选择
          </div>
        </div>
      </div>
    </>
  )
}
