"""Item names the OSMS export spells wrong: its items.json drops non-ASCII letters (Ü, ü) from names.
Applied by build_data.py when it writes D.items; tests/name_fix_test.py guards data.json.
Spelling: the German words Übel ("evil") and Lügner ("liar") from the game's cosmetic sets; the item list on
mapleclassicprices.com (checked 2026-11-01) spells all five this way and matches OSMS on the other 2,251 shared names."""
ITEM_NAME_FIX = {
    "2430039": "Übel Outfit Set",
    "2430042": "Lügner Outfit Set",
    "2542006": "Übel Hair Coupon",
    "2897004": "Übel Face Coupon",
    "2897007": "Lügner Face Coupon",
}
