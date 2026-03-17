# 角色知识包 (Role Knowledge Packs)

每个子目录代表一个系统角色的知识包，包含：

```
masters/<role-id>/
├── persona.md           # 人格定义（必需）
├── knowledge/           # 知识文档（传记、演讲、著作等）
│   ├── biography.md
│   ├── speeches/
│   └── works/
└── voice-samples/       # 语音样本（Phase 3）
    └── sample.wav
```

## 添加新角色

1. 在 `masters/` 下创建以 `role-id` 命名的目录
2. 编写 `persona.md` 定义角色人格
3. 在 `knowledge/` 中放入相关知识文档
4. 在 `src/lib/master/registry.ts` 中注册系统角色
