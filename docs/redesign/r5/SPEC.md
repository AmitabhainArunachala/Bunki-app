# Round 5: authored responses

The eight laws, from VISION §8:

1. The brief is the frame.
2. Beauty and function are one object.
3. One app, one memory, one web.
4. One language at a time.
5. One world, distinct rooms.
6. One job per screen, one obvious next step.
7. Real and true.
8. Calm ground, living detail.

This pass serves VISION §10 checks 6 and 23. The responses below carry a change in meaning or place. Ambient rain, breathing, a generic hint and the mere presence of a keyframe do not count. Durations include authored delays. Only opacity and transform animate. Reduced motion uses opacity, with ambient movement stopped.

`R5` is `/Users/dhyana/.dharma/bunki_review/2026-10-10/r5-strict`. The first final-candidate recording is `responses-final/{normal,reduced}`: each room has a contiguous excerpt of the actual Playwright video, action timestamps, observed active effects and a still. This recording exposed suppressed reduced-motion effects; those gaps are retained in its JSON rather than rewritten as passes. The final verification recording and review identify which fixes were subsequently observed.

| Room/state | Three meaning-bearing responses | Normal authored duration | Reduced mode |
|---|---|---|---|
| Door | Open the navigation sheet; return to the sky; leave through Today | Sheet/return ≤280 ms; arrival ≤580 ms including word ink | Short opacity response; no sky movement |
| Today | The day's word arrives; its word opens an entry; Follow takes its part into the web | Word ink ≤580 ms; entry 280 ms; room 220 ms/web ≤300 ms | Room/entry 80 ms; web 80 ms |
| Today after | Completed queue arrives; the same day's word opens; Follow keeps its part | ≤580 ms; 280 ms; 220 ms | 80 ms opacity |
| Session close | Kept words settle; Undo returns the real last card; the next article opens | Words ≤600 ms including delay; card ≤340 ms; room 220 ms | 80 ms opacity on explicit response surfaces |
| Shelf | Today's lead arrives; Tools reveals real filters; the selected article opens | Room 220 ms; tools 160 ms; article 220 ms | 80 ms opacity |
| Reader | The article arrives with its line intact; a touched word raises its meaning; Back restores the shelf | 220 ms; popup ≤260 ms; 220 ms | 80–100 ms opacity |
| Popup | A touched word raises its meaning; Save confirms the durable capture; Study this sentence replaces the word bands with its exact source sentence | ≤260 ms; toast 180 ms; pane 220 ms | 80–100 ms opacity |
| Sentence study | The exact source sentence opens; Back returns to the same word; Save confirms the actual sentence capture | Pane/return 220 ms; toast 180 ms | 80–100 ms opacity |
| Full entry | Full entry rises; its kanji opens the next sheet; Back restores the preceding entry | 280 ms each | 80 ms opacity; close restores focus synchronously |
| Learn | The next real deck arrives; Begin opens its first inert prompt; the saved queue opens Today | Stage ≤455 ms; player 180 ms; room 220 ms | Stage/room 80 ms; player 100 ms |
| Words | The visited word arrives; following a node re-centres that actual word; its entry opens | Room 220 ms; web ≤300 ms; entry 280 ms | 80 ms opacity |
| Me | The actual record opens its book; Review statistics opens the underlying record view; return restores the book | Book 420 ms; room 220 ms; earned rows ≤760 ms | 80 ms opacity |
| Settings | A language choice changes the actual chrome; the world picker opens its named stones; choosing a stone changes the selected world | 220 ms; picker 180 ms; world 220 ms | 80 ms opacity |
| Kotoba home | Begin opens the actual queue; Word list opens its real words; Settings opens its preferences | Outgoing 140 ms, incoming 180 ms, overlapping | 100 ms opacity |
| N1 home | Begin opens the actual queue; Word list opens its real words; Settings opens its preferences | Same 140/180 ms | 100 ms opacity |
| Kotoba front | Reveal shows the concealed answer without changing scroll; Quit returns to the deck; Remove records the real removal and advances | Live response ≤180 ms | 100 ms opacity |
| N1 front | Reveal shows the concealed answer without changing scroll; Quit returns to the deck; Remove records the real removal and advances | Live response ≤180 ms | 100 ms opacity |
| Kotoba back | A kanji opens its own sheet; Focus retains readable context; a coloured grade records its actual outcome and advances | Sheet/response ≤180 ms; Focus opacity 160 ms | 100 ms opacity |
| N1 back | A kanji opens its own sheet; Focus retains readable context; a coloured grade records its actual outcome and advances | Same ≤180/160 ms | 100 ms opacity |

The player recordings are `R5/cards-final/responses`: both decks, both motion modes, six card states and 36 actual actions. Navigation holds an inert departing visual frame while the incoming controls remain live. Same-screen preference changes do not duplicate the Settings controls. A fixed grade dock is never moved by an incoming ancestor transform.

The main-room transition captures only the departing main. The incoming main remains live and fades in; this is deliberate because a captured incoming DOM cannot receive pointer hits until a native view transition ends. The departing snapshot can translate slightly; the live incoming room uses opacity so fixed audio and grade docks keep their viewport position. Search and internal guided returns retain their synchronous focus/keyboard contracts.

Every finite response is under one second. Ambient cycles are at least six seconds and excluded from the count. If a video does not show three meaningful responses in a state or motion mode, REVIEW keeps check 23 partial. Check 25 still requires an unprompted first viewer; no recording or automation substitutes for that person.
