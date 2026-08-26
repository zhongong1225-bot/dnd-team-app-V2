/**
 * 职业特性默认 BUFF 效果（硬编码回退）
 *
 * 优先级：DM 配置（localStorage）> 本文件硬编码
 * 当 DM 未为某职业特性配置默认 BUFF 时，getBuffsFromClassFeatures 使用本映射作为回退。
 *
 * 设计原则：
 *  - 仅有真实数值效果的特性才出现在此（无条件被动数值 → 真实 BUFF）
 *  - 纯描述/许可/主动激活类特性不在此处（由特性描述文本展示）
 *  - 有真实 BUFF 效果时不加 custom_condition，避免重复显示
 *
 * Key 格式：`${职业}|${子职|''}|${featureId}`
 * 核心特性子职为空字符串，子职特性为子职名（如 '月亮结社'）
 */

/* ════════════════════════════════════════════════════════════════════ */
export const HARDCODED_CLASS_FEATURE_BUFFS = {

  /* ══════════════════════════════════════════════════════════════════
   *  德鲁伊 (Druid)
   * ══════════════════════════════════════════════════════════════════ */

  /* ── 核心特性 ────────────────────────────────────────────────────── */

  // 1级 原初职能：二选一（术师/卫士），由 CLASS_FEATURE_CHOICE_REGISTRY 处理
  // 2级 荒野变形：主动变身，creature_transform 由 useBuffCalculator 动态构建
  // 2级 荒野伙伴：规则许可，无数值效果
  // 5级 荒野复苏：规则许可，无数值效果
  // 7级 元素之怒：二选一，由 CLASS_FEATURE_CHOICE_REGISTRY 处理
  // 15级 元素神威：条件效果，DM 裁定
  // 18级 兽形施法：规则许可，无数值效果
  // 19级 传奇恩惠：规则许可，无数值效果
  // 20级 大德鲁伊：规则许可，无数值效果

  /* ── 月亮结社子职 ────────────────────────────────────────────────── */

  // 3级 结社形态：主动变身参数，由 useBuffCalculator 动态构建
  // 3级 月亮结社法术：规则许可，无数值效果

  // 6级 进阶结社形态：CON豁免+感知调整值
  '德鲁伊|月亮结社|improved_circle_forms': [{
    effectType: 'save_bonus',
    category: 'defense',
    scope: 'global',
    scopeDetail: [],
    value: { con: { ref: 'abilityModifier', ability: 'wis' } },
  }],

  // 10级 月光飞步：主动能力，DM 裁定
  // 14级 月辉形态：攻击+2d10光耀伤害
  '德鲁伊|月亮结社|lunar_form': [{
    effectType: 'extra_damage_dice',
    category: 'offense',
    scope: 'global',
    scopeDetail: [],
    value: { plus: '2d10', type: '光耀' },
  }],
}
