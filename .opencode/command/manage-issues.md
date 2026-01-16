---
description: Triage and fix GitHub issues
agent: github
---
1. Check Environment:
   - Verify 'gh' CLI is installed: `gh --version`
   - Verify Auth: `gh auth status` (if this fails, STOP immediately and output "AUTH_FAILED")

2. Issue Review:
   - List open issues: `gh issue list`
   - Review ALL open issues labeled 'help wanted' or 'bug'.
   - Avoid creating duplicate issues.

3. Action:
   - If a relevant issue is found, pick the highest priority one.
   - Create a fix branch immediately.
   - Work incrementally: Commit your progress frequently (e.g., after reproducing, after fixing, after verifying).
   - Be aware of the 30-minute workflow timeout. If running low on time, push current progress and exit gracefully.
   - Attempt to resolve it.
   - Create a PR.

If no issues are found, exit.
If any permission error occurs, STOP and output "PERMISSION_DENIED".
