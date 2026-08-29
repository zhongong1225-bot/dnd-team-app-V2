/**
 * 专长默认 BUFF 配置（作为初始模板）
 * 
 * 用途：
 * 1. FeatPickerModal - 用户选择专长时显示默认效果预览
 * 2. effectMapping.getBuffFromSelectedFeats - 当用户未自定义时提供回退配置
 * 
 * 注意：
 * - 这些是"初始模板"，用户可在专长选择器中通过齿轮按钮自定义并保存到 defaultBuffPatchStore
 * - 自定义后的配置优先级高于此处的硬编码
 * - 所有条目均为 charge_item 类型（主动释放效果），不包含被动数值效果
 */
export const HARDCODED_FEAT_BUFFS = {
  // ========== 起源专长 ==========
  
  // 幸运：消耗幸运点获得优势/劣势
  lucky: {
    source: '幸运',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'lucky_points',
          charges: 1,
          recovery: { method: 'long_rest' },
          actionCost: 'none',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '优势/劣势',
                description: '花费 1 幸运点，为你的 D20 检定赋予优势，或为敌人的攻击检定赋予劣势。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 医疗师：战地医师治疗
  healer: {
    source: '医疗师',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'healer_kit',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '战地医师',
                description: '消耗医疗包一次使用次数，救治 5 尺内生物。目标消耗一枚生命骰，恢复投掷结果 + 熟练加值 HP。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 魔法学徒：施展一环法术
  magic_initiate: {
    source: '魔法学徒',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'spell_slot_1',
          charges: 1,
          recovery: { method: 'long_rest' },
          actionCost: 'action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '一环法术',
                description: '消耗一个一环法术位，施展你从专长中习得的一环法术。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // ========== 星辰专长 ==========
  
  // 星辰记忆：临时专长
  star_memory: {
    source: '星辰记忆',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'star_points',
          charges: 1,
          recovery: { method: 'long_rest' },
          actionCost: 'reaction',
          effects: [
            {
              type: 'temp_buff',
              value: {
                duration: { type: 'hours', value: 1 },
                description: '获得一个临时专长或特殊能力，持续 1 小时。',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 星光之环：飞行
  star_ring_of_radiance: {
    source: '星光之环',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'star_points',
          charges: 1,
          recovery: { method: 'long_rest' },
          actionCost: 'action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '悬空飞行',
                description: '获得 1 小时悬空能力，飞行速度 30 尺。可升阶：每多花 1 星辰点，速度 +10 尺、持续时间 +6 小时（上限 4 点）。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 慈悲关怀：范围治疗
  star_compassionate_care: {
    source: '慈悲关怀',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'star_points',
          charges: 1,
          recovery: { method: 'long_rest' },
          actionCost: 'action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '黄金光芒',
                description: '以自身为中心 10 尺范围内所有生物恢复至生命上限。不死生物需进行 DC 10+等级的魅力豁免，失败则死亡。不分敌我。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 神圣指引：攻击必中
  star_divine_guidance: {
    source: '神圣指引',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'star_points',
          charges: 1,
          recovery: { method: 'long_rest' },
          actionCost: 'action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '必中祝福',
                description: '1 分钟内所有攻击检定自动成功。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 控制闪烁：闪现
  star_control_blink: {
    source: '控制闪烁',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'recharge', dice: '1d6' },
          actionCost: 'reaction',
          effects: [
            {
              type: 'teleport',
              value: {
                distance: 60,
                description: '消失并在 60 尺内任意位置出现，可携带随身物品但不能携带其他生物。充能 1d6 回合。',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 高频共振：恢复星辰点
  star_high_frequency: {
    source: '高频共振',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'long_rest' },
          actionCost: 'action',
          effects: [
            {
              type: 'restore_star_points',
              value: {
                amount: 'max',
                description: '恢复所有星辰点到上限。1 分钟后累积 1 级力竭。',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 辉耀武器：武器附魔
  star_radiant_weapon: {
    source: '辉耀武器',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'star_points',
          charges: 1,
          recovery: { method: 'long_rest' },
          actionCost: 'reaction',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '武器强化',
                description: '选定武器获得 +1d6 伤害加值。攻击不死生物时，目标需进行 DC 5+等级+魅力的豁免，失败即死。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 辉耀护甲：AC 提升
  star_radiant_armor: {
    source: '辉耀护甲',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'star_points',
          charges: 1,
          recovery: { method: 'long_rest' },
          actionCost: 'reaction',
          effects: [
            {
              type: 'ac_bonus',
              value: {
                bonus: 5,
                duration: { type: 'minutes', value: 1 },
                description: 'AC 获得 +5 加值，持续 1 分钟。对「辉耀」属性伤害无效。',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 星辰运气：检定优势
  star_luck: {
    source: '星辰运气',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'star_points',
          charges: 1,
          recovery: { method: 'long_rest' },
          actionCost: 'reaction',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '神眷优势',
                description: '任何检定获得优势；若投出 1 可重骰。持续 1 分钟。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 法力涌动：恢复法术位
  star_mana_surge: {
    source: '法力涌动',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'star_points',
          charges: 1,
          recovery: { method: 'long_rest' },
          actionCost: 'reaction',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '恢复法术位',
                description: '消耗 1 星辰点，恢复所有 3 环及以下法术位。可升阶：每多花 1 星辰点，恢复环阶 +2（例如多花一点则恢复所有 5 环）。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 星辰替身：召唤分身
  star_doppelganger: {
    source: '星辰替身',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'star_points',
          charges: 1,
          recovery: { method: 'long_rest' },
          actionCost: 'action',
          effects: [
            {
              type: 'summon',
              value: {
                creatureId: 'star_doppelganger_clone',
                duration: { type: 'minutes', value: 1 },
                costHpPercent: 50,
                description: '创造灵体复制体，共享生命值与法术位。灵体需在 60 尺内。若 24 小时内使用超过 1 次，产生负面力竭效果。',
              },
            },
          ],
        },
      },
    ],
  },
}
