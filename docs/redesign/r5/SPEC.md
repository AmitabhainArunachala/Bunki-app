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

`R5` is `/Users/dhyana/.dharma/bunki_review/2026-10-10/r5-strict`. The first candidate recording in `responses-final/{normal,reduced}` exposed suppressed reduced-motion effects; its failed observations remain intact. The fresh root-room recording is `responses-final-v12`: 26 contiguous actual Playwright video excerpts, 86 qualifying semantic actions, with at least three in each state and mode. Entry Close has no finite animation and is excluded: entry Open, Kanji and Back supply its three responses. Each receipt retains timestamps, active effects and actual results. `journey-final-v12` supplies the complete journey and `contact-sheet.png`, twelve actual video frames with intermediate frames. The v12 checked sheet retains all twelve original selected timestamps; its card tile at 10.058s is populated, and Follow, reveal and article tiles show real intermediate frames. The earlier v6 blank-frame sheet remains in its own evidence folder.

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
| Kotoba back | A word opens its real lookup sheet; English unfolds its meaning; Good records the actual outcome and advances | Sheet/response ≤180 ms | 100 ms opacity |
| N1 back | A word opens its real lookup sheet; English unfolds its meaning; Good records the actual outcome and advances | Same ≤180 ms | 100 ms opacity |

The player recordings are `R5/cards-final-v12/responses`: four fresh actual films, both decks and motion modes, six card states and 36 actual actions. Exact clean `2d3ed3d1` identity is retained. Navigation holds an inert departing visual frame while incoming controls remain live. Same-screen preference changes do not duplicate Settings controls, and a fixed grade dock is not moved by an incoming transform. First authored response is at most 128ms and settled response at most 457.5ms on this Mac under parallel load; font status is still loading on 20/36 first RAFs and 59 sampled frames. This is observed motion response, not a proof of fully loaded typography, compositor paint, human readability or iPhone speed. Settled font proofs are separate.

The main-room transition captures only the departing main. The incoming main remains live and fades in; this is deliberate because a captured incoming DOM cannot receive pointer hits until a native view transition ends. The departing snapshot can translate slightly; the live incoming room uses opacity so fixed audio and grade docks keep their viewport position. Search and internal guided returns retain their synchronous focus/keyboard contracts.

All 19 states have three observed meaningful responses per mode, each under one second. The v12 CSS audit covers 20 shipped sheets, zero forbidden properties and 13 ambient cycles of at least six seconds; ambient motion is excluded from the response count. The historical `room-motion-final-v7` records 30 real stages across normal, reduced and explicitly simulated native-API absence. The historical `motion-live-final-v7` additionally proves 14 physical clicks land on live incoming controls before native transition completion, with fixed docks unchanged. Unsupported-native focus, route and state remain synchronous. Check 25 still requires an unprompted first viewer; no recording or automation substitutes for that person.

Asynchronous dictionary enrichment now keeps the entry and its backdrop on their original arrival timelines. Actual core/index/details replacements are not new doors. Opening another entry, Kanji, Back or reopening after dismissal starts a new arrival. The original v6 video/RAF trace records two whole-entry fade resets; the clean `sheet-arrival-final-v7` trace records three entry nodes and zero opacity drops in each mode. This v7 behavior is independently observed, rather than inferred from the helper. It does not prove late room fades after native cleanup. The unchanged fresh `late-room-final-v12` observer supplies that separate scope: twelve normal/reduced/native-absent cases, zero main/child resets and page errors, final opacity 1, and at least 1195.0999999940395ms actually observed after native clearance. Gate commit `2208ed7b` prevents the missed late room replay. The original failing observer remains intact. Fresh `CSS-audit-final-v12` covers all twenty shipped sheets: no forbidden animation properties, thirteen ambient loops, minimum six seconds. The production Undo proof separately tests all forty trusted centre/corner actions in EN/JA at 320/390 after grade and removal, at scrollY0. Three responses per state do not imply every possible response is measured.
