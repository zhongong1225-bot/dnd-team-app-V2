/**
 * Buff 栏「来源」归类（与专长/装备小标签同一层级）
 * 专长、装备由 fromFeat / fromItem 推导，不读写 sourceKind。
 */

export const BUFF_SOURCE_KIND_OPTIONS = [
  { key: 'feat', label: '专长' },
  { key: 'equipment', label: '装备' },
  { key: 'temporary', label: '临时' },
  { key: 'class', label: '职业' },
  { key: 'race', label: '种族' },
  { key: 'adventure', label: '冒险' },
]

/** 表单中可选归类（专长/装备仅由系统自动，不可手选） */
export const BUFF_SOURCE_KIND_OPTIONS_EDITABLE = BUFF_SOURCE_KIND_OPTIONS.filter(
  (o) => o.key !== 'feat' && o.key !== 'equipment',
)

/** 模组库/导入弹窗中的分类选项：不包含装备（跟随物品）与冒险（随机性大） */
export const BUFF_SOURCE_KIND_LIBRARY_OPTIONS = BUFF_SOURCE_KIND_OPTIONS.filter(
  (o) => o.key !== 'equipment' && o.key !== 'adventure',
)

const LABEL_BY_KEY = Object.fromEntries(BUFF_SOURCE_KIND_OPTIONS.map((o) => [o.key, o.label]))

const VALID_KEYS = new Set(BUFF_SOURCE_KIND_OPTIONS.map((o) => o.key))

/** 横向 Buff 分栏顺序（左→右）；须包含全部六类各一次 */
export const BUFF_COLUMN_KEYS = ['feat', 'adventure', 'class', 'race', 'equipment', 'temporary']

export const BUFF_COLUMN_DRAG_MIME = 'application/x-dnd-team-buff-column'
export const BUFF_ENTRY_DRAG_MIME = 'application/x-dnd-team-buff-entry'

/**
 * @param {string[] | undefined} order
 * @returns {string[]} 合法顺序（缺项补全、去重）
 */
export function normalizeBuffColumnOrder(order) {
  const seen = new Set()
  const out = []
  if (Array.isArray(order)) {
    for (const k of order) {
      if (BUFF_COLUMN_KEYS.includes(k) && !seen.has(k)) {
        seen.add(k)
        out.push(k)
      }
    }
  }
  for (const k of BUFF_COLUMN_KEYS) {
    if (!seen.has(k)) out.push(k)
  }
  return out
}

/**
 * @param {object | undefined} buff
 * @returns {string} 所属分栏 key（专长/装备由系统决定）
 */
export function getColumnKeyForBuff(buff) {
  if (!buff) return 'adventure'
  if (buff.fromFeat || buff.fromInvocation || buff.fromFightingStyle) return 'feat'
  if (buff.fromClassFeature) return 'class'
  if (buff.fromItem) return 'equipment'
  return normalizeBuffSourceKindKey(buff.sourceKind)
}

/** @param {string} key */
export function getBuffColumnLabel(key) {
  return LABEL_BY_KEY[key] ?? key
}

/**
 * 将 dragKey 插到 targetKey 之前（用于栏位排序）
 * @param {string[]} order
 * @param {string} dragKey
 * @param {string} targetKey
 */
export function reorderBuffColumns(order, dragKey, targetKey) {
  const norm = normalizeBuffColumnOrder(order)
  if (dragKey === targetKey || !norm.includes(dragKey) || !norm.includes(targetKey)) return norm
  const without = norm.filter((k) => k !== dragKey)
  const idx = without.indexOf(targetKey)
  if (idx < 0) return norm
  without.splice(idx, 0, dragKey)
  return without
}

/** @param {string | undefined} raw */
export function normalizeBuffSourceKindKey(raw) {
  if (raw && VALID_KEYS.has(raw)) return raw
  return 'adventure'
}

/**
 * @param {object | undefined} buff
 * @returns {string} 列表小标签文案
 */
export function getBuffSourceKindLabel(buff) {
  if (!buff) return LABEL_BY_KEY.adventure
  if (buff.fromInvocation) return '魔能祈唤'
  if (buff.fromFightingStyle) return '战斗风格'
  if (buff.fromClassFeature) return '职业特性'
  if (buff.fromFeat) return '专长'
  if (buff.fromItem) return '装备'
  return LABEL_BY_KEY[normalizeBuffSourceKindKey(buff.sourceKind)] ?? '冒险'
}

/**
 * @param {object | undefined} buff
 * @returns {string} 悬停说明
 */
export function getBuffSourceKindTitle(buff) {
  if (!buff) return '冒险'
  if (buff.fromInvocation) return '魔能祈唤：来自已选魔能祈唤，数值写入祈唤补丁'
  if (buff.fromFightingStyle) return '战斗风格：来自已选战斗风格，数值写入战斗风格补丁'
  if (buff.fromClassFeature) return '职业特性：来自职业特性默认 BUFF 配置'
  if (buff.fromFeat) return '专长：来自已选专长，数值写入专长补丁'
  if (buff.fromItem) return '装备：来自已装备物品的附魔效果'
  const key = normalizeBuffSourceKindKey(buff.sourceKind)
  const label = LABEL_BY_KEY[key] ?? '冒险'
  const hint = {
    temporary: '玩家手动归类为临时',
    class: '玩家手动归类为职业特性',
    race: '玩家手动归类为种族特性',
    adventure: '玩家手动归类为冒险/剧情等',
  }[key]
  return hint ? `${label}：${hint}` : label
}
