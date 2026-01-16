---
description: Scan codebase for potential issues to track
agent: build
---
# Issue Discovery

Scan the codebase to discover potential issues that should be tracked.

## Environment Check
!`gh auth status 2>&1 | head -3`

## Existing Open Issues (check for duplicates)
!`gh issue list --state open --limit 100 --json number,title -q '.[] | "#\(.number): \(.title)"'`

## Code Markers - TODOs
!`grep -rn "TODO" --include="*.ts" --include="*.js" --include="*.tsx" --include="*.py" . 2>/dev/null | head -20 || echo "None found"`

## Code Markers - FIXMEs and HACKs
!`grep -rn "FIXME\|HACK\|XXX\|BUG" --include="*.ts" --include="*.js" --include="*.tsx" --include="*.py" . 2>/dev/null | head -20 || echo "None found"`

## Large Files (potential refactoring targets)
!`find . -name "*.ts" -o -name "*.js" -o -name "*.tsx" | xargs wc -l 2>/dev/null | sort -rn | head -10 || echo "Unable to check"`

## TypeScript 'any' usage
!`grep -rn ": any" --include="*.ts" --include="*.tsx" . 2>/dev/null | head -10 || echo "None found"`

---

## Instructions

### 1. Before creating ANY issue:
- Search existing issues list above for similar items
- Use `gh issue list --search "keyword"` to check further
- If similar exists, ADD A COMMENT instead of creating duplicate

### 2. Group related items:
- Multiple TODOs in same module → single issue
- Example: "Clean up 15 TODO comments in auth module"

### 3. For genuinely NEW discoveries:
```bash
gh issue create \
  --title "[Type] Brief description" \
  --label "auto-discovered" \
  --body "## Found In
\`file:line\`

## Description
[What was found]

## Suggested Action
[What should be done]

## Priority
[low/medium/high]

---
*Auto-discovered by OpenCode Agent*"
```

### 4. Issue types:
- `[Tech Debt]` - Code quality, refactoring needs
- `[Bug]` - Potential bugs found in code
- `[Security]` - Security concerns
- `[Docs]` - Documentation gaps
- `[Test]` - Missing test coverage

### 5. Project-specific context (if available):
@AGENTS.md
@.opencode/AGENTS.md

$ARGUMENTS
