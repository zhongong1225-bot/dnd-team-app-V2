/**
 * cardModel.js 单元测试
 * 
 * 测试范围：
 * - 工厂函数：createActiveCard / createPassiveCard
 * - 序列化：cardToJSON / cardFromJSON
 * - 迁移：migrateBuffToCard / migrateBuffsArray
 * - 兼容：旧 buffs[] 格式读取
 */

import { describe, it, expect } from 'vitest'
import {
  createActiveCard,
  createPassiveCard,
  cardToJSON,
  cardFromJSON,
  migrateBuffToCard,
  migrateBuffsArray,
  CARD_MODE,
  ACTION_TYPE,
  DURATION_UNIT,
  SCOPE_TYPE,
} from './cardModel'

describe('createActiveCard', () => {
  it('应创建具有默认值的主动卡', () => {
    const card = createActiveCard()
    
    expect(card.mode).toBe(CARD_MODE.ACTIVE)
    expect(card.cost).toEqual({ type: 'charges', resourceKey: '', amount: 1 })
    expect(card.actionType).toBe('action')
    expect(card.duration).toEqual({ unit: 'instant', amount: 1 })
    expect(card.effects).toEqual([])
    expect(card.buffEffects).toEqual([])
    expect(card.enabled).toBe(true)
  })

  it('应支持覆盖默认值', () => {
    const card = createActiveCard({
      name: '火球术',
      cost: { type: 'spell_slot_3', resourceKey: 'spellSlot3', amount: 1 },
      actionType: ACTION_TYPE.ACTION,
      duration: { unit: DURATION_UNIT.INSTANT, amount: 1 },
      effects: [{ effectType: 'damage', value: '8d6' }],
    })
    
    expect(card.name).toBe('火球术')
    expect(card.cost.type).toBe('spell_slot_3')
    expect(card.actionType).toBe('action')
    expect(card.effects.length).toBe(1)
  })

  it('应支持多资源消耗', () => {
    const card = createActiveCard({
      multiCost: true,
      costs: [
        { type: 'rage', amount: 2 },
        { type: 'bonus_action', amount: 1 },
      ],
    })
    
    expect(card.multiCost).toBe(true)
    expect(card.costs.length).toBe(2)
    expect(card.costs[0].type).toBe('rage')
  })

  it('应支持移动动作', () => {
    const card = createActiveCard({
      actionType: ACTION_TYPE.MOVEMENT,
      movementDistance: 30,
    })
    
    expect(card.actionType).toBe('movement')
    expect(card.movementDistance).toBe(30)
  })

  it('应深度合并嵌套对象', () => {
    const card = createActiveCard({
      recovery: { method: 'short_rest' },
      duration: { unit: DURATION_UNIT.ROUND, amount: 10 },
    })
    
    expect(card.recovery.method).toBe('short_rest')
    expect(card.recovery.kind).toBe('full') // 保留默认值
    expect(card.duration.unit).toBe('round')
    expect(card.duration.amount).toBe(10)
  })
})

describe('createPassiveCard', () => {
  it('应创建具有默认值的被动卡', () => {
    const card = createPassiveCard()
    
    expect(card.mode).toBe(CARD_MODE.PASSIVE)
    expect(card.scope).toEqual({ type: 'global', weapons: [], damageTypes: [], custom: '' })
    expect(card.effects).toEqual([])
    expect(card.buffEffects).toEqual([])
    expect(card.enabled).toBe(true)
  })

  it('应支持武器类型范围', () => {
    const card = createPassiveCard({
      scope: {
        type: SCOPE_TYPE.WEAPON_TYPE,
        weapons: ['longsword', 'greatsword'],
      },
    })
    
    expect(card.scope.type).toBe('weapon_type')
    expect(card.scope.weapons).toEqual(['longsword', 'greatsword'])
  })

  it('应支持伤害类型范围', () => {
    const card = createPassiveCard({
      scope: {
        type: SCOPE_TYPE.DAMAGE_TYPE,
        damageTypes: ['fire', 'cold'],
      },
    })
    
    expect(card.scope.type).toBe('damage_type')
    expect(card.scope.damageTypes).toEqual(['fire', 'cold'])
  })

  it('应同步 effects 到 buffEffects', () => {
    const effects = [{ effectType: 'ac_bonus', value: 2 }]
    const card = createPassiveCard({ effects })
    
    expect(card.effects).toBe(effects)
    expect(card.buffEffects).toBe(effects)
  })
})

