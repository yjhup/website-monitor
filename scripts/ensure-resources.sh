#!/usr/bin/env bash
# 自动确保 D1 数据库存在，并把 database_id 写入 wrangler.toml 完成绑定。
# 项目所有数据均存储在 D1，无需创建 KV 命名空间。
# 在 GitHub Actions 或本地均可运行（需要已配置 CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID）。
set -euo pipefail

DB_NAME="website-monitor-db"
TOML="wrangler.toml"

echo "==> 检查 D1 数据库：$DB_NAME"
DB_LIST="$(npx wrangler d1 list --json 2>/dev/null)"
DB_ID="$(echo "$DB_LIST" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);const it=(j||[]).find(x=>x.name==='$DB_NAME');if(it)process.stdout.write(it.database_id)})")"
if [ -n "$DB_ID" ]; then
  echo "    D1 数据库已存在：$DB_ID"
else
  echo "    创建 D1 数据库..."
  DB_CREATE="$(npx wrangler d1 create "$DB_NAME" --json)"
  DB_ID="$(echo "$DB_CREATE" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const j=JSON.parse(d);process.stdout.write((j[0]||j).database_id||'')})")"
  if [ -z "$DB_ID" ]; then
    echo "    [警告] 无法从 JSON 输出解析 database_id，尝试从文本输出解析"
    DB_ID="$(echo "$DB_CREATE" | sed -n 's/.*database_id *= *"\([^"]*\)".*/\1/p' | head -n1)"
  fi
  echo "    已创建：$DB_ID"
fi

echo "==> 更新 $TOML 绑定"
if [ -n "$DB_ID" ]; then
  sed -i "s/^database_id *= *.*/database_id = \"$DB_ID\"/" "$TOML"
fi

echo "==> 初始化数据库表"
npx wrangler d1 execute "$DB_NAME" --remote --file=schema.sql >/dev/null

echo "✅ 资源准备完成。"
