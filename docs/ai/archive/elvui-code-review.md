# ElvUI — Deep Code Review (Full Ingest Edition)

**Prepared by:** Glorg (z.ai agent), for ingestion by Claude T-08 and any agent on the Turbosauce team
**Date:** 2026-10-29 · **Source tree:** `github.com/tukui-org/ElvUI`, head `e834a4c` (2026-10-26), version string parses as `16.00-git`
**Permission status:** repo owner (Turbozo) obtained approval from the ElvUI team on 2026-10-29 for AI-assisted study/learning of the codebase (non-WoW use, no cloning/redistribution). Recorded in `agent-mailbox.md`. Reproduction of the addon itself remains prohibited; this document is original analysis.

> **How to use this document (Claude):** this is a complete functional + internal review of ElvUI's code, written so you can understand the system deeply without reading 100k+ lines. File paths are repo-relative; `file:line` references are from the pinned commit. One correction vs the earlier `elvui-architecture-briefing.md`: **the Nameplate Style Filter engine was removed** in the v14-era refactor (verified: zero `StyleFilter` matches in source) — see §11. Everything else in the briefing stands. When Danny asks for something ElvUI-shaped (a tracker UI, panel system, profile system, rule engine), this is your reference for how the pattern is done at production quality.

---

## 1. Repo & load architecture

Three loadable addons, one repo (`X-Tukui-ProjectFolders: ElvUI, ElvUI_Libraries, ElvUI_Options`):

| Addon | Role | Key fact |
|---|---|---|
| `ElvUI` | Engine + all modules | `## RequiredDeps: ElvUI_Libraries`; SVs: `ElvDB`, `ElvPrivateDB`; per-character: `ElvCharacterDB` |
| `ElvUI_Libraries` | Vendored libs (Ace3 family incl. `Ace3-ElvUI` forks, oUF fork, LibElvUIPlugin-1.0, LibActionButton-1.0, LibSharedMedia-3.0, LibDeflate-era replaced by `C_EncodingUtil`, etc.) | loads first; oUF exported as global `ElvUF` via `## X-oUF: ElvUF` |
| `ElvUI_Options` | Options UI | `## LoadOnDemand: 1`, loaded only when options open (`E:ToggleOptions`, Config.lua:1619-1647); no SavedVariables |

**Flavor dispatch** (`ElvUI/ElvUI.toc:38-43`): one `Game/load_<flavor>.xml` per game type via `AllowLoadGameType` — `vanilla`, `tbc`, `wrath`, `mists`, `standard` (retail/"Midnight" 12.0.x), `camelot` ("Forever", `ExcludeLoadGameType standard, classic`). Shared code in `Game/Shared/`, per-flavor overlays in `Game/<Flavor>/` (extra DataTexts, Filters, DataBars, Skins).

**Load order inside `load_*.xml`** (identical structure all flavors): `General/Initialize.lua` **first** → Locales → Developer tests → SharedMedia → Defaults (`Profile`, `Global`, `Private`) → `Core.lua` → `Math` → `API` → `Fonts` → `Install` → `PixelPerfect` → `Toolkit` → `Commands` → `StaticPopups` → `Animation` → `Movers` → `Config` → `Cooldowns` → `Modules/Layout` → Filters → modules XMLs → UnitFrames XML.

## 2. Boot sequence (exact)

ElvUI registers **no** VARS_LOADED/PLAYER_LOGIN handlers itself — boot rides the AceAddon-3.0 lifecycle (the engine *is* an AceAddon):

- `Initialize.lua:45`: `E = AceAddon:NewAddon(AddOnName, 'AceConsole-3.0', 'AceEvent-3.0', 'AceTimer-3.0', 'AceHook-3.0')`
- `Initialize.lua:46`: `E.DF = {profile={}, global={}}; E.privateVars = {profile={}}`
- `Initialize.lua:69-73`: builds the handle table and `_G.ElvUI = Engine`; at file scope all **24 core modules** are created via `E:NewModule(...)` (Initialize.lua:75-98).

**`ADDON_LOADED` → `E:OnInitialize`** (Initialize.lua:718-751): `PrepDB` → tooltip/EasyMenu setup → `E.PixelMode`/`E.Border`/`E.Spacing` → class/guid/serverID → `DisableAddons`, `CheckAddons`, `UIMult`, `UpdateMedia` → `E:InitializeInitialModules()` (skipped when Tukui is present) → minimap shape hook.

**`PLAYER_LOGIN` → `E:OnEnable`** (Core.lua:2026-2028) → **`E:Initialize()`** (Core.lua:2030-2100): `InitDB` → `CreateFonts` → `UIScale` → `LoadStaticPopups` → DualSpec → `LoadAPI` (2055) → `LoadCommands` (2056) → **`InitializeModules`** (2057) → `LoadMovers` (2058) → `E.Initialized = true` → first-run `E:Install()` if `not E.private.install_complete` (2074-2076) → version-mismatch popup → login message.

**Module queues** (Core.lua):
- `E:RegisterInitialModule(name, func)` :1965 → runs inside OnInitialize.
- `E:RegisterModule(name, func)` :1971-1980 → queues `{name, func}`; if `E.Initialized` already true, runs immediately (this is why late-loading plugins can register safely).
- Dispatch loop `E:InitializeModules()` :1989 → `E:CallLoadedModule` :1946 → resolves via `E:GetModule`, xpcalls `module.Initialize` through `E:CallLoadFunc` (:1941-1943). Every module file ends with `E:RegisterModule(LO:GetName())`.

**Post-init refresh:** `E:UpdateAll()` (Core.lua:1751-1796) re-applies everything with **staggered 0.02s `E:Delay` chains** (Layout → DataBars → DataTexts → Auras → ActionBars → NamePlates → Bags → Chat → Tooltip → Minimap → UnitFrames → Misc → `UpdateEnd`). Plugins hooking Update* must tolerate re-entry.

## 3. Data model & defaults layering

- `ElvDB` = AceDB instance seeded from `E.DF` (`E.Libs.AceDB:New('ElvDB', E.DF, true)`, Initialize.lua:664-682); `ElvPrivateDB` seeded from `E.privateVars`; `ElvCharacterDB` handled manually in `PrepDB` (:684-716).
- **`ElvUI[1..5]` are literally the defaults tables** (Initialize.lua:69-73):
  ```lua
  for i, k in next, { E, {}, E.privateVars.profile, E.DF.profile, E.DF.global } do Engine[i] = k end -- E, L, V, P, G
  ```
  `ElvUI[4]` *is* `E.DF.profile`, `ElvUI[5]` *is* `E.DF.global`, `ElvUI[3]` *is* the private defaults. Defaults files just assign into them (`P.general = {...}`). Locale (`ElvUI[2]`) is filled by Core.lua:3.
- **Layer semantics:** `P` = per-profile (bulk of config, transferable), `G` = per-account global (`E.global`), `V` = private per-account (`E.private`). Runtime rebinds on profile switch: `E:UpdateDB` (Core.lua:1645-1656) re-points `E.db = E.data.profile`, `E.global = E.data.global`, `E.private = E.charSettings.profile`, runs DB conversions + `SetupDB` (:650-661) which assigns `module.db = E.db.<section>` shortcuts.
- Merge utilities: `E:CopyTable(current, default, merge, shallow)` (Initialize.lua:465-480), `E:CopyDefaults` (:483), `E:RemoveDefaults` (:497). `P`/`G`/`V` top-level sections: P has `general, databars, bags, nameplates, auras, chat, datatexts, tooltip, unitframe, actionbar, cooldown`; G has `general, classtimer, chat, bags, datatexts, nameplates, unitframe (incl. aurafilters/aurawatch), profileCopy`; V has `general, bags, nameplates, auras, chat, skins, tooltip, unitframe, actionbar`.
- Movers persist **inside the profile**: `E.db.movers[name] = 'point,anchor,relPoint,x,y'` string (Movers.lua:34-39).
- Version-gated conversions: `E.db.dbConverted` stamp (Core.lua:1995-2008).

