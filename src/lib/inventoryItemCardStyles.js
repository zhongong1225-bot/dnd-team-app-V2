/**
 * 物品卡统一视觉：背包 / 次元袋 / 团队仓库秘法箱与公家袋等共用。
 * 调整间距、阴影、说明字号时请改此文件以保持全局一致。
 */

/**
 * 外投影：仍偏紧、不散太远，但透明度略提高，在深色底上能看出层次（过弱会像「没投影」）。
 */
export const inventoryItemCardShadow =
  'shadow-[0_2px_10px_rgba(0,0,0,0.42),0_1px_4px_rgba(0,0,0,0.34)]'

/**
 * 外卡片壳：微渐变 + 内描边轻质感；悬停略提亮边线。
 * 渐变与角色卡「背包」分区壳 `bg-[#141c28]` 同色相：顶/底由 #141c28 等比微调明度，避免与 `gray-800` 标题条对比时发绿、发青。
 */
export const inventoryItemCardShellClass =
  `rounded-md border border-gray-600/45 bg-gradient-to-b from-[#161e2b] via-[#141c28] to-[#121a25] px-3.5 py-2 min-w-0 flex flex-col overflow-hidden ring-1 ring-inset ring-white/[0.028] transition-[opacity,box-shadow,border-color] hover:border-gray-500/55 ${inventoryItemCardShadow}`

/** 列表内相邻物品卡竖间距：为原 gap-4（1rem）的 3/5，即间隔减少 2/5；背包 / 次元袋 / 仓库等共用 */
export const inventoryItemCardListGapClass = 'gap-[0.6rem]'

/**
 * 充能 / 数量+重量：已合并到名称行内联显示，不再作为独立 grid 列。
 * 保留常量供旧引用兼容。
 */
export const INV_COL_CHARGE = '6.5rem'
export const INV_COL_QTY_WEIGHT = '8.5rem'
/** 编辑列：按 4 个图标（存仓·编辑·锁·删）预留宽度，仅 3 个时也占满本列，各行右缘对齐 */
export const INV_COL_ACTIONS = '6rem'

/**
 * 统一网格：名称(1.6fr) | 充能(6rem) | 释放(4.5rem) | 空白(1fr×2) | 数量(3.5rem) | 重量(4rem) | 操作(3.5rem)
 * gap-x-2 让充能/释放紧跟名称但不贴死；空白列把数量/重量/操作推到右侧。
 * 替代旧的 inventoryItemRowGrid* 系列 class。
 */
export const inventoryItemRowGridUnified =
  'grid grid-cols-[minmax(0,1.6fr)_6rem_4.5rem_0.5fr_0.5fr_3.5rem_4rem_7rem] gap-x-2 items-center min-w-0 shrink-0'

/** 充能步进器容器 */
export const chargeStepperClass =
  'flex items-center h-7'

/** 充能步进器 ± 按钮 */
export const chargeStepperBtnClass =
  'w-[22px] h-7 flex items-center justify-center bg-white/[0.06] border border-white/[0.08] text-dnd-text-muted text-sm font-semibold cursor-pointer select-none transition-colors hover:bg-white/[0.12] hover:text-gray-300'

/** 充能进度条外框 */
export const chargeBarWrapClass =
  'flex-1 h-7 bg-white/[0.04] border-y border-white/[0.08] relative overflow-hidden'

/** 充能进度条填充 */
export const chargeBarFillClass =
  'h-full transition-[width] duration-200'

/** 充能进度条填充色：低透明度灰蓝，避免在深色卡片上抢夺视觉重心 */
export const chargeBarFillGradient =
  'linear-gradient(90deg, rgba(74,144,217,0.18), rgba(124,179,245,0.12))'

/** 充能数值文字（内置于进度条） */
export const chargeTextClass =
  'absolute inset-0 flex items-center justify-center text-[11px] font-semibold text-gray-300 tracking-wide'

/** 释放按钮 */
export const releaseBtnClass =
  'flex items-center justify-center gap-1 w-full h-7 rounded-md bg-dnd-gold/[0.12] border border-dnd-gold/25 text-dnd-gold-light text-[10px] font-medium cursor-pointer transition-colors hover:bg-dnd-gold/[0.22] hover:border-dnd-gold/40 active:scale-[0.96]'

/** 操作列：直接图标按钮（无背景无边框，hover 才亮） */
export const actionIconBtnClass =
  'w-7 h-7 flex items-center justify-center rounded-md text-dnd-text-muted cursor-pointer transition-colors hover:bg-white/[0.08] hover:text-gray-300'

/** 操作列：危险图标按钮（删除用，hover 显红底） */
export const actionIconBtnDangerClass =
  'w-7 h-7 flex items-center justify-center rounded-md text-dnd-text-muted cursor-pointer transition-colors hover:bg-dnd-red/10 hover:text-dnd-red'

/** 操作列：单个下拉按钮 */
export const actionDropdownBtnClass =
  'w-7 h-7 flex items-center justify-center rounded-md bg-white/[0.05] border border-white/[0.08] text-dnd-text-muted text-sm cursor-pointer transition-colors hover:bg-white/[0.1] hover:text-gray-400'

/** 操作下拉菜单面板 */
export const actionDropdownMenuClass =
  'absolute right-0 top-[calc(100%+4px)] min-w-[110px] bg-[#1e2836] border border-white/10 rounded-md shadow-[0_8px_24px_rgba(0,0,0,0.4)] z-[100] overflow-hidden'

