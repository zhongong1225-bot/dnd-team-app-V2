import { X, Moon, Sun, Sunrise } from 'lucide-react'

const restIcon = {
  short_rest: Moon,
  long_rest: Moon,
  dawn: Sunrise,
}

const restLabel = {
  short_rest: '短休',
  long_rest: '长休',
  dawn: '黎明',
}

export default function RecoverySummaryModal({ open, onClose, eventType, summary }) {
  if (!open || !summary) return null

  const Icon = restIcon[eventType] || Sun
  const label = restLabel[eventType] || '休息'

  const sections = []

  if (summary.classResources?.length > 0) {
    sections.push({
      title: '职业资源',
      items: summary.classResources.map((r) => ({
        name: r.name,
        detail: `${r.from} → ${r.to}`,
      })),
    })
  }

  if (summary.shields?.length > 0) {
    sections.push({
      title: '护盾',
      items: summary.shields.map((s) => ({
        name: s.name,
        detail: `${s.from} → ${s.to}`,
      })),
    })
  }

  if (summary.shieldPools?.length > 0) {
    sections.push({
      title: '护盾池',
      items: summary.shieldPools.map((s) => ({
        name: s.name,
        detail: `${s.from} → ${s.to}`,
      })),
    })
  }

  if (summary.inventory?.length > 0) {
    sections.push({
      title: '物品充能',
      items: summary.inventory.map((l) => ({
        name: l.name,
        detail: `${l.from} → ${l.to}${l.expression ? '（' + l.expression + '）' : ''}`,
      })),
    })
  }

  if (summary.spellSlots?.length > 0) {
    sections.push({
      title: '法术位',
      items: summary.spellSlots.map((s) => ({
        name: `第 ${s.ring} 环`,
        detail: `${s.from} → ${s.to}`,
      })),
    })
  }

  if (summary.pactSlots?.length > 0) {
    sections.push({
      title: '契约法术位',
      items: summary.pactSlots.map((s) => ({
        name: `第 ${s.ring} 环`,
        detail: `${s.from} → ${s.to}`,
      })),
    })
  }

  if (summary.abilities?.length > 0) {
    sections.push({
      title: '主动技能冷却',
      items: summary.abilities.map((a) => ({
        name: a.name,
        detail: '已重置',
      })),
    })
  }

  if (summary.buffsCleared > 0) {
    sections.push({
      title: 'BUFF',
      items: [{ name: '到期 BUFF', detail: `清理了 ${summary.buffsCleared} 个` }],
    })
  }

  if (sections.length === 0) {
    sections.push({
      title: '无恢复',
      items: [{ name: '没有需要恢复的内容', detail: '' }],
    })
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70" onClick={onClose}>
      <div
        className="rounded-xl bg-[#1a1f2e] border border-white/10 shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 标题栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-dnd-gold" />
            <span className="text-dnd-gold-light font-bold text-base">{label}恢复</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded hover:bg-white/10 text-gray-400 hover:text-gray-200 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {sections.map((section, si) => (
            <div key={si}>
              <p className="text-xs text-gray-500 font-medium mb-1.5">{section.title}</p>
              <div className="space-y-1">
                {section.items.map((item, ii) => (
                  <div key={ii} className="flex items-center justify-between text-sm">
                    <span className="text-gray-300 truncate mr-2">{item.name}</span>
                    <span className="text-dnd-gold/80 font-mono text-xs whitespace-nowrap">{item.detail}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 底部按钮 */}
        <div className="px-4 py-3 border-t border-white/10">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-9 rounded-lg bg-dnd-gold/20 border border-dnd-gold/30 text-dnd-gold-light text-sm font-medium hover:bg-dnd-gold/30 transition-colors"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  )
}
