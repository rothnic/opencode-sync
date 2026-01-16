---
description: Audit project security, dependencies, and code quality
agent: build
---
# Project Review

Conduct a comprehensive project review. Check for existing work first.

## Environment Check
!`gh auth status 2>&1 | head -3`

## Existing Review Issues
!`gh issue list --label "project-review" --state open --limit 1 --json number,title -q '.[] | "#\(.number): \(.title)"' 2>/dev/null || echo "None found"`

## Repository Info
!`gh api repos/:owner/:repo --jq '{name,description,language,default_branch}' 2>/dev/null || echo "Unable to fetch"`

## Package Info (if available)
!`cat package.json 2>/dev/null | head -30 || echo "No package.json"`

## Outdated Dependencies
!`npm outdated 2>/dev/null || bun outdated 2>/dev/null || echo "Unable to check"`

## Security Audit
!`npm audit --json 2>/dev/null | head -50 || bun audit 2>/dev/null || echo "Unable to audit"`

## Code Markers (TODOs, FIXMEs)
!`grep -rn "TODO\|FIXME\|HACK\|XXX" --include="*.ts" --include="*.js" --include="*.tsx" . 2>/dev/null | head -30 || echo "None found"`

---

## Instructions

1. **Check for existing review issue first**
   - If one exists, UPDATE it with new findings (use `gh issue edit NUMBER --body "..."`)
   - If none exists, CREATE one with label "project-review"

2. **Analyze the data above and report on:**
   - 🔴 **Critical**: Security vulnerabilities, breaking issues
   - 🟡 **Important**: Outdated major versions, code smells
   - 🟢 **Nice to Have**: Minor improvements, documentation gaps

3. **Include metrics:**
   - Total dependencies, outdated count, security issues count
   - TODO/FIXME count by area

4. **Project-specific context (if available):**
   @AGENTS.md
   @.opencode/AGENTS.md

5. **Output format for new issue:**
   ```bash
   gh issue create --title "Project Review - $(date +%Y-%m-%d)" \
     --label "project-review" \
     --body "## Review Summary..."
   ```

$ARGUMENTS
