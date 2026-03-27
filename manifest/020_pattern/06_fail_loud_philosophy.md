# Fail Loud Philosophy

Graceful fallbacks are the number one AI sin. They create secondary code paths — untested, unmonitored, silently wrong.

## Hot Code

Healthy code is executed code. It's exercised. We share code between classes and write granular reusable functions not for theoretical OO cleanliness — we do it to keep the codebase small and hot. Rarely executed code, code that only triggers in edge cases, is a dormant mistake waiting to activate.

## Structural Impossibility

We prefer approaches that cannot fail. Two variables can't get out of sync if the second one doesn't exist. 100% of impossible things don't happen. We strive to make errors structurally impossible — not handled, not caught, not recovered from. Eliminated.

## When It Breaks

In this extreme effort to keep code small and hot, when a preventable failure occurs — that's a bug. EXPLODE. Expose it. Do not fallback. Do not recover. Do not log and continue.

A loud failure finds bugs in QA and testing. A quiet one finds bugs in customer support and headlines.

**FAIL LOUD.**
