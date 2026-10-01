#!/usr/bin/env bash
set -euo pipefail

# Symlinks every skill in this repo into the local harness skill directories:
#   - ~/.claude/skills  — Claude Code
#   - ~/.agents/skills  — pi and other Agent-Skills-standard harnesses
# Each entry is a symlink into this repo, so `git pull` keeps installed skills current.

REPO="$(cd "$(dirname "$0")/.." && pwd)"

# 非符号链接的既有条目一律不删:实测两个技能目录里有大量实体目录,
# 先删后建会把它们整个抹掉。默认跳过并打印;确要覆盖须显式 --force。
FORCE=0
for arg in "$@"; do [ "$arg" = "--force" ] && FORCE=1; done
DESTS=("$HOME/.claude/skills" "$HOME/.agents/skills")

names=()
srcs=()
while IFS= read -r -d '' skill_md; do
  src="$(dirname "$skill_md")"
  names+=("$(basename "$src")")
  srcs+=("$src")
done < <(find "$REPO/skills" -name SKILL.md -not -path '*/node_modules/*' -not -path '*/deprecated/*' -print0)

for DEST in "${DESTS[@]}"; do
  if [ -L "$DEST" ]; then
    resolved="$(readlink -f "$DEST")"
    case "$resolved" in
      "$REPO"|"$REPO"/*)
        echo "error: $DEST is a symlink into this repo ($resolved)." >&2
        echo "Remove it (rm \"$DEST\") and re-run." >&2
        exit 1
        ;;
    esac
  fi

  mkdir -p "$DEST"
  for i in "${!names[@]}"; do
    name="${names[$i]}"; src="${srcs[$i]}"; target="$DEST/$name"
    # 先试后兜:不去猜「这个条目是什么」——MSYS 对 Windows junction 的 -e / -L / -d 判定都不可靠,
    # 猜错的代价是 ln 失败 + set -e 让整脚本半途退出(实测:一个 junction 就让后面所有技能装不上)。
    # 直接试重指:成功照旧;失败则按「非符号链接」跳过并打印,要覆盖须显式 --force。
    if ln -sfn "$src" "$target" 2>/dev/null; then
      echo "linked $name -> $src ($DEST)"
    elif [ "$FORCE" = "1" ]; then
      rm -rf "$target"
      ln -sfn "$src" "$target" && echo "linked $name -> $src ($DEST) (--force 覆盖)"
    else
      echo "skip $name: $target 未能重指(实体目录或 junction);不删除(确要覆盖请加 --force)" >&2
    fi
  done
done
