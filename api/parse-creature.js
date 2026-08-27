/**
 * Vercel Serverless Function — 生物库截图解析
 * POST /api/parse-creature
 * Body: { image: "data:image/png;base64,..." }
 * Returns: parsed creature data as JSON
 */

const QWEN_API_KEY = process.env.QWEN_API_KEY;
const QWEN_ENDPOINT = 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions';
const QWEN_MODEL = 'qwen-vl-max';

const SYSTEM_PROMPT = `你是一个 D&D 5e 生物数据块解析器。用户会给你一张生物数据块的截图，你需要从中提取所有信息并以 JSON 格式返回。

返回格式（所有字段都必须存在，找不到则用默认值）：
{
  "name": "生物名称（英文）",
  "nameZh": "生物名称（中文，如有）",
  "size": "tiny|small|medium|large|huge|gargantuan",
  "type": "beast|dragon|humanoid|undead|fiend|celestial|fey|elemental|aberration|construct|giant|monstrosity|ooze|plant",
  "alignment": "阵营描述（如 neutral good）",
  "cr": 数字（挑战等级，如 0.25, 0.5, 1, 2），
  "xp": 数字（经验值），
  "abilities": {
    "str": 数字,
    "dex": 数字,
    "con": 数字,
    "int": 数字,
    "wis": 数字,
    "cha": 数字
  },
  "hp": "HP 数字或骰子公式（如 '45 (6d8+18)'）",
  "ac": 数字（护甲等级）,
  "speed": {
    "walk": 数字,
    "fly": 数字或null,
    "swim": 数字或null,
    "climb": 数字或null
  },
  "savingThrows": "豁免描述文本（如 'Dex +5, Con +3'）",
  "skills": "技能描述文本（如 'Perception +5, Stealth +8'）",
  "damageVulnerabilities": "伤害易伤列表",
  "damageResistances": "伤害抗性列表",
  "damageImmunities": "伤害免疫列表",
  "conditionImmunities": "状态免疫列表",
  "senses": "感官描述（如 'darkvision 60 ft., passive Perception 15'）",
  "languages": "语言描述",
  "traits": ["特性1描述", "特性2描述"],
  "actions": ["动作1描述", "动作2描述"],
  "reactions": ["反应1描述"],
  "legendaryActions": ["传奇动作1描述"]
}

规则：
- size 映射：Tiny=tiny, Small=small, Medium=medium, Large=large, Huge=huge, Gargantuan=gargantuan
- type 映射到最接近的上述类型
- cr: 1/4=0.25, 1/2=0.5, 1=1, 2=2 等
- hp: 保留原始文本格式（如 "45 (6d8+18)"）
- ac: 只取数字
- speed: 只取数字，没有的飞行/游泳/攀爬速度填 null
- traits/actions 等：保留完整描述文本，包括名称和效果
- 如果截图中有多个生物，只解析第一个
- 只返回 JSON，不要其他文字`;

export default async function handler(req, res) {
  // CORS
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
    const { image } = req.body || {};

    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'Missing image data' });
    }

    // Extract base64 data and media type
    const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid image data format. Expected: data:image/xxx;base64,...' });
    }

    const mimeType = match[1];
    const base64Data = match[2];

    // Call Qwen VL API
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
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${base64Data}` },
              },
              {
                type: 'text',
                text: '请解析这张图片中的 D&D 生物数据块，返回 JSON。',
              },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Qwen API error:', errText);
      return res.status(502).json({ error: 'AI service error', detail: errText });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Extract JSON from response (may be wrapped in markdown code block)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    } else {
      // Try to find raw JSON
      const rawMatch = content.match(/\{[\s\S]*\}/);
      if (rawMatch) {
        jsonStr = rawMatch[0];
      }
    }

    let creatureData;
    try {
      creatureData = JSON.parse(jsonStr);
    } catch (e) {
      console.error('Failed to parse JSON:', jsonStr);
      return res.status(502).json({ error: 'AI returned invalid JSON', raw: content });
    }

    return res.status(200).json(creatureData);
  } catch (err) {
    console.error('parse-creature error:', err);
    return res.status(500).json({ error: 'Internal server error', message: err.message });
  }
}
