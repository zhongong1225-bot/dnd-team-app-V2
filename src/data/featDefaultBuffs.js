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
 * - 包含被动数值效果和主动释放效果
 */
export const HARDCODED_FEAT_BUFFS = {
  // ========== 起源专长 ==========
  
  // 警戒：先攻加熟练
  alert: {
    source: '警戒',
    effects: [
      {
        category: 'ability',
        effectType: 'initiative_buff',
        scope: 'global',
        scopeDetail: [],
        value: { bonus: { ref: 'proficiency' } },
      },
      {
        category: 'mobility_casting',
        effectType: 'advantage_on_saves',
        scope: 'global',
        scopeDetail: [],
        value: { saveTypes: ['wis'], advantage: true },
      },
    ],
  },
  
  // 巧匠：工具熟练+折扣+快速制作
  crafter: {
    source: '巧匠',
    effects: [
      {
        category: 'proficiency',
        effectType: 'specific_tool_proficiency',
        scope: 'global',
        scopeDetail: [],
        value: { tools: [] }, // DM需手动添加工具列表
      },
    ],
  },
  
  // 医疗师：战地医师治疗+治疗重掷
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
  
  // 音乐家：乐器训练+鼓舞之歌
  musician: {
    source: '音乐家',
    effects: [
      {
        category: 'proficiency',
        effectType: 'instrument_proficiency',
        scope: 'global',
        scopeDetail: [],
        value: { instruments: [] }, // DM需手动添加乐器列表
      },
    ],
  },
  
  // 凶蛮打手：伤害重掷
  savage_attacker: {
    source: '凶蛮打手',
    effects: [
      {
        category: 'offense',
        effectType: 'damage_reroll',
        scope: 'global',
        scopeDetail: [],
        value: { rerollOn: [1], trigger: 'on_hit' },
      },
    ],
  },
  
  // 熟习：三项自选技能和工具熟练
  skilled: {
    source: '熟习',
    effects: [
      {
        category: 'proficiency',
        effectType: 'skill_proficiency',
        scope: 'global',
        scopeDetail: [],
        value: { skills: [] }, // DM需手动添加技能列表
      },
      {
        category: 'proficiency',
        effectType: 'specific_tool_proficiency',
        scope: 'global',
        scopeDetail: [],
        value: { tools: [] }, // DM需手动添加工具列表
      },
    ],
  },
  
  // 酒馆斗殴者：强化徒手打击+伤害重掷+临时武器熟练
  tavern_brawler: {
    source: '酒馆斗殴者',
    effects: [
      {
        category: 'offense',
        effectType: 'unarmed_damage_override',
        scope: 'global',
        scopeDetail: [],
        value: { damageDice: '1d4', addAbilityMod: 'str' },
      },
      {
        category: 'offense',
        effectType: 'damage_reroll',
        scope: 'global',
        scopeDetail: [],
        value: { rerollOn: [1], trigger: 'unarmed_only' },
      },
      {
        category: 'proficiency',
        effectType: 'weapon_proficiency',
        scope: 'global',
        scopeDetail: [],
        value: { weapons: ['improvised'] },
      },
    ],
  },
  
  // 健壮：生命值上限提升
  tough: {
    source: '健壮',
    effects: [
      {
        category: 'ability',
        effectType: 'max_hp_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { bonus: { ref: 'level', mult: 2 } },
      },
    ],
  },
  
  // ========== 通用专长 ==========
  
  // 演员：魅力+1+伪装优势+拟声
  actor: {
    source: '演员',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { cha: 1 },
      },
      {
        category: 'proficiency',
        effectType: 'skill_expertise',
        scope: 'global',
        scopeDetail: [],
        value: { skills: ['deception', 'performance'], condition: 'disguise' },
      },
    ],
  },
  
  // 运动精英：力量/敏捷+1+攀爬速度+鲤鱼打挺+跳跃增强
  athlete: {
    source: '运动精英',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: ['str', 'dex'], amount: 1 },
      },
      {
        category: 'mobility_casting',
        effectType: 'climb_speed',
        scope: 'global',
        scopeDetail: [],
        value: { speed: { ref: 'walk_speed' } },
      },
      {
        category: 'mobility_casting',
        effectType: 'stand_up_cost_reduction',
        scope: 'global',
        scopeDetail: [],
        value: { cost: 5 },
      },
    ],
  },
  
  // 冲锋手：力量/敏捷+1+进阶疾走+冲锋攻击
  charger: {
    source: '冲锋手',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: ['str', 'dex'], amount: 1 },
      },
      {
        category: 'mobility_casting',
        effectType: 'dash_speed_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { bonus: 10 },
      },
      {
        category: 'offense',
        effectType: 'charge_attack',
        scope: 'global',
        scopeDetail: [],
        value: {
          distance: 10,
          extraDamage: '1d8',
          pushDistance: 10,
        },
      },
    ],
  },
  
  // 大厨：体质/感知+1+厨师工具熟练+大补食膳+应急零嘴
  chef: {
    source: '大厨',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: ['con', 'wis'], amount: 1 },
      },
      {
        category: 'proficiency',
        effectType: 'specific_tool_proficiency',
        scope: 'global',
        scopeDetail: [],
        value: { tools: ["chef's tools"] },
      },
    ],
  },
  
  // 双持客：力量/敏捷+1+强化双持+快速拔刀
  dual_wielder: {
    source: '双持客',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: ['str', 'dex'], amount: 1 },
      },
      {
        category: 'offense',
        effectType: 'two_weapon_fighting_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { addAbilityMod: true },
      },
    ],
  },
  
  // 巨武器大师：力量+1+强力攻击
  great_weapon_master: {
    source: '巨武器大师',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { str: 1 },
      },
      {
        category: 'offense',
        effectType: 'power_attack',
        scope: 'global',
        scopeDetail: [],
        value: {
          penalty: -5,
          bonusDamage: 10,
          trigger: 'heavy_weapon',
        },
      },
    ],
  },
  
  // 神射手：敏捷+1+精准射击
  sharpshooter: {
    source: '神射手',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { dex: 1 },
      },
      {
        category: 'offense',
        effectType: 'ranged_power_attack',
        scope: 'global',
        scopeDetail: [],
        value: {
          ignoreCover: true,
          ignoreLongRangeDisadvantage: true,
          penalty: -5,
          bonusDamage: 10,
        },
      },
    ],
  },
  
  // ========== 通用专长（主动技能） ==========
  
  // 防御式决斗：招架反应
  defensive_duelist: {
    source: '防御式决斗',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'reaction',
          effects: [
            {
              type: 'ac_bonus',
              value: {
                bonus: { ref: 'proficiency' },
                duration: { type: 'rounds', value: 1 },
                description: '当被近战攻击命中时，AC获得熟练加值，持续到你的下回合结束。',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 长柄武器大师：额外攻击
  polearm_master: {
    source: '长柄武器大师',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'bonus',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '柄击',
                description: '使用长柄武器的另一端发动额外攻击，造成1d4钝击伤害。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 强弩专家：快速装填+抵近射击
  crossbow_expert: {
    source: '强弩专家',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'bonus',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '额外攻击',
                description: '使用轻型弩发动一次额外攻击，可加入属性调整值到伤害。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 战法师：专注豁免+机会攻击施法
  war_caster: {
    source: '战法师',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'reaction',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '机会攻击施法',
                description: '当敌人离开你的触及范围时，可以对其发动一次法术攻击作为机会攻击，而非近战攻击。',
                triggerCondition: 'opportunity_attack',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 法师杀手：反制法术
  mage_slayer: {
    source: '法师杀手',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'reaction',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '反制施法',
                description: '当60尺内生物施放法术时，可以用反应发动一次武器攻击打断施法。若命中，该法术被打断。',
                triggerCondition: 'spell_casting',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 哨兵：拦截反应
  sentinel: {
    source: '哨兵',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'reaction',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '哨兵打击',
                description: '当敌人对你以外的目标发动近战攻击时，可以用反应对该敌人发动一次近战攻击。若命中，目标速度降为0直到当前回合结束。',
                triggerCondition: 'ally_attacked',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 擒抱者：擒抱动作
  grappler: {
    source: '擒抱者',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '压制',
                description: '尝试压制一个已被你擒抱的生物。双方进行力量（运动）对抗，若你成功，则你和目标都处于束缚状态。',
                triggerCondition: 'on_grappled_target',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 盾牌大师：盾击
  shield_master: {
    source: '盾牌大师',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'bonus',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '盾击',
                description: '使用盾牌发动一次额外攻击，造成1d4+力量调整值钝击伤害。若命中，可将目标推离5尺。',
                triggerCondition: 'attack_action',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 鼓舞领袖：激励盟友
  inspiring_leader: {
    source: '鼓舞领袖',
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
              type: 'temp_buff',
              value: {
                duration: { type: 'hours', value: 1 },
                amount: { ref: 'level' },
                description: '选择最多等于你魅力调整值的盟友，每个获得等于你等级的临时生命值，持续1小时。',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 仪式施法者：仪式施法
  ritual_caster: {
    source: '仪式施法者',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '仪式施法',
                description: '施展一本仪式书中的一个已知仪式法术。需要消耗相应时间的仪式过程。',
                triggerCondition: 'ritual_casting',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 精魂接触：迷雾步
  fey_touched: {
    source: '精魂接触',
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
          actionCost: 'bonus',
          effects: [
            {
              type: 'teleport',
              value: {
                distance: 30,
                description: '传送30尺到可见的未占据空间。可携带随身物品但不能携带其他生物。',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 暗影接触：暗影步
  shadow_touched: {
    source: '暗影接触',
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
          actionCost: 'bonus',
          effects: [
            {
              type: 'teleport',
              value: {
                distance: 60,
                description: '在阴影之间传送60尺到可见的未占据空间。必须在昏暗光照或黑暗中才能使用。',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 念动力：念力推/拉
  telekinetic: {
    source: '念动力',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'bonus',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '念力推移',
                description: '推动或拉动一个大型或更小的物体或生物30尺。若目标是生物，可进行力量豁免对抗你的法术DC。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 心灵感应：心灵通讯
  telepathic: {
    source: '心灵感应',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '心灵通讯',
                description: '与60尺内你能看到的一个生物建立心灵链接，持续1分钟。你们可以进行心灵交流。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 魔能师学徒：祈唤使用
  eldritch_adept: {
    source: '魔能师学徒',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '祈唤能力',
                description: '使用从本专长习得的魔能祈唤的特殊能力。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 超魔法学徒：超魔法使用
  metamagic_adept: {
    source: '超魔法学徒',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'sorcery_points',
          charges: 1,
          recovery: { method: 'long_rest' },
          actionCost: 'none',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '超魔法',
                description: '花费术法点使用一个已知的超魔法选项来修改正在施放的法术。',
                triggerCondition: 'spell_casting',
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
  
  // 星辰替身：召唤分身（每 24 小时一次，不消耗星辰点）
  star_doppelganger: {
    source: '星辰替身',
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
              type: 'summon',
              value: {
                preset: 'stellar_double',
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

  // ========== 灵能专长 ==========
  
  // 灵能身躯：每个灵能专长+6HP（被动）
  psionic_body: {
    source: '灵能身躯',
    effects: [
      {
        category: 'ability',
        effectType: 'max_hp_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { bonus: { ref: 'level', mult: 2 } },
      },
    ],
  },
  
  // 灵能闪避：反射闪避（被动）
  psionic_dodge: {
    source: '灵能闪避',
    effects: [
      {
        category: 'defense',
        effectType: 'evasion',
        scope: 'global',
        scopeDetail: [],
        value: {},
      },
    ],
  },
  
  // 专注之盾：盾牌AC+1，体质+1（被动）
  psionic_focus_shield: {
    source: '专注之盾',
    effects: [
      {
        category: 'defense',
        effectType: 'ac_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { bonus: 1, slot: 'shield' },
      },
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { con: 1 },
      },
    ],
  },
  
  // 深度视野：黑暗视觉+30尺（被动）
  psionic_deep_vision: {
    source: '深度视野',
    effects: [
      {
        category: 'ability',
        effectType: 'darkvision_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { bonus: 30 },
      },
    ],
  },
  
  // 心灵共振：灵能集中时附近有其他灵能者，能力/技能/豁免+2（被动）
  psionic_resonance: {
    source: '心灵共振',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_check_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { bonus: 2 },
      },
      {
        category: 'ability',
        effectType: 'save_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { bonus: 2 },
      },
    ],
  },
  
  // 特选能量：每伤害骰+1（被动）
  psionic_privileged_energy: {
    source: '特选能量',
    effects: [
      {
        category: 'offense',
        effectType: 'damage_bonus_per_die',
        scope: 'global',
        scopeDetail: [],
        value: { bonus: 1 },
      },
    ],
  },
  
  // 炫目能量：能量异能附加目眩（被动）
  psionic_dazzling_energy: {
    source: '炫目能量',
    effects: [
      {
        category: 'offense',
        effectType: 'conditional_damage_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { condition: 'energy_power', description: '能量异能攻击附带目眩效果 1 分钟' },
      },
    ],
  },
  
  // 异能越障：消耗灵能集中穿越屏障显能（主动）
  psionic_overcome_barrier: {
    source: '异能越障',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'psionic_focus',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '穿越屏障',
                description: '消耗灵能集中，尝试对被墙或力场效果掩蔽的目标显能。进行 DC 10+硬度+每英尺厚度 1 的奥秘检定。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 异能双发：双重释放异能（主动）
  psionic_twin_power: {
    source: '异能双发',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'psionic_focus',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '双重异能',
                description: '消耗灵能集中，展现的异能在目标身上作用两次。目标分别经受两道异能的全部效果并分别进行豁免。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 异能瞬发：附赠动作释放异能（主动）
  psionic_quicken: {
    source: '异能瞬发',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'psionic_focus',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'bonus',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '瞬发异能',
                description: '消耗灵能集中，用附赠动作释放一道异能。每轮只能展现一道瞬发异能。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 异能链化：连锁打击（主动）
  psionic_chain: {
    source: '异能链化',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'psionic_focus',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '链化打击',
                description: '消耗灵能集中，异能打击主目标后可连锁打击最多等于显能者等级（最多20）的次要目标，每次造成一半伤害。次要目标需在主目标30尺内。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 战斗显能：专注熟练+属性提升（被动+主动）
  psionic_combat: {
    source: '战斗显能',
    effects: [
      {
        category: 'mobility_casting',
        effectType: 'concentration_enhance',
        scope: 'global',
        scopeDetail: [],
        value: { proficiency: true },
      },
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'none',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '属性提升',
                description: '在智力、感知、体质中选择一项提升 1 点。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 燃烧自身：属性燃烧恢复魂力点（主动）
  psionic_burn_self: {
    source: '燃烧自身',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '属性燃烧',
                description: '在力量、敏捷和体质上各承受 1 点属性燃烧伤害，恢复 2 点魂力点。可燃烧更多按比例恢复。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 亲和灵晶：获得灵晶仆（主动）
  psionic_crystal_affinity: {
    source: '亲和灵晶',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '灵晶仆',
                description: '获得一个灵晶仆 companion。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 灵能资质：异能豁免DC+1（主动，消耗灵能集中）
  psionic_focus: {
    source: '灵能资质',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'psionic_focus',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'none',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '专注增幅',
                description: '消耗灵能集中，展现的异能豁免 DC+1。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 灵能拳：额外伤害（主动，消耗灵能集中）
  psionic_fist: {
    source: '灵能拳',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'psionic_focus',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'none',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '灵能拳打击',
                description: '消耗灵能集中，徒手击打或天然武器攻击造成额外 2d6 伤害。5级4d6，11级5d6，17级6d6。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 灵能射击：远程额外伤害（主动，消耗灵能集中）
  psionic_shot: {
    source: '灵能射击',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'psionic_focus',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'none',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '灵能射击',
                description: '消耗灵能集中，一次远程攻击造成额外 2d6 伤害。5级4d6，11级5d6，17级6d6。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 充能护甲：反应减能量伤害10（主动）
  psionic_charged_armor: {
    source: '充能护甲',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'spell_slot',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'reaction',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '充能防护',
                description: '消耗法术环位，抵抗能量伤害减少 10 点。',
                triggerCondition: 'on_hit',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 狂野兴奋：攻击/豁免/伤害+1（主动，长休恢复）
  psionic_wild_excitement: {
    source: '狂野兴奋',
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
          actionCost: 'none',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '狂野兴奋',
                description: '攻击检定、豁免检定、伤害检定 +1。12级+2，20级+3。持续等于角色等级的回合数。使用后长休才可再次启动，结束时获得1级力竭。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 强化护甲：AC+3（主动，消耗灵能集中）
  psionic_invest_armor: {
    source: '强化护甲',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'psionic_focus',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'none',
          effects: [
            {
              type: 'ac_bonus',
              value: {
                bonus: 3,
                duration: { type: 'until_rest', value: 'short_rest' },
                description: '增强护甲 AC+3，消耗灵能集中。',
              },
            },
          ],
        },
      },
    ],
  },
  
  // 秘法汇流：同调+1+鉴定术（被动+主动）
  psionic_mystic_conflux: {
    source: '秘法汇流',
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
              type: 'custom_logic',
              value: {
                title: '鉴定术',
                description: '不消耗法术位施展鉴定术一次。长休后恢复。可同时同调4个魔法物品。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },

  // ========== 史诗恩惠 ==========

  // 英勇战斗之恩惠
  epic_boon_combat_prowess: {
    source: '英勇战斗之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, bonus: 1 },
      },
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'reaction',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '命中转换',
                description: '当你的一次攻击投骰失手时，你可以使用反应使该次攻击改为命中。每回合可用。',
                triggerCondition: 'on_miss',
              },
            },
          ],
        },
      },
    ],
  },

  // 次元旅行之恩惠
  epic_boon_dimensional_travel: {
    source: '次元旅行之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, bonus: 1 },
      },
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'bonus_action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '传送',
                description: '传送至多30尺到你可见的一个未被占据的空间。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },

  // 能量抗性之恩惠
  epic_boon_energy_resistance: {
    source: '能量抗性之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, bonus: 1 },
      },
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '能量抗性',
          description: '选择两种伤害类型（从酸蚀、寒冷、火焰、闪电、毒素、雷鸣中选）。你对这两种伤害类型具有抗性。长休后可重新选择。',
          triggerCondition: 'passive',
        },
      },
    ],
  },

  // 扭曲命运之恩惠
  epic_boon_fate: {
    source: '扭曲命运之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, bonus: 1 },
      },
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'initiative' },
          actionCost: 'reaction',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '命运骰',
                description: '投1d4，将结果加到你自己的一次D20投骰上，或从另一个你能看到的生物的一次D20投骰中减去。先攻、短休或长休后恢复使用次数。',
                triggerCondition: 'on_roll',
              },
            },
          ],
        },
      },
    ],
  },

  // 超凡强韧之恩惠
  epic_boon_fortitude: {
    source: '超凡强韧之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, bonus: 1 },
      },
      {
        category: 'ability',
        effectType: 'max_hp_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { bonus: 40 },
      },
    ],
  },

  // 无敌攻势之恩惠
  epic_boon_irresistible_offense: {
    source: '无敌攻势之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, choiceOptions: ['str', 'dex'], bonus: 1 },
      },
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '无视抗性',
          description: '你用力量或敏捷做出的钝击、挥砍、穿刺伤害攻击无视目标的抗性（将抗性视为无，但不影响免疫）。',
          triggerCondition: 'passive',
        },
      },
    ],
  },

  // 强力恢复之恩惠
  epic_boon_recovery: {
    source: '强力恢复之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, bonus: 1 },
      },
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'long_rest' },
          actionCost: 'special',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '背水一战',
                description: '当你被降至0HP时，你可以改为降至1HP并恢复你最大HP的一半。长休后恢复。',
                triggerCondition: 'on_hp_zero',
              },
            },
          ],
        },
      },
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'long_rest' },
          actionCost: 'bonus_action',
          effects: [
            {
              type: 'heal',
              value: { dice: '10d10', bonus: 0 },
            },
          ],
        },
      },
    ],
  },

  // 博学多才之恩惠
  epic_boon_skill: {
    source: '博学多才之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, bonus: 1 },
      },
      {
        category: 'proficiency',
        effectType: 'skill_proficiency',
        scope: 'global',
        scopeDetail: [],
        value: {
          skills: [
            'acrobatics', 'animal_handling', 'arcana', 'athletics', 'deception',
            'history', 'insight', 'intimidation', 'investigation', 'medicine',
            'nature', 'perception', 'performance', 'persuasion', 'religion',
            'sleight_of_hand', 'stealth', 'survival',
          ],
        },
      },
    ],
  },

  // 神行无拘之恩惠
  epic_boon_speed: {
    source: '神行无拘之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, bonus: 1 },
      },
      {
        category: 'mobility_casting',
        effectType: 'speed_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { bonus: 30 },
      },
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'bonus_action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '撤离与解脱',
                description: '执行撤离动作（Disengage）并解除擒抱状态。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },

  // 法术溯回之恩惠
  epic_boon_spell_recall: {
    source: '法术溯回之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, choiceOptions: ['int', 'wis', 'cha'], bonus: 1 },
      },
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '法术溯回',
          description: '当你施展一个环阶等于1d4投骰结果的法术时，该法术不消耗法术位。',
          triggerCondition: 'on_cast',
        },
      },
    ],
  },

  // 暗夜精魂之恩惠
  epic_boon_night_spirit: {
    source: '暗夜精魂之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, bonus: 1 },
      },
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'bonus_action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '暗影隐形',
                description: '当你处于微光光照或黑暗环境中时，你可以变为隐形状态。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '暗夜抗性',
          description: '你对除心灵伤害和光耀伤害外的所有伤害类型具有抗性。',
          triggerCondition: 'passive',
        },
      },
    ],
  },

  // 真实视觉之恩惠
  epic_boon_truesight: {
    source: '真实视觉之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, bonus: 1 },
      },
      {
        category: 'mobility_casting',
        effectType: 'darkvision_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { bonus: 60 },
      },
    ],
  },

  // 血海漂橹之恩惠
  epic_boon_bloodshed: {
    source: '血海漂橹之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, bonus: 1 },
      },
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '血海漂橹',
          description: '当一个你能看到的敌人在你30尺内被降至0HP时，你的下一次攻击投骰具有优势。浴血期间，你的武器攻击额外造成1d10伤害。',
          triggerCondition: 'on_enemy_down',
        },
      },
    ],
  },

  // 生机勃发之恩惠
  epic_boon_bountiful_health: {
    source: '生机勃发之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, bonus: 1 },
      },
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '生机勃发',
          description: '每当你完成一次短休或长休时，你获得等于你角色等级+5的临时生命值。',
          triggerCondition: 'on_rest',
        },
      },
    ],
  },

  // 八面玲珑之恩惠
  epic_boon_communication: {
    source: '八面玲珑之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, choiceOptions: ['int', 'wis', 'cha'], bonus: 1 },
      },
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '心灵感应',
          description: '你可以与120尺内你能看到的任何具有语言的生物进行心灵感应。',
          triggerCondition: 'passive',
        },
      },
    ],
  },

  // 绝境逢生之恩惠
  epic_boon_desperate_resilience: {
    source: '绝境逢生之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, choiceOptions: ['str', 'con'], bonus: 1 },
      },
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '绝境逢生',
          description: '浴血期间，你对除力场伤害外的所有伤害类型具有抗性。',
          triggerCondition: 'on_bloodied',
        },
      },
    ],
  },

  // 熠熠生辉之恩惠
  epic_boon_exquisite_radiance: {
    source: '熠熠生辉之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, bonus: 1 },
      },
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '熠熠生辉',
          description: '被降至0HP的生物不能被你复活为亡灵。你的光耀伤害投骰取最大值。长休后恢复。',
          triggerCondition: 'passive',
        },
      },
    ],
  },

  // 变幻无常之恩惠
  epic_boon_fluid_forms: {
    source: '变幻无常之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, choiceOptions: ['int', 'wis', 'cha'], bonus: 1 },
      },
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'long_rest' },
          actionCost: 'magic_action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '变形',
                description: '变形为挑战等级10或以下的野兽、类人生物或怪兽。长休后恢复。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },

  // 命运眷顾之恩惠
  epic_boon_fortunes_favor: {
    source: '命运眷顾之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, bonus: 1 },
      },
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '命运眷顾',
          description: '当你进行一次攻击投骰、属性检定或豁免投骰时，你可以将结果改为20。每回合限一次。',
          triggerCondition: 'on_roll',
        },
      },
    ],
  },

  // 毒手殁心之恩惠
  epic_boon_poison_mastery: {
    source: '毒手殁心之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, bonus: 1 },
      },
      {
        category: 'defense',
        effectType: 'damage_immunity',
        scope: 'global',
        scopeDetail: [],
        value: { damageTypes: ['poison'] },
      },
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '中毒免疫',
          description: '你对中毒状态免疫。',
          triggerCondition: 'passive',
        },
      },
    ],
  },

  // 夜宴狂欢之恩惠
  epic_boon_revelry: {
    source: '夜宴狂欢之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, choiceOptions: ['int', 'wis', 'cha'], bonus: 1 },
      },
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
              type: 'custom_logic',
              value: {
                title: '奥图迷舞',
                description: '施展奥图迷舞（Otto\'s Irresistible Dance），无需材料成分，且专注不会被伤害打断。长休后恢复。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },

  // 惊魂落魄之恩惠
  epic_boon_terror: {
    source: '惊魂落魄之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { ability: 'cha', bonus: 1 },
      },
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '恐慌免疫与威吓专精',
          description: '你对恐慌状态免疫。你的威吓（Intimidation）技能获得熟练和专精（双倍熟练加值）。',
          triggerCondition: 'passive',
        },
      },
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'short_rest' },
          actionCost: 'reaction',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '恐惧驱逐',
                description: '当一个你能看到的生物处于恐慌状态时，你可以使用反应迫使该生物远离你移动。短休后恢复。',
                triggerCondition: 'on_fear',
              },
            },
          ],
        },
      },
    ],
  },

  // 旭日骄阳之恩惠
  epic_boon_bright_sun: {
    source: '旭日骄阳之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, choiceOptions: ['con', 'wis', 'cha'], bonus: 1 },
      },
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'bonus_action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '阳光光环',
                description: '你散发30尺阳光光环，持续1分钟。每回合开始时你获得10点临时生命值。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },

  // 暴风骤岚之恩惠
  epic_boon_furious_storm: {
    source: '暴风骤岚之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, choiceOptions: ['int', 'wis', 'cha'], bonus: 1 },
      },
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '暴风骤岚',
          description: '你对闪电和雷鸣伤害具有抗性。浴血期间，你对闪电和雷鸣伤害免疫。',
          triggerCondition: 'passive',
        },
      },
    ],
  },

  // 汲魂饮魄之恩惠
  epic_boon_soul_drinker: {
    source: '汲魂饮魄之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, bonus: 1 },
      },
      {
        category: 'defense',
        effectType: 'damage_resistance',
        scope: 'global',
        scopeDetail: [],
        value: { damageTypes: ['cold', 'necrotic'] },
      },
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'short_rest' },
          actionCost: 'reaction',
          effects: [
            {
              type: 'heal',
              value: { fixed: 50 },
            },
          ],
        },
      },
    ],
  },

  // 炽耀黎明之恩惠
  epic_boon_blazing_dawn: {
    source: '炽耀黎明之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, bonus: 1 },
      },
      {
        category: 'defense',
        effectType: 'damage_immunity',
        scope: 'global',
        scopeDetail: [],
        value: { damageTypes: ['radiant'] },
      },
    ],
  },

  // 厄影迫现之恩惠
  epic_boon_looming_shadows: {
    source: '厄影迫现之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, bonus: 1 },
      },
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '厄影迫现',
          description: '当你执行攻击动作时，你的触及增加10尺。',
          triggerCondition: 'on_attack',
        },
      },
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'bonus_action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '回避',
                description: '执行撤离动作（Disengage）。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },

  // 雾影遁形之恩惠
  epic_boon_misty_escape: {
    source: '雾影遁形之恩惠',
    effects: [
      {
        category: 'ability',
        effectType: 'ability_score_bonus',
        scope: 'global',
        scopeDetail: [],
        value: { choice: true, choiceOptions: ['int', 'wis', 'cha'], bonus: 1 },
      },
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'long_rest' },
          actionCost: 'special',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '雾影遁形',
                description: '当你被降至0HP时，你可以变为气化形体并获得20尺飞行速度。每回合开始时你恢复10HP。长休后恢复。',
                triggerCondition: 'on_hp_zero',
              },
            },
          ],
        },
      },
    ],
  },

  // ========== 制作物品专长 ==========

  // 抄录法术卷轴
  scribe_scroll: {
    source: '抄录法术卷轴',
    effects: [
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '抄录卷轴',
          description: '你可以将你所知晓的法术抄录至卷轴上。',
          triggerCondition: 'passive',
        },
      },
    ],
  },

  // 调制药水
  brew_potion: {
    source: '调制药水',
    effects: [
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '调制药水',
          description: '你可以制造包含你所知晓法术的药水。调制一瓶药水需要一天的时间。',
          triggerCondition: 'passive',
        },
      },
    ],
  },

  // 制造魔法武器及防具
  craft_magic_arms_armor: {
    source: '制造魔法武器及防具',
    effects: [
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '制造魔法武器防具',
          description: '你可以制造任何你已经满足其制造前提的魔法武器、盔甲或盾牌。',
          triggerCondition: 'passive',
        },
      },
    ],
  },

  // 制造权杖
  craft_rod: {
    source: '制造权杖',
    effects: [
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '制造权杖',
          description: '你可以制造任何你已经满足其制造前提的权杖。',
          triggerCondition: 'passive',
        },
      },
    ],
  },

  // 制造法杖
  craft_staff: {
    source: '制造法杖',
    effects: [
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '制造法杖',
          description: '你可以制造任何你已经满足其制造前提的法杖。',
          triggerCondition: 'passive',
        },
      },
    ],
  },

  // 制造魔杖
  craft_wand: {
    source: '制造魔杖',
    effects: [
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '制造魔杖',
          description: '你可以制造存储你所知晓法术的魔杖，法术等级为四级或更低。',
          triggerCondition: 'passive',
        },
      },
    ],
  },

  // 制造奇物
  craft_wondrous_item: {
    source: '制造奇物',
    effects: [
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '制造奇物',
          description: '你可以制造任何你已经满足其制造前提的奇物。',
          triggerCondition: 'passive',
        },
      },
    ],
  },

  // 锻造戒指
  forge_ring: {
    source: '锻造戒指',
    effects: [
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '锻造戒指',
          description: '你可以制造任何你已经满足其制造前提的戒指。',
          triggerCondition: 'passive',
        },
      },
    ],
  },

  // ========== 九剑特殊专长 ==========

  // 武术学习
  tob_martial_study: {
    source: '武术学习',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 1,
          recovery: { method: 'none' },
          actionCost: 'action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '武术招式',
                description: '使用你所学的武术招式。无武术家等级时每场遭遇限一次。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },

  // 武术架势
  tob_martial_stance: {
    source: '武术架势',
    effects: [
      {
        category: 'custom_condition',
        effectType: 'custom_logic',
        scope: 'global',
        scopeDetail: [],
        value: {
          title: '武术架势',
          description: '你掌握了一种流派的架势，获得该架势的持续增益效果。具体效果取决于所学架势。',
          triggerCondition: 'passive',
        },
      },
    ],
  },

  // 瞬间明晰
  tob_instant_clarity: {
    source: '瞬间明晰',
    effects: [
      {
        category: 'active_release',
        effectType: 'charge_item',
        scope: 'global',
        scopeDetail: [],
        value: {
          resourceType: 'none',
          charges: 3,
          recovery: { method: 'long_rest' },
          actionCost: 'bonus_action',
          effects: [
            {
              type: 'custom_logic',
              value: {
                title: '瞬间明晰',
                description: '在一次成功的攻击技之后，以附赠动作进入灵能专注。每天3次。',
                triggerCondition: 'on_use',
              },
            },
          ],
        },
      },
    ],
  },
}