/** 下拉菜单项 */
export const actionMenuItemClass =
  'flex items-center gap-2 px-3.5 py-2 text-xs text-gray-400 cursor-pointer transition-colors hover:bg-white/[0.06] whitespace-nowrap'

/** 下拉菜单项（危险操作） */
export const actionMenuItemDangerClass =
  'flex items-center gap-2 px-3.5 py-2 text-xs text-dnd-red cursor-pointer transition-colors hover:bg-dnd-red/10 whitespace-nowrap'

/** 下拉菜单分隔线 */
export const actionMenuDividerClass =
  'h-px bg-white/[0.06]'

/** @deprecated 使用 inventoryItemRowGridUnified */
export const inventoryItemRowGridEditableWithCharge =
  'grid grid-cols-[auto_minmax(0,1fr)_6rem] gap-x-2.5 gap-y-0 items-center min-w-0 shrink-0'

/** @deprecated 使用 inventoryItemRowGridUnified */
export const inventoryItemRowGridEditableNoCharge =
  'grid grid-cols-[auto_minmax(0,1fr)_6rem] gap-x-2.5 gap-y-0 items-center min-w-0 shrink-0'

/** @deprecated 使用 inventoryItemRowGridUnified */
export const inventoryItemRowGridReadWithCharge =
  'grid grid-cols-[minmax(0,1fr)_6rem] gap-x-2.5 gap-y-0 items-center min-w-0 shrink-0'

/** @deprecated 使用 inventoryItemRowGridUnified */
export const inventoryItemRowGridReadNoCharge =
  'grid grid-cols-[minmax(0,1fr)_6rem] gap-x-2.5 gap-y-0 items-center min-w-0 shrink-0'

/** 数量+重量列（内联在名称行内）：紧凑横排 */
export const inventoryItemQtyWeightCellClass =
  'inline-flex flex-nowrap items-center gap-x-1.5 shrink-0 text-[10px] text-dnd-text-muted whitespace-nowrap'

/** 充能列（内联在名称行内）：紧凑横排 */
export const inventoryItemChargeCellClass =
  'inline-flex flex-nowrap items-center gap-1 shrink-0 text-[10px] text-dnd-text-muted whitespace-nowrap'

/** 操作列：与栅格列宽一致，右对齐；图标间距略增便于 3/4 颗混排 */
export const inventoryItemActionsCellClass =
  'min-w-0 w-full flex min-h-7 items-center justify-end gap-1 shrink-0 pl-0.5'

/** 卡底说明版式：约 8.8px（较 11px 约小 20%）、最多两行；颜色由 body / muted 后缀类控制 */
export const inventoryItemBriefTwoLinesBaseClass =
  'mt-0.5 shrink-0 overflow-hidden border-t border-white/[0.06] pt-0.5 text-[8.8px] leading-snug line-clamp-2 break-words'

export const inventoryItemBriefBodyClass = `${inventoryItemBriefTwoLinesBaseClass} text-dnd-text-body/90`

export const inventoryItemBriefMutedClass = `${inventoryItemBriefTwoLinesBaseClass} text-dnd-text-muted`

/** @deprecated 使用 inventoryItemBriefBodyClass 或 inventoryItemBriefMutedClass */
export const inventoryItemBriefTwoLinesClass = inventoryItemBriefBodyClass

/**
 * 名称行：左为详情折叠钮（若有），中间为「名称 + 紧挨标注」（名称截断、标注不折行），整体单行。
 */
export const inventoryItemNameRowClass = 'flex min-w-0 flex-nowrap items-center gap-1.5 max-w-full'
/** 名称 + 魔法加值 / 层数 / 模块文案等，紧跟在名称右侧 */
export const inventoryItemNameTitleGroupClass = 'min-w-0 flex-1 flex flex-nowrap items-center gap-1 overflow-hidden'
export const inventoryItemNameTextClass = 'min-w-0 shrink truncate text-white font-medium text-sm'
export const inventoryItemNameExtrasClass = 'shrink-0 flex items-center gap-1 whitespace-nowrap'
/** @deprecated 用 inventoryItemNameTextClass */
export const inventoryItemNameTruncateClass = inventoryItemNameTextClass

/** 折叠详情：相对折叠前正文约 8.8px 放大 20% → ~10.6px */
export const inventoryItemBriefExpandedBodyClass =
  'mt-0.5 shrink-0 overflow-y-auto border-t border-white/[0.06] pt-1 text-[10.6px] leading-relaxed text-dnd-text-body/90 whitespace-pre-wrap break-words max-h-[min(32vh,14rem)]'

export const inventoryItemBriefExpandedMutedClass =
  'mt-0.5 shrink-0 overflow-y-auto border-t border-white/[0.06] pt-1 text-[10.6px] leading-relaxed text-dnd-text-muted whitespace-pre-wrap break-words max-h-[min(32vh,14rem)]'

/** 名称行末尾「展开/收起详情」小按钮（勿在拖拽柄上起拖） */
export const inventoryItemBriefChevronBtnClass =
  'shrink-0 inline-flex items-center justify-center h-6 w-6 rounded border border-white/10 bg-[#1a2430]/60 text-dnd-text-muted hover:bg-white/10 hover:text-gray-200'

/** 是否有可展开的详情文案（无内容或仅「—」不显示按钮） */
export function inventoryItemBriefIsExpandable(brief) {
  const t = brief != null ? String(brief).trim() : ''
  return t.length > 0 && t !== '—'
}
