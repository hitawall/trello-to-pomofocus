Create a fix branch linked to a GitHub issue:

1. Ask for the issue number if not provided.

2. Fetch the issue title:
   ```
   gh issue view <N> --json title --jq '.title'
   ```

3. Build a slug: lowercase, replace spaces/special chars with `-`, max 35 chars.

4. Run in sequence:
   ```
   git checkout main
   git pull origin main
   git checkout -b fix/issue-<N>-<slug>
   git push -u origin fix/issue-<N>-<slug>
   ```

5. Confirm branch name and remind user to include `Closes #<N>` in the PR body.
