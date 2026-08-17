#!/usr/bin/env bash
# ============================================================================
# Nextcloud 同步插件 — 集成回归测试驱动（需真实 Nextcloud 服务）
#
# 覆盖 design.md 中 R2/R6/R8 与验收 V-1/V-2/V-8：
#   V-1  认证/连接      R8
#   V-2  智能同步三态    R2（需配合本地 vault 工具，本脚本聚焦服务端）
#   V-8  大文件 chunking R6
#
# 用法：
#   NC_URL=https://cloud.example.com NC_USER=youruser NC_PASS=apppassword \
#     NC_BASE=Obsidian bash test/integration-webdav.sh
#
# 注意：本沙箱无 Docker，无法自动起 Nextcloud；此脚本供有服务器时一键回归。
# ============================================================================
set -euo pipefail

NC_URL="${NC_URL:-https://cloud.example.com}"
NC_USER="${NC_USER:-}"
NC_PASS="${NC_PASS:-}"
NC_BASE="${NC_BASE:-Obsidian}"
AUTH="${NC_USER}:${NC_PASS}"
DAV="${NC_URL%/}/remote.php/dav/files/${NC_USER}/${NC_BASE}"
UPLOADS="${NC_URL%/}/remote.php/dav/uploads/${NC_USER}"

pass=0; fail=0
ok()   { echo "  ✅ $1"; pass=$((pass+1)); }
bad()  { echo "  ❌ $1"; fail=$((fail+1)); }

echo "== V-1 连接/认证 (R8) =="
code=$(curl -s -o /dev/null -w "%{http_code}" -u "$AUTH" -X PROPFIND "$DAV/" -H "Depth: 0")
if [ "$code" = "207" ] || [ "$code" = "200" ]; then ok "PROPFIND 认证成功 (HTTP $code)"; else bad "PROPFIND 失败 (HTTP $code)"; fi

echo "== V-8 大文件 chunking v2 (R6) =="
TID="regression-test-$(date +%s)"
# 1) MKCOL 临时上传目录
mk=$(curl -s -o /dev/null -w "%{http_code}" -u "$AUTH" -X MKCOL "$UPLOADS/$TID" -H "Destination: $DAV/big.bin")
if [ "$mk" = "201" ] || [ "$mk" = "405" ]; then ok "MKCOL 临时目录 (HTTP $mk)"; else bad "MKCOL 失败 (HTTP $mk)"; fi

# 2) 分两块上传（每块 1MB）
head -c 1048576 /dev/urandom > /tmp/chunk1.bin
head -c 1048576 /dev/urandom > /tmp/chunk2.bin
p1=$(curl -s -o /dev/null -w "%{http_code}" -u "$AUTH" -X PUT "$UPLOADS/$TID/00001" \
  -H "Destination: $DAV/big.bin" -H "OC-Total-Length: 2097152" --data-binary @/tmp/chunk1.bin)
p2=$(curl -s -o /dev/null -w "%{http_code}" -u "$AUTH" -X PUT "$UPLOADS/$TID/00002" \
  -H "Destination: $DAV/big.bin" -H "OC-Total-Length: 2097152" --data-binary @/tmp/chunk2.bin)
if [ "$p1" = "201" ] && [ "$p2" = "201" ]; then ok "分块 PUT x2 (HTTP $p1/$p2)"; else bad "分块 PUT 失败 (HTTP $p1/$p2)"; fi

# 3) MOVE 组装
mv=$(curl -s -o /dev/null -w "%{http_code}" -u "$AUTH" -X MOVE "$UPLOADS/$TID/.file" \
  -H "Destination: $DAV/big.bin" -H "OC-Total-Length: 2097152" -H "Overwrite: T")
if [ "$mv" = "201" ] || [ "$mv" = "204" ]; then ok "MOVE 组装 (HTTP $mv)"; else bad "MOVE 失败 (HTTP $mv)"; fi

# 4) 校验远端 size
sz=$(curl -s -u "$AUTH" -X PROPFIND "$DAV/big.bin" -H "Depth: 0" | grep -o '<d:getcontentlength>[0-9]*' | grep -o '[0-9]*')
if [ "$sz" = "2097152" ]; then ok "远端 size 一致 (2097152)"; else bad "远端 size 不符: $sz"; fi

# 5) 清理
curl -s -o /dev/null -u "$AUTH" -X DELETE "$DAV/big.bin" || true

echo ""
echo "== 结果: 通过 $pass / 失败 $fail =="
[ "$fail" = "0" ]
