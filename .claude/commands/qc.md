---
description: Run the Trip Finder QC & Bug Hunter and report verified bugs
argument-hint: "[focus, e.g. 'engine' or 'my last change'] [fix]"
---

Use the `qc-bug-hunter` agent to QC Trip Finder. Focus: $ARGUMENTS

If no focus is given, run the full hunt (all passes, including the browser). Relay its
report as it is. Only make fixes if the focus includes the word "fix".