describe('cardToJSON / cardFromJSON', () => {
  it('应序列化主动卡并去除 undefined', () => {
    const card = createActiveCard({ name: '测试卡' })
    const json = cardToJSON(card)
    
    expect(json.id).toBeDefined()
    expect(json.name).toBe('测试卡')
    expect(json.mode).toBe(CARD_MODE.ACTIVE)
    expect(json.cost).toBeDefined()
    expect(json.duration).toBeDefined()
    expect(json.effects).toEqual([])
  })

  it('应序列化被动卡的 scope', () => {
    const card = createPassiveCard({
      name: '火焰抗性',
      scope: {
        type: SCOPE_TYPE.DAMAGE_TYPE,
        damageTypes: ['fire'],
      },
    })
    const json = cardToJSON(card)
    
    expect(json.mode).toBe(CARD_MODE.PASSIVE)
    expect(json.scope.type).toBe('damage_type')
    expect(json.scope.damageTypes).toEqual(['fire'])
  })

  it('应反序列化 JSON 并规范化', () => {
    const json = {
      id: 'test_123',
      name: '从JSON恢复',
      mode: CARD_MODE.ACTIVE,
      cost: { type: 'charges', amount: 2 },
      actionType: 'bonus',
      duration: { unit: 'round', amount: 5 },
    }
    
    const card = cardFromJSON(json)
    
    expect(card.id).toBe('test_123')
    expect(card.name).toBe('从JSON恢复')
    expect(card.mode).toBe(CARD_MODE.ACTIVE)
    expect(card.cost.amount).toBe(2)
    expect(card.actionType).toBe('bonus')
    expect(card.duration.unit).toBe('round')
  })

  it('应处理无效输入', () => {
    expect(cardToJSON(null)).toBeNull()
    expect(cardToJSON(undefined)).toBeNull()
    expect(cardFromJSON(null).mode).toBeUndefined()
    expect(cardFromJSON({}).enabled).toBe(true)
  })

  it('往返转换应保持数据一致', () => {
    const original = createActiveCard({
      name: '往返测试',
      cost: { type: 'spell_slot_5', amount: 1 },
      effects: [{ effectType: 'damage', value: '10d6' }],
      duration: { unit: 'instant', amount: 1 },
    })
    
    const json = cardToJSON(original)
    const restored = cardFromJSON(json)
    
    expect(restored.name).toBe(original.name)
    expect(restored.cost.type).toBe(original.cost.type)
    expect(restored.effects.length).toBe(original.effects.length)
  })
})

