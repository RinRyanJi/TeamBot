// Manual, non-sending checklist for the live Teams tenant. The harness prints
// stable prompts so a user can run the same verification on a phone without
// putting chat history, cookies, screenshots, or tokens in the repository.
const cases = [
  ["UC-01", "!tb projects", "Project names, aliases and policy are visible"],
  ["UC-02", "!tb focus TeamBot; then !tb fix the login tests", "Request stays in focused project"],
  ["UC-03", "Start TeamBot work, then CodexWeb work, then !tb overview", "Projects are grouped and both tasks remain visible"],
  ["UC-04", "!tb fork <task-id> run compatibility tests", "Fork gets an isolated worktree/task"],
  ["UC-05", "!tb task <task-id>", "Card identifies project, status, thread and result"],
  ["UC-06", "Trigger an approval; approve only from the bound owner chat", "Approval is scoped and one-time"],
  ["UC-07", "!tb add <task-id> ...; !tb cancel <task-id>", "Append/cancel affect the named task"],
  ["UC-08", "Run the group role and private-approval steps in task060 evidence", "Viewer denied; group receives summary only"],
  ["UC-09", "Disconnect/reconnect and send !tb overview", "Recovery state is explicit; no blind rerun"],
  ["UC-10", "!tb handoff <task-id>", "Desktop handoff names thread/project/worktree"],
  ["UC-11", "Clear focus, then send an ambiguous request", "TeamBot asks for project options"],
  ["UC-12", "Complete a task and request its result/artifact", "Result remains attached to project/task"],
];

console.log("TeamBot User Cases v4 live harness (manual; no messages are sent by this script)\n");
console.log("Run against a disposable Teams test chat/group. Record only redacted observations outside Git.\n");
for (const [id, action, expected] of cases) console.log(`${id} | ${action} | expect: ${expected}`);
console.log("\nAfter the run, copy redacted observations to tasks/task060-group-project-context/evidence/group-project-live.md and never include tokens, cookies, chat exports, or screenshots.");
