import { X } from 'lucide-react'
import BuffForm from './BuffForm'

/**
 * 统一 BUFF 编辑器弹窗
 *
 * 封装 modal overlay + BuffForm，替代各处重复的弹窗壳。
 *
 * @param {boolean}   open         是否显示
 * @param {function}  onClose      关闭回调（点遮罩 / 关闭按钮 / 取消）
 * @param {React.node} header      自定义头部内容（选择器、输入框等），替换 title
 * @param {string}    title        简单标题（header 未提供时使用）
 * @param {string}    description  标题下方的描述文字
 * @param {number}    zIndex       遮罩层 z-index（默认 300，内容区 +1）
 * @param {boolean}   plain        无卡片壳，直接渲染 BuffForm（用于 ModuleLibrary 等场景）
 * @param {object}    buffFormProps 透传给 BuffForm 的所有 props
 */
export default function BuffEditorModal({
  open,
  onClose,
  header,
  title,
  description,
  zIndex = 300,
  plain,
  wide,
  buffFormProps,
}) {
  if (!open) return null

  return (
    <>
      <div
        className="fixed inset-0 bg-black/60"
        style={{ zIndex }}
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed inset-0 flex items-center justify-center p-4 sm:p-8 overflow-auto"
        style={{ zIndex: zIndex + 1 }}
        onClick={onClose}
      >
        {plain ? (
          <div className={`w-full ${wide ? 'max-w-5xl' : 'max-w-3xl'} max-h-[90vh] overflow-auto`} onClick={(e) => e.stopPropagation()}>
            <BuffForm {...buffFormProps} onCancel={onClose} />
          </div>
        ) : (
          <div
            className={`w-full ${wide ? 'max-w-5xl' : 'max-w-3xl'} max-h-[90vh] overflow-auto rounded-xl border border-white/15 bg-[#1b2738] shadow-xl`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-4 border-b border-white/10">
              {header || (
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold text-dnd-gold-light/90">{title}</h3>
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1.5 rounded-lg text-gray-400 hover:bg-white/10 hover:text-white"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              )}
              {description && (
                <p className="text-xs text-dnd-text-muted mt-1">{description}</p>
              )}
            </div>
            <div className="p-4">
              <BuffForm {...buffFormProps} onCancel={onClose} />
            </div>
          </div>
        )}
      </div>
    </>
  )
}
