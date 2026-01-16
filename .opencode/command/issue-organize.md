---
description: Organize issues into phases and identify dependencies
agent: build
---
# Issue Organization

Analyze open issues and organize them into a coherent roadmap.

## Environment Check
!`gh auth status 2>&1 | head -3`

## Existing Roadmap Issue
!`gh issue list --label "roadmap" --state open --limit 1 --json number,title,body -q '.[0] | "#\(.number): \(.title)\n\(.body | split("\n") | .[0:10] | join("\n"))"' 2>/dev/null || echo "None found"`

## All Open Issues
!`gh issue list --state open --limit 100 --json number,title,labels,body -q '.[] | "#\(.number): \(.title) [\(.labels | map(.name) | join(", "))]"'`

## Issues by Label
!`gh issue list --state open --json labels -q '[.[].labels[].name] | group_by(.) | map({label: .[0], count: length}) | sort_by(-.count) | .[] | "\(.label): \(.count)"' 2>/dev/null || echo "Unable to group"`

---

## Instructions

### 1. Check for existing roadmap:
- If exists, UPDATE it with `gh issue edit NUMBER --body "..."`
- If not, CREATE with `gh issue create --label "roadmap" --title "Project Roadmap"`

### 2. Identify dependencies for each issue:
- What must be completed BEFORE this one?
- What is BLOCKED BY this one?
- Add dependency comments only if not already documented

### 3. Group into phases:

**Phase 1: Foundation**
- Core infrastructure, critical bugs
- No or minimal dependencies

**Phase 2: Features**  
- User-facing functionality
- May depend on Phase 1

**Phase 3: Polish**
- UX improvements, optimizations
- Depends on features being complete

**Phase 4: Future**
- Nice-to-haves, exploration
- Long-term ideas

### 4. Roadmap format:
```markdown
# Project Roadmap
Last updated: [DATE]

## Phase 1: Foundation
- [ ] #X - [Title] (blocked by: none)
- [ ] #Y - [Title] (blocked by: #X)

## Phase 2: Features
- [ ] #Z - [Title] (blocked by: #Y)

## Phase 3: Polish
...

## Phase 4: Future
...

## Unorganized
[Issues that don't fit a phase yet]
```

### 5. Apply phase labels (only if not present):
```bash
gh issue edit NUMBER --add-label "phase:1-foundation"
gh issue edit NUMBER --add-label "phase:2-features"
gh issue edit NUMBER --add-label "phase:3-polish"
gh issue edit NUMBER --add-label "phase:4-future"
```

### 6. Project-specific context (if available):
@AGENTS.md
@.opencode/AGENTS.md

$ARGUMENTS
