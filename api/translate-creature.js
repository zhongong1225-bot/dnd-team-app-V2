/**
 * Vercel Serverless Function — 生物数据翻译为中文
 * POST /api/translate-creature
 * Body: { creature: { name, traits, actions, ... } }
 * Returns: translated creature data as JSON
 */

const QWEN_API_KEY = process.env.QWEN_API_KEY;
const QWEN_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const QWEN_MODEL = 'qwen-plus';

const SYSTEM_PROMPT = `你是一个 D&D 5e 生物数据翻译器。用户会给你一个生物的 JSON 数据（可能是英文的），你需要将所有文本字段翻译为中文。

返回翻译后的 JSON，保持完全相同的结构，但以下字段全部翻译为中文：
- name: 翻译为中文名称
- alignment: 阵营中文（如：中立善良）
- savingThrows: 豁免中文描述（如：'敏捷 +5, 体质 +3'）
- skills: 技能中文描述
- damageVulnerabilities: 伤害易伤中文列表（如：['火焰']）
- damageResistances: 伤害抗性中文列表
- damageImmunities: 伤害免疫中文列表
- conditionImmunities: 状态免疫中文列表（如：['魅惑', '恐慌', '中毒']）
- senses: 感官中文描述（如：'黑暗视觉 60 尺，被动感知 15'）
- languages: 语言中文描述
- traits[]: 每个特质的 name 和 description 翻译为中文
- actions[]: 每个动作的 name 和 description 翻译为中文
- reactions[]: 每个反应的 name 和 description 翻译为中文
- legendaryActions[]: 每个传奇动作的 name 和 description 翻译为中文

翻译规则：
- 伤害类型：fire=火焰, cold=寒冷, lightning=闪电, thunder=雷鸣, poison=毒素, acid=强酸, necrotic=黯蚀, radiant=光耀, force=力场, psychic=心灵, bludgeoning=钝击, piercing=穿刺, slashing=挥砍
- 状态：poisoned=中毒, frightened=恐慌, charmed=魅惑, restrained=束缚, paralyzed=麻痹, stunned=震慑, unconscious=失去意识, prone=倒地, grappled=擒抱, invisible=隐形, blinded=致盲, deafened=耳聋, exhausted=力竭, petrified=石化
- 保留骰子公式和数字不变（如 2d6+3）
- 如果已经是中文，保持原样
- 只返回 JSON，不要其他文字`;

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!QWEN_API_KEY) {
    return res.status(500).json({ error: 'QWEN_API_KEY not configured' });
  }

  try {
    const { creature } = req.body || {};

    if (!creature || typeof creature !== 'object') {
      return res.status(400).json({ error: 'Missing creature data' });
    }

    const response = await fetch(QWEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${QWEN_API_KEY}`,
      },
      body: JSON.stringify({
        model: QWEN_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: `请翻译以下生物数据为中文：\n${JSON.stringify(creature, null, 2)}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(502).json({ error: 'AI API error', details: errText });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return res.status(502).json({ error: 'Empty AI response' });
    }

    // Extract JSON from response (may be wrapped in markdown code block)
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
    const translated = JSON.parse(jsonMatch[1].trim());

    return res.status(200).json(translated);
  } catch (err) {
    console.error('translate-creature error:', err);
    return res.status(500).json({ error: 'Translation failed', message: err.message });
  }
}
