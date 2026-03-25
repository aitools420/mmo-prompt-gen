#!/usr/bin/env bash
# Daily MMO polish endpoint stats → Telegram digest
# Cron: 0 14 * * * (2pm UTC / 10pm AWST)

set -euo pipefail

STATS_URL="https://mmo-prompt-gen.pages.dev/api/stats"
STATS_KEY="$(cat /home/green/projects/mmo-prompt-gen/.stats-key)"
TG_TOKEN="$(grep TELEGRAM_BOT_TOKEN /home/green/.claude/channels/telegram/.env | cut -d= -f2)"
TG_CHAT="5442429763"

DATA=$(curl -sf "${STATS_URL}?key=${STATS_KEY}" 2>/dev/null) || {
  curl -sf "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
    -d chat_id="${TG_CHAT}" \
    -d parse_mode=Markdown \
    -d text="⚠️ *MMO Stats* — failed to reach stats endpoint" >/dev/null
  exit 1
}

TODAY=$(echo "$DATA" | jq -r '.days[0]')
DATE=$(echo "$TODAY" | jq -r '.date')
OK=$(echo "$TODAY" | jq -r '.ok')
FAIL=$(echo "$TODAY" | jq -r '.fail')
RL=$(echo "$TODAY" | jq -r '.rate_limited')
MODELS=$(echo "$TODAY" | jq -r '.models | to_entries | map("\(.key | split("/")[0]): \(.value)") | join(", ")')

if [ "$FAIL" -gt 0 ]; then
  ICON="🔴"
  STATUS="FAILURES DETECTED"
elif [ "$OK" -gt 0 ]; then
  ICON="🟢"
  STATUS="All good"
else
  ICON="⚪"
  STATUS="No traffic"
fi

TOTAL=$((OK + FAIL))
if [ "$TOTAL" -gt 0 ]; then
  RATE=$(( OK * 100 / TOTAL ))
else
  RATE="-"
fi

MSG="${ICON} *MMO Polish — ${DATE}*
Status: ${STATUS}
Polished: ${OK} | Failed: ${FAIL} | Rate-limited: ${RL}
Success rate: ${RATE}%
Models: ${MODELS:-none}"

curl -sf "https://api.telegram.org/bot${TG_TOKEN}/sendMessage" \
  -d chat_id="${TG_CHAT}" \
  -d parse_mode=Markdown \
  -d text="${MSG}" >/dev/null
