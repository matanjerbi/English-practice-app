#!/usr/bin/env bash
# פריסה מלאה ל-Cloudflare: יוצר D1 ופרויקט Pages אם חסרים, מריץ סכמה, מעלה, ומגדיר סודות.
# דורש: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID. אופציונלי: SIGNUP_CODE, PAGES_PROJECT
set -euo pipefail

PROJECT="${PAGES_PROJECT:-english-practice}"
DB_NAME="english-practice-db"
W="npx --yes wrangler"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ] || [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "✗ חסרים סודות: CLOUDFLARE_API_TOKEN ו/או CLOUDFLARE_ACCOUNT_ID"
  echo "  יש להגדיר אותם ב-GitHub: Settings → Secrets and variables → Actions → לשונית Secrets → Repository secrets"
  exit 1
fi

echo "▶ D1: מחפש את $DB_NAME"
find_db() { $W d1 list --json 2>/dev/null | node -e '
  let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{
    const i=s.indexOf("["); let list=[]; try { list=JSON.parse(s.slice(i)); } catch {}
    const db=list.find(x=>x.name===process.argv[1]); process.stdout.write(db?(db.uuid||db.database_id||""):"");
  })' "$DB_NAME"; }
DB_ID="$(find_db || true)"
if [ -z "$DB_ID" ]; then
  echo "▶ D1: יוצר מסד נתונים חדש"
  $W d1 create "$DB_NAME"
  DB_ID="$(find_db)"
fi
[ -n "$DB_ID" ] || { echo "✗ לא הצלחתי למצוא/ליצור D1"; exit 1; }
echo "  database_id=$DB_ID"
sed -i "s/^database_id = .*/database_id = \"$DB_ID\"/" wrangler.toml

echo "▶ D1: מריץ סכמה"
$W d1 execute "$DB_NAME" --remote --file=schema.sql --yes

echo "▶ Pages: מוודא שהפרויקט $PROJECT קיים"
if ! $W pages project list --json 2>/dev/null | grep -q "\"$PROJECT\""; then
  $W pages project create "$PROJECT" --production-branch main
fi

if [ -n "${SIGNUP_CODE:-}" ]; then
  echo "▶ מגדיר SIGNUP_CODE"
  printf '%s' "$SIGNUP_CODE" | $W pages secret put SIGNUP_CODE --project-name "$PROJECT"
fi

echo "▶ Pages: מעלה"
$W pages deploy --project-name "$PROJECT" --branch main --commit-dirty=true

echo "✓ הסתיים (הכתובת מופיעה למעלה בפלט של pages deploy)"