## 4. The `E` engine surface

**Events** — AceEvent mixins plus an ElvUI object-event bus on one shared frame `E.ObjectEventFrame` (Core.lua:1810-1822): `E:RegisterEventForObject(event, object, func)` :1855, `E:UnregisterEventForObject` :1881, `E:UnregisterAllEventsForObject` :1908, query helpers :1824/:1835. This lets many objects share one physical frame for unit events.

**Timers** — AceTimer via mixin, **but** `E:Delay(delay, func, ...)` (Math.lua:408-415) is deliberately *not* AceTimer: it wraps `C_Timer.After`, clamps ≥0.01s, returns no handle → **an UpdateAll chain cannot be cancelled**. Know which you're using.

**Math/format** (Math.lua): `E:Round` :214, `E:Clamp` :196, `E:ShortValue` :135, `E:GetFormattedText(style, min, max, dec, short)` :332 (style table :28), `E:FormatMoney` :453, `E:TextGradient` :159, `E:GetScreenQuadrant` :268, `E:GetXYOffset` :303, `E:AbbreviateNumbers` :102.

**Colors/media**: `E:ClassColor(token, usePriestColor)` (API.lua:273), `E:InverseClassColor` :318, quality colors :297/:305, color-table helpers (Core.lua:261-330) with `[1..4]` indexing compat. `E.media` (Core.lua:93, populated by `E:UpdateMedia` :351-405: `normFont`, `blankTex`, `normTex`, `glossTex`, `bordercolor`, `backdropcolor`, `rgbvaluecolor`...). `E.Media.{Fonts,Textures,Sounds}` from SharedMedia.lua; media consumed through LibSharedMedia handles.

**Fonts**: `:FontTemplate(fontName?, fontSize?, fontStyle?, skip?)` (Toolkit.lua:486) registers every FontString into `E.texts` for mass refresh; style strings encode extras (`'SHADOW…'`, Midnight `'…SLUG'` flag, Initialize.lua:588-592).

**Registry tables**: `E.frames`, `E.texts`, `E.statusBars` (Core.lua:94-98; `E:RegisterStatusBar` :676) — global sweeps for color/font updates. `E.valueColorUpdateFuncs` lets modules react to value-color changes (Chat and DataTexts register here).

**Coroutine batching**: `E:CoroutineUpdate(func, obj, data, finish, limit, delay)` (Core.lua:506) — chunked table iteration (default 100/frame-tick, 0.1s ticker, combat-safe). Used for full unitframe/bag refreshes. Never loop the whole registry synchronously.

**Slash commands**: `E:AddSlashCommand(name, keys, func)` (Initialize.lua:574-586) + `E:LoadCommands()` (Commands.lua:210-237): `ec/elvui`, `moveui/emove`, `kb`, `resetui/ereset`, `egrid`, `bgstats`, `edebug`, `estatus`, `efixdb`, `efixsnap`, `ehelp`, `in` (delayed), `guildlist/guildapply`.

**Static popups**: registry `E.PopupDialogs` (StaticPopups.lua:37, ~40 built-ins), four physical frames `ElvUI_StaticPopup1..4` (:1313-1330), show API `E:StaticPopup_Show(which, arg1, arg2, data, insertedFrame)` :822 with exclusive/cancels/reuse semantics; special dialogs via `E:StaticPopupSpecial_Show` :471.

**Incompatibility system**: `E.INCOMPATIBLE_ADDONS` (Core.lua:733-800 — Bartender4, Prat, Plater, OmniCC...) + `E:CheckIncompatible()` :809 → popup offering to disable either side.

## 5. Toolkit & pixel-perfect

- **Scale math** (PixelPerfect.lua): `E.perfect = 768 / E.physicalScreensHeight` (Core.lua:78); `E:UIMult()` :51 → `E.mult = E.perfect / E.global.general.UIScale` (UIScale default 0.64); `E:Scale(x)` :109-117 snaps any value onto the mult grid by modulo-floor; `E:UIScale()` :55-90 sets `UIParent:SetScale`, computes `E.eyefinity`/`E.ultrawide` (width ladders :23-49), resizes `E.UIParent`, defers during combat via `PLAYER_REGEN_ENABLED`.
- `E.Border = 1` (PixelMode) else 2; `E.Spacing = 0` (PixelMode) else 1 (Initialize.lua:727-728). `E.twoPixelsPlease` is hard-coded `false` "not supported" (:102) but still read in 4 places — a trap, never enable it.
- **Toolkit injection** (Toolkit.lua `E:AddAPI` :606-646) — every Frame/Texture/FontString gets these as methods: `:Size(w,h)`:170, `:Point(...)`:190 (auto-parent + auto-scale), `:SetInside`/:`SetOutside(anchor?, x?, y?, ...)` default offset `E.Border` (:267/:250), `:SetTemplate(template, ...)` :284 (`'Default'/'Transparent'/'ClassColor'/'NoBackdrop'`), `:CreateBackdrop` :367, `:CreateShadow` :400, `:Kill` :428 (reparents to `E.HiddenFrame`), `:StripTextures` :478 (hunts Blizzard named insets, list :20-45), `:StyleButton` :522, `:FontTemplate` :486, point inspectors (`:GrabPoint`/:`NudgePoint`) :201-237.
- Non-PixelMode fakes 2px borders by adding 1px `iborder`/`oborder` sibling frames inside SetTemplate (Toolkit.lua:321-349).
- Midnight-era guards: `E:NotSecretValue/NotSecretTable/NotSizeRestricted` (Toolkit.lua:81-86) — the 12.x client's "secret value" API is checked all over the codebase (chat, nameplates, oUF).

## 6. Movers

`E:CreateMover(parent, name, textString, overlay, snapOffset, postdrag, types, shouldDisable, configString, ignoreSizeChanged)` — Movers.lua:388-412 (all 10 args; `types` is a comma string gating which config modes show it; returns holder from `E.CreatedMovers[name]`). Sticky dragging via LibSimpleSticky; overlay flag picks strata `'DIALOG'` vs `'BACKGROUND'` (:275-279).

- Persistence: drag stop → `E:SaveMoverPosition(name)` :381 → `E.db.movers[name] = 'point,anchor,relPoint,x,y'` (rounded ints). Applied by `E:SetMoversPositions()` :497 on every `UpdateAll`; falls back to `E:GetMoverLayout(name)` :373 → `E.LayoutMoverPositions[E.db.layoutSet]` (Profile.lua:3677 — layout presets `ALL`, `dpsCaster`, `healer`, `anniversary`).
- Mode: `/moveui` → `E:ToggleMoveMode(which)` (Config.lua:79-119) shows labeled proxies + grid + `ElvUIMoverPopupWindow` (lock/reset/snap config, Config.lua:281-460); per-mover nudge via mouse wheel (`E:NudgeMover` Config.lua:247); reset single = Ctrl+RightClick, global = `/resetui` → `E:ResetUI` (Core.lua:1922) with confirm popup; `E:ResetMovers(arg)` (Movers.lua:473) wipes or name-matches.
- Extras: `E:DisableMover/EnableMover` :433/:453, `E:SetMoverSnapOffset` :261, `E:HasMoverBeenMoved` :369, `E:LoadMovers()` :518.

