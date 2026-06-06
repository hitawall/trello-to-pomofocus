Create a GitHub issue interactively:

1. Ask the user for:
   - Title (required)
   - Type: bug | feature | epic | task | chore | docs
   - Priority: critical | high | medium | low
   - 1–2 sentence description of the problem or goal

2. Draft a structured body:
   - **What**: restate the description
   - **Why**: ask for motivation if type is feature or epic
   - **Acceptance criteria**: 2–4 testable bullet points

3. Show the draft and ask for approval or edits.

4. Run:
   ```
   gh issue create --title "<title>" --body "<body>" --label "type: <type>,priority: <priority>"
   ```

5. Print the issue URL and number. Suggest `/feature` or `/fix` to create a branch.
