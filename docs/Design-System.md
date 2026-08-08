# BlackLetter Design System

The design system for BlackLetter — a single vocabulary, a consistent visual language, and precise interaction rules applied across the entire product.

## Voice

Direct. Minimal. Never apologetic.

Write as if the system is a capable assistant — not a salesperson, not a chatbot. Sentences are short. Instructions are imperative. Explanations are precise.

- "What are you working on?" not "What would you like to do today?"
- "Start with a topic or question" not "Enter a query to get started"
- "Could not complete your brief" not "Sorry, something went wrong"

## Tone

| Context | Tone | Example |
| --- | --- | --- |
| Empty state | Inviting, quiet | "Start with a topic or question" |
| Loading | Informative, precise | "Reviewing evidence..." |
| Error | Direct, actionable | "PDF extraction returned 0 characters" |
| Success | Understated | "Ready" |
| Configuration | Neutral, clear | "Gemini API key is not configured" |

Never use exclamation marks. Never use emoji in system text. Never say "success" or "failed" as standalone labels.

## Naming system

All user-facing names follow a consistent vocabulary:

| Internal | Display | Use case |
| --- | --- | --- |
| quick-overview | Brief | Fast analysis |
| student-study | Study | Structured learning |
| deep-research | Comprehensive | Full investigation |
| academic-research | Scholarly | Formal academic |
| business-analysis | Strategic | Business context |
| legal-analysis | Jurisdiction | Legal reasoning |
| historical-analysis | Chronology | Historical context |
| scientific-analysis | Empirical | Scientific method |
| technical-analysis | Specification | Technical breakdown |
| Dashboard | Atlas | Home/navigation view |
| Notebook | Ledger | Notes and insights |
| Settings | Workshop | Configuration |
| Timeline | Chronology | Event sequences |
| Bookmarks | Collections | Saved resources |
| Exports | Downloads | Exported files |
| Report | Docket | Rendered output |
| Summary | Verdict | Key findings |
| Learning Goal | Objective | Purpose statement |
| Key Takeaways | Verdict | Conclusions |
| Core Concepts | Principles | Fundamental ideas |
| Common Mistakes | Pitfalls | Edge cases |
| Memory Tricks | Mnemonics | Recall aids |
| Practical Exercise | Drill | Practice task |
| Further Reading | References | Sources |
| Action Plan | Next Steps | Follow-up |
| Mini Quiz | Probe | Knowledge check |
| Knowledge Graph | Atlas | Concept relationships |

## Motion

Transitions are subtle and fast. 200ms ease-out for view changes. 300ms for modals. No bounce or spring defaults. Opacity + y-axis translation for most entrances. Never animate purely for decoration.

- View transitions: 200ms, easeOut, opacity + y: 12px
- Hover: 150ms color transitions
- Loading pulse: 1s loop, gentle opacity

## Type scale

| Token | Size / weight | Use case |
| --- | --- | --- |
| display | 30px / 700 | Page titles |
| heading | 20px / 600 | Section headings |
| title | 15px / 600 | Card and dock titles |
| body | 14px / 400 | Body text |
| caption | 12px / 400 | Metadata and secondary text |

## Spacing

Use a 4px grid. Standard content padding is 24px (p-6) on desktop and 16px (p-4) on mobile. Section spacing is 32px (space-y-8). Tight spacing for toolbars and icon rails is 8px (gap-2).

## Icons

Use Monochrome. 13px for icon-bar items. 16px for navigation. 24px for empty states. Icons are muted (`text-muted`) — never primary unless indicating state.

## Buttons

- Primary: filled background, used for the main action on screen
- Ghost: borderless, used for secondary toolbar actions
- Danger: red tint, used for destructive or irreversible actions
- Icon: square, used when only an icon is needed

All buttons use `font-sans text-sm`. Primary uses lowercase `text-white`. Ghost buttons have no background until hover.

## Navigation

The dock is the primary navigation surface. Icons + labels in a vertical column. The active item is highlighted. Mobile uses a bottom tab bar with truncated labels.

No nested navigation. No dropdown menus. Every surface is one action away.

## Surfaces

Surfaces (cards, panels, the dock) use a `bg-background` surface on the breadplate, `border border-border/70` borders, and `rounded-xl` corners. Padding is `p-5`. Surfaces are flat by design — shadows appear only on interaction elements (dock, primary button).

## Reports (Docket)

Reports render as Markdown. Sections are separated by `##` headings. The docket always opens with the subject as `#` heading, followed by metadata. The footer contains pipeline metadata. No wall of text longer than 5 sentences without a subheading.

## Interactions

- Hover: 150ms color transition
- Press: no scale, no shimmer
- Focus: ring-2 with `bg-accent/40`
- Drag: no drag motion in the editor
- Swipe: disabled on mobile
- Loading: progress is never faked; states match the real pipeline

## Errors

Every error has a code and a message. Messages are specific. Never show "Something went wrong" as a final state.

| Code | Message |
| --- | --- |
| EMPTY_PROMPT | "Prompt is empty. Enter a topic or question to learn about." |
| MISSING_API_KEY | "An API key is not configured. Add one in Settings." |
| PROMPT_TOO_LONG | "Prompt is X characters. Maximum is 10,000." |
| FILE_TOO_LARGE | "file.pdf (15MB) exceeds the 10MB limit." |
| UNSUPPORTED_FILE | "file.xyz is not supported. Use .txt, .md, .pdf, or .docx." |
| EXTRACTION_EMPTY | "Text extraction returned 0 characters for file.pdf. The file may be empty or use an unsupported format." |
| EMPTY_RESPONSE | "The provider returned an empty response after streaming completed." |

## Accessibility

- Every interactive element has a focus ring (160ms).
- Color is never the only signal — state is reinforced with iconography and text.
- Touch targets are at least 32px high on mobile.
- Live regions announce loading and error states to screen readers.