describe('migrateBuffToCard', () => {
  it('应将含 charge_item 的 BUFF 迁移为主动卡', () => {
    const buffEntry = {
      id: 'buff_123',
      source: '野蛮人狂暴',
      effects: [
        {
          effectType: 'charge_item',
          value: {
            resourceType: 'rage',
            charges: 1,
            actionCost: 'bonus',
            recovery: { method: 'long_rest', kind: 'full' },
            effects: [{ effectType: 'resistance', damageType: 'bludgeoning' }],
          },
        },
      ],
      enabled: true,
    }
    
    const card = migrateBuffToCard(buffEntry)
    
    expect(card.mode).toBe(CARD_MODE.ACTIVE)
    expect(card.name).toBe('野蛮人狂暴')
    expect(card.cost.type).toBe('rage')
    expect(card.cost.amount).toBe(1)
    expect(card.actionType).toBe('bonus')
    expect(card.effects.length).toBe(1)
    expect(card.effects[0].effectType).toBe('resistance')
  })

  it('应将普通 BUFF 迁移为被动卡', () => {
    const buffEntry = {
      id: 'buff_456',
      source: '祝福术',
      effects: [
        { effectType: 'attack_bonus', value: 4 },
        { effectType: 'save_bonus', value: 4 },
      ],
      enabled: true,
    }
    
    const card = migrateBuffToCard(buffEntry)
    
    expect(card.mode).toBe(CARD_MODE.PASSIVE)
    expect(card.name).toBe('祝福术')
    expect(card.effects.length).toBe(2)
    expect(card.scope.type).toBe('global')
  })

  it('应处理空输入', () => {
    const card = migrateBuffToCard(null)
    expect(card.mode).toBe(CARD_MODE.PASSIVE)
  })

  it('应保留其他效果到 buffEffects', () => {
    const buffEntry = {
      id: 'buff_789',
      source: '混合卡',
      effects: [
        {
          effectType: 'charge_item',
          value: {
            resourceType: 'charges',
            charges: 1,
            effects: [{ effectType: 'damage', value: '2d6' }],
          },
        },
        { effectType: 'speed_bonus', value: 10 },
      ],
    }
    
    const card = migrateBuffToCard(buffEntry)
    
    expect(card.mode).toBe(CARD_MODE.ACTIVE)
    expect(card.effects.length).toBe(1) // charge_item 的子效果
    expect(card.buffEffects.length).toBe(1) // 其他效果
    expect(card.buffEffects[0].effectType).toBe('speed_bonus')
  })
})

describe('migrateBuffsArray', () => {
  it('应批量迁移 BUFF 数组', () => {
    const buffs = [
      {
        id: 'buff_1',
        source: '狂暴',
        effects: [
          {
            effectType: 'charge_item',
            value: { resourceType: 'rage', charges: 1, effects: [] },
          },
        ],
      },
      {
        id: 'buff_2',
        source: '祝福',
        effects: [{ effectType: 'attack_bonus', value: 4 }],
      },
      {
        id: 'virtual_1',
        source: '职业特性',
        fromClassFeature: true, // 虚拟条目应被过滤
        effects: [],
      },
    ]
    
    const cards = migrateBuffsArray(buffs)
    
    expect(cards.length).toBe(2) // 过滤掉虚拟条目
    expect(cards[0].mode).toBe(CARD_MODE.ACTIVE)
    expect(cards[1].mode).toBe(CARD_MODE.PASSIVE)
  })

  it('应处理空数组', () => {
    expect(migrateBuffsArray([])).toEqual([])
    expect(migrateBuffsArray(null)).toEqual([])
    expect(migrateBuffsArray(undefined)).toEqual([])
  })
})

describe('向后兼容性', () => {
  it('应读取无 mode 字段的旧卡', () => {
    const oldCard = {
      id: 'old_123',
      name: '旧卡',
      buffEffects: [{ effectType: 'ac_bonus', value: 2 }],
    }
    
    const normalized = cardFromJSON(oldCard)
    
    expect(normalized.mode).toBeUndefined() // 不设 mode，保持兼容
    expect(normalized.buffEffects.length).toBe(1)
    expect(normalized.enabled).toBe(true)
  })

  it('应将有 activeAbility 的旧卡视为主动', () => {
    const oldCard = {
      id: 'old_456',
      name: '有主动技能的旧卡',
      activeAbility: { name: '测试技能' },
    }
    
    const normalized = cardFromJSON(oldCard)
    
    expect(normalized.mode).toBe(CARD_MODE.ACTIVE)
    expect(normalized.activeAbility).toBeDefined()
  })

  it('应兼容旧的 selectedFeats[].featBuffPatch 格式', () => {
    // featBuffPatch 是 DM 补丁，应能直接作为 effects 传入
    const featBuffPatch = [
      { effectType: 'attack_bonus', value: 3 },
      { effectType: 'damage_bonus', value: 3 },
    ]
    
    const card = createPassiveCard({
      name: '巨武器大师',
      effects: featBuffPatch,
    })
    
    expect(card.effects).toBe(featBuffPatch)
    expect(card.buffEffects).toBe(featBuffPatch)
  })
})
