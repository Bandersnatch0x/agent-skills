#!/usr/bin/env bash
# Read-only inventory for Claude Code local state.

set -euo pipefail

CLAUDE_HOME="${CLAUDE_HOME:-$HOME/.claude}"

if [[ ! -d "$CLAUDE_HOME" ]]; then
    printf 'Claude home does not exist: %s\n' "$CLAUDE_HOME" >&2
    exit 1
fi

if [[ -t 1 && -z "${NO_COLOR:-}" ]]; then
    BLUE='\033[0;34m'
    YELLOW='\033[1;33m'
    NC='\033[0m'
else
    BLUE=''
    YELLOW=''
    NC=''
fi

header() {
    printf '\n%b== %s ==%b\n' "$BLUE" "$1" "$NC"
}

note() {
    printf '%bREVIEW:%b %s\n' "$YELLOW" "$NC" "$1"
}

human_size() {
    du -sh "$1" 2>/dev/null | awk '{print $1}' || printf 'unknown\n'
}

count_entries() {
    local root="$1"
    shift

    find "$root" -mindepth 1 -maxdepth 1 "$@" -print0 2>/dev/null \
        | tr -cd '\0' \
        | wc -c \
        | tr -d ' '
}

print_root_usage() {
    local entries=()
    shopt -s nullglob
    entries=("$CLAUDE_HOME"/* "$CLAUDE_HOME"/.[!.]* "$CLAUDE_HOME"/..?*)
    shopt -u nullglob

    printf 'Total: %s\n' "$(human_size "$CLAUDE_HOME")"
    if ((${#entries[@]} > 0)); then
        printf 'Largest top-level entries:\n'
        { du -sh "${entries[@]}" 2>/dev/null || true; } \
            | sort -hr \
            | sed -n '1,10p'
    fi
}

print_session_inventory() {
    local projects_root="$CLAUDE_HOME/projects"
    local session_root

    if [[ -d "$projects_root" ]]; then
        printf 'Project directories: %s\n' "$(count_entries "$projects_root" -type d)"
        printf 'Transcript files (*.jsonl): %s\n' \
            "$(find "$projects_root" -type f -name '*.jsonl' -print0 2>/dev/null | tr -cd '\0' | wc -c | tr -d ' ')"
    else
        printf 'Projects root not found: %s\n' "$projects_root"
    fi

    while IFS= read -r -d '' session_root; do
        printf 'Discovered session directory: %s (%s entries)\n' \
            "$session_root" "$(count_entries "$session_root")"
    done < <(find "$CLAUDE_HOME" -mindepth 1 -maxdepth 4 -type d -name sessions -print0 2>/dev/null)
}

print_worktree_inventory() {
    local root
    local worktree
    local dirty_count
    local branch
    local commit
    local found=0

    while IFS= read -r -d '' root; do
        found=1
        printf 'Discovered worktree root: %s\n' "$root"

        while IFS= read -r -d '' worktree; do
            printf '\n- %s (%s)\n' "$worktree" "$(human_size "$worktree")"
            if git -C "$worktree" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
                branch="$(git -C "$worktree" branch --show-current 2>/dev/null || true)"
                commit="$(git -C "$worktree" rev-parse --short HEAD 2>/dev/null || true)"
                dirty_count="$(git -C "$worktree" status --porcelain=v1 2>/dev/null | wc -l | tr -d ' ')"
                printf '  Git: branch=%s commit=%s dirty_entries=%s\n' \
                    "${branch:-detached}" "${commit:-unknown}" "$dirty_count"
                if ((dirty_count > 0)); then
                    note "Preserve this worktree until its uncommitted state is handed off."
                else
                    note "Clean is necessary but not sufficient; verify activity, purpose, and handoff before removal."
                fi
            else
                note "Purpose is unknown; this directory is not a Git worktree."
            fi
        done < <(find "$root" -mindepth 1 -maxdepth 1 -type d -print0 2>/dev/null)
    done < <(find "$CLAUDE_HOME" -mindepth 1 -maxdepth 4 -type d -name worktrees -print0 2>/dev/null)

    if ((found == 0)); then
        printf 'No directory named worktrees was found under %s\n' "$CLAUDE_HOME"
    fi
}

print_logs_and_large_files() {
    local log_count
    local old_log_count
    local large_count
    local shown=0
    local file

    log_count="$(find "$CLAUDE_HOME" -type f \( -name '*.log' -o -name '*.log.*' \) -print0 2>/dev/null | tr -cd '\0' | wc -c | tr -d ' ')"
    old_log_count="$(find "$CLAUDE_HOME" -type f \( -name '*.log' -o -name '*.log.*' \) -mtime +30 -print0 2>/dev/null | tr -cd '\0' | wc -c | tr -d ' ')"
    large_count="$(find "$CLAUDE_HOME" -type f -size +10M -print0 2>/dev/null | tr -cd '\0' | wc -c | tr -d ' ')"

    printf 'Log files: %s (%s older than 30 days)\n' "$log_count" "$old_log_count"
    printf 'Files larger than 10 MiB: %s\n' "$large_count"

    while IFS= read -r -d '' file; do
        printf '  %s  %s\n' "$(human_size "$file")" "$file"
        ((shown += 1))
        if ((shown == 10)); then
            break
        fi
    done < <(find "$CLAUDE_HOME" -type f -size +10M -print0 2>/dev/null)
}

main() {
    printf 'Claude Code state inventory\n'
    printf 'Generated: %s\n' "$(date '+%Y-%m-%d %H:%M:%S')"
    printf 'Root: %s\n' "$CLAUDE_HOME"
    printf 'Mode: read-only\n'

    header 'Cleanup Record'
    if [[ -f "$CLAUDE_HOME/.last-cleanup" ]]; then
        printf 'Last cleanup: '
        sed -n '1p' "$CLAUDE_HOME/.last-cleanup"
    else
        printf 'No cleanup record found.\n'
    fi

    header 'Disk Usage'
    print_root_usage

    header 'Sessions and Projects'
    print_session_inventory

    header 'Worktrees'
    print_worktree_inventory

    header 'Logs and Large Files'
    print_logs_and_large_files

    header 'Next Step'
    note 'Classify exact targets with activity, ownership, handoff, and recovery evidence before changing anything.'
}

main "$@"
