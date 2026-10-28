# ElvUI — Architecture Briefing (License-Safe Edition)

**Prepared by:** Glorg (z.ai agent) for ingestion by Claude T-08 and any other agent on the Turbosauce team
**Date:** 2026-10-29
**Source basis:** Public plugin-API documentation, community knowledge, and repository *metadata* only (file tree, TOC headers, license files, third-party notices) as of commit `e834a4c`, 2026-10-26.

> **READ THIS FIRST — compliance statement.**
> ElvUI's own source is **not** open source. It ships a custom all-rights-reserved license plus an `AGENTS.md` that explicitly forbids AI systems from ingesting its code as input/reference or generating derivative material from it. That is why Claude (and any careful model) refuses deep-source work on it — this was the correct behavior, not overcaution. Repo-owner permission does not override the rights holder (Elv, Simpy, the tukui-org team).
> Accordingly, this document contains **zero proprietary source content**: no copied code, no lifted comments, no assets. It is a functional description of how ElvUI is organized and how its documented extension surface behaves, written from public knowledge. It is safe to ingest, quote, and index. Directory paths below are factual structure (metadata), included so agents can navigate a local copy that a *human* has lawfully obtained. Do not treat this document as a substitute for reading code, and do not ask an AI to work with ElvUI source files unless written permission from the ElvUI authors has been obtained.

---

## 1. What ElvUI is

ElvUI is the dominant full-replacement UI suite for World of Warcraft: unit frames, action bars, bags, chat, nameplates, tooltip, minimap, data feeds, and a unifying visual/pixel-perfect style, all driven by one options system and one profile system. It descends from the Tukui project (its OptionalDeps still list Tukui) and is maintained on `github.com/tukui-org/ElvUI` by Elv, Simpy, and team, distributed via tukui.org.

From the TOC metadata, one build ships against **all current game flavors** via per-flavor load rules: Classic Era (`vanilla`), TBC (`tbc`), Wrath (`wrath`), Mists (`mists`), modern retail branded "Midnight" (`standard`, interface 12.0.x), and a classic-forever realm type branded "Forever" (`AllowLoadGameType camelot`). Flavor-specific code lives under `Game/<Flavor>/...`; shared code under `Game/Shared/...`.

Repo metadata also shows the product is split into **three loadable addons** (`X-Tukui-ProjectFolders: ElvUI, ElvUI_Libraries, ElvUI_Options`):

| Addon | Role |
|---|---|
| `ElvUI` | The engine + all gameplay modules |
| `ElvUI_Libraries` | Embedded third-party libraries (loaded first; ElvUI has `RequiredDeps: ElvUI_Libraries`) |
| `ElvUI_Options` | The options UI, kept in a separate addon so its bulk never loads in normal play |

Saved variables (from TOC): **`ElvDB`** (global settings, profiles, shared state), **`ElvPrivateDB`** (per-account private state, e.g. install-complete flags), **`ElvCharacterDB`** (per-character data such as chat history).

## 2. The mental model every plugin author learns first

One line of idiom, reproduced in every public plugin tutorial, captures the whole architecture:

```lua
local E, L, V, P, G = unpack(ElvUI)
```

The global `ElvUI` is a table of handles:

- **`E`** — the engine. Module registry, event/timer helpers, media, profile access, pixel-perfect math, mover factory, static popups, command registration. Nearly every subsystem hangs off `E` or a module handle obtained from it (`E:GetModule('Name')`).
- **`L`** — the locale table. `enUS` is the base dictionary; other languages (a dozen ship in `Locales/`) overlay it. Plugins add strings by inserting into `L`.
- **`V`** — defaults for *private* (per-account, non-transferred) settings.
- **`P`** — defaults for *profile* (transferable, per-profile) settings.
- **`G`** — defaults for *global* (non-profile) settings.

This V/P/G triple is the key to the data model. Every setting in ElvUI belongs to exactly one of those three layers, mirrored at runtime onto `ElvDB` / `ElvPrivateDB`:

