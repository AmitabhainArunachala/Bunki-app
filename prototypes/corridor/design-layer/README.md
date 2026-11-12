# The live design layer: a safety copy

These are the lead's design files as they stood on 2026-11-12, copied byte for byte from the program
folder on the owner's Mac. They are what the Mac preview lays over the app:

- `depth/print.css`: the print look (the printed sky, the washi sheet under every screen, a word's
  meanings set as running lines), with `depth/depth.css`, `depth/lead.css` and `depth/kanji.css`
- `depth/art/`: the plates (washi, bokashi) and their sources
- `live.js`: the loader that attaches these style sheets to the running app and swaps them in place
- `sky/`: the design copy of the first screen (version 3, fifth release) and its review tools
- `tools/`: the tools that walk and photograph the app

Not wired into the build. `prototypes/corridor/depth.css` is still the older folded copy
(`depth.css` and `lead.css` only); folding the print look into the app is a task of its own.
The first screen's data files are not here: the build makes its own, pool by pool.

`SHA256.txt` lists the checksum of every file as it was copied.
