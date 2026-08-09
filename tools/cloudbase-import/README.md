# 微信云开发数据导入说明

本目录包含从 Supabase 导出的数据转换后的云开发数据库导入文件。

## 数据结构

已生成以下集合数据：

| 集合名 | 说明 | 数据条数 |
|--------|------|---------|
| characters | 角色 | 3 |
| warehouses | 团队仓库 | 1 |
| campaign_modules | 模组列表 | 1 |
| team_vaults | 团队金库 | 0 |
| crafting_projects | 制作项目 | 0 |
| user_prefs | 用户偏好 | 1 |
| custom_libraries | 自定义库 | 0 |

## 导入方式（三选一）

### 方式一：微信开发者工具手动导入（最简单，推荐）

1. 打开微信开发者工具，进入「云开发」→「数据库」
2. 依次创建上表中的集合
3. 点击集合名称 →「导入」
4. 选择对应名称的 `.json` 文件（如 `characters.json`）
5. 等待导入完成

### 方式二：本地脚本自动导入

需要腾讯云 SecretId / SecretKey。

```bash
npm install @cloudbase/node-sdk

set CLOUDBASE_ENV_ID=你的环境ID
set CLOUDBASE_SECRET_ID=你的SecretId
set CLOUDBASE_SECRET_KEY=你的SecretKey

node tools/import-to-cloudbase.mjs
```

### 方式三：云函数导入

1. 把 `tools/cloudfunctions/migrateFromSupabase` 复制到 Taro 项目的 `cloudfunctions/` 目录
2. 把 `tools/cloudbase-import/*.json` 复制到 `cloudfunctions/migrateFromSupabase/data/` 目录
3. 在微信开发者工具中右键该云函数 →「上传并部署：云端安装依赖」
4. 调用该云函数即可导入

## 注意事项

- 角色表 `_id` 使用短 ID，原 Supabase UUID 保存在 `supabaseId` 字段
- 手动导入时若提示 `_id` 重复，说明集合中已有数据，可先清空集合再导入
- 导入前建议先备份云开发现有数据
