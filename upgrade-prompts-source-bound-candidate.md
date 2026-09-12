# Tailoring DeepL’s upgrade prompts for a 12% paid conversion lift

In late 2024, DeepL’s Monetization team focused on encouraging more free users to move to paid plans through the self-serve funnel. In-product upgrade prompts were a key part of that effort. Unlike marketing campaigns viewed in isolation, these prompts met people while they were already translating a document or refining a text—moments when reaching a usage limit or selecting a paid tool made additional capacity or capability relevant to an immediate task. The existing prompt catalog had not been reviewed in detail for some time. Working alongside a product manager and a product designer, my role as content designer and UX copywriter was to rewrite these prompts so they communicated value clearly and helped users decide how to proceed with their work.

## Addressing usage limits and paid features

In-product upgrade decisions generally fall into two distinct situations. In one, someone reaches a capacity limit—such as a monthly document allowance or a file-size threshold. In the other, they engage a paid control, such as a formality setting or a glossary, to see how it might alter their output.

These situations require completely different conversations. When a user runs into a capacity constraint, their focus is operational: they need to know what remains of their allowance, whether their document qualifies, and what their options are to proceed. When they select a paid feature, their evaluation is functional: they need to understand what the control actually does and whether it meets their recurring translation or writing needs.

In an earlier file-translation prompt, for example, the interface simply asked, “Want to translate more documents? Try DeepL Pro for free.” That phrasing bypassed the practical question a user faced at that moment: what happened to my document, and what can I do right now? My decision was to reorient the prompt around answering that immediate operational question. The copy needed to state the status of the upload clearly, keep any available free path visible, and present a 30-day trial as a concrete way forward if they needed additional volume immediately.

## Document Allowances

Translating documents was a core workflow in DeepL Translator, but the free tier placed natural constraints on monthly volume. Managing the friction around these limits meant preserving user control when work was still underway, and providing clear system status when an allowance was exhausted.

When someone uploaded a document with one free file translation remaining for the month, their immediate translation was still completely free. The prompt needed to give advance notice about their quota without creating false alarm or implying that the current file required an upgrade.

A courtesy warning informed users of their remaining free translation, preserving their ability to proceed immediately or start a trial for upcoming files.

To protect user control, the modal preserved the available free path. Offering Continue as the secondary free action allowed people to dismiss the dialog and execute their free translation right away, while Start free trial was visually primary for users with a queue of documents waiting. Waiting for the monthly reset remained a valid free alternative; the advance notice was intended to inform users before their allowance ran out, rather than leaving them blindsided on their next upload.

Once that monthly allowance reached zero, the dynamic shifted. Users could no longer translate another document for free that month, so an option to continue translation was no longer appropriate.

When the monthly file allowance was exhausted, the in-page workspace counter clarified the reset cadence alongside the trial offer.

Instead of interrupting with another modal, this transition lived directly in the workspace. Relying on visibility of system status, an in-page indicator showed that zero files remained and noted the exact reset cadence (such as Resets in 16 days).

Displaying the reset schedule gave users the operational context they needed to decide what to do next. If a document was urgent, starting a trial offered an immediate way forward. If the project could wait, users knew precisely when their free allowance would return. Clear visibility ensured the trial was presented as a functional solution for immediate needs rather than an unavoidable barrier.

## Clarifying File Size Limits

Beyond document volume, limits also applied to individual file sizes. When an upload failed because of document weight, the prompt had to answer a straightforward question: would upgrading actually solve this person's immediate problem?

Vague phrasing like promising to "translate larger files" introduces friction through uncertainty. A user holding an 8 MB document might assume the paid tier still cannot support it and abandon the task, while someone with a 25 MB file might start a trial only to discover their document remains blocked. In both cases, ambiguity works against both user trust and conversion.

Pairing the 5 MB free limit with the 20 MB trial threshold allowed users to check their document's size eligibility before starting a trial.

I chose to present the 5 MB free ceiling and the 20 MB trial capacity together so someone could compare the offer directly against the file they were trying to upload. Instead of making users hunt through pricing pages or guess whether a paid plan would help, showing both thresholds on screen supported recognition rather than recall: a person could immediately see whether their document fell within that 20 MB limit. For an eligible file, the trial resolved that specific size barrier; for a file larger than 20 MB, the prompt made clear that this trial would not accommodate it. Offering Not now alongside Start free trial gave users an easy way to decline the offer and return to the workspace, without suggesting that the blocked file could proceed.

## Explaining Specialized Controls

