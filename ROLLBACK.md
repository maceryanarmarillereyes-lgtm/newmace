# ROLLBACK — Members Enterprise Fullscreen (Phase-1-601)

## Quick rollback (recommended)
If this PR is merged and needs to be reverted:

```bash
git checkout main
git pull
# Revert the merge commit (replace <MERGE_COMMIT_SHA>)
git revert -m 1 <MERGE_COMMIT_SHA>
git push origin main
```

## Alternative rollback (reset branch before merge)
If not merged yet, and you want to discard the feature branch changes:

```bash
git checkout feature/members-enterprise-fullscreen
git reset --hard origin/main
git push --force origin feature/members-enterprise-fullscreen
```

## Post-rollback verification checklist
- Members page loads normally and global nav/topbar are visible.
- No fullscreen overlay behavior is triggered.
- Roster/timeline render without console errors.
- Exports and audit views still operate as before.

## Post-deploy verification checklist (after any rollback deployment)
- Reload the app (hard refresh) to clear cached CSS/JS.
- Validate `/health` returns `ok`.
- Validate `/api/env` returns expected environment config.
