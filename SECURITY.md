# Security policy

Many repositories run this action with a token that can write to them. If you find a vulnerability in the action, report it privately, so it can be fixed before it becomes public.

## Reporting a vulnerability

Email **backport.action@gmail.com**. Don't open a public issue, pull request or discussion about it.

Report anything in the action that lets someone do more than the workflow running it intends, for example run untrusted code, expose the token, or write to branches or pull requests it shouldn't. This includes the README's guidance: if following it leaves a workflow vulnerable, report that too.

Include in your report:

- the affected version or ref, e.g. `v4`, `v4.7.1` or a commit SHA,
- how to reproduce it: the workflow file, the event that triggers it, and the steps. Logs from a run that shows it help, but reproduce it in a private repository: a run in a public one discloses the problem,
- the impact: what an attacker can do, and what access they need for it.
