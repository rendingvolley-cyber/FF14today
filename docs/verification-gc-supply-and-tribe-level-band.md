# GC supply + allied society level-band verification

- Grand Company item display is gated by the current character job levels and XIVAPI v2 `GCSupplyDuty` rows for those levels. `GCSupplyDuty` is a client-data sheet whose `SupplyData` contains candidate `Item` links and counts.
- Item OCR is no longer accepted merely because the text is an existing `Item` name. It must resolve inside the current-level `GCSupplyDuty` candidate set; otherwise the UI shows `品名要確認`.
- Omicron is kept in the app's Endwalker leveling band (80–89). It is not used as automatic reputation/filler work after leaving that band.
- Mamool Ja is the current gathering allied-society band beginning at level 90. The app uses 90–100 for the current level-cap band.
- Gathering focus is authoritative when explicitly selected. Without a focus, MIN/BTN are the default basis so a lower FSH does not silently pull the whole gathering plan back to an older society.

Sources checked before implementation: current Lodestone Patch 6.25 Omicron notes, current Lodestone Patch 7.25 Mamool Ja notes, XIVAPI v2 sheet documentation, and the current EXDSchema `GCSupplyDuty` schema.
