Fetch and display a prioritized view of all open GitHub issues:

1. Run:
   ```
   gh issue list --state open --json number,title,labels,milestone,assignees --limit 100
   ```

2. Organize into sections (in display order):
   - **Blocked** — label `status: blocked`
   - **In Progress** — label `status: in-progress`
   - **By Milestone** — remaining issues grouped by milestone; no milestone → "Unplanned"
   - Within each group: sort by priority critical → high → medium → low → unlabeled

3. Format each issue as: `#N [priority] title (assignee or unassigned)`

4. End with a one-line summary: total open | blocked count | unassigned count.