## 7. Cooldowns engine (shared by AB + UF + Bags + NP)

`General/Cooldowns.lua` (278 lines). One registry renders every cooldown text in the UI:

- `E:RegisterCooldown(cooldown, which, override, subgroup)` :230-278 — `which` ∈ `'global' | 'actionbar' | 'barN' | 'barPet' | 'stanceBar' | 'bags' | 'auraindicator' | aura containers...`; two indexes (`E.RegisteredCooldowns` per-cooldown, `E.CooldownByModule[which]` for bulk reapply); re-registration updates instead of duplicating.
- Settings resolve through `E:CooldownData` :210: `E.db.cooldown[which]` + optional override object + optional subgroup descent (UF/NP aura sub-settings).
- `E:CooldownUpdate` :89 applies fonts, colors (`edge/edgeCharge/edgeLOC`, swipe), textures (`E.Media.Textures.Edge/Edge2`), bling (`SetDrawBling`), reverse.
- Breakpoint ladder `E:CooldownBreakpoints` :140-176 from static `times` table :130-138: expiring `%.1f` → seconds @5 → secondsLong @10 → minutes → hours → days → years; per-key colors; `-1` thresholds remove entries. Formatter via `SetCountdownFormatter` + `SetBreakpoints` :179-192.
- Text region extracted by `E:CooldownRegion` :194 (`cooldown.Text = cooldown:GetRegions()`), styled in `E:CooldownText` :53 (`FontTemplate`, centered, offsets).
- Modern extras: `SetCooldownFromDurationObject` honored (modRate); charge cooldowns registered separately.

## 8. UnitFrames

Module `UF = E:GetModule('UnitFrames')` (UnitFrames.lua, 2461 lines), registered as an **initial** module (:2460). `UF:Initialize()` :2410 guards `E.private.unitframe.enable`, then `ElvUF:Factory(UF.Setup)` :2423 (factory defers to PLAYER_LOGIN): `UF.Setup` :2402 registers `UF.AfterStyleCallback`, `ElvUF:RegisterStyle('ElvUF', UF.Style)`, `SetActiveStyle`, `UF:LoadUnits()` :1598.

**Load queues** — unit files register themselves at file scope: `UF.unitstoload` (singles), `UF.unitgroupstoload` (arena/boss), `UF.headerstoload` (party/raid/tank/assist/raidpet). `LoadUnits` walks them.

**Per-unit file pattern** (see Player.lua): `UF:Construct_PlayerFrame(frame)` builds every element + `E:CreateMover` (Player.lua:59); `UF:Update_PlayerFrame(frame, db)` :62 sets `frame.db`, computes `UNIT_WIDTH / POWERBAR_OFFSET / CLASSBAR_YOFFSET / BOTTOM_OFFSET` (:66-94), then calls the **central dispatcher** `UF:ConfigureFrame(frame, 'player', 12 + db.castbar.height)` :101. `ConfigureFrame` (UF.lua:1444) runs `UF:Configure_<Element>(frame)` for every present element ("the order of these is sometimes very important", :1438), ends with `frame:UpdateAllElements('ElvUI_UpdateAllElements')` :1594 — that magic event bypasses the `isForced` guards inside oUF elements (health.lua:246 etc.). Dispatch by name: `UF['Construct_'..Title(unit)..'Frame']` (:452-460). Closures re-fetch `UF.db.units[unit]` **every call** because profile swaps replace the table (:914, :1385).

**Spawn**: `ElvUF:Spawn('player', 'ElvUF_Player', 'SecureUnitButtonTemplate, PingableUnitFrameTemplate')` (ouf.lua:825-832 — the third `overrideTemplate` arg is an ElvUI fork addition). Frames parented to `E.UFParent` hider; click attributes `*type1='target'`, `*type2='togglemenu'` (:336-337); Clique support via `ClickCastFrames` :375.

**Groups** (Groups/Raid.lua + machinery): `UF:CreateAndUpdateHeaderGroup(group, groupFilter, ...)` (UF.lua:1276) — multi-group (raid) = parent `SecureHandlerStateTemplate` Header with sub-headers from `UF:CreateHeader` → `ElvUF:SpawnHeader` (:1243); single-group (party/tank/assist) direct. Sort providers `UF.headerGroupBy` :133-179 (`CLASS/ROLE/NAME/GROUP/PETNAME/INDEX`); growth via `DIRECTION_TO_POINT` tables :181-272; `Configure_Groups` :950-1079 does attribute math, `SetAttribute('_ignore', true)` holds, and the `startingIndex` pre-spawn trick (:1025-1030, restore to 1 or "it spawns more buttons than it can show"). Visibility = `RegisterStateDriver(Header, 'visibility', db.visibility)` :1355. `UF.maxAllowedGroups` re-evaluated on `ZONE_CHANGED_NEW_AREA` (:1181).

**Update-all**: `UF:Update_AllFrames()` :868 → `UpdateAllHeaders()` → `E:CoroutineUpdate(UF.Update_UnitFrame, UF.units)` (slices of 100) → font/statusbar/template sweeps.

**Element map** (frame field ← builder, oUF element): `frame.Health` ← `Construct_HealthBar` (Elements/Health.lua:31; oUF health.lua:462; cascade color logic disconnected→tap→happiness→threat→class→selection→reaction→smooth), `frame.Power` ← Construct_PowerBar (Power.lua:63; detachable holder, text via tags), `frame.Castbar` ← Construct_Castbar (CastBar.lua:112; latency SafeZone :232, empower pips, interrupt colors), `frame.HealthPrediction` ← Construct_HealComm (HealPrediction.lua:38; `absorbStyle='REVERSED'` handling; Modern `SetupPredictionValues()` :110-117), `frame.ClassPower/Runes/Stagger/AdditionalPower/ThirdPower/Totems` ← ClassBars.lua:25+ (visibility via `UF.ToggleResourceBar` :399 which recomputes `CLASSBAR_SHOWN/HEIGHT/YOFFSET` and reconfigures Health/Portrait/Prediction), `frame.Auras/Buffs/Debuffs` ← Auras.lua:75/100/125 (non-Modern oUF element; Modern uses the `E:Auras_*` container API — see §11), `frame.AuraWatch` (oUF_Plugins/oUF_AuraWatch.lua:329; watched table from `E.global.unitframe.aurawatch[class]/GLOBAL/PET` or profile override; icons register `E:RegisterCooldown(button.cd, 'auraindicator')`), `frame.AuraBars` (oUF_AuraBars.lua:376; bar-per-aura, filtered from `oUF.AuraFiltered` cache), `frame.customTexts` (CustomText.lua:19 — user tag fontstrings via `frame:Tag(object, format)`), plus Portrait, Name, Threat, RaidIcon, RoleIcons, PVPIcon, Range (fader), FrameGlow, Cutaway, RaidDebuffs, AltPower, InfoPanel, ReadyCheck/Resurrection/Summon/Phase/Party indicators, Trinket. Raised stacking parent: `UF:CreateRaisedElement` :394.

## 9. The oUF fork (`ElvUI_Libraries/Game/Shared/oUF/`)

