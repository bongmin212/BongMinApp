---
description: Generate commit message following COMMIT.md rules, commit, and push
---

1. Check for staged changes using `git status`
2. If no staged changes, stage all changes with `git add .`
3. Read staged changes using `git diff --staged`
4. Analyze the changes and determine the appropriate category from `.agent/rules/COMMIT.md`:
   - 📊 Data - Updates or adds data
   - 🐛 Bug - Fixes a user-facing bug
   - 🔨 Refactor - Changes code without fixing bugs or adding features
   - ✨ Enhance - Improves existing functionality
   - 🎉 Feature - Adds a new user-facing feature
   - 📜 Docs - Updates or adds documentation
   - 🧹 Chore - Maintenance tasks like dependency updates
   - 💄 Style - Formatting or linting changes
   - 🚧 WIP - Work in progress
   - ✅ Tests - Adds or refactors tests
5. Generate a commit message in format: `<emoji>: <short_concise_message>`
6. Show the generated message to user for confirmation
7. After user confirms, run:
// turbo
   ```
   git commit -m "<generated_message>"
   ```
// turbo
8. Push to remote:
   ```
   git push
   ```
9. Confirm success to user
