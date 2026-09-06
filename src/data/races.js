/**
 * 种族数据层
 *
 * 所有种族均由用户手动创建，无内置预设。
 * 自定义种族通过 localStorage + Supabase custom_library 双模式存储。
 *
 * 新版种族数据结构（见 raceModel.js）：
 * {
 *   id, name, description, source, creatureType,
 *   sizeOptions, sizeDefault, speed, darkvision,
 *   traits: [{ id, name, description, cards }],
 *   tables: [{ id, name, dice, rows }],
 *   subraces: [{ id, name, description, traits }],
 * }
 *
 * 旧版格式 { id, name, subraces:[{id,name}], traits:string } 通过 normalizeRace 自动迁移。
 */

import { isSupabaseEnabled } from '../lib/supabase'
import * as teamData from '../lib/teamDataSupabase'
import { DEFAULT_RACE, normalizeRace, migrateOldRace } from './raceModel'

/** 内置种族列表 */
export const RACES = [
  {
    id: 'human',
    name: '人类',
    description: '人类的外貌就像地球上的人一样多样，他们也同样信奉许多的神祇。学者们对人类的起源争议不休，但据说已知最早的人类聚居地是在印记城，那座位于多元宇宙中心的环形城市，那座通用语诞生的城市。从那里开始，人类带着门之城的世界主义走到了多元宇宙的每个角落。',
    source: '',
    creatureType: 'humanoid',
    sizeOptions: ['Medium', 'Small'],
    sizeDefault: 'Medium',
    speed: { walk: 30, climb: null, swim: null, fly: null, burrow: null },
    darkvision: null,
    abilityScoreBonuses: [],
    traits: [
      {
        id: 'human_resourceful',
        name: '适应力',
        description: '每当你完成长休时，你都会获得英雄激励。',
        cards: [],
      },
      {
        id: 'human_skillful',
        name: '技能熟练',
        description: '你获得一项自选技能的熟练。',
        cards: [],
      },
      {
        id: 'human_versatile',
        name: '多才多艺',
        description: '你获得一项自选的起源专长。推荐选择熟习（Skilled）专长。',
        cards: [],
      },
    ],
    tables: [],
    subraces: [],
  },
  {
    id: 'dragonborn',
    name: '龙裔',
    description: '龙裔的先祖由金属龙和色彩龙的龙蛋孵化而来。有故事传言，这些龙蛋乃是得到了龙神巴哈姆特或提亚马特的祝福，应两位希望让多元宇宙布满自己造物的愿景而生。但也有故事称，最初的龙裔是由巨龙们独立制造，与神无关。无论起源如何，龙裔都已经在物质位面中扎根落地，繁衍生息。\n\n龙裔看起来就如同双足行走的无翼巨龙——明亮而灼热的眼瞳，头顶细长的骨角，其独有的色泽和其他特征更是彰显着其龙类先祖。',
    source: '',
    creatureType: 'humanoid',
    sizeOptions: ['Medium'],
    sizeDefault: 'Medium',
    speed: { walk: 30, climb: null, swim: null, fly: null, burrow: null },
    darkvision: 60,
    abilityScoreBonuses: [],
    traits: [
      {
        id: 'dragonborn_draconic_ancestry',
        name: '龙族血统',
        description: '你的血脉可以追溯到某种巨龙祖先。从龙族血统表格中选择一种龙。你选择的龙种将会影响你的吐息武器和伤害抗性特质，以及你的外表。',
        cards: [],
        choiceOptions: [
          { id: 'white', label: '白龙', description: '寒冷伤害', cards: [{ effectType: 'damage_type_relation', value: { types: ['cold'], relation: 'resist' } }] },
          { id: 'black', label: '黑龙', description: '强酸伤害', cards: [{ effectType: 'damage_type_relation', value: { types: ['acid'], relation: 'resist' } }] },
          { id: 'green', label: '绿龙', description: '毒素伤害', cards: [{ effectType: 'damage_type_relation', value: { types: ['poison'], relation: 'resist' } }] },
          { id: 'blue', label: '蓝龙', description: '闪电伤害', cards: [{ effectType: 'damage_type_relation', value: { types: ['lightning'], relation: 'resist' } }] },
          { id: 'red', label: '红龙', description: '火焰伤害', cards: [{ effectType: 'damage_type_relation', value: { types: ['fire'], relation: 'resist' } }] },
          { id: 'brass', label: '黄铜龙', description: '火焰伤害', cards: [{ effectType: 'damage_type_relation', value: { types: ['fire'], relation: 'resist' } }] },
          { id: 'copper', label: '赤铜龙', description: '强酸伤害', cards: [{ effectType: 'damage_type_relation', value: { types: ['acid'], relation: 'resist' } }] },
          { id: 'bronze', label: '青铜龙', description: '闪电伤害', cards: [{ effectType: 'damage_type_relation', value: { types: ['lightning'], relation: 'resist' } }] },
          { id: 'silver', label: '银龙', description: '寒冷伤害', cards: [{ effectType: 'damage_type_relation', value: { types: ['cold'], relation: 'resist' } }] },
          { id: 'gold', label: '金龙', description: '火焰伤害', cards: [{ effectType: 'damage_type_relation', value: { types: ['fire'], relation: 'resist' } }] },
        ],
      },
      {
        id: 'dragonborn_breath_weapon',
        name: '吐息武器',
        description: '每当你在自己回合内进行攻击动作时，你可以将其中一次攻击替换为释放魔法性的能量，覆盖15尺锥状区域或30尺长5尺宽的线状区域（每次吐息时选择其范围）。区域内的生物必须进行一次敏捷豁免检定（DC=8+你的体质调整值+你的熟练加值）。豁免失败的生物受到1d10伤害，伤害类型为你龙族血统特质所选龙种对应的类型。豁免成功的生物只受到一半伤害。此伤害会在你达到5级（2d10），11级（3d10）和17级（4d10）时提升1d10。\n\n你可以使用此吐息武器的次数等于你的熟练加值，完成一次长休后，你重获全部已消耗的使用次数。',
        cards: [
          {
            effectType: 'charge_item',
            category: 'active_release',
            scope: 'global',
            scopeDetail: [],
            value: {
              resourceType: 'charges',
              charges: 1, // 实际使用时会被角色熟练加值覆盖
              actionCost: 'action',
              movementFeet: 0,
              recovery: { method: 'long_rest', kind: 'full' },
              effects: [
                {
                  type: 'custom_logic',
                  value: {
                    title: '吐息武器',
                    description: '15尺锥状或30尺线状区域，敏捷豁免 DC=8+体质调整值+熟练加值。豁免失败受到{damageDice}伤害，成功减半。伤害类型由龙族血统决定。',
                    triggerCondition: 'on_use',
                  },
                },
              ],
              // 伤害骰子会随等级自动调整：1-4级1d10，5-10级2d10，11-16级3d10，17+级4d10
              damageDice: '1d10',
              damageTypeFromAncestry: true, // 标记：伤害类型从龙族血统选择继承
            },
          },
        ],
      },
      {
        id: 'dragonborn_damage_resistance',
        name: '伤害抗性',
        description: '根据你龙族血统特质所选龙种，你获得对应的伤害类型的伤害抗性。',
        cards: [],
      },
      {
        id: 'dragonborn_draconic_flight',
        name: '龙族飞翼',
        description: '到达5级后，你可以引导体内龙之魔法的能力，让自己暂时获得飞行能力。以一个附赠动作，你的后背临时伸出两片灵体飞翼，持续10分钟，陷入失能状态时或你主动收起它时（无需动作）它将提前消失。飞翼存在期间，你获得等于你速度的飞行速度。你的翅膀看起来像是和你吐息武器相同的能量凝聚而成。使用此特质后，直到你完成一次长休为止你都不能再次使用它。',
        cards: [
          {
            effectType: 'charge_item',
            category: 'active_release',
            scope: 'global',
            scopeDetail: [],
            value: {
              resourceType: 'charges',
              charges: 1,
              actionCost: 'bonus',
              movementFeet: 0,
              recovery: { method: 'long_rest', kind: 'full' },
              effects: [
                {
                  type: 'custom_logic',
                  value: {
                    title: '龙族飞翼',
                    description: '5级后可用。附赠动作激活，获得飞行速度(等于行走速度)，持续10分钟。失能时或主动收起时提前结束。长休后恢复使用次数。',
                    triggerCondition: 'on_use',
                  },
                },
              ],
              // 持续时间：10分钟
              duration: { type: 'minutes', value: 10 },
              // 等级要求标记
              minLevel: 5,
            },
          },
        ],
      },
    ],
    tables: [
      {
        id: 'draconic_ancestry',
        name: '龙族血统',
        dice: 'd10',
        rows: [
          { roll: '1', text: '白龙 - 寒冷' },
          { roll: '2', text: '黑龙 - 强酸' },
          { roll: '3', text: '绿龙 - 毒素' },
          { roll: '4', text: '蓝龙 - 闪电' },
          { roll: '5', text: '红龙 - 火焰' },
          { roll: '6', text: '黄铜龙 - 火焰' },
          { roll: '7', text: '赤铜龙 - 强酸' },
          { roll: '8', text: '青铜龙 - 闪电' },
          { roll: '9', text: '银龙 - 寒冷' },
          { roll: '10', text: '金龙 - 火焰' },
        ],
      },
    ],
    subraces: [],
  },
  {
    id: 'dhampir',
    name: '半血裔',
    description: '半血裔是活生生的人，他们拥有类似吸血鬼的超凡之力，但却被一种可怕的饥渴所诅咒。大多数半血裔渴望吸食鲜血，不过也有一些半血裔靠汲取梦境、生气或其他重要之物以获取养分。半血裔必须做出选择，是努力克制自身的饥渴，还是屈服于掠食的冲动本能。\n\n有些半血裔是强大吸血鬼的后代，而另一些则在被吸血鬼咬伤后发生了部分转变，可怕的交易以及死灵魔法的影响也可能催生出半血裔。',
    source: '',
    creatureType: 'humanoid',
    sizeOptions: ['Medium', 'Small'],
    sizeDefault: 'Medium',
    speed: { walk: 35, climb: null, swim: null, fly: null, burrow: null },
    darkvision: 60,
    abilityScoreBonuses: [],
    traits: [
      {
        id: 'dhampir_darkvision',
        name: '黑暗视觉',
        description: '你具有60尺黑暗视觉。',
        cards: [],
      },
      {
        id: 'dhampir_spider_climb',
        name: '蛛行',
        description: '你具有等于你速度的攀爬速度。当你到达3级后，你可以在垂直表面上上下左右移动，且能倒挂在天花板上，期间你的双手可以保持空闲。',
        cards: [
          {
            effectType: 'speed_bonus',
            category: 'mobility_casting',
            scope: 'global',
            scopeDetail: [],
            value: { type: 'climb', bonus: 0 }, // 0 表示等于行走速度
          },
        ],
      },
      {
        id: 'dhampir_trace_of_undeath',
        name: '不死之痕',
        description: '你具有对暗蚀伤害的抗性。',
        cards: [
          {
            effectType: 'damage_type_relation',
            category: 'defense',
            scope: 'global',
            scopeDetail: [],
            value: { types: ['necrotic'], relation: 'resist' },
          },
        ],
      },
      {
        id: 'dhampir_vampiric_bite',
        name: '吸血啃咬',
        description: '当你使用徒手打击造成伤害时，你可以选择使用你的獠牙啃咬敌人。你对目标造成1d4+体质调整值的穿刺伤害，而非徒手打击原本的伤害。\n\n此外，当你对非构装非亡灵的生物造成此伤害时，你可以选择以下方式之一来增福你自己：\n• 汲取Drain。你恢复等于此啃咬造成的穿刺伤害的生命值。\n• 强化Strengthen。在接下来的一分钟内，你进行的下一次属性检定或攻击检定获得加值，加值等于此啃咬造成的穿刺伤害。\n\n你能够以此啃咬增福你自己的次数等于你的熟练加值，在你完成长休时你将重获所有已消耗的增福次数。',
        cards: [
          {
            effectType: 'charge_item',
            category: 'active_release',
            scope: 'global',
            scopeDetail: [],
            value: {
              resourceType: 'charges',
              charges: 1, // 实际使用时会被角色熟练加值覆盖
              actionCost: 'action',
              movementFeet: 0,
              recovery: { method: 'long_rest', kind: 'full' },
              effects: [
                {
                  type: 'custom_logic',
                  value: {
                    title: '吸血啃咬',
                    description: '徒手打击替换为啃咬，造成1d4+体质调整值穿刺伤害。可选择：①恢复等量生命值；②下次属性/攻击检定获得等量加值(持续1分钟)。使用次数=熟练加值，长休恢复。',
                    triggerCondition: 'on_use',
                  },
                },
              ],
              damageDice: '1d4',
              damageAbility: 'con', // 体质调整值
              damageType: 'piercing',
            },
          },
        ],
      },
    ],
    tables: [],
    subraces: [],
  },
  {
    id: 'elf',
    name: '精灵',
    description: '由大神科瑞隆所创造的原初精灵们可以随意改变自身的身体形态。但因为原初精灵们曾伙同另一位精灵神祇罗丝阴谋篡夺科瑞隆的神域，而被科瑞隆诅咒，他们失去了这种能力。当罗丝被逐入深渊时，大多数精灵都和她断绝了关系，并得到了科瑞隆的原谅，但科瑞隆从精灵身上收回的东西却是永远不再了。\n\n失去了随心所欲变形能力的精灵们退回到了妖精荒野，这个位面的影响又加深了他们的悲伤。随着时间推移，好奇心又使他们中的许多人前往探索其他存在位面，其中包括了物质位面的各个世界。\n\n精灵们双耳尖尖，少有胡须和体毛。他们的寿命长达750岁。他们不需要睡觉，而是在需要休息的时候进入一种出神状态取而代之。在这种状态下，精灵们在沉浸于自己的记忆和冥思中的同时，还能感知到周围的环境。\n\n精灵在一个地方居住千年以上后，环境会微妙的改变精灵，使他们获得特定的魔法。卓尔，高等精灵，木精灵，都是这种转变的例证。',
    source: '',
    creatureType: 'humanoid',
    sizeOptions: ['Medium'],
    sizeDefault: 'Medium',
    speed: { walk: 30, climb: null, swim: null, fly: null, burrow: null },
    darkvision: 60,
    abilityScoreBonuses: [],
    traits: [
      {
        id: 'elf_darkvision',
        name: '黑暗视觉',
        description: '你拥有60尺黑暗视觉。',
        cards: [],
      },
      {
        id: 'elf_elven_lineage',
        name: '精灵血系',
        description: '你属于一支精灵血系，并因此获得了超自然能力。从精灵血系表格中选择其一。你获得该血系的1级好处。当你到达3级和5级时，你分别习得一道表格上更高级的法术；你时刻准备着这道习得的法术，且可以不消耗法术位施展此法术一次，当你完成一次长休时，你重获施展该道法术的能力。你也可以用任何你拥有的相应环阶法术位施展该道法术。\n\n当你选择血系时，选择智力、感知、或魅力之一，该属性即是你用此特质施展法术时的施法属性。',
        cards: [],
        choiceOptions: [
          {
            id: 'drow',
            label: '卓尔 Drow',
            description: '黑暗视觉提升至120尺。习得戏法舞光术 Dancing Light。3级习得妖火 Faerie Fire，5级习得黑暗术 Darkness。',
            cards: [
              { effectType: 'darkvision_bonus', value: { bonus: 60 } }, // 基础60 + 额外60 = 120
              { effectType: 'spell_granted', value: { cantrips: ['dancing_lights'], level1: ['faerie_fire'], level2: ['darkness'] } },
            ],
          },
          {
            id: 'high_elf',
            label: '高等精灵 High Elf',
            description: '知晓戏法魔法伎俩 Prestidigitation。每当你完成长休时，你可以将它替换为法师法术列表中的另一个戏法。3级习得侦测魔法 Detect Magic，5级习得迷踪步 Misty Step。',
            cards: [
              { effectType: 'spell_granted', value: { cantrips: ['prestidigitation'], level1: ['detect_magic'], level2: ['misty_step'] } },
            ],
          },
          {
            id: 'wood_elf',
            label: '木精灵 Wood Elf',
            description: '速度提升至35尺。知晓戏法德鲁伊伎俩 Druidcraft。3级习得大步奔行 Longstrider，5级习得行动无踪 Pass without Trace。',
            cards: [
              { effectType: 'speed_bonus', value: { type: 'walk', bonus: 5 } }, // 基础30 + 5 = 35
              { effectType: 'spell_granted', value: { cantrips: ['druidcraft'], level1: ['longstrider'], level2: ['pass_without_trace'] } },
            ],
          },
        ],
      },
      {
        id: 'elf_fey_ancestry',
        name: '妖精血统',
        description: '你在进行避免或结束魅惑状态的豁免时具有优势。',
        cards: [
          {
            effectType: 'saving_throw_advantage',
            category: 'defense',
            scope: 'global',
            scopeDetail: [],
            value: { condition: 'charmed' },
          },
        ],
      },
      {
        id: 'elf_keen_senses',
        name: '敏锐感官',
        description: '你具有洞察、察觉或求生之一技能的熟练。',
        cards: [],
        choiceOptions: [
          { id: 'insight', label: '洞察', description: '获得洞察技能熟练', cards: [{ effectType: 'skill_proficiency', value: { skill: 'insight' } }] },
          { id: 'perception', label: '察觉', description: '获得察觉技能熟练', cards: [{ effectType: 'skill_proficiency', value: { skill: 'perception' } }] },
          { id: 'survival', label: '求生', description: '获得求生技能熟练', cards: [{ effectType: 'skill_proficiency', value: { skill: 'survival' } }] },
        ],
      },
      {
        id: 'elf_trance',
        name: '出神 Trance',
        description: '你无需睡眠，魔法也无法使你陷入睡眠。利用出神冥想，你可以仅用4小时完成长休，且在这期间保持意识清醒。',
        cards: [],
      },
    ],
    tables: [
      {
        id: 'elven_lineages',
        name: '精灵血系',
        dice: 'd3',
        rows: [
          { roll: '1', text: '卓尔 Drow - 黑暗视觉120尺，舞光术，妖火(3级)，黑暗术(5级)' },
          { roll: '2', text: '高等精灵 High Elf - 魔法伎俩，可替换戏法，侦测魔法(3级)，迷踪步(5级)' },
          { roll: '3', text: '木精灵 Wood Elf - 速度35尺，德鲁伊伎俩，大步奔行(3级)，行动无踪(5级)' },
        ],
      },
    ],
    subraces: [],
  },
  {
    id: 'tiefling',
    name: '提夫林',
    description: '提夫林要么出生在下层位面，要么有来自那里的祖先。提夫林（音近TEE-fling）会与魔鬼、恶魔或其他的什么邪魔有着血缘关系。而这种与下层次面的联系是提夫林所承继的邪魔遗赠，它带有着力量，但对提夫林的道德观念没有影响。\n\n提夫林需要选择他们想要接受或者厌恨的邪魔遗赠，以下是三种遗赠：\n\n深渊 Abyssal\n无底深渊中的腐殖、喧嚷空隙中的混乱、卡瑟利的绝望，都呼唤着带有深渊遗赠的提夫林。犄角、皮毛、长牙和特殊的气味是这些提夫林共同具有的身体特征，他们中大多数的血管里奔流着恶魔之血。\n\n幽冥 Chthonic\n拥有幽冥邪魔遗赠的提夫林不仅能感受到卡瑟利的泥淖，也能感受到焦炎火狱中的贪婪和哈迪斯中的阴暗。这些提夫林中，有的肤色苍白，彷如死尸。另一些则如同梦魇与魅魔般美丽，还有的则是有着与其那夜鬼魔、尤格罗斯魔或其他中立邪恶的邪魔祖先相似的身体特征。\n\n炼狱 Infernal\n炼狱遗赠将提夫林绑定于焦炎火狱、九层地狱、还有修罗场的狂暴战场。魔角、尖刺、尾巴，金色的眼睛和一股淡淡的硫磺或硝烟味，是这些提夫林共有的身体特征，他们中的大多数都有着一位魔鬼祖先。',
    source: '',
    creatureType: 'humanoid',
    sizeOptions: ['Medium', 'Small'],
    sizeDefault: 'Medium',
    speed: { walk: 30, climb: null, swim: null, fly: null, burrow: null },
    darkvision: 60,
    abilityScoreBonuses: [],
    traits: [
      {
        id: 'tiefling_darkvision',
        name: '黑暗视觉 Darkvision',
        description: '你拥有60尺黑暗视觉。',
        cards: [],
      },
      {
        id: 'tiefling_fiendish_legacy',
        name: '邪魔遗赠 Fiendish Legacy',
        description: '你承载着一份给予了你超自然能力的邪魔遗赠。从邪魔遗赠表格中选择其一。你获得该遗赠的1级好处。当你到达3级和5级时，你分别习得一道表格上更高级的法术；你时刻准备着这道习得的法术，且可以不消耗法术位施展此法术一次，当你完成一次长休时，你重获施展该道法术的能力。你也可以用任何你拥有的相应环阶法术位施展该道法术。\n\n选择遗赠时，从智力、感知、魅力中选择一项属性，该属性是你用此特质施展法术时的施法属性。',
        cards: [],
        choiceOptions: [
          {
            id: 'abyssal',
            label: '深渊 Abyssal',
            description: '获得对毒素伤害的抗性。习得戏法毒气喷涌 Poison Spray。3级习得致病射线 Ray of Sickness，5级习得定身类人 Hold Person。',
            cards: [
              { effectType: 'damage_type_relation', value: { types: ['poison'], relation: 'resist' } },
              { effectType: 'spell_granted', value: { cantrips: ['poison_spray'], level1: ['ray_of_sickness'], level2: ['hold_person'] } },
            ],
          },
          {
            id: 'chthonic',
            label: '幽冥 Chthonic',
            description: '获得对暗蚀伤害的抗性。习得戏法枯萎之触 Chill Touch。3级习得虚假生命 False Life，5级习得衰弱射线 Ray of Enfeeblement。',
            cards: [
              { effectType: 'damage_type_relation', value: { types: ['necrotic'], relation: 'resist' } },
              { effectType: 'spell_granted', value: { cantrips: ['chill_touch'], level1: ['false_life'], level2: ['ray_of_enfeeblement'] } },
            ],
          },
          {
            id: 'infernal',
            label: '炼狱 Infernal',
            description: '获得对火焰伤害的抗性。习得戏法火焰箭 Fire Bolt。3级习得炼狱叱喝 Hellish Rebuke，5级习得黑暗术 Darkness。',
            cards: [
              { effectType: 'damage_type_relation', value: { types: ['fire'], relation: 'resist' } },
              { effectType: 'spell_granted', value: { cantrips: ['fire_bolt'], level1: ['hellish_rebuke'], level2: ['darkness'] } },
            ],
          },
        ],
      },
      {
        id: 'tiefling_otherworldly_presence',
        name: '异界存在 Otherworldly Presence',
        description: '你习得戏法奇术 Thaumaturgy。用此特质施展它时，这道法术使用与你的邪魔遗赠特质使用相同的施法属性。',
        cards: [
          { effectType: 'spell_granted', value: { cantrips: ['thaumaturgy'] } },
        ],
      },
    ],
    tables: [
      {
        id: 'fiendish_legacies',
        name: '邪魔遗赠 Fiendish Legacies',
        dice: 'd3',
        rows: [
          { roll: '1', text: '深渊 Abyssal - 毒素抗性，毒气喷涌，致病射线(3级)，定身类人(5级)' },
          { roll: '2', text: '幽冥 Chthonic - 暗蚀抗性，枯萎之触，虚假生命(3级)，衰弱射线(5级)' },
          { roll: '3', text: '炼狱 Infernal - 火焰抗性，火焰箭，炼狱叱喝(3级)，黑暗术(5级)' },
        ],
      },
    ],
    subraces: [],
  },
]

