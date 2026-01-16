---
description: Handle @opencode mention in GitHub issue/PR comment
agent: github
---
# Mention Handler

You were mentioned in a GitHub comment. Post progress updates frequently.

## Environment Check
!`gh auth status 2>&1 | head -3`

## Context from Environment
The following environment variables contain the mention context:
- ISSUE_NUMBER: The issue/PR number
- REPO: The repository (owner/name)
- TRIGGER_COMMENT_URL: URL to the triggering comment
- TRIGGER_USER: Who mentioned you
- IS_PR: Whether this is a PR (true/false)

## Issue/PR Details
!`gh issue view $ISSUE_NUMBER --json title,body,labels,state -q '"Title: \(.title)\nState: \(.state)\nLabels: \(.labels | map(.name) | join(", "))\n\nBody:\n\(.body)"' 2>/dev/null || echo "Unable to fetch"`

## Comment Thread
!`gh api repos/:owner/:repo/issues/$ISSUE_NUMBER/comments --jq '.[] | "[\(.user.login)]: \(.body | split("\n") | .[0:3] | join(" "))"' 2>/dev/null | tail -10 || echo "Unable to fetch"`

## If PR - Get Diff Summary
!`if [ "$IS_PR" = "true" ]; then gh pr diff $ISSUE_NUMBER --name-only 2>/dev/null | head -20; fi || echo ""`

---

## Instructions

### 1. Post acknowledgment immediately:
```bash
gh issue comment $ISSUE_NUMBER --body "## 📋 Received

I'm analyzing your request. I'll post updates as I work.

> Request from: @$TRIGGER_USER"
```

### 2. After analyzing, post your plan:
```bash
gh issue comment $ISSUE_NUMBER --body "## 📋 Plan

**Understanding:** [what you think is being asked]

**Steps:**
1. [step 1]
2. [step 2]"
```

### 3. When making changes, post progress:
```bash
gh issue comment $ISSUE_NUMBER --body "## 🔧 Progress

Working on: [current task]
Pushed: [commit message if applicable]"
```

### 4. When creating a PR, reference the original:
```bash
gh pr create \
  --title "fix: [description]" \
  --body "## Summary
[changes made]

## References
- Triggered by: $TRIGGER_COMMENT_URL
- Related: #$ISSUE_NUMBER

## Changes
[list of changes]"
```

### 5. When complete:
```bash
gh issue comment $ISSUE_NUMBER --body "## ✅ Complete

**What I did:**
- [action 1]
- [action 2]

**Result:** [PR link or summary]"
```

### 6. If blocked or need clarification:
```bash
gh issue comment $ISSUE_NUMBER --body "## ❓ Need Clarification

[question]"
```

### 7. Project-specific context (if available):
@AGENTS.md
@.opencode/AGENTS.md

**CRITICAL: The user cannot see your internal reasoning. POST UPDATES EARLY AND OFTEN.**

$ARGUMENTS
