import React, { useState, useEffect } from 'react'
/* eslint-disable react/prop-types -- 小型受控组件，由调用方保证类型 */
import { Pencil, X } from 'lucide-react'
import { textareaClass, inputClass } from '../lib/inputStyles'
import {
  loadRuleTextOverrides,
  resolveRuleText,
  setRuleTextEntry,
  clearRuleTextEntry,
} from '../lib/ruleTextOverrides'

/**
 * 名称 + 正文 合并编辑：规则收录中职业/子职特性等，单按钮弹窗内两项一并保存。
 */
export default function RuleTextPairOverrideControl({
  moduleId,
  nameKey,
  originalName,
  descKey,
  originalDescription,
  isAdmin,
  title = '编辑',
  buttonClassName = 'inline-flex shrink-0 items-center justify-center rounded p-1 text-gray-500 hover:bg-white/10 hover:text-dnd-gold-light',
}) {
  const [open, setOpen] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [draftDesc, setDraftDesc] = useState('')

  useEffect(() => {
    if (!open) return
    const map = loadRuleTextOverrides(moduleId)
    setDraftName(resolveRuleText(map, nameKey, originalName ?? ''))
    setDraftDesc(resolveRuleText(map, descKey, originalDescription ?? ''))
  }, [open, moduleId, nameKey, descKey, originalName, originalDescription])

  if (!isAdmin || !nameKey || !descKey) return null

  const handleSave = () => {
    setRuleTextEntry(moduleId, nameKey, draftName, originalName)
    setRuleTextEntry(moduleId, descKey, draftDesc, originalDescription)
    setOpen(false)
  }

  const handleReset = () => {
    clearRuleTextEntry(moduleId, nameKey)
    clearRuleTextEntry(moduleId, descKey)
    setDraftName(originalName ?? '')
    setDraftDesc(originalDescription ?? '')
    setOpen(false)
  }

  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        title={`${title}（存于本机·当前战役）`}
        aria-label={title}
        onClick={() => setOpen(true)}
      >
        <Pencil className="h-3.5 w-3.5" aria-hidden />
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-3 bg-black/65"
          role="dialog"
          aria-modal="true"
          aria-label={title}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false)
          }}
        >
          <div
            className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-white/15 bg-[#1b2738] shadow-xl"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10">
              <span className="text-sm font-semibold text-dnd-gold-light/95">{title}</span>
              <button
                type="button"
                className="p-1 rounded text-gray-400 hover:bg-white/10 hover:text-white"
                aria-label="关闭"
                onClick={() => setOpen(false)}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="px-3 pt-2 text-[11px] text-dnd-text-muted leading-snug">
              保存后仅替换展示文案，不写回代码；数据存在本浏览器当前战役下。
            </p>
            <div className="p-3 flex-1 min-h-0 flex flex-col gap-3 overflow-y-auto">
              <div>
                <label className="block text-dnd-text-muted text-xs font-medium mb-1">显示名称</label>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => setDraftName(e.target.value)}
                  className={inputClass + ' w-full text-sm'}
                  spellCheck={false}
                />
              </div>
              <div className="flex flex-col min-h-0 flex-1">
                <label className="block text-dnd-text-muted text-xs font-medium mb-1">正文</label>
                <textarea
                  value={draftDesc}
                  onChange={(e) => setDraftDesc(e.target.value)}
                  className={textareaClass + ' flex-1 !min-h-[28rem] text-sm'}
                  spellCheck={false}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-2 px-3 pb-3 justify-end border-t border-white/10 pt-3">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-xs border border-white/20 text-dnd-text-muted hover:bg-white/5"
                onClick={handleReset}
              >
                恢复默认
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-xs border border-white/20 text-dnd-text-muted hover:bg-white/5"
                onClick={() => setOpen(false)}
              >
                取消
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-dnd-red/90 text-white hover:bg-dnd-red"
                onClick={handleSave}
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