Load chain `oUF_Forever.xml` → `init.lua` (namespace + flavor flags `oUF.isClassic/TBC/Wrath/Cata/Mists/Forever/Retail`, `oUF.isModern = isRetail or isForever` :23-31; **secret-value API** `oUF:IsSecretValue/NotSecretValue/IsSecretUnit...` :61-72) → `ouf.lua` (core) → `events.lua`, `factory.lua`, `blizzard.lua`, `units.lua`, `colors.lua`, `elements/*`, plus **`auraskip.lua`** (fork-only, see below).

- **Element registry**: `oUF:AddElement(name, update, enable, disable)` (ouf.lua:1064). `frame:EnableElement(name, unit)` :119 runs `element.enable`, pushes `element.update` into `frame.__elements`. On spawn (`walkObject`→`initObject` :293-390) **all registered elements are enabled**, then style callbacks run — which is exactly why `UF.AfterStyleCallback` exists (UF.lua:2364: oUF enables elements *after* the style function; ElvUI needs a post-pass for aura container show/hide).
- **Update fanout**: `frame:UpdateAllElements(event)` :226 — PreUpdate → every `__elements` update → PostUpdate.
- **Event delegation**: `frame:RegisterEvent(event, func, unitless)` (events.lua:105) chains multiple handlers per event via `event_metatable.__call` :86-92; unit events re-register on unit change via `Private.UpdateUnits` :36-78. Dispatch `OnEvent` :80: **`if(self:IsVisible()) then ... end` — hidden frames receive no events at all** (core perf stance).
- **Eventless units** (`*target` family): stock oUF uses a generic OnUpdate; ElvUI overrides with `UF:HandleEventlessUnit` (UF.lua:1721) — segmented throttles: 0.1s base / 0.2s resource / 0.4s prediction / 0.5s secret / 0.6s aura, full refresh only on GUID change (:1649-1730).
- **Aura skip layer** (`auraskip.lua`): Modern `UNIT_AURA` payloads are processed incrementally — per-filter caches `oUF.AuraFiltered[filter][unit]` built from `C_UnitAuras.IsAuraFilteredOutByInstanceID`, `TryAdded/TryUpdated/TryRemove`, and gate `oUF:ShouldSkipAuraUpdate(frame, event, unit, updateInfo, showFunc)` :239. Elements (Auras, AuraBars, AuraWatch) pass a `showFunc` and skip everything when no relevant aura changed. This is the single most important Modern-era perf design in the fork.
- **Fork fingerprints** (how to tell fork code from upstream): `-- ElvUI block/changed/adds` comments (castbar.lua ×8, runes.lua, power.lua, additionalpower.lua), `Spawn(unit, overrideName, overrideTemplate)` third arg (ouf.lua:825), `'ElvUI_UpdateAllElements'` bypasses, tag engine extensions (§10), `SpawnNamePlates` driver (ouf.lua:1029, used by NP), secret-value wrappers.

## 10. Tag engine

**Public API** (Game/Shared/Tags/API.lua):
- `E:AddTag(tagName, eventsOrSeconds, func, block, spells)` :91 — second arg is either an **event string** (space-separated WoW events; `UNIT_HEALTH_FREQUENT` auto-swaps to `UNIT_HEALTH` on classic, :97) or a **number** = OnUpdate throttle seconds (`Tags.OnUpdateThrottle`). `spells` whitelists spellIDs so `UNIT_AURA`-driven tags can react to specific auras (:109-113). After initial load, redefining a tag hot-refreshes parsed tag strings (`Tags:RefreshEvents/RefreshMethods` via `RefreshNewTags` :441).
- `E:AddTagInfo(tagName, category, description, order, hidden)` :72 → `E.TagInfo` (options browser).
- Real examples: `E:AddTag('absorbs', 'UNIT_ABSORB_AMOUNT_CHANGED', fn)` (Modern.lua:26); `E:AddTag('health:%s', 'UNIT_HEALTH UNIT_MAXHEALTH UNIT_CONNECTION PARTY_MEMBER_ENABLE PARTY_MEMBER_DISABLE', fn)` (Shared.lua:118); throttled `E:AddTag('statustimer', 1, fn)` (Shared.lua:499); `E:AddTag('distance', 0.1, fn)` :939.

**Engine** (in the fork: `oUF/elements/tags.lua`, 1147 lines):
- Syntax: `[tag]`, `[>literal <literal]` prefixes/suffixes, custom args `[tag{args}]` (:995-1001), `[mouseover]` (alpha-0 fontstrings tracked in `__mousetags`, shown by `UF:UnitFrame_OnEnter` :426).
- **Compile & cache**: `GetTagFunc(tagstr)` :738 converts a tag string once into a format string + bracket function list; caches `tagStringFuncs`/`bracketFuncs`. Tag funcs run in a sandboxed env (`_ENV`/`_PROXY` :141-193) with helpers exposed as `E.TagFunctions` (GetClassPower, Abbrev, NameHealthColor...).
- **Dispatch**: per-frame hidden handler frames (`eventHandlers`) `RegisterUnitEvent` per unit; events are **debounced through a 0.2s timer** (`eventTimerThreshold` :788, floor 0.05, tunable via `E:TagUpdateRate`) → merged → `fs:UpdateTag()` only `if fs:IsVisible()` (:823). Unit-mismatch guard `ShouldUpdateTag` :799.
- **Timers**: eventless/throttled tags share one hidden frame per interval (`RegisterTimer` :948).
- Wired into frames via oUF meta methods `frame:Tag(fs, tagstr)` / `frame:Untag(fs)` / `frame:UpdateTags` (:1144).

## 11. Nameplates

`NP = E:GetModule('NamePlates')` (Nameplates.lua, 1177 lines + `Elements/` + `Plugins/`). **Nameplates run on the oUF fork too, not on Blizzard templates**: `ElvUF:RegisterStyle('ElvNP', NP.Style)` :1098, player plate `ElvUF:Spawn('player','ElvNP_Player','')` :1107, then `ElvUF:SpawnNamePlates('ElvNP_')` :1156 — the fork's plate driver mixin wires `SetTargetCallback/SetAddedCallback/SetRemovedCallback` → `NP.PLAYER_TARGET_CHANGED / NAME_PLATE_UNIT_ADDED / NAME_PLATE_UNIT_REMOVED` :1158-1160.

**⚠ Breaking change vs all older literature: the Style Filter engine is GONE.** `rg StyleFilter` across `ElvUI/` + `ElvUI_Options/` returns nothing (only CHANGELOG history: "settings with style filters gone now"). The v14+ replacement is:
1. **Grouped aura filters** shared with UnitFrames: per-plate-type `E.db.nameplates.units[TYPE].{buffs,debuffs,auras}.filterLists['group1'..'group8']` (8 groups, `E.filterMax = 8`, Initialize.lua:103 "midnight filter group count"). Group fields: `enable, filter, useAllowlist/allowList, useBlocklist/blockList, maxDuration, candidates` — candidates are the `E.AuraCandidates` booleans (`canApplyAura, isBossAura, isFromPlayerOrPlayerPet, isStealable, isPriorityAura, ...`).
2. **Native AuraContainers** (Modern): `NP:AuraContainer_ConstructFilters()` (NP Elements/Auras.lua:193) compiles via `UF:GroupFilters` (UF Auras.lua:283); matching happens engine-side through `container:AddAuraGroup(key, filter, group)` + `SetAuraGroupCandidateFilters` (Auras/Containers.lua:696-742). Legacy path still has `NP.AuraFilter` :966 delegating to `UF.AuraFilter` (returns `pass, priority`).
3. The old user-facing trigger→action rule tables (scale/color/visibility per name/aura/health conditions) **do not exist in this tree**. If porting the *idea* of style filters, model it on the new grouped-filter data + container API.

