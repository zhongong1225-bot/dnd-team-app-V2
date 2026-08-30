import { useState, useRef, useEffect, useMemo } from 'react'
import { getMergedSpells } from '../data/spellDatabase'

const LEVEL_LABELS = ['戏法', '一环', '二环', '三环', '四环', '五环', '六环', '七环', '八环', '九环']

/**
 * 法术名称搜索自动填充组件。
 * 输入关键字（单字/多字）模糊匹配法术名，选中后自动填充环位、距离等字段。
 */
export default function SpellNameAutocomplete({
  value = '',
  onChange,
  onSelect,
  placeholder = '法术名称',
  className = '',
  listId,
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState(value)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)

  // 同步外部 value 变化（如从 spellId 解析出的名称）
  useEffect(() => {
    setQuery(value)
  }, [value])

  // 点击外部关闭下拉
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const allSpells = useMemo(() => getMergedSpells(), [])

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return allSpells
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, 20)
  }, [query, allSpells])

  const handleInputChange = (e) => {
    const v = e.target.value
    setQuery(v)
    setOpen(true)
    onChange?.(v)
  }

  const handleSelect = (spell) => {
    setQuery(spell.name)
    setOpen(false)
    onSelect?.(spell)
  }

  const handleFocus = () => {
    if (query.trim()) setOpen(true)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setOpen(false)
      inputRef.current?.blur()
    }
    if (e.key === 'Enter' && matches.length === 1) {
      handleSelect(matches[0])
      e.preventDefault()
    }
  }

  return (
    <div ref={wrapRef} className="relative inline-block" style={{ minWidth: '6rem' }}>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={handleInputChange}
        onFocus={handleFocus}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        spellCheck={false}
        list={listId}
        title={placeholder}
      />
      {open && matches.length > 0 && (
        <div
          className="absolute z-50 mt-1 w-64 max-h-60 overflow-y-auto rounded-md border border-cyan-800/40 bg-[#0d1520] shadow-lg shadow-black/40"
          style={{ top: '100%' }}
        >
          {matches.map((s) => (
            <button
              key={s.id}
              type="button"
              className="w-full text-left px-2.5 py-1.5 hover:bg-cyan-900/30 transition-colors border-b border-white/[0.04] last:border-b-0"
              onMouseDown={(e) => {
                e.preventDefault()
                handleSelect(s)
              }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-white text-sm truncate">{s.name}</span>
                <span className="text-cyan-400/70 text-[10px] shrink-0">{LEVEL_LABELS[s.level] ?? s.level}</span>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                {s.range && <span className="text-gray-400 text-[10px]">{s.range}</span>}
                {s.school && <span className="text-gray-500 text-[10px]">{s.school}</span>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
