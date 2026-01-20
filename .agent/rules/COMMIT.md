# COMMIT.md - Commit Message Rules

> **Version 1.0** - Standardized Commit Message Guidelines
> This file defines how commit messages should be formatted in this workspace.

---

## 📝 COMMIT MESSAGE FORMAT

**Format:** `<emoji>: <message>`

```
<category_emoji>: <short_concise_message>
```

**Rules:**
- Keep messages **short and concise**
- Use **one emoji per commit** for clarity
- Split changes into **separate commits** if needed

---

## 🏷️ CATEGORY EMOJIS

| Emoji | Category | Purpose | Example |
|-------|----------|---------|---------|
| 📊 | **Data** | Updates or adds data | `📊 Update population dataset` |
| 🐛 | **Bug** | Fixes a user-facing bug | `🐛 Fix crash when uploading files` |
| 🔨 | **Refactor** | Changes code without fixing bugs or adding features | `🔨 Refactor chart rendering logic` |
| ✨ | **Enhance** | Improves existing functionality | `✨ Improve chart loading speed` |
| 🎉 | **Feature** | Adds a new user-facing feature | `🎉 Add dark mode support` |
| 📜 | **Docs** | Updates or adds documentation | `📜 Add setup guide for developers` |
| 🧹 | **Chore** | Maintenance tasks like dependency updates | `🧹 Update Node.js to latest version` |
| 💄 | **Style** | Formatting or linting changes | `💄 Fix inconsistent indentation` |
| 🚧 | **WIP** | Work in progress for future commits | `🚧 Add initial layout for dashboard` |
| ✅ | **Tests** | Adds or refactors tests | `✅ Add missing unit tests` |

---

## ✅ GOOD EXAMPLES

```
✨ Add new search functionality
🐛 Fix broken link in footer
🎉 Add dark mode support
🔨 Refactor authentication logic
📜 Update README with API docs
🧹 Upgrade React to v18
💄 Format code with Prettier
✅ Add unit tests for UserService
```

---

## ❌ BAD EXAMPLES

```
❌ fix bug                     → Too vague
❌ Update stuff                → Not descriptive
❌ 🐛🔨 Fix and refactor      → Multiple emojis
❌ Added new feature for...   → Too long, use past tense
```

---

## 🔄 QUICK REFERENCE

**When to use what:**

| Situation | Emoji |
|-----------|-------|
| Fixed a crash/error | 🐛 |
| Added new button/page/feature | 🎉 |
| Made existing feature better | ✨ |
| Changed code structure only | 🔨 |
| Updated package.json deps | 🧹 |
| Fixed typos/formatting | 💄 |
| Added/updated tests | ✅ |
| Updated docs/README | 📜 |
| Not finished yet | 🚧 |

---
