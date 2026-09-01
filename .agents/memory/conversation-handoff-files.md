---
name: Conversation handoff files
description: Replit project-transition behavior relevant to restoring preserved source files.
---

After a conversation is moved into a durable project, uploaded project files may be preserved under `.local/conversation-workspace/files` instead of being present at the project root.

**Why:** Workflow configuration can become active before all preserved source files are restored, which makes valid workflows appear broken because their package or entry point is missing.

**How to apply:** When a transitioned project is missing files that were present before the move, compare the project root with `.local/conversation-workspace/files` and restore only the intended project source before debugging workflow commands.