/** 旧版硬编码种族兼容表（仅用于回退显示，不会出现在选择列表中） */
const LEGACY_RACES = {
  'dwarf':        { id: 'dwarf',        name: '矮人',     subraces: [{ id: 'hill', name: '丘陵矮人' }, { id: 'mountain', name: '山地矮人' }], traits: '黑暗视觉 60 尺；毒素抗性；矮人坚韧；石工工具熟练' },
  'elf':          { id: 'elf',          name: '精灵',     subraces: [{ id: 'high', name: '高精灵' }, { id: 'wood', name: '木精灵' }, { id: 'drow', name: '暗精灵' }], traits: '黑暗视觉 60 尺；敏锐感官；妖精血统' },
  'halfling':     { id: 'halfling',     name: '半身人',   subraces: [{ id: 'lightfoot', name: '轻足半身人' }, { id: 'stout', name: '健壮半身人' }], traits: '幸运；勇敢；半身人敏捷' },
  'human':        { id: 'human',        name: '人类',     subraces: [{ id: 'standard', name: '标准人类' }, { id: 'variant', name: '变体人类' }], traits: '全属性 +1 或自选两项 +1 加一项技能/专长' },
  'dragonborn':   { id: 'dragonborn',   name: '龙裔',     subraces: [], traits: '龙息武器；伤害抗性；龙语者' },
  'gnome':        { id: 'gnome',        name: '侏儒',     subraces: [{ id: 'forest', name: '森林侏儒' }, { id: 'rock', name: '岩石侏儒' }], traits: '黑暗视觉 60 尺；侏儒狡诈' },
  'half-elf':     { id: 'half-elf',     name: '半精灵',   subraces: [{ id: 'standard', name: '标准半精灵' }, { id: 'wood', name: '木精灵血统' }, { id: 'drow', name: '卓尔血统' }], traits: '黑暗视觉 60 尺；妖精血统；两项自选属性 +1；两项自选技能熟练' },
  'half-orc':     { id: 'half-orc',     name: '半兽人',   subraces: [], traits: '黑暗视觉 60 尺；不屈；凶猛攻击；兽人耐力' },
  'tiefling':     { id: 'tiefling',     name: '提夫林',   subraces: [{ id: 'standard', name: '标准提夫林' }, { id: 'variant', name: '变体提夫林' }], traits: '黑暗视觉 60 尺；地狱抗性；炼狱遗产' },
}

