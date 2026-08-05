# Product

## Register

BirdNET Passive Acoustic Monitoring — ingest continuous field recordings to
Backblaze B2, detect and classify bird species and sound events on-device with
BirdNET-Analyzer, and browse a per-recording detection timeline with
event-aligned audio clips.

## Users

Ecologists, conservation teams, and acoustic-survey researchers running **passive
acoustic monitoring (PAM)**. They deploy autonomous recorders in the field, come back
with hours of continuous audio, and need to know *which bird species were heard, when,
and how confidently* — without hand-labeling every file. Their context: sustained
raw-audio ingest, on-device analysis they can trust and reproduce, and durable storage
they can share across a team.

## Product Purpose

A full-stack passive-acoustic-monitoring app (Next.js 16 + React 19 + Tailwind v4 +
shadcn/ui frontend, FastAPI backend) that stores continuous field recordings on
Backblaze B2, runs the official on-device **BirdNET-Analyzer** engine to detect and
classify bird vocalizations, slices an event clip per detection back to B2, and shows a
per-recording **detection timeline**. It demonstrates B2 as the single storage layer
for a PAM pipeline: sustained raw-audio ingest plus write-amplification from each raw
recording into per-detection JSON/CSV and many small clipped-event WAVs. Success = a
researcher can upload a recording, run detection, and browse an accurate, reproducible
timeline of what was heard and when — with every artifact durable on B2.

## Brand Personality

Confident, precise, quietly scientific. Voice is direct and free of hype. The interface
should feel like a modern field-research instrument — considered, calm, trustworthy —
where the data (species, confidence, time) is the hero, not decoration. Restraint over
flourish: the craft shows in accurate timelines and honest states, not effects.

## Anti-references

- **Generic AI/SaaS slop.** No gradient text, hero-metric templates, identical
  icon-card grids, tracked uppercase eyebrows, or decorative glassmorphism. These are
  the exact 2026 AI tells this app avoids.
- **Over-branded / loud.** No heavy brand-color drenching, decorative motion, or flashy
  effects. The timeline and species data carry the screen.
- **Toy / prototype feel.** No missing states, inconsistent components, or placeholder
  polish. Detection status, empty timelines, and failures are all designed.
- **Enterprise-drab.** No Bootstrap-era gray boxes or dense-but-lifeless admin-panel
  look. Considered, like modern dev/science tools (Linear, GitHub Primer, Stripe).

## Design Principles

- **The data is the product.** An accurate detection timeline, honest confidence, and
  reproducible parameters matter more than any visual flourish.
- **Every state is designed.** Default, hover, focus, active, disabled, loading (skeleton),
  empty (teaches the interface), running (live poll), and error (says what's wrong +
  offers retry) — never half-shipped.
- **Earned familiarity over novelty.** Standard, trusted affordances (top bar + side
  nav, command palette, data tables, audio players). The tool disappears into the task.
- **Consistency is the feature.** One button vocabulary, one form-control set, one icon
  style across every screen. Divergence is a bug.
- **Reproducibility.** Detection parameters are explicit selectors stored per recording,
  so a run can be understood and repeated.

## Accessibility & Inclusion

Target **WCAG 2.1 AA**. Body text ≥ 4.5:1, large/bold text ≥ 3:1, visible focus
indicators on every interactive element, full keyboard navigation, correct semantic
landmarks and heading order, labelled form controls, native `<audio>` controls for clip
playback, and a `prefers-reduced-motion` alternative for every animation. Full light and
dark theme parity.