**Plate lifecycle**: `NAME_PLATE_UNIT_ADDED` :769 caches unit facts (classification, reaction, npcID/GUID) → `NP:UpdatePlateType` :724 sets `frameType` ∈ `PLAYER/FRIENDLY_PLAYER/FRIENDLY_NPC/ENEMY_PLAYER/ENEMY_NPC` → `UpdatePlateSize` :745 → `AuraContainer_SetActive` :814 → reparent Blizzard `SoftTargetFrame`/`WidgetContainer` :818-833. Full element reconfig (`NP:UpdatePlate` :422, `Update_Tags/Health/.../ClassPowerTwo` :440-454) runs **only when frameType changes** — the per-plate throttle. `NP:DisablePlate` :462 handles `nameOnly` mode. Static player plate + secure click-catcher `ElvNP_StaticSecure` :1116-1129.

**Aura containers (Modern)**: 40 plate tokens × 5 plate types × 3 containers preallocated (`PLATETOKENS=40`, NP Auras.lua:12), warmed by coroutine preloader `E:CoroutineUpdate(NP.AuraContainer_Preloader, ..., 1, 0.3)` (Nameplates.lua:664 — deliberately slow, comment says ~3 min budget). Aura refresh gated by a `FAKE_REFRESH_AURAS` one-shot + `nameplate.allowAuraUpdate` :978-986.

Elements per plate mirror UF (Health, HealthPrediction, Power, Castbar, Portrait, ClassPower + TargetClassPower separate frame, ThreatIndicator, TargetIndicator, QuestIcons, RaidTargetIndicator, Highlight, Cutaway, PvP indicators) built in `NP:StylePlate` :371-401 with a fixed frameLevel ladder (:303-325). CVars written constantly (`NP:SetCVars` :183, combat regen toggles :245/:250, environment conditionals :560).

## 12. ActionBars

`AB = E:GetModule('ActionBars')` wraps **LibActionButton-1.0** (`E.Libs.LAB`, ActionBars.lua:68):

- **Bars**: `AB.barDefaults` :87-101 defines bar1-10 (+13-15 non-Modern extras) with `page`, `bindButtons`, default position. `AB:CreateBar(id)` :412 → `SecureHandlerStateTemplate` frame → 12 × `LAB:CreateButton(i, 'ElvUI_BarNButtonI', bar)` :437 → per-bar Masque group :419 → `E:CreateMover(bar, 'ElvAB_'..id, ...)` :516. Init order :1981-2060 (bind globals → enable guard → 9 LAB callbacks :1994-2002 → fade parent `Elv_ABFade` → `DisableBlizzard()` → micro bar → CreateBar 1-10, 13-15 → pet/stance/vehicle-leave → `UpdateButtonSettings` → keybinder).
- **Paging**: bar1 condition string built :103-107 (`[overridebar] 14; [vehicleui][possessbar] 12; [shapeshift] 13; [bar:2] 2; ... [bonusbar:5] 11;`), per-class user paging appended in `AB:GetPage` :784 → `RegisterStateDriver(bar, 'page', page)` :330 → `_onstate-page` handler :497-514 maps states via `button:SetState(k, 'action', (k-1)*12+index)`; vehicle slot gets `AB.customExitButton` :109-119. Visibility also via state drivers :396-407. Global fade conditions (combat/cast/target/vehicle...) via `FadeParent_OnEvent` :993-1012.
- **Button config**: `AB:UpdateButtonConfig` :1391 → `button:UpdateConfig(config)` :1510 (hotkey/count/macro text fonts+colors, range/mana coloring, `outOfRangeColoring`, `clickOnDown` from `ActionButtonUseKeyDown` CVar :1482). Cooldown text: `E:RegisterCooldown(button.cooldown, 'barN')` :856; desaturation-on-CD via GCD probe :1741-1767.
- **Keybind mode** (Bind.lua): overlay frame `ElvUI_KeyBinder` :39; `AB:ActivateBindMode` :42; hover resolves `bindstring` per class of button (FLYOUT/SPELL/MACRO/MICRO/BAG/command-range math, :171-251); `AB:BindListener(key)` :83 writes `SetBinding(...)`; save/discard `DeactivateBindMode` :54 (`SaveBindings/LoadBindings`); per-character toggle :380-395. Bars get `SetOverrideBindingClick` :632.
- **MicroBar**: reparents Blizzard micro buttons into `ElvUI_MicroBar` :461-480 with a custom atlas sheet (`E.Media.Textures.MicroBar` + `AB.MICRO_OFFSETS` :43-62), visibility state-driver proxy :283, sorting overrides :303-310.
- **Pet/Stance/Extra/Totem**: PetBar reuses `PetActionButton1..10` with full manual refresh (`AB:UpdatePet` :28); StanceBar creates `StanceButtonTemplate` buttons on demand :186-231; ExtraAB reparents `ExtraActionBarFrame`/`ZoneAbilityFrame` (combat-deferred :193-200); TotemBar wraps `MultiCastActionBarFrame` with right-click-destroy attribute :420.
- **Taint mine**: `AB:DisableBlizzard` :1300 (untaint tables :1227-1248, `ActionBarButtonEventsFrame.RegisterFrame` hook, SettingsPanel.OnHide replacement, `StatusTrackingBarManager:Kill()`). Every layout change funnels into `Needs*` flags applied on `PLAYER_REGEN_ENABLED` :521-565 — new option callbacks must follow the same combat-deferred pattern.

## 13. Bags

`B = E:GetModule('Bags')` (Bags.lua 3938 lines + Sort.lua 1089 + BagBar.lua 438):

- **Frames**: `ConstructContainerFrame('ElvUI_ContainerFrame'[, isBank])` :2446 — `f.BagIDs` per container set (:297-327), sort/stack/bags buttons, search editBox (`C_Container.SetItemSearch` engine-side filtering :444), currency row, vendor-grays button, Modern bank tabs + warband toggle. Slots: `B:ConstructContainerButton` :2781 inheriting Blizzard templates; **taint workaround**: `slot.SlotID = slotID` — never name the field `slotID` ("taints since DF prepatch in ContainerFrameItemButtonMixin:GetBagID()", :2798). Item level overlay eligibility :533/:687 (equipment-classified equipLoc OR hunter ranged; rarity > 1; threshold).
- **Group sections = Blizzard bag-slot flags**, not ElvUI's own classifier: `B.GearFilters` :159-215 maps `Enum.BagSlotFlags` → EQUIPMENT/CONSUMABLES/TRADE_GOODS/JUNK/QUEST/REAGENTS; read via `C_Container.GetBagSlotFlag` :1143, written via right-click flags menu :1116; holder borders colored per assignment (`B.AssignmentColors`). Physical split layout + profession auto-split colors in `B:Layout` :1284-1447.
- **Sort engine** (Sort.lua): cache keyed `B:Encode_BagSlot = bag*100 + slot` :493; scan fills qualities/stacks/maxStacks/petIDs :525. Target order `B.Sort` :699 walks slots forward issuing `B:AddMove` (:520, `EncodeMove = source*10000 + target` :506) with a **fixed-point retry** for locked/pending slots. Comparator `DefaultSort` :286: pets → same-ID stack merging → rarity desc (conjured pinned -99) → item class → equipLoc order → subclass → `PrimarySort` (ilevel/price/name). Compaction `B.Stack` :631 (deposit forward / withdraw backwards), placement `B.Fill` :779 with `B:CanItemGoInBag` :590 (assignment class + specialty-bag family checks). Driver `B.SortBags` :819: per specialty type Stack→Fill→Sort, then normal bags. **Move executor**: hidden `SortUpdateTimer` frame OnUpdate every `WAIT_TIME` 0.1s (`B:DoMoves` :953 → `PickupContainerItem` + `PickupItem`, split-overflow :935-937; guild bank 0.6s delay; stuck-move recovery `MAX_MOVE_TIME=1.25` + 100 retries; combat abort). All user entry points pass through `B:CommandDecorator` :1056 to serialize against the timer.
- **Event hygiene**: listeners register only while a container frame is shown (`Container_OnShow/OnHide` :3045/:3052); the `presistentEvents` whitelist :302-309 stays registered while closed — miss this and closed-bag state silently drifts; bank catch-up via `staleBags` :3430.
- **BagBar** :300 reparents Blizzard bag buttons (backpack + 4 + reagent + keyring), own mover, `BAG_SLOT_FLAGS_UPDATED` reskin.

