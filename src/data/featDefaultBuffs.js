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
}
