window.__TL__ = {
  "schema": 3,
  "seq": 21,
  "run": {
    "id": "run_demo_20260928_v1",
    "title": "长任务状态机与复核台账落地执行",
    "goal": "生成式夹具：state.js 由 project() 真输出序列化而来；转义探针 run.goal 承载 \u003c/script\u003e \u003cscript\u003e",
    "type": "",
    "status": "running",
    "started_at": "2026-09-28T09:30:00.000Z",
    "updated_at": "2026-09-28T10:14:50.000Z",
    "active_seconds": 2730,
    "est_min": null,
    "eta": {
      "low": null,
      "high": null,
      "basis": "估算中",
      "n": 1
    }
  },
  "theme": "dark",
  "accent": "#c2563f",
  "density": "comfortable",
  "counts": {
    "todo": 1,
    "doing": 1,
    "done": 2,
    "discovered": 0,
    "review": {
      "ok": 0,
      "flag": 0,
      "unreviewed": 2
    },
    "decisions": {
      "pending": 1,
      "resolved": 1,
      "defaulted": 0,
      "moot": 0
    }
  },
  "items": [
    {
      "id": "T1",
      "title": "定义 4px 几何网格与皮肤颜色令牌 (tokens.mjs)",
      "lane": "done",
      "outcome": "superseded",
      "origin": {
        "type": "initial",
        "ref": null,
        "summary": null
      },
      "deps": [],
      "owner": null,
      "note": "",
      "progress": 1,
      "started_at": "2026-09-28T09:34:00.000Z",
      "ended_at": "2026-09-28T09:36:00.000Z",
      "active_seconds": 120,
      "rounds": 1,
      "assumes": [],
      "flags": [],
      "blocked_by": [],
      "evidence": {
        "changes": [
          {
            "path": "migrations/001_schema.sql",
            "add": 12,
            "del": 3
          }
        ],
        "attribution": "exact",
        "checks": [
          {
            "id": "C1",
            "name": "schema 一致性检查",
            "src": "run",
            "result": "pass",
            "exit": 0,
            "dur_s": 2,
            "at": "2026-09-28T10:08:00.000Z"
          }
        ],
        "artifacts": [
          {
            "title": "初始 schema 迁移脚本",
            "path": "migrations/001_schema.sql",
            "summary": "T1 交付的建表与索引 DDL"
          }
        ],
        "checkpoint": null
      },
      "review": {
        "state": "unreviewed",
        "by": null,
        "at": null,
        "note": "",
        "batch": false
      },
      "priority": {
        "score": 2,
        "reasons": [
          "改动命中 review_paths:migrations/001_schema.sql",
          "CLI 已执行检查全部通过且改动很小"
        ]
      },
      "history": []
    },
    {
      "id": "T2",
      "title": "实现 10 秒动态 script 刷新机制与页面内状态保护",
      "lane": "doing",
      "outcome": null,
      "origin": {
        "type": "initial",
        "ref": null,
        "summary": null
      },
      "deps": [],
      "owner": null,
      "note": "",
      "progress": 0,
      "started_at": "2026-09-28T10:02:00.000Z",
      "ended_at": null,
      "active_seconds": 810,
      "rounds": 1,
      "assumes": [
        {
          "decision": "D2",
          "option": "A",
          "confirmed": false
        }
      ],
      "flags": [],
      "blocked_by": [],
      "evidence": {
        "changes": [],
        "attribution": null,
        "checks": [],
        "artifacts": [
          {
            "title": "动态刷新脚本 patch",
            "path": "templates/app.js",
            "summary": "10s 刷新机制的差分补丁"
          }
        ],
        "checkpoint": null
      },
      "review": {
        "state": "unreviewed",
        "by": null,
        "at": null,
        "note": "",
        "batch": false
      },
      "priority": {
        "score": 0,
        "reasons": []
      },
      "history": []
    },
    {
      "id": "T3",
      "title": "安全防御: CSP meta 零网络请求 \u0026 全部走 textContent 渲染",
      "lane": "todo",
      "outcome": null,
      "origin": {
        "type": "initial",
        "ref": null,
        "summary": null
      },
      "deps": [],
      "owner": null,
      "note": "",
      "progress": 0,
      "started_at": null,
      "ended_at": null,
      "active_seconds": 0,
      "rounds": 1,
      "assumes": [],
      "flags": [],
      "blocked_by": [],
      "evidence": {
        "changes": [],
        "attribution": null,
        "checks": [],
        "artifacts": [],
        "checkpoint": null
      },
      "review": {
        "state": "unreviewed",
        "by": null,
        "at": null,
        "note": "",
        "batch": false
      },
      "priority": {
        "score": 0,
        "reasons": []
      },
      "history": []
    },
    {
      "id": "T5",
      "title": "响应式多视图: 深色模式、窄屏流式与打印友好排版",
      "lane": "done",
      "outcome": "completed",
      "origin": {
        "type": "initial",
        "ref": null,
        "summary": null
      },
      "deps": [],
      "owner": null,
      "note": "",
      "progress": 1,
      "started_at": null,
      "ended_at": "2026-09-28T10:11:00.000Z",
      "active_seconds": 0,
      "rounds": 1,
      "assumes": [],
      "flags": [
        "claimed-only"
      ],
      "blocked_by": [],
      "evidence": {
        "changes": [],
        "attribution": "exact",
        "checks": [
          {
            "id": "C2",
            "name": "真实视口检查",
            "src": "claimed",
            "result": "fail",
            "exit": 1,
            "dur_s": 4,
            "at": "2026-09-28T10:12:00.000Z"
          }
        ],
        "artifacts": [
          {
            "title": "响应式排版回归截图",
            "path": "templates/screenshots/dark.png",
            "summary": "窄屏流式与打印排版的真视口证据"
          }
        ],
        "checkpoint": null
      },
      "review": {
        "state": "unreviewed",
        "by": null,
        "at": null,
        "note": "",
        "batch": false
      },
      "priority": {
        "score": 4,
        "reasons": [
          "没有 CLI 已执行的检查",
          "有失败的检查"
        ]
      },
      "history": []
    }
  ],
  "decisions": [
    {
      "id": "D2",
      "opened_at": "2026-09-28T09:38:00.000Z",
      "title": "裁决: 默认执行路径的加载策略",
      "question": "默认执行路径采用哪种加载策略？",
      "why_now": "缓存破除策略影响后续所有页面刷新行为",
      "mode": "provisional",
      "status": "pending_default",
      "gate": {
        "g1": false,
        "g2": false,
        "g3": false,
        "policy_hit": null
      },
      "pack": null,
      "affects": [],
      "anchors": [],
      "assumed_by": [
        "T2"
      ],
      "options": [
        {
          "key": "A",
          "label": "使用动态时间戳查询参数并保持 fallback 备用加载",
          "default": true,
          "reversible": true,
          "impact": {
            "declared": null,
            "ripple": {
              "items": {
                "redo": [],
                "affected_todo": [],
                "enable": [],
                "disable": []
              },
              "decisions": [],
              "sunk_min": 0,
              "redo_est_min": null,
              "confidence": "unknown"
            }
          },
          "hold_effects_hit": []
        },
        {
          "key": "B",
          "label": "仅使用固定相对路径依赖浏览器静态无缓存重读",
          "default": false,
          "reversible": true,
          "impact": {
            "declared": null,
            "ripple": {
              "items": {
                "redo": [
                  "T2"
                ],
                "affected_todo": [],
                "enable": [],
                "disable": []
              },
              "decisions": [],
              "sunk_min": 14,
              "redo_est_min": null,
              "confidence": "computed"
            }
          },
          "hold_effects_hit": []
        }
      ],
      "lock_at": null,
      "checkpoint": null,
      "answer": {
        "key": null,
        "by": null,
        "via": null,
        "at": null
      },
      "resolved_at": null,
      "cascades": [],
      "effective": null
    },
    {
      "id": "D1",
      "opened_at": "2026-09-28T10:13:00.000Z",
      "title": "裁决: 本地 file:// 协议下的脚本刷新缓存破除策略",
      "question": "本地离线打开时采用哪种缓存破除手段？",
      "why_now": "",
      "mode": "provisional",
      "status": "overridden",
      "gate": {
        "g1": false,
        "g2": false,
        "g3": false,
        "policy_hit": null
      },
      "pack": null,
      "affects": [],
      "anchors": [],
      "assumed_by": [],
      "options": [
        {
          "key": "A",
          "label": "使用动态时间戳查询参数并保持 fallback 备用加载",
          "default": true,
          "reversible": true,
          "impact": {
            "declared": null,
            "ripple": {
              "items": {
                "redo": [],
                "affected_todo": [],
                "enable": [],
                "disable": []
              },
              "decisions": [],
              "sunk_min": 0,
              "redo_est_min": null,
              "confidence": "unknown"
            }
          },
          "hold_effects_hit": []
        },
        {
          "key": "B",
          "label": "仅使用固定相对路径依赖浏览器静态无缓存重读",
          "default": false,
          "reversible": true,
          "impact": {
            "declared": {
              "redo": [
                "T1"
              ]
            },
            "ripple": {
              "items": {
                "redo": [
                  "T1"
                ],
                "affected_todo": [],
                "enable": [],
                "disable": []
              },
              "decisions": [],
              "sunk_min": 2,
              "redo_est_min": null,
              "confidence": "declared"
            }
          },
          "hold_effects_hit": []
        }
      ],
      "lock_at": null,
      "checkpoint": null,
      "answer": {
        "key": "B",
        "by": "you",
        "via": "chat",
        "at": "2026-09-28T10:13:30.000Z"
      },
      "resolved_at": "2026-09-28T10:13:30.000Z",
      "cascades": [],
      "effective": {
        "option": "B",
        "ripple": {
          "items": {
            "redo": [
              "T1"
            ],
            "affected_todo": [],
            "enable": [],
            "disable": []
          },
          "decisions": [],
          "sunk_min": 2,
          "redo_est_min": null,
          "confidence": "declared"
        }
      }
    }
  ],
  "stuck": [],
  "queue": {
    "review": [
      {
        "ref": "T5",
        "score": 4,
        "reasons": [
          "没有 CLI 已执行的检查",
          "有失败的检查"
        ]
      },
      {
        "ref": "T1",
        "score": 2,
        "reasons": [
          "改动命中 review_paths:migrations/001_schema.sql",
          "CLI 已执行检查全部通过且改动很小"
        ]
      }
    ],
    "top_n": 5,
    "low_max": 2,
    "low_eligible": [
      "T1"
    ]
  },
  "trail": [
    {
      "seq": 1,
      "t": "2026-09-28T09:30:00.000Z",
      "type": "run.start",
      "ref": null
    },
    {
      "seq": 2,
      "t": "2026-09-28T09:32:00.000Z",
      "type": "item.add",
      "ref": "T1"
    },
    {
      "seq": 3,
      "t": "2026-09-28T09:34:00.000Z",
      "type": "item.start",
      "ref": "T1"
    },
    {
      "seq": 4,
      "t": "2026-09-28T09:36:00.000Z",
      "type": "item.done",
      "ref": "T1"
    },
    {
      "seq": 5,
      "t": "2026-09-28T09:38:00.000Z",
      "type": "decision.open",
      "ref": "D2"
    },
    {
      "seq": 6,
      "t": "2026-09-28T09:56:00.000Z",
      "type": "item.add",
      "ref": "T2"
    },
    {
      "seq": 7,
      "t": "2026-09-28T09:58:00.000Z",
      "type": "item.add",
      "ref": "T3"
    },
    {
      "seq": 8,
      "t": "2026-09-28T10:00:00.000Z",
      "type": "branch.fork",
      "ref": "T3"
    },
    {
      "seq": 9,
      "t": "2026-09-28T10:02:00.000Z",
      "type": "item.start",
      "ref": "T2"
    },
    {
      "seq": 11,
      "t": "2026-09-28T10:06:00.000Z",
      "type": "branch.prune",
      "ref": "T3"
    },
    {
      "seq": 12,
      "t": "2026-09-28T10:08:00.000Z",
      "type": "check.run",
      "ref": "T1"
    },
    {
      "seq": 13,
      "t": "2026-09-28T10:10:00.000Z",
      "type": "item.add",
      "ref": "T5"
    },
    {
      "seq": 14,
      "t": "2026-09-28T10:11:00.000Z",
      "type": "item.done",
      "ref": "T5"
    },
    {
      "seq": 15,
      "t": "2026-09-28T10:12:00.000Z",
      "type": "check.claim",
      "ref": "T5"
    },
    {
      "seq": 16,
      "t": "2026-09-28T10:13:00.000Z",
      "type": "decision.open",
      "ref": "D1"
    },
    {
      "seq": 17,
      "t": "2026-09-28T10:13:30.000Z",
      "type": "decision.answer",
      "ref": "D1"
    },
    {
      "seq": 19,
      "t": "2026-09-28T10:14:30.000Z",
      "type": "artifact",
      "ref": "T1"
    },
    {
      "seq": 20,
      "t": "2026-09-28T10:14:40.000Z",
      "type": "artifact",
      "ref": "T2"
    },
    {
      "seq": 21,
      "t": "2026-09-28T10:14:50.000Z",
      "type": "artifact",
      "ref": "T5"
    }
  ],
  "activity": [
    {
      "seq": 1,
      "t": "2026-09-28T09:30:00.000Z",
      "type": "run.start",
      "ref": null,
      "actor": "claude"
    },
    {
      "seq": 2,
      "t": "2026-09-28T09:32:00.000Z",
      "type": "item.add",
      "ref": "T1",
      "actor": "claude"
    },
    {
      "seq": 3,
      "t": "2026-09-28T09:34:00.000Z",
      "type": "item.start",
      "ref": "T1",
      "actor": "claude"
    },
    {
      "seq": 4,
      "t": "2026-09-28T09:36:00.000Z",
      "type": "item.done",
      "ref": "T1",
      "actor": "claude"
    },
    {
      "seq": 5,
      "t": "2026-09-28T09:38:00.000Z",
      "type": "decision.open",
      "ref": "D2",
      "actor": "claude"
    },
    {
      "seq": 6,
      "t": "2026-09-28T09:56:00.000Z",
      "type": "item.add",
      "ref": "T2",
      "actor": "claude"
    },
    {
      "seq": 7,
      "t": "2026-09-28T09:58:00.000Z",
      "type": "item.add",
      "ref": "T3",
      "actor": "claude"
    },
    {
      "seq": 8,
      "t": "2026-09-28T10:00:00.000Z",
      "type": "branch.fork",
      "ref": "T3",
      "actor": "claude"
    },
    {
      "seq": 9,
      "t": "2026-09-28T10:02:00.000Z",
      "type": "item.start",
      "ref": "T2",
      "actor": "claude"
    },
    {
      "seq": 10,
      "t": "2026-09-28T10:04:00.000Z",
      "type": "redo",
      "ref": "T3",
      "actor": "subagent"
    },
    {
      "seq": 11,
      "t": "2026-09-28T10:06:00.000Z",
      "type": "branch.prune",
      "ref": "T3",
      "actor": "user"
    },
    {
      "seq": 12,
      "t": "2026-09-28T10:08:00.000Z",
      "type": "check.run",
      "ref": "T1",
      "actor": "tool"
    },
    {
      "seq": 13,
      "t": "2026-09-28T10:10:00.000Z",
      "type": "item.add",
      "ref": "T5",
      "actor": "claude"
    },
    {
      "seq": 14,
      "t": "2026-09-28T10:11:00.000Z",
      "type": "item.done",
      "ref": "T5",
      "actor": "claude"
    },
    {
      "seq": 15,
      "t": "2026-09-28T10:12:00.000Z",
      "type": "check.claim",
      "ref": "T5",
      "actor": "tool"
    },
    {
      "seq": 16,
      "t": "2026-09-28T10:13:00.000Z",
      "type": "decision.open",
      "ref": "D1",
      "actor": "claude"
    },
    {
      "seq": 17,
      "t": "2026-09-28T10:13:30.000Z",
      "type": "decision.answer",
      "ref": "D1",
      "actor": "user"
    },
    {
      "seq": 18,
      "t": "2026-09-28T10:14:00.000Z",
      "type": "decide",
      "ref": "D1",
      "actor": "user"
    },
    {
      "seq": 19,
      "t": "2026-09-28T10:14:30.000Z",
      "type": "artifact",
      "ref": "T1",
      "actor": "claude"
    },
    {
      "seq": 20,
      "t": "2026-09-28T10:14:40.000Z",
      "type": "artifact",
      "ref": "T2",
      "actor": "claude"
    },
    {
      "seq": 21,
      "t": "2026-09-28T10:14:50.000Z",
      "type": "artifact",
      "ref": "T5",
      "actor": "claude"
    }
  ],
  "notes": [
    "未知事件类型「decide」×1,已跳过",
    "未知事件类型「redo」×1,已跳过"
  ],
  "conflicts": [],
  "generated_at": "2026-09-28T10:15:30.000Z"
};