## 14. Chat

`CH = E:GetModule('Chat')` (Chat.lua, 4234 lines). The most hook-heavy module — effectively a managed sandbox around Blizzard chat:

- **Docking = snapping, not reparenting**: `CH:PositionChats()` :1620 sizes the Layout panels, `CH:FindChatWindows()` :1389 picks left/right candidates via `E:FramesOverlap` (persisted `panelSnapLeftID/panelSnapRightID`), matched frames get hard-anchored to the panel (:1605/:1611) and the dock manager re-parented :1580-1587. Re-snap hooks on `EditModeManagerFrame.UpdateLayoutInfo` and FCF functions :4117-4133.
- **Message pipeline replaced**: every non-ignored frame gets `SetScript('OnEvent', CH:FloatingChatFrame_OnEvent)` :2721 — a **hand-maintained partial copy** of Blizzard's handler feeding ElvUI's own ~260-line message pipeline (:2266, formatter :2103, class colors :1938, role icons, tab flash). Blizzard's `ChatFrameMixin.OnEvent` is never used for those frames (drift risk on new events). `SETTINGS_LOADED` deliberately unregistered ("taints: preventing linking achievements" :2720).
- **AddMessage override**: `chat.AddMessage = CH.AddMessage` :2714 — "usually taints, but LibChatAnims should make sure it doesn't" (:2712). Wraps timestamps (`|Helvtime|h`) and copy-lines (`|Hcpl:<frameID>|h`) links.
- **Copy**: per-frame copy button :1105-1121 → `CH:CopyChat(frame)` :1214 → `GetLines` :1198 (secret-guard `MessageIsProtected`, icon stripper, re-colorizer) → 700×200 editbox popup :3684. Per-line copy via `cpl` hyperlinks dispatched in an `ItemRefTooltip.SetHyperlink` override :1794-1805 (same dispatcher handles `url` and `squ` links; `elvtime` links must be skipped or timestamps open tooltips).
- **URLs**: message filters on 21 `CHAT_MSG_*` events :4177 via 5 gsub patterns (:1701-1713) → `|Hurl:...|h` links → click inserts into send box.
- **History**: `ElvCharacterDB.ChatHistoryLog` — packed rows: args `[1..18]`, `[50]=event`, `[51]=E:GetDateTime`, `[52]=coloredName`, `[53]=battleTag` :3082-3089 (index convention is load-bearing), capped at `historySize` (default 100). Replay `CH:DisplayChatHistory` :2990 re-feeds rows through the normal handler. Editbox history separate (`ChatEditHistory`, secure-command blocklist :189-193; Blizzard's `AddHistoryLine` intentionally bypassed :1087).
- **Scroll/fade**: OnMouseWheel handler locked with `hooksecurefunc(chat, 'SetScript', ...)` :2725 so Blizzard can't replace it; shift=page, alt=line, else `numScrollMessages`; auto-return timer `scrollDownInterval`.

## 15. Tooltip

`TT = E:GetModule('Tooltip')` (Tooltip.lua, 1333 lines). Anchor policy `TT:GameTooltip_SetDefaultAnchor` :132-192 (SecureHooked onto the global :1278): combat/actionbar visibility gates with mod-key overrides, health-bar reposition, `cursorAnchor` (SetOwner with type+offsets) vs anchored-to-mover (screen quadrant + `E.InversePoints`), bag-anchoring option. Hook set :1250-1331: Modern `TooltipDataProcessor.AddTooltipPostCall` for Spell/Macro/Item/Unit + `AddLinePreCall(LINETYPE_SELLPRICE)`; legacy fallbacks via OnTooltipSet* scripts. Unit resolution `TT:GetUnitToken` :696 (GUID → token → mouseover). Extra info lines are mod-key gated (`TT:IsModKeyDown` :114): spellID/auraID/currencyID/questID/battlePetID lines, item count (bag/bank/stack), sell-price rewrite :1229, target/role/mythic+ lines, inspect ilvl with `INSPECT_READY` :414. Styling hook for other addons: `TT:SetStyle(tt, _, isEmbedded)` :945.

## 16. Skins

`S = E.Skins` (Skins.lua, 2382 lines). Registry + widget kit:

- **Registration**: `S:AddCallback(name, func, position, toggle)` :2244 (queues into `S.nonAddonsToLoad`, fired at `S:Initialize`); `S:AddCallbackForAddon(addonName, name, func, forceLoad, bypass, position, toggle)` :2233 → both funnel into `S:RegisterSkin` :2267-2313 which stores `S.addonStorage[key] = info` (info.data = per-skin function table) and queues. `toggle` string gates against `E.private.skins.blizzard[toggle]`; **a plugin needing a custom gate must pass a `check` function or the skin silently no-ops** (:2256-2262). `bypass=true` allows firing before `E.Initialized`.
- **Firing model**: there is **no generic "on frame created" hook** — the trigger is `S:ADDON_LOADED` :2214-2223 (drops skins unless `bypass` before init) plus, inside each skin file, `hooksecurefunc` on Blizzard update functions to catch dynamically created children (e.g. Mail.lua hooks `SendMailFrame_Update`).
- **Load safety**: skins run through `E:CallLoadFunc` = xpcall with `E.ErrorHandler` — a broken skin never breaks load.
- **Handle\* inventory** (the widget kit — exact names): HandleButton (13 params :908), HandleCheckBox :1595, HandleRadioButton :1655, HandleSliderFrame :1870 / HandleStepSlider :1907, HandleEditBox :1411, HandleDropDownBox :1444, HandleScrollBar :1014 / HandleTrimScrollBar :1124, HandleTab :1183, HandleLargeSideTab :1231, HandleFrame :233, HandlePortraitFrame :285, HandleInsetFrame :269, HandleIcon :1715, HandleItemButton :1723, HandleIconBorder :745, HandleCloseButton :1769, HandleNextPrevButton :1792, HandleMaxMinFrame :1344, HandleCollapseTexture :2064, HandleBlizzardRegions :1392, HandleStatusBar :1502, HandleRotateButton :1294, HandleIconSelectionFrame :1971, plus SetModifiedBackdrop/StaticPopup handlers/UIWidget skinners (`S.WidgetSkinningFuncs` keyed by `Enum.UIWidgetVisualizationType` :2182-2204). All idempotent via `IsSkinned` flags.
- **Ace3 skinning** (Ace3.lua, 712 lines): hooks **`LibStub.NewLibrary` itself** (:711). On new lib, `S:HookAce3` :608 (version gates: AceGUI minor ≥ 36, AceConfigDialog ≥ 76) nils `RegisterAsWidget/RegisterAsContainer` and installs a metatable whose `__newindex` (:563-596) wraps future registrations — skin, then call original. Dispatch by `widget.type` (:195-384) and container class (:461-519); TreeGroup `childGroups == 'ElvUI_HiddenTree'` special case collapses the tree pane :406-416 (the options root depends on this — see §18). Pre-existing widgets captured by walking `UIParent:GetChildren()` into `S.EarlyAceWidgets` and replayed at init.

## 17. DataTexts

`DT = E:GetModule('DataTexts')` (DataTexts.lua, 1136 lines):

- **Exact registration signature** (DataTexts.lua:1088 — verified):
  `DT:RegisterDatatext(name, category, events, onEvent, onUpdate, onClick, onEnter, onLeave, localizedName, objectEvent, applySettings)`
  - `events`: table **or** `', '-delimited` string (:1097); a function errors by design (:1094).
  - `objectEvent`: routes events through `E:RegisterEventForObject` (:478).
  - `applySettings(dt, hex)`: runs before first update and on every value-color change (:491).
  - Events listed in `DT.UnitEvents` (:66-77) are registered as `RegisterUnitEvent(..., 'player')`; `MODIFIER_STATE_CHANGED` is special-cased to register only while hovered (:107-109).
  - Stored in `DT.RegisteredDataTexts`; seeds `G.datatexts.settings[name] = {}` (:1129).
- **Panels/slots**: built-ins registered by Layout (`LeftChatDataPanel` 3 slots, `RightChatDataPanel` 4, `MinimapPanel` 2, Layout.lua:364-467); custom panels via `DT:BuildPanelFrame(name)` :325 (frame pool + own mover, configLoc `'datatexts,panels'`). db shape: `E.db.datatexts.panels.<Panel> = {enable, backdrop, ..., 'DT1', 'DT2', 'DT3'}` — **the array part is the slot assignment**. Battleground overrides via `battlePanel`.
- **Assignment/wiring**: `DT:UpdatePanelInfo` :561 creates slot buttons (`<Panel>_DataText<i>` with `.text/.icon`), `DT:AssignPanelToDataText` :462 registers events + kicks with fake `'ELVUI_FORCE_UPDATE'` event + pre-seeds OnUpdate with `data.onUpdate(dt, 20000)`; teardown `DT:CleanPanel` :161. OnUpdate DTs self-throttle (System.lua updates text 1×/s :273-304).
- **Quick-assign menu**: ALT+hover a slot (`DT:QuickDTMode` :81) → menu → `DT:MenuSetItem` :990 writes the profile slot + refreshes. LDB objects are auto-bridged as datatexts (`DT:SetupObjectLDB` :351).

## 18. Options (`ElvUI_Options`)

- **Load-on-demand**: `E:ToggleOptions` (Config.lua:1619-1647) does `EnableAddOn` + `LoadAddOn('ElvUI_Options')`; version cross-check popup on mismatch.
- **Root table created by the engine, not the options addon**: `E.Options = {type='group', args={}, childGroups='ElvUI_HiddenTree', get=E.noop}` (Initialize.lua:47). The options addon registers it: `AceConfig:RegisterOptionsTable('ElvUI', E.Options)` + `ACD:SetDefaultSize` (ElvUI_Options/Core.lua:186-188).
- **DSL**: `LibAceConfigHelper` (`ACH`) — `ACH:Group(name, desc, order, childGroups, get, set, disabled, hidden, func)`:60, `ACH:Toggle`:94, `ACH:Select/MultiSelect`:76/85, `ACH:Range`:112, `ACH:Execute`:51, `ACH:Input`:68, `ACH:Color`:35, `ACH:Header/Description/Spacer`, `ACH:SharedMediaFont/Sound/Statusbar/Background/Border`:141-158, `ACH:FontFlags`:161.
- **How a module adds its section** (the exact pattern): at options-file load, `E.Options.args.<module> = ACH:Group(...)` — e.g. General.lua:59, UnitFrames.lua:1225, Nameplates.lua:395. `load.lua` runs **last** (`EP:OptionsLoaded()` + `E:ExecuteOptions`), deliberately, for ClassicHC load limits.
- **Window chrome is custom** around AceGUI: `E:ExecuteOptions(msg)` (Config.lua:1419-1617) hooks `AceConfigDialog.Open` :1424 and decorates the frame — left nav buttons from `E.Options.args` (`E:Config_CreateLeftButtons` :1057), top/bottom holders, resize (persisted `E.global.general.AceGUI.width/height`). Navigation quirk: groups registered after load without `order` get forced to 6 unless present in the frozen snapshot `E.OriginalOptions` (Tags.lua:72-74).
- **Search**: `Search.lua` recursively walks `E.Options.args` (skipping `blockOption` set :26-34), matches stripped names + select values, caches results, renders jump-buttons that call `ACD:SelectGroup('ElvUI', ...)` :77-81. "What's new" mode matches `E.NewSign`.
- **Profiles tab** (Core.lua:390-411): AceDBOptions tables for `E.data`/`E.charSettings`, DualSpec enhancement, Distributor share buttons :392-395, ModuleCopy tab :893-917, ModuleReset tab :919-932 (`E.db[key] = CopyTable(P[key])`).
- **Filter editor** (Filters.lua): create/select/delete/reset over `E.global.unitframe.aurafilters`, per-spell aura-ID inputs, auraIndicator group, AuraBar colors / Aura Highlight / raid-debuff priority groups; all setters call `UF:Update_AllFrames()`.

## 19. Profiles & Distributor

`D = E:GetModule('Distributor')` (Distributor.lua, 712 lines; AceComm). Four `profileTypes`: `profile | private | global | filters` (:35-40).

- **Export** `D:GetProfileData` :442 → copy live table → `E:RemoveTableDuplicates(data, P/G/V, D.GeneratedKeys.*)` (strip defaults/generated, table :99-137) → `E:FilterTableFromBlacklist(data, D.blacklistedKeys.*)` :47-96 → `C_EncodingUtil.SerializeCBOR` :12 → wrap `type::key` → `C_EncodingUtil.CompressString(Deflate)` :19 → `EncodeBase64` → prefix **`!E2!`**. Alternate formats: `luaTable`, `luaPlugin` (:493-497). Import `D:Decode` :527 (detects `!E2!` / `{` / rejects legacy `!E1!`), `D:SetImportedProfile` :580 per type (profile → AceDB SetProfile + rename popup; private → reload popup; global → CopyTable + UpdateAll; filters → aurafilters/aurawatch + UpdateUnitFrames).
- **Live send**: opt-in `E.global.general.allowDistributor` both ends; `D:Distribute(target, otherServer, dataKey)` :182 → REQUEST/REPLY/TRANSFER/COMPLETE prefixes (:27-31) over WHISPER or RAID/PARTY/INSTANCE_CHAT; receiver gets accept popup (`DISTRIBUTOR_RESPONSE`), progress bar, confirm/rename popup, acks.
- **Plugins must extend `D.GeneratedKeys`** if they add generated settings — otherwise exports balloon and imports clobber (gotcha #6 from the options audit).

## 20. Install wizards

- **Core** (`E:Install()`, Install.lua:1463): hardcoded 9-page if-chain (`E:SetPage` :1253-1444): Welcome → CVars (`E:SetupCVars` :168) → Chat setup → Profile select → Layout (`anniversary|tank|healer|dpsCaster`) → Theme → UI Scale slider → Auras → Finish (`E.private.install_complete = E.version; ReloadUI()`). Step banners via `InstallStepComplete`.
- **Plugin wizard**: `E:GetModule('PluginInstaller'):Queue(addon)` (PluginInstaller.lua:423) with table shape `{Title, Name, tutorialImage, Pages = {fn,...}, StepTitles, ...}` (:1-56); `PI:RunInstall` :454 **refuses to run** until core install is complete and while the core frame is shown — plugin steps queue behind core.

## 21. Plugin system — the real anatomy

LibElvUIPlugin-1.0 (MINOR 49): `EP = E.Libs.EP`, comm prefix `'ElvUIPluginVC'`.

- `EP:RegisterPlugin(name, callback, isLib, version)` (:107-152): requires the addon be loaded; version from TOC metadata; first registration registers the addon-message prefix + version-check events. If ElvUI_Options is already loaded, callback runs immediately; otherwise it fires at `EP:OptionsLoaded()` (called from options `load.lua`) — **this callback is the options-injection point**.
- Version check: plugins' `name=version;` concatenated, chunked at 250 chars, 1s spacing, over RAID/INSTANCE/PARTY/GUILD; receiver compares via `StripVersion` (folds `8.1.5.0015` → `8150015`), prints outdated notices once per session.
- `EP:HookInitialize(tbl, func)` :312 — plugin init deferred until after `E:Initialize` via `hooksecurefunc(E, 'Initialize', ...)`.
- **Minimal full anatomy** (per the code):
  ```lua
  -- TOC: ## RequiredDeps: ElvUI
  local E, L, V, P, G = unpack(ElvUI)
  local MyPlugin = E:NewModule('MyPlugin', 'AceHook-3.0', 'AceEvent-3.0')
  function MyPlugin:Initialize() ... end
  -- file scope (enqueue-only, safe anytime):
  DT:RegisterDatatext(...)          -- optional
  S:AddCallbackForAddon(...)        -- optional
  V.myplugin = {...}; P.myplugin = {...}   -- defaults
  E:RegisterModule('MyPlugin')      -- queues init
  LibStub('LibElvUIPlugin-1.0'):RegisterPlugin('MyPlugin', function()
      E.Options.args.myplugin = ACH:Group(...)   -- options injection
  end)
  -- optional: E:GetModule('PluginInstaller'):Queue{...}
  -- optional: profile-copy via E.global.profileCopy.myplugin + MC:CreateModuleConfigGroup('MyPlugin', 'myplugin', 'myplugin')
  ```

## 22. Flavor system

- Booleans (Initialize.lua:105-136): `E.Retail/Classic/TBC/Cata/Wrath/Mists/Forever` from `WOW_PROJECT_ID`; `E.Modern = E.Retail or E.Forever`; season flags `E.ClassicSOD/HC/Anniv`; `E.IsGamepadActive`. oUF mirrors its own (`oUF.isModern`).
- **"Secret values"** (Midnight 12.x): the client returns protected-value objects for names/GUIDs/colors; ElvUI centralizes guards (`E:IsSecretValue/NotSecretValue`, `oUF:IsSecretUnit`, chat `MessageIsProtected`) — any new code touching unit identity must route through them.
- Per-flavor overlays add modules/DataTexts/Skins/Filters under `Game/<Flavor>/`; shared code must stay flavor-agnostic (capability booleans guard the rest).

## 23. Cross-cutting gotchas (consolidated)

1. **Combat lockdown discipline**: every layout/config change funnels into `Needs*` flags applied on `PLAYER_REGEN_ENABLED` (AB :521-565, NP, Movers, options `E:ToggleOptions` defers). Copy this pattern or taint.
2. **Hidden frames get no events** (oUF OnEvent gate) and **invisible fontstrings don't update** (tag engine) — visibility-gating is the core perf stance.
3. **`E:Delay` returns no handle** — can't cancel; use AceTimer `ScheduleTimer` when cancellation matters.
4. **Profile swaps replace tables** (`E.db.units[x]` etc.) — always re-read per call; `SetupDB` re-points `module.db` on switch.
5. **Taint mines**: `slot.SlotID` naming (Bags :2798), `chat.AddMessage` replacement (needs LibChatAnims), AB `DisableBlizzard` untaint tables, vehicle-leave button script removals, `SETTINGS_LOADED` unregister. Don't "simplify" these.
6. **SV bloat**: `E.db.movers` grows per mover; exports strip defaults via `D.GeneratedKeys`/`blacklistedKeys` (extend them for new generated keys); chat history caps exist for a reason.
7. **Order-sensitive construction**: UF element construct/configure order matters (`PowerPrediction` after `Power`; `ToggleResourceBar` reconfigures Prediction); `ConfigureFrame` comment: "the order of these is sometimes very important".
8. **Skins are ADDON_LOADED-driven** — no generic frame-create hook; dynamic children need hooksecurefunc on the Blizzard update functions.
9. **Options timing**: `E.Options.args` is empty until ElvUI_Options LOD-loads; plugin options go in the `EP:RegisterPlugin` callback, never at raw file scope.
10. **Named magic events**: `'ElvUI_UpdateAllElements'` (bypasses isForced), `'ELVUI_FORCE_UPDATE'` (DT kick), `'QuickDTMode'`.
11. **Style filters are gone** (v14+) — don't build on tutorials referencing `NP.StyleFilter*`/`ElvDB.filters` shapes; use grouped `filterLists` + AuraContainers.
12. **`E.twoPixelsPlease`** is a loaded gun that's welded false. Leave it.

## 24. Key file index (fast navigation)

| Path | Lines | Role |
|---|---|---|
| `ElvUI/Game/Shared/General/Initialize.lua` | ~760 | engine creation, handles, module objects, OnInitialize/PrepDB/InitDB |
| `.../General/Core.lua` | ~2100 | lifecycle, module queues, UpdateAll, colors, coroutine, incompat |
| `.../General/API.lua` | ~1600 | class colors, spell info, scan-tooltip helpers |
| `.../General/Toolkit.lua` | ~650 | AddAPI frame kit, SetTemplate, fonts |
| `.../General/PixelPerfect.lua` | ~120 | scale math |
| `.../General/Movers.lua` / `Cooldowns.lua` | ~520/278 | mover factory / cooldown registry |
| `.../General/Distributor.lua` / `Install.lua` / `ModuleCopy.lua` / `PluginInstaller.lua` | 712/1676/298/554 | sharing / wizard / copy / plugin wizard |
| `.../Modules/UnitFrames/UnitFrames.lua` | 2461 | UF core + group machinery |
| `ElvUI_Libraries/Game/Shared/oUF/` | — | fork core (ouf.lua ~1100, tags.lua 1147, auraskip.lua) |
| `.../Modules/Nameplates/Nameplates.lua` | 1177 | plate driver + containers |
| `.../Modules/ActionBars/ActionBars.lua` | ~2090 | LAB integration |
| `.../Modules/Bags/Bags.lua` / `Sort.lua` | 3938/1089 | containers / sort engine |
| `.../Modules/Chat/Chat.lua` | 4234 | chat sandbox |
| `.../Modules/Skins/Skins.lua` / `Ace3.lua` | 2382/712 | skin registry / LibStub hook |
| `.../Modules/DataTexts/DataTexts.lua` | 1136 | DT framework (RegisterDatatext :1088) |
| `ElvUI_Options/Game/Shared/Core.lua` | ~950 | root registration, profiles, modulecopy tabs |

*Analysis document — original expression, describes functional behavior; not a reproduction of ElvUI source. Usage governed by the permission recorded 2026-10-29 in agent-mailbox.md.*