When someone clicked a locked control in DeepL Translator, the prompt was triggered by an attempt to use a paid feature during active translation. That interaction provided a natural opening for progressive disclosure: rather than presenting a generic sales pitch, the interface could explain the specific capability at the exact moment it became relevant. My focus was to ensure the copy explained what the tool delivered, giving users the practical context needed to evaluate whether that capability addressed an ongoing need in their work.

The content challenge was communicating specific linguistic utility without resorting to vague marketing claims or over-explaining the mechanics. The formality feature and multi-glossary management represented two different ways paid tiers refined translation quality.

The formality prompt, badged as a DeepL Pro feature, framed the tool around adapting forms of address to the relationship with the reader.

When writing the formality prompt, I chose to focus on the relationship with the audience rather than offering vague promises of professionalism. In languages with distinct pronouns—such as choosing between du and Sie in German—selecting formal or informal forms of address establishes the appropriate social distance with the reader. Rather than turning the modal into a grammar lesson or describing it as an emotional tone adjustment, I anchored the copy in familiar communication contexts, contrasting business correspondence with everyday conversation. That gave users an immediate, practical way to evaluate whether the control was relevant to the text they were translating.

The glossary prompt, badged as a DeepL Pro Advanced feature, emphasized automated terminology consistency across distinct workflows.

For the glossary prompt, I focused the messaging on the recurring task of maintaining terminology across distinct workflows. When someone regularly translates material for different projects, clients, or subject areas, having the system automatically apply preferred terms removes the need to make repetitive manual edits. Instead of pitching generic efficiency, I chose to describe the practical setup: creating glossaries for different teams, projects, and use cases so DeepL applies approved terminology automatically. That direct explanation connected the control's mechanical function to a concrete operational benefit, giving users a clear standard to judge whether an advanced plan suited their ongoing translation work.

In both instances, treating locked controls as moments of contextual guidance allowed users to evaluate whether a paid plan solved an active requirement in their work.

## Evaluating Trade-offs in DeepL Write

While DeepL Translator handled multilingual translation, DeepL Write served as DeepL’s dedicated writing-improvement tool, focusing on monolingual phrasing, grammar, and style. When free users reached their daily limit in Write, redesigning the limit panel brought a sharp information-hierarchy trade-off into focus.

An earlier version of this panel centered on immediate operational details: a live countdown timer (22h 48m 55s) until the next free daily reset, paired directly with subscription pricing (“Only €6 per user / month. Billed monthly.”).

The updated limit panel shifted emphasis toward ongoing writing capabilities available during a 30-day DeepL Write Pro trial.

The redesigned panel reframed that moment around recurring value. Because editing is an ongoing practice rather than a one-off transaction, the updated layout positioned the 30-day DeepL Write Pro trial around sustained writing support—such as unlimited text improvements, stylistic control, and data security. The intent was to give users a substantive reason to evaluate the trial for their regular workflow, rather than seeing it merely as an emergency pass to finish today's paragraph.

Yet elevating longer-term capability came at a genuine cost. The countdown timer and monthly price provided clear, actionable information at the exact moment of friction. Knowing whether a reset was hours away helped users with flexible deadlines decide whether to wait, while showing the monthly price upfront gave immediate financial clarity before entering a signup flow. Omitting those details prioritized the product’s ongoing value proposition, but it also withheld practical context that helped users manage their immediate task.

## Commercial outcomes

In a self-serve funnel, the commercial effectiveness of an upgrade prompt depends on how directly it connects to what someone is trying to accomplish. When an offer appears during active work, broad promotional language forces users to guess whether upgrading is worth their time. Clear content design bridges that gap: by stating system limits plainly and explaining the practical utility of paid tools, the interface provides the operational context needed to evaluate a trial alongside the task at hand. Connecting an offer to the user's immediate workflow makes the paid plan tangible, turning moments of friction into straightforward evaluations of value.

Across the wider program, the Monetization team’s overhaul of the in-product upgrade prompt catalog increased paid conversion by 12% and added €1.2 million in annual recurring revenue (ARR).

This project demonstrated how content design can make product value understandable and assessable at moments of decision. Across these touchpoints, my work focused on grounding each prompt in the user's immediate situation—whether that meant pairing the free limit with trial capacity on file uploads, clarifying what remained of a document allowance, or articulating the practical utility of controls like formality and glossaries. Presenting clear operational parameters rather than vague promotional claims allowed users to judge for themselves whether a trial addressed their ongoing needs. Making that value transparent in the flow of work is how content design effectively supports a self-serve business.