/** 将旧版兼容种族迁移为自定义种族（保留原 ID），已迁移则直接返回 */
export function migrateLegacyRace(id) {
  const legacy = LEGACY_RACES[id]
  if (!legacy) return null
  const list = getCustomRaces()
  const existing = list.find((r) => r.id === id)
  if (existing) return existing
  const entry = normalizeRace(migrateOldRace({ ...legacy, subraces: [...legacy.subraces] }))
  list.push(entry)
  persistCustomRaces(list)
  return entry
}

/** 判断是否为旧版兼容种族（不在自定义列表中） */
export function isLegacyRace(id) {
  if (!LEGACY_RACES[id]) return false
  return !getCustomRaces().some((r) => r.id === id)
}

const CUSTOM_RACES_KEY = 'dnd_custom_races'
let customRacesRemoteCache = null

function generateUniqueRaceId(usedIds) {
  const used = usedIds instanceof Set ? usedIds : new Set()
  let id
  do {
    id = `race_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
  } while (used.has(id))
  used.add(id)
  return id
}

function saveCustomRacesLocal(list) {
  try {
    localStorage.setItem(CUSTOM_RACES_KEY, JSON.stringify(list))
  } catch (_) {}
}

function persistCustomRaces(list) {
  if (isSupabaseEnabled()) {
    customRacesRemoteCache = [...list]
    return teamData.saveCustomLibrary('custom_races', customRacesRemoteCache)
  }
  saveCustomRacesLocal(list)
  return Promise.resolve()
}

/** 从 Supabase 加载自定义种族到远程缓存；若 Supabase 无数据则回退到 localStorage */
export async function loadCustomRacesFromSupabase() {
  if (!isSupabaseEnabled()) return
  try {
    const list = await teamData.fetchCustomLibrary('custom_races')
    if (Array.isArray(list) && list.length > 0) {
      customRacesRemoteCache = list
    } else {
      // Supabase 无数据，回退到 localStorage
      try {
        const raw = localStorage.getItem(CUSTOM_RACES_KEY)
        const localList = raw ? JSON.parse(raw) : []
        customRacesRemoteCache = Array.isArray(localList) ? localList : []
      } catch {
        customRacesRemoteCache = []
      }
    }
  } catch {
    customRacesRemoteCache = []
  }
}

/** 获取所有自定义种族（自动 normalize 为新版格式） */
export function getCustomRaces() {
  let list
  if (isSupabaseEnabled()) {
    list = Array.isArray(customRacesRemoteCache) ? [...customRacesRemoteCache] : []
  } else {
    try {
      const raw = localStorage.getItem(CUSTOM_RACES_KEY)
      const listRaw = raw ? JSON.parse(raw) : []
      list = Array.isArray(listRaw) ? listRaw : []
    } catch {
      list = []
    }
  }
  return list.map(normalizeRace)
}

/** 获取完整种族列表（内置 + 自定义，按 id 去重，内置优先） */
export function getAllRaces() {
  const custom = getCustomRaces()
  const builtInIds = new Set(RACES.map(r => r.id))
  // 过滤掉自定义中与内置同 id 的旧数据
  const uniqueCustom = custom.filter(r => !builtInIds.has(r.id))
  return [...RACES, ...uniqueCustom]
}

/** 按 ID 查找种族（自定义 + 旧版兼容回退），返回 normalize 后的数据 */
export function getRaceById(id) {
  const found = getAllRaces().find((r) => r.id === id)
  if (found) return normalizeRace(found)
  if (LEGACY_RACES[id]) return normalizeRace(migrateOldRace(LEGACY_RACES[id]))
  return null
}

/** 按种族 ID + 亚种 ID 查找亚种 */
export function getSubraceById(raceId, subraceId) {
  const race = getRaceById(raceId)
  if (!race) return null
  return race.subraces.find((s) => s.id === subraceId) || null
}

/** 新增自定义种族（支持新版完整格式） */
export function addCustomRace(race) {
  const list = getCustomRaces()
  const usedIds = new Set(list.map((x) => x?.id).filter(Boolean))
  const id = race?.id || generateUniqueRaceId(usedIds)
  const newRace = normalizeRace({
    ...DEFAULT_RACE,
    ...race,
    id,
    name: race?.name?.trim() || '新种族',
  })
  list.push(newRace)
  if (race?.id) {
    persistCustomRaces(list)
    return newRace
  }
  const p = persistCustomRaces(list)
  if (p && typeof p.then === 'function') return p.then(() => newRace)
  return newRace
}

/** 更新自定义种族 */
export function updateCustomRace(id, patch) {
  const list = getCustomRaces()
  const idx = list.findIndex((x) => x.id === id)
  if (idx === -1) return null
  list[idx] = { ...list[idx], ...patch }
  const pr = persistCustomRaces(list)
  if (pr && typeof pr.then === 'function') return pr.then(() => list[idx])
  return list[idx]
}

/** 删除自定义种族 */
export function removeCustomRace(id) {
  const list = getCustomRaces().filter((x) => x.id !== id)
  const pr = persistCustomRaces(list)
  if (pr && typeof pr.then === 'function') return pr.then(() => true)
  return Promise.resolve(true)
}