1. **Profile layer (`P`)** — the bulk of appearance/behavior config. Swappable; exportable; per-character assignment; dual-spec aware on flavors that support it.
2. **Global layer (`G`)** — settings that make no sense per-profile (e.g. global filter lists, muted addons).
3. **Private layer (`V`)** — install state and machine/account-local bits that should not travel with a shared profile.

Defaults are layered: user values override defaults; defaults are written back into the saved tables by a defaults-merging pass at load so new versions can ship new defaults without clobbering user config. Deleting a key restores the default. This "defaults live in code, user deltas live in SVs" pattern is the single most ElvUI-idiomatic idea to internalize.

## 3. Boot sequence

Functional timeline (names paraphrased from public knowledge; the exact call graph lives in `Game/Shared/General/Initialize.lua` and `Core.lua`):

1. **AddOn loading.** `ElvUI_Libraries` loads first (dependency), registering LibStub libraries (Ace3 family, `LibSharedMedia-3.0`, `LibActionButton-1.0`, `LibElvUIPlugin-1.0`, `oUF`, etc.). Then `ElvUI` loads: the unpack handle is published early so later-load addons/plugins can unpack immediately.
2. **Saved variables become available** (`VARS_LOADED`-phase); the defaults merge runs over `ElvDB`/`ElvPrivateDB` using the V/P/G tables; the locale table finalizes.
3. **Engine init.** Core registers its command slash handlers, static popups, the media set, tag engine, and builds the module registry. Modules across `Game/Shared/Modules/**` plus the flavor overlays register themselves.
4. **PLAYER_LOGIN.** The engine runs `E:Initialize`: modules are initialized in a deliberate order (layout/movers before consumers; unitframes and nameplates before plugins' hooks that assume frames exist), then a post-init phase fires `E:InitialUpdate`-style update sweeps, shows the install wizard for first-run accounts (`private.installComplete` false), and performs after-login tasks (version check comms, status report if requested).

Extension point: plugins that must run "inside" this sequence register their init via the plugin library rather than raw `PLAYER_LOGIN`, so they initialize after the engine is ready.

## 4. Core services on `E` (the surface plugins actually touch)

- **Module system.** `E:RegisterModule('Name')` enqueues a module; `Module:Initialize()` runs during boot; `E:GetModule('Name')` retrieves handles. Modules conventionally expose `Initialize`, `Update` (re-apply all config), and a `Toggle`/enable path gated on their `db.enable`. The big modules live as namespaces: AB (ActionBars), UF (UnitFrames), NP (Nameplates), B (Bags), CH (Chat), TT (Tooltip), DT (DataTexts), S (Skins), M (Maps), DB (DataBars), L1/Layout, and Misc.
- **Events.** `E:RegisterEvent(event, handler, [object])` wraps the raw WoW API with convenient unregistration on module disable and optional one-shot/first-fire semantics. Handlers receive the usual (self, event, ...) shape.
- **Timers.** Scheduler helpers in the `E:Delay(sec, fn, ...)`, `E:ScheduleTimer`, `E:CancelTimer` family (ticker/next-frame helpers also exist). These are the idiomatic way to defer work without raw `C_Timer` sprawl.
- **Commands.** Slash registration helper plus the built-ins every user knows: `/ec` and `/elvui` (options), `/moveui` (mover mode), `/kb` (keybind mode), `/egrid` (pixel grid), `/in <sec> <cmd>` (delayed execution), `/bgstats`, plus a debug/diagnostics command for status reports.
- **Media.** ElvUI registers its font/texture/sound set through `LibSharedMedia-3.0` (`Game/Shared/Media/SharedMedia.lua`) and consumes media exclusively through LSM handles; plugins add media by registering with LSM, not by patching ElvUI.
- **Static popups.** A named-dialog registry (`Game/Shared/General/StaticPopups.lua`): confirmations for profile delete, CVar resets, etc. Plugins show registered popups by name instead of building dialogs.
- **Locale, colors, class data.** `L` plus shared constants (class colors, power-type colors, role icons) exposed as data tables consumed everywhere; per-flavor token/class-power quirks are absorbed here so modules stay flavor-agnostic.
- **API helpers.** `Game/Shared/General/API.lua`-style helpers: point/size wrappers that bake in pixel-perfect, frame "kit" functions (borders, shadows, generic backdrops), string/table utilities, round/trim/abbreviate numeric formatting. When ElvUI code positions anything, it goes through these so the pixel grid stays intact.

### 4.1 Pixel-perfect system (`PixelPerfect.lua` + `Toolkit.lua`)

ElvUI's trademark "1px everywhere" is a global scale model, not per-frame fiddling:

- A global multiplier is computed from the client resolution (UI height/width against fixed reference resolutions, adjustable via an "UI Scale"/auto-scale setting).
- Every coordinate and size is routed through `E:Scale(value)` so layouts are authored in "design pixels" and rendered crisp at any resolution.
- A toolkit pass walks frames to force border thickness, backdrop insets, and font offsets onto whole-pixel values (the famous "thin borders"), and enforces `IgnoreParentScale`-style corrections on modern clients where nested scale would blur lines.
- The pixel grid is inspectable at runtime via `/egrid`.

Design consequence for anyone mimicking this pattern: **no module ever hardcodes pixel values**; everything multiplies by the global scale, and every border/backdrop goes through the toolkit helpers. That discipline is why third-party skins can match ElvUI's look exactly.

## 5. Layout & Movers (where frames live)

- **Layout module** (`Game/Shared/Layout/Layout.lua` + `Game/Shared/General/`): builds the two-anchor workspace — left/right chat panel roots, the top/bottom data panels, minimap anchor, and the abstract anchor points every other module and mover attaches to. It owns the "center bottom" actionbar zone geometry. Nothing in ElvUI self-anchors to Blizzard frames; everything hangs off these layout roots so one option (`general` panel settings, chat panel visibility) reflows the whole UI.
- **Mover system** (`Movers.lua`). Every user-positionable frame gets a drag proxy created via the mover factory (idiom: `E:CreateMover(frame, 'SomeMoverName', 'Display Text', ...optional behavior args)`):
  - Movers are persistent records in `ElvDB.movers` (name → anchor points), applied on login after frames spawn; "Reset Position" restores defaults.
  - Mover mode (`/moveui` or the options toggle) reveals all proxies with labels; drag to move, right-click for per-mover config.
  - Snap/sticky behavior, grid snapping, and per-mover "snap offset" keep groups (like 10 actionbar buttons) moving as a unit.
  - Post-drag callbacks let modules react (e.g., reflow a datatext panel's contents).

This mover pattern is one of the most-copied ideas in the addon ecosystem and is fully exposed to plugins — a plugin frame that registers a mover gets drag/persist/reset for free.

## 6. UnitFrames — the oUF core

ElvUI does not use Blizzard's unit frame templates. It ships a **fork of oUF** (the classic community unitframe framework) inside `ElvUI_Libraries`, heavily extended, and builds every unit frame on it.

**oUF in one paragraph:** frames are plain frame objects registered with oUF as unit frames; *elements* are self-contained feature tables (Health, Power, CastBar, Auras...) attached onto a frame. When you set `frame.Health = elementInstance`, oUF wires the element: it enables it, routes relevant events by unit, and calls the element's `Update` hooks. Elements declare which events/units they need; oUF's dispatcher handles unit-to-frame matching (player, target, party1..4, raid1..40, boss1..5, arena1..5, etc.), visibility, and update fan-out. ElvUI's fork adds: its own element set, tag integration, aura filtering, cooldown-text integration, and performance tweaks.

**Roster & spawn model.** Per repository structure, unit definitions split into:
- `Game/Shared/Modules/UnitFrames/Units/*.lua` — singleton units: Player, Target, TargetTarget, TargetTargetTarget, Pet, PetTarget, Focus, FocusTarget.
- `.../UnitFrames/Groups/*.lua` — group units: Party, Raid (with layout variants), RaidPets, Tank, Assist, Arena, Boss. Group files define sort/filter providers, group spacing, growth direction, and per-row column/row templates; oUF's group factory (header spawning) materializes child frames.
- A shared `UnitFrames.lua` core handles the module-level concerns: db-driven construction, global update sweeps, mover integration ("Unlock UF" mode), configuration change application, and a config sandbox (`ConfigEnvironment.lua` lets options-era code evaluate filter-like expressions safely).

**Construction pattern per unit file** (functional description): each unit file is a set of small *Construct* functions — one per element — that build and attach the element when the db says it's enabled, plus an *Update* function that re-applies the full config to the frame (sizes, colors, text formats, anchors, visibility). Changing an option triggers the targeted Update, not a respawn; full rebuilds happen on profile switch or element enable-toggle.

**Element catalog** (from the repo's Elements directory — each is its own file): Health, Power, PowerPrediction, HealPrediction, CastBar, Auras (buffs/debuffs containers), AuraBars (stacking bars), AuraWatch (icon-grid "buff watch"), AuraHighlight (color-on-aura), ClassBars (combo points/channels/class resources), Portrait, Name, InfoPanel, CustomText (user-defined tag texts), Threat, RaidIcon, RaidRoleIcons, RoleIcons, PvPText/PVPIcon/PVPSpecIcon/PVPClassificationIndicator, ReadyCheckIcon, ResurrectionIcon, SummonIndicator, RestingIndicator, CombatIndicator, PhaseIndicator, PartyIndicator, AltPower, Range (fader), FrameGlow, Cutaway (ghost of lost health), Trinket (arena trinket indicator), RaidDebuffs (priority debuff display). Plus a shared **Cooldowns** engine (`Game/Shared/General/Cooldowns.lua`) rendering all cooldown text with thresholds/coloring shared between UF auras, castbars, and action buttons.

**Tags.** The tag engine (`Game/Shared/Tags/*.lua`) is ElvUI's templating system for dynamic text: strings like `[name]`, `[health:current-max]`, `[classcolor]` are registered in a global registry together with (a) the WoW events that invalidate them and (b) a pure function `(unit) -> string`. Frames declare text objects with a tag string; the engine subscribes events, evaluates on fire, and caches per-unit results. Plugins add their own tags via the public `E:AddTag(name, eventString, fn)` idiom and optional category registration — this is a first-class, heavily documented extension point. Tags are also shared into Nameplates (`Nameplates/Elements/Tags.lua`), which is why one tag implementation serves both systems.

**Aura filtering.** Aura displays consume the shared **filter system**: named lists (whitelist/blacklist with spell IDs and rules) stored in `ElvDB.filters` (global), with per-flavor default lists registered from `Game/<Flavor>/Filters/Filters.lua`. Options expose a filter editor; units reference filters by name. This same filter registry backs nameplate style filters and buffwatch — one concept, three consumers.

## 7. Nameplates

The Nameplates module (`Game/Shared/Modules/Nameplates/`) is a second unitframe framework layered on Blizzard's nameplate system (plate pooling/tokens), not on oUF:

- It reskins and re-lays-out each plate as it is assigned a unit, building the same visual kit as UF (Health, Power, CastBar, Auras, ClassPower, Threat, PvP, RaidTargetIndicator, Portraits, Tags — the Elements directory mirrors UF's).
- **Style filters** are the headline feature: user-authored rule tables with *triggers* (name, auras present/missing, health %, casting spell, classification, threat, in-combat, level range, unit type...) and *actions* (scale, color, visibility, glow, text overrides, arrow/castbar customization). Filters are ordered, evaluated per plate update, and first-match applies. This is a rule engine with a config UI; the data lives in the global filter registry alongside aura filters.
- `Nameplates/Plugins/` holds optional extras (TargetIndicator styles, QuestIcons, PVPRole, ClassificationIndicator, Highlight) that plug into the plate layout like UF elements do.

Practical note for agents: anything "conditional look" in ElvUI usually means style filters, not code — they are data, user-editable, and exportable.

## 8. ActionBars

ActionBars (`Game/Shared/Modules/ActionBars/`) wraps `LibActionButton-1.0` (a community lib that renders spells/items/macro buttons independent of Blizzard bars):

- Ten configurable bars (1–10) plus **PetBar**, **StanceBar**, **ExtraAB** (extra action button), **MicroBar** (menu buttons), and a **TotemBar** on flavors that have it.
- Per-bar db: buttons count, rows/columns, size/spacing (pixel-perfect), paging/dynamic groups (stance/vehicle/condition paging via macro-condition-like rules), visibility states, and flyout handling.
- **Keybind mode** (`Bind.lua`, `/kb`): hover-to-bind overlay writing `SetBinding` and storing an optional ElvUI-side profile of bindings display.
- Bar buttons integrate the shared **Cooldowns** engine, range-indicator dimming, Masque support (OptionalDeps), and the standard hotkey/count/name text objects.
- MicroBar is a custom micro-menu grid; TotemBar handles totem pulse/emphasis.

Extension point: plugins add bars by spawning their own LibActionButton groups and registering movers — no patching of the module needed.

## 9. Bags

The Bags module (`Game/Shared/Modules/Bags/`) is a full replacement inventory: custom button grid over bag slots with:

- Consolidated views per container type (backpack, bank, reagent bank on flavors with one), configurable columns, slot size, and *bag grouping filters* (junk, consumables, trade goods, equipment, by TOCTR category) that visually partition the grid into labeled sections.
- **Sort engine** (`Sort.lua`): the well-known "move stack A onto B" algorithm — it computes a target ordering, diffs it against current bag state, and issues the minimal sequence of `UseContainerItem`-style moves; classic-era and modern inventory APIs differ, and the module abstracts that.
- Item level text, bind-on states, junk highlighting, new-item glows, "discard/handle junk" helpers, a **BagBar** module (the four bag buttons + toggles), search, and auto-toggle on vendor/bank/mail events.
- Bag assignment (which bag shows where/scroll filters) is data-driven from db; the bank is a separate frame set with its own layout config.

## 10. Chat

The Chat module (`Game/Shared/Modules/Chat/`) rebuilds Blizzard chat presentation:

- Docks chat tabs into the Layout module's left/right panel roots with configurable panel chrome and the data panels above/below.
- Adds: scroll-to-history with a **persisted per-session channel history** (stored in `ElvCharacterDB`), a **copy text** popup, URL detection, smart tab-completion tweaks, whisper sounds, channel/logo customization, emoji replacement (asset pack lives in Media), spam/quote suppression options, and fades/scroll behavior.
- It takes ownership of FCF (FloatingChatFrame) lifecycle: new tabs are adopted, moved, skinned; dock position, font, and size are managed from db rather than Blizzard settings.

## 11. Tooltip, DataTexts, DataBars

**Tooltip** (`Game/Shared/Modules/Tooltip/`): full reskin of GameTooltip family + anchoring policy (cursor vs anchored with configurable offsets), unit-frame hover linking, comparison handling, extra info lines (item count, target-of-target, spec/talents on modern flavors, item level), fade timing, and visibility toggles per frame group.

**DataTexts** (`Game/Shared/Modules/DataTexts/` — ~60 built-in from `System.lua` (fps/latency) and `Time.lua` to `Currencies`, `Gold`, `Friends`, `Bags`, `CombatTime`, flavor-specific ones like `Crests`/`DungeonScore` under `Game/Mainline/DataTexts/`):
- The framework (`DataTexts.lua`) manages *panels and slots*: the chat panels expose slots; users assign datatexts to slots (or to minimap-attached panels and custom panels via Layout).
- Registration idiom (public API): `DT:RegisterDatatext(name, categories, eventList, onUpdate, onClick, onEnter, onLeave, ...)`. Events auto-register/auto-clear per assigned slot; `onUpdate` handles periodic text; `onEnter` builds the hover tooltip menu (most built-ins render rich menus, e.g. currency list or friends list, with click-through actions).
- Text formatting supports per-slot font/size and the standard `textFormat` string templates some DTs implement.
- This is the **lowest-effort high-value extension point in ElvUI** — a working custom datatext is ~30 lines in a plugin.

**DataBars** (`Game/Shared/Modules/DataBars/`): XP, Reputation, pet XP, Threat (+ Honor/Azerite on flavors that have them) — horizontal bars with text tags, colors, and (for rep) faction selection; independent of unitframes.

## 12. Skins

The Skins module (`Game/Shared/Modules/Skins/`) is ElvUI's theming engine for **Blizzard UI and third-party addons**:

- **Callback registry.** Skin files register handlers per Blizzard frame (created eagerly or lazily — the registry fires when the frame actually exists) and per addon (`ADDON_LOADED`-keyed). Idiom: `S:AddCallback('FrameOrAddonName', fn)`.
- **Widget kit.** A large set of `S:Handle*` functions (Button, CheckBox, Slider, EditBox, DropDown, Tab, ScrollBar, Tooltip, CloseButton, etc.) that convert stock widgets into the ElvUI look (flat backdrop, pixel border, styled textures). Every skin is just "create/locate frame → call Handle* on children → done".
- **Ace3 skinning.** An Ace3 layer (`Skins/Ace3.lua`) hooks `LibStub` AceGUI registrations so *any* Ace3 config UI that loads after ElvUI is skinned automatically (widget/container hooks) — this is how ElvUI visually swallows other addons' option panes.
- **Auras module** note: `Game/Shared/Modules/Auras/` is the standalone buff/debuff bar system (with its own Containers) separate from UF auras.

Community note: the large third-party skin suite "AddOnSkins" extends this exact registry from outside, which is the proof it's a workable plugin surface.

## 13. Maps, Blizzard tweaks, Misc

- **Maps** (`Modules/Maps/`): Minimap module (reshapes the minimap, gathers the round buttons into a managed stack with click-open menus, adds coordinates/compass options, hides clutter) and Worldmap module (shared media styling, coordinates, spawn pin tweaks).
- **Blizzard module** (`Modules/Blizzard/`): surgical fixes/repositioning for Blizzard systems that need it — ObjectiveTracker (move/skin/fade), AlertFrame, GuildBank, TimerTracker, TalkingHead, AltPower, CaptureBar, QuestWatch, ColorPicker (legacy + modern variants), WidgetsUI. Pattern throughout: minimally re-parent/reposition/skin; never rebuild Blizzard logic.
- **Misc** (`Modules/Misc/`): AFK screen, ChatBubbles (styled speech bubbles incl. names), Loot (auto-loot/quality filter) and LootRoll (styled roll frames), RaidUtility (tank/raid control panel), RaidMarker bar, QueueStatus (LFG eye), TotemTracker, PrivateAuras, InfoItemLevel (inspect ilvl), DebugTools, TutorialFrames suppression.

## 14. Options, Profiles, Distribution

**ElvUI_Options** is its own addon (loads on demand / always-soft-loaded) that builds the giant tree UI. Functionally:

- One registered options tree; every module contributes its section; a shared widget vocabulary (toggle groups, range sliders, color pickers, media dropdowns, "selection list" editors for filters/tags/DT slots) keeps it consistent.
- Search across the tree, per-section reset, and a **profile system UI**: create/rename/delete/copy profiles, per-character assignment, "apply to all", dual-spec hooks where supported.
- **Import/Export** (`Distributor.lua`): profiles serialize to compressed, encoded strings (deflate + encoding via embedded libs) that users share as text; the Distributor also supports sending profiles *live* between players over an addon comm channel ("ELVUI"), with an accept prompt on the receiving side. Filter sets and other data blobs ride the same mechanism.
- **ModuleCopy** (`ModuleCopy.lua`): copy a single module's settings from another profile or another character — fine-grained between the two extremes of full-profile copy.
- **Install wizard** (`Install.lua`, plus `PluginInstaller.lua`): step-based onboarding (layout choice, chat setup, CVars, UF setup). Third-party plugins append their own steps via the plugin installer registry, so a plugin can have a first-run setup identical in feel to core.
- **StatusReport** (`StatusReport.lua`): diagnostics window listing checks (libraries loaded, versions, known-conflict detectors) — the thing users screenshot when filing issues.

## 15. The plugin system (the public extension surface)

This is the part an outside developer (or an AI assistant) is *meant* to build against, and it is extensively documented across tukui forums, the community wiki, and dozens of open plugin repos:

1. **Plugin = a separate WoW addon** that does `unpack(ElvUI)` and depends on ElvUI. It never modifies ElvUI files.
2. **Registration.** The plugin registers with `LibElvUIPlugin-1.0` (name + version). That library powers the cross-client **version check** (broadcast over the ElvUI comm channel; out-of-date users get the standard nag) and lists the plugin in ElvUI's addon registry.
3. **Options.** The plugin contributes an options group under the **Plugins** section of ElvUI Options (the exact registry key has shifted across versions — check a current plugin; the mechanism is stable).
4. **Installer steps.** Optional first-run steps via the plugin installer registry.
5. **Everything else** is just using the handles: `E:RegisterModule` for ElvUI-style modules of your own, `E:RegisterEvent`, `E:Delay/E:ScheduleTimer`, `E:CreateMover`, `E:AddTag`, `DT:RegisterDatatext`, `S:AddCallback` skins, LSM media registration, static popup registration, filter-list access.

Canonical plugin skeleton (public idiom, paraphrased):

```lua
local E, L, V, P, G = unpack(ElvUI)
local mod = E:NewModule('MyPlugin', 'AceHook-3.0', 'AceEvent-3.0')  -- Ace mixins optional

-- defaults injection: V.myplugin = {...} (private) / P.myplugin = {...} (profile)
-- then: E:RegisterModule('MyPlugin') and mod:Initialize() { ... spawn frames, add options, DTs, tags ... }
```

Known plugin families (all open) that double as working references: Shadow & Light, ElvUI Enhanced (+ forks), MerathilisUI, AddOnSkins (skins via the registry), ElvUI_CustomTags and assorted tag/DT plugins.

## 16. Flavor handling (how one codebase serves six clients)

- Per-flavor load XMLs (`Game/load_classic.xml`, `load_tbc.xml`, `load_wrath.xml`, `load_mists.xml`, `load_forever.xml`, `load_mainline.xml`) gate files with `AllowLoadGameType`.
- Shared code must be flavor-agnostic; flavor deltas live in `Game/<Flavor>/` overlays: extra DataTexts (retail `Crests`, `DungeonScore`, `Missions`, `Warmode`, `Quickjoin`; mists `SpecSwitch`), per-flavor `Filters/Filters.lua` defaults (spell lists differ per era), DataBars (`Azerite`, `Honor` retail-only; `PetExperience` era-only), Skins (per-era frames like `Reforge`, `Artifact`, `Runeforge`, `Delves`).
- Runtime capability checks (`E.Retail`-style booleans / build sniffing) guard remaining behavioral branches.
- The TOC's multi-`Interface:` list plus `AllowLoadGameType` headers are the entire dispatch mechanism — one folder, six clients, zero duplicated core.

## 17. License & AI-terms reality (the part Claude must internalize)

**Facts from the repository:**

- `ElvUI/LICENSE.txt` and `ElvUI_Options/LICENSE.txt`: custom license. Free to **use**; modifications allowed **for private use only**; you may **not publicize any portion** (the stated exception: uploading to GitHub); keep the addon name/folders; retain the copyright notice; *all other rights reserved*.
- `AGENTS.md` (repo root): automated agents and AI tools must **not** train on, ingest, embed, retrieve over, or use the content as AI input/reference/grounding, nor generate material that reproduces/imitates/derives from/substitutes the original content — **unless prior written permission from the copyright holder**. Ordinary local tooling (run/search/lint/package/debug/backup) is fine, but must not transmit content to an AI system.
- `ElvUI_Libraries` is different: those are third-party projects (Ace3 family, oUF, LibSharedMedia-3.0, LibActionButton-1.0, LibCustomGlow, LibDispel, LibDualSpec, LibSimpleSticky, LibStub, LibTranslit, TaintLess, UTF8, LibElvUIPlugin, LibDataBroker, LibAnim, LibAceConfigHelper, AceGUI-SharedMediaWidgets) under their own licenses catalogued in `ThirdPartyNotices.md` (LGPL for classic Ace3-era libs, MIT for several modern libs, oUF under its own terms). Those libraries may be reused subject to their licenses.

**What this means operationally for our team:**

1. Claude declining deep-source work on ElvUI was **correct and will not change** — no one on our side can grant the missing permission.
2. A **human** may read and privately modify the code (that right is explicit in the license). Danny reviewing code and explaining it to Claude in his own words is his prerogative.
3. The clean path for AI-assisted work **on top of ElvUI** is *plugin development against the public surface* (Section 15) — writing a new, separate addon that unpacks ElvUI. That requires no copying of proprietary content.
4. For AI-assisted work **requiring source access** (forking features, deep debugging), the only clean route is written permission from the authors (tukui.org support / their Discord). They are historically responsive to addon developers.
5. For building **original UI systems** (our own projects), the transferable assets are the *ideas* — module registry, defaults layering (V/P/G), pixel-perfect scaling, mover persistence, style-filter rule engines, datatext panels — none of which are copyrightable. The **permissively-licensed libraries** (oUF, Ace3, LSM, LibActionButton, MIT components) can be embedded directly per their licenses.

## 18. Tribal knowledge (public, community-documented)

- **Profile size discipline:** `ElvDB` bloat is a chronic user complaint — mover records and per-item data accumulate; the options UI ships cleanup paths. Plugins should keep per-item state in `ElvCharacterDB` or prune aggressively.
- **Defaults merging is one-way:** removing a key from `P`/`G` in a new version *resets user settings* for that key unless handled; the codebase gates default migrations carefully — plugin authors must too.
- **Timing:** options that touch construction (element enable, bar count) need the module's full update path, not just an apply; the Update functions are written to be idempotent and cheap.
- **Taint awareness:** heavily hooks Blizzard; `TaintLess` is embedded to mitigate. New code touching Blizzard frames should follow the existing hook patterns (post-login, nameplate-safe).
- **Aura filters are data:** users share whole filter packs via Distributor; hardcoding spell lists in plugins is an anti-pattern.
- **Version gating:** because one build ships to six clients, every PR is expected to either be shared code or correctly gated — CI/lint enforces per-flavor load sanity; plugin authors should guard flavor-specific calls similarly.

## 19. Summary mental map

```
ElvUI_Libraries  →  LibStub libs (Ace3, oUF, LSM, LibActionButton, LibElvUIPlugin...)
ElvUI            →  E engine (Core/API/Toolkit/PixelPerfect/Movers/Install/Distributor)
                    ├─ Module registry → Layout, ActionBars, UnitFrames(oUF), Nameplates,
                    │   Bags, Chat, Tooltip, DataTexts, DataBars, Maps, Skins, Auras, Misc, Blizzard
                    ├─ Data: ElvDB(profiles/global/filters/movers) + ElvPrivateDB + ElvCharacterDB
                    ├─ Defaults: P (profile) / G (global) / V (private), merged at load
                    └─ Flavors: Game/<era> overlays over Game/Shared
ElvUI_Options    →  options tree UI + profile manager + import/export + install wizard
Plugins          →  separate addons: unpack(ElvUI) → LibElvUIPlugin → options/DTs/tags/skins/movers
```

That is the whole machine: **one engine handle, one layered data model, one module registry, one options/profile plane — and a public plugin surface on top.** Everything else is depth inside a module.

*— end of briefing. No proprietary source content was used or reproduced in this document.*
