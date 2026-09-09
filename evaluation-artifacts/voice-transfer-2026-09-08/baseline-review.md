# Baseline observations

Baseline commit: `03718834781c6281d7722201cf71a8b2436dd449`.

Both runs used the repository's 169-word documentation memo, its two enabled demo essays, the original Balanced rewrite path, and `gemini-3.8-flash` with automatic reasoning. The exact inputs, SDK requests, raw responses, and endpoint results are retained alongside this note. The baseline instrumentation recorded traffic and disabled cross-model fallback; it did not alter the original writing prompt or response schema.

The original memo proposes considering a centralized documentation platform, reports observed documentation inefficiencies, recommends some weekly tracker-updating time, suggests possible speed improvements, and connects participation to quarterly deliverables. It does not specify a weekly duration or day, an engineer departing, a rebuilding duration, or the fraction of time spent searching.

| Run | Observable fidelity issues | Voice and scoring observations |
| --- | --- | --- |
| 1 | Invented an engineer's departure, three weeks of rebuilding, and a one-hour weekly commitment. Changed a proposal into a firm need and command. Omitted the stated quarterly-deliverable objective. | Strong craft imagery and rhythmic changes; adapted a distinctive sample closing almost verbatim. Reported 95% similarity. |
| 2 | Invented half a working day spent guessing and a thirty-minute Friday commitment. Changed suggestions into commands. Omitted the stated quarterly-deliverable objective. | Used the same short pivot “It isn't.” as a sample and imposed workshop/chisel imagery. Reported 95% similarity. |

These runs do not reproduce the pasted corporate-language failure. They demonstrate a related problem: the current prompt can impose its preferred essay style while changing meaning. High reported similarity does not establish fidelity or authenticity.

The revised comparison must assess source facts and qualifications as well as authorial rhythm. Matching these demo essays alone cannot prove transfer quality for every author or genre.
