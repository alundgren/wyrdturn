# Generation and agent self-check research

Research date: 2026-11-13. Scope: a small team building a painted, first-person Three.js crawler with 2 m tiles. This is research and proposed design, not an implementation or a benchmark of the tools. Recent research is included where useful; older production examples remain the best references for several requested techniques.

**Recommendation:** generate from a small, approved vocabulary, at several levels of detail. Use a gameplay graph, curated room templates, compatible asset parts, typed effects, and an engine-owned director. Let an LLM propose combinations and fiction. Keep geometry, rules, state transitions and acceptance decisions independently checkable.

## Project context and evidence status

Read `design/direction.md`, `prototypes/e10-code-monsters/RESULT.md` and `prototypes/e3-lighting/RESULT.md`. These are local reports, not independently reproduced measurements. No application, benchmark, GUI or validation command was run for this research.

- E10 already has seeded biped/crawler parameters, approximately 2.3–3k triangles, 17–21 bones, and procedural idle/walk/attack/hit/death. Its contact sheet caught an attack ending behind the body, a sinking spider and an excessively thin ghoul. Extend that loop.
- E10 identifies smooth tubular bodies and missing silhouette detail as the present quality problem. A new generator is less urgent than better profiles, heads, clothing and attachments.
- PLAN's later lighting decision calls for readable base light, with mood from color, shadows and transitions. E3's older darkness advice should not override it. E3 reports 60 fps on the MacBook after static shadow maps and reduced AO resolution; its software-rendered screenshots did not establish hardware performance.
- E5/E6 results and the exact Windows TRELLIS installation were not inspected. Their quality, timings and memory usage remain **unverified** here.

Unless attributed to a source, the workflows, numerical limits and targets below are **proposals for us**. Vendor feature documentation establishes availability, not output quality. Prices, commercial rights and service versions must be checked against the exact version used.

## 1. Levels that feel authored

### Methods and references

| Method / concrete source | What it actually contributes | Fit for this crawler |
| --- | --- | --- |
| Dormans & Bakkes, *Generating Missions and Spaces for Adaptable Play Experiences* (2011), [paper](https://pure.hva.nl/ws/files/149264/453867_Dormans_Bakkes_-_Generating_Missions_and_Spaces_for_Adaptable_Play_Experiences.pdf) | Separates the graph of tasks/dependencies from physical arrangement. | Excellent: decide key, gate, reward and route relationships before finding tile coordinates. |
| Joris Dormans, Unexplored 2 developer article (2019), [Level Generation](https://www.ludomotion.com/blogs/level-generation/) | Describes staged refinement with tile and graph grammars, gameplay features, decoration and final presentation. | Excellent: each pass gets a small contract and its own validator. Cycles support shortcuts and alternate routes. |
| Spelunky, Darius Kazemi's executable [Generator Lessons](https://tinysubversions.com/spelunkyGen/) | Demonstrates a solution path through a 4×4 room arrangement with connection-compatible room classes. | Copy the connection contract and solution-first approach; replace platformer drops with doors, stairs and traversable grid links. |
| Sébastien Bénard, [Dead Cells: Procedural Level Design](https://www.gdcvault.com/play/1025768/Dead-Cells-Procedural-) (GDC 2019) | Relevant production talk on authored content and procedural layouts. | Use biome-specific room pools and progression constraints. **Talk page was inaccessible in this research session; detailed implementation claims are unverified.** |
| Gridbugs, [Procedural Generation with Wave Function Collapse](https://gridbugs.github.io/gridbugs.org/wave-function-collapse/) | Implementer's explanation of local pattern/adjacency constraints and propagation. | Useful for compatible wall trims, floor motifs and local dressing. Plain local adjacency does not itself prove global solvability. |
| Crawl developer [vault-making introduction](https://github.com/crawl/crawl/blob/master/crawl-ref/docs/develop/levels/introduction.txt) | First-party documentation for authored vault content in a randomized dungeon. | Very good model for annotated ASCII room templates with constrained substitutions. |
| Brian Walker's [Brogue project](https://sites.google.com/site/broguegame/home) | Primary project and downloadable implementation; useful reference for systemic dungeon design. | Study environmental interactions and special encounters. Exact current machine-generation internals were not source-audited here; community descriptions are leads, not verified algorithms. |
| Baek et al., [PCGRLLM](https://arxiv.org/abs/2502.10906) (2025, revised 2026) | LLM-generated rewards with feedback for a 2D content-generation RL task. | Evidence for iterative measurable feedback; adopting RL is unnecessary for our first generator. |

For Brogue, the often-cited ideas are room accretion, extra loops, cellular-automaton water/chasm regions, and “machines” that combine terrain, objects and rewards. Treat these as **implementation-study leads** until checking the selected Brogue CE version. Avoid assuming a precise probability or algorithm from an old wiki applies today. For DCSS, use the documented vault authoring approach directly: a memorable local arrangement can coexist with a random larger map.

### Proposed 2 m grid pipeline

1. **Gameplay graph:** entrance → introduction fight → fork; one route reaches a key, another previews its locked gate; opening the gate reveals reward and a return shortcut. Attach tags for combat, rest, reveal, secret and landmark. Start with 3–4 small graph recipes rather than unrestricted rewriting.
2. **Room embedding:** place curated footprints on integer coordinates. Each doorway records tile, outward direction, width, height and connection type. Rotate only when allowed; mirrored text, asymmetrical puzzles and lighting may prohibit reflection. Initially keep one floor elevation and explicit stairs between floors.
3. **Geometry:** instantiate E2 modules from tile occupancy; derive collision from the same occupancy data. Wall thickness and decorative protrusions must respect the walkable volume. A 2 m tile is a movement interval, not necessarily a 2 m clear doorway.
4. **Gameplay placement:** reserve entrances, turning positions, combat lanes and interaction tiles before adding clutter. Validate keys in reachable inventory states; a simple flood fill cannot catch a key behind its own lock.
5. **Dressing:** attach semantic sockets to templates: altar focal point, wall torch, ceiling hanging, floor corner, rubble edge. Check footprint, facing, floor support, clearance, permitted biome, visibility and minimum separation. Use weighted clusters with empty space between them, rather than independent random props on every tile.
6. **Mood:** choose a room-level palette and lighting preset; vary within controlled ranges. Provide a recognizable landmark visible on approach and a deliberate contrast at the next threshold. Preserve an accessibility/readability floor for interactables and enemies.

**POIs and pacing proposal:** place one primary focal object in a normal room; allow a second only when it serves another explicit beat. Use distance along the playable route, not Euclidean distance, for spacing rewards and recovery. Detect repeated door-view compositions. Reserve at least one useful empty area for fighting; decoration must not consume the only retreat tile.

**Biome palette proposal:** each biome specifies 3–5 approved surface materials, a dominant/secondary/accent color relationship, compatible prop families, environmental decals, ambient audio and lighting ranges. For example, crypt = pale stone + old iron + amber accents; flooded cistern = mineral stone + wet wood + cool fill with warm navigational accents. Material selection follows room purpose and moisture exposure. A consistent palette with a few major landmarks should produce more apparent intention than arbitrary color variation.

**WFC decision:** defer full-map WFC. If used, pin doors and route cells first, apply it inside bounded decorative regions, enforce a contradiction/retry limit, and fall back to a known-valid pattern. Global graph planning and local constraint solving solve different problems.

## 2. Creatures: variety with production control

### What to borrow from procedural creature systems

Spore is relevant because authored animation intent must survive changing anatomy. A public first-party entry is its [polypod gait tutorial](https://www.spore.com/comm/tutorials); the historical animation paper is a useful further reading lead, but was not examined directly here. No Man's Sky's [Continuous World Generation talk](https://www.gdcvault.com/play/1024265/Continuous-World-Generation-in-No-Man-s-Sky) is a production reference for world generation; it is **not evidence for a particular creature-rig algorithm**. Exact NMS creature part assembly, rigging and animation details remain unverified in this report.

For us, use a few bounded body plans: hunched biped, heavy biped, low quadruped, many-legged crawler, hovering body. Each owns a skeleton contract, allowed limb lengths, sockets and animation family. Vary primary proportions first, secondary parts next, paint last. Independent random radii produce noise; correlated parameters produce an identifiable archetype.

| Role | Primary visual cues to author | Behavior/animation contract |
| --- | --- | --- |
| Brute | Wide upper body, heavy forearms, low head, broad stance | Large anticipatory wind-up and slow recovery |
| Skirmisher | Narrow body, long legs, forward posture | Fast approach/retreat and clearly separated strike |
| Caster | Tall narrow profile, staff or raised focal appendage | Visible channel cue; attack source matches effect origin |
| Defender | Shield/armored front, compact stance | Front protection readable from a tile away |
| Swarm/crawler | Low profile, distinctive leg count and rhythm | Foot placement and attack range stay clear at floor level |

These are proposed art rules, not universal perceptual findings. Test silhouettes at actual 2/4/8 m distances, grayscale and backlight. Color can reinforce a role but should not be its only identifier.

**Kitbashing:** commission/generate and approve a small part library: heads, horns, shoulder plates, shields, hands, feet, cloth strips and back ornaments. Each part needs origin, units, socket orientation, material family, bounds and role tags. Rigid attachments on E10 bones avoid the cost of skinning each accessory. Cap the number of focal details and disallow part combinations that conceal the attack limb or face.

**SDF/marching cubes:** useful for organic body masses and fused roots/slimes. An offline Blender workflow can union capsule/ellipsoid fields and extract a surface; it still needs UVs and a rig. Arbitrary triangulation is acceptable for a rigid slime but can deform badly at elbows. Keep E10's explicit joint-aware topology for articulated limbs until a real comparison proves another method better. Blender's [voxel remesh documentation](https://docs.blender.org/manual/en/latest/modeling/meshes/retopology.html) is a practical entry to remeshing, not a guarantee of animation topology.

**Animation:** use a deterministic gait phase, stance/swing phases, planted-foot targets and two-bone IK for each leg. Keep pelvis/body bob subordinate to foot contacts. On grid movement, match cycle speed to the 2 m travel tween and settle feet when movement ends. Authored attack anticipation/strike/recovery should override locomotion cleanly. A small clip selector based on movement direction, speed and current phase is a reasonable “motion matching lite” proposal; full motion matching requires a suitable motion database and is excessive now. The E10 procedural attacks may already be adequate once anatomy improves.

### Image-to-3D and rigging options

| Tool / primary reference | Documented contribution | Realistic use and limits |
| --- | --- | --- |
| Microsoft [TRELLIS.2](https://github.com/microsoft/trellis.2) and [2026 paper](https://openaccess.thecvf.com/content/CVPR2026/papers/Xiang_Native_and_Compact_Structured_Latents_for_3D_Generation_CVPR_2026_paper.pdf) | Image-conditioned textured 3D generation. Upstream README specifies Linux and at least 24 GB GPU memory. | Use installed pipeline first for props, heads, armor and rigid monsters. NVIDIA lists the desktop [5070 Ti at 16 GB](https://www.nvidia.com/en-us/geforce/graphics-cards/50-series/rtx-5070-family/); compatibility depends on the installed port/offload configuration and is **unverified**, not established by upstream requirements. |
| Tencent [Hunyuan3D 2.1 paper](https://arxiv.org/abs/2506.15442) | Geometry and PBR texture generation. | An alternative experiment, not an assumed drop-in. The [2.1 license](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1/blob/main/LICENSE) excludes EU/UK/South Korea from its defined territory; do not assume it is available for this Swedish team's use. Check exact version and granted rights before adoption. |
| [Meshy rigging API](https://docs.meshy.ai/en/api/rigging), [animation API](https://docs.meshy.ai/en/api/animation) | Hosted rigging and animation tasks. API documentation restricts reliable rigging to standard humanoids. | Good candidate for an isolated humanoid bake-off. Its [web guide](https://docs.meshy.ai/en/webapp/guides/3d-model/rigging) also describes four-legged characters: web and API capabilities must not be conflated. |
| [Tripo API](https://developers.tripo3d.ai/en/docs/introduction), [auto-rig](https://developers.tripo3d.ai/en/docs/animations-rig) | Hosted generation, editing and rigging interfaces. | Candidate for cloud comparison; actual crawler-monster deformation, turnaround and cost unmeasured. |
| Hyper3D [Rodin API](https://docs.hyper3d.ai/en), [features](https://docs.hyper3d.ai/en/get-started/features) | Text/image-to-3D with mesh/material controls and asynchronous jobs. | Compare props or a hero enemy under the same concept brief. Do not infer animation readiness from attractive static previews. |
| Adobe [Mixamo FAQ](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) | Auto-rigging and motion assets; aimed at humanoid bipeds. | Useful manual baseline for one clean humanoid. A fully unattended public API workflow was not verified. |
| Reallusion [AccuRIG](https://www.reallusion.com/auto-rig/accurig/default.html), [AI-model workflow](https://tips.reallusion.com/2025/04/29/using-ai-tool-to-generate-3d-model-and-rig-with-iclone-character-creator-accurig/) | Guided humanoid rigging and skinning. | Useful Windows comparison with a human marking joints; unattended automation unverified. |
| [UniRig](https://arxiv.org/abs/2504.12451) (2025) | Predicts skeletons and skinning weights for diverse objects. | Best research candidate for non-humanoid rigs; test our meshes, not just showcased examples. Skeleton creation does not supply good attacks. |
| [RigNet](https://zhan-xu.github.io/rig-net/) (2020) | Earlier learned automatic rigging research. | Good conceptual baseline; lower priority than newer tools for setup effort. |
| [Make-It-Animatable](https://arxiv.org/abs/2411.18197) (2024/CVPR 2025) | Predicts bones, weights and pose transforms for humanoid animation readiness. | Promising humanoid trial. Paper speed claims do not include our entire generation/cleanup/export workflow; do not extrapolate to spiders. |

### Proposed pipelines, ordered by practicality

1. **Routine monsters:** E10 controlled body → approved rigid attachments → shared painted materials → procedural animation. Cheapest repeatable variants and easiest deterministic repair.
2. **Distinctive props/parts:** image_gen approved concept → installed TRELLIS → scale/orientation cleanup → simplify/remesh when needed → UVs and bake → glTF. Generate parts offline; the runtime GM chooses approved asset IDs.
3. **Hero humanoid trial:** concept in neutral pose with separated limbs → TRELLIS or one hosted generator → clean mesh → UniRig or Mixamo/AccuRIG baseline → retarget a small approved clip set → all-state deformation checks. Promote only after cleanup time and rejection rate are measured.
4. **Custom many-legged creature:** explicit skeleton + generated/curated parts + procedural IK. Arbitrary AI mesh → arbitrary rig → arbitrary motion is a research project, not our main content factory.

For cleanup, preserve the original high-detail asset. Decimation reduces triangles but does not create good elbow loops. Retopology changes topology and often UVs; reproject color and normal detail with a cage and inspect thin surfaces. Blender documents [Decimate](https://docs.blender.org/manual/en/latest/modeling/modifiers/generate/decimate.html) and [selected-to-active baking](https://docs.blender.org/manual/en/latest/render/cycles/baking.html). Inspect bake errors around fingers, horns, mouths and overlapping cloth. Recheck weights after topology changes. Track total elapsed time, agent retries and human repair minutes separately.

## 3. Skills, spells and items

Epic's [Gameplay Ability System effects](https://dev.epicgames.com/documentation/en-us/unreal-engine/gameplay-effects-for-the-gameplay-ability-system-in-unreal-engine) and [ability lifecycle](https://dev.epicgames.com/documentation/unreal-engine/using-gameplay-abilities-in-unreal-engine) provide a concrete reference for tags, effects, durations, costs and cooldowns. Borrow the data concepts without importing an engine-sized framework into Three.js.

**Proposed ability grammar:** delivery (touch/bolt/cone/ground tile) + target rule + one primary effect (damage/heal/push/status) + at most one initial modifier + cost/cooldown + telegraph family. Start with legal production rules rather than arbitrary combinations. Fire bolt + on-hit burn is understandable; three recursive on-hit effects are hard to explain and balance.

Define typed tags and compatibility constraints: fire/cold, projectile/melee, periodic/direct, hostile/friendly, rooted/airborne. Tags should have explicit behavior and validation rules. A status definition owns stacking, refresh, expiration and immunity semantics. Effects execute in a documented order; generated data cannot insert executable callbacks.

For items, use base item + eligibility-filtered affix pool + bounded rolls + uniqueness/exclusion groups. Diablo and PoE are useful examples of authored modifier vocabularies rather than random code. PoE's [official modifier reference](https://www.pathofexile.com/item-data/mods) is a concrete starting point. **No private Diablo/PoE balancing formula was verified; do not attribute the following proposed budget to either game.** Exact live affix counts and crafting rules vary by title/version and are intentionally not assumed here.

**Proposed power budget:** estimate expected direct damage plus expected damage-over-time actually delivered, then multiply by expected targets/hit probability; add separate estimates for healing, control and mobility. Evaluate over a fixed encounter window and account for cast time, resource availability and cooldown. For example, a 20-damage bolt hitting one target has a different value from 10 damage hitting three targets, and a 4-turn burn often loses value when targets die after two turns. Control needs an estimate of prevented enemy actions, not a tiny arbitrary damage surcharge.

Use the estimate only to reject obvious outliers. Simulate to expose nonlinear interactions: indefinite stun, damage reflection recursion, healing/resource loops and on-kill farming. Apply hard caps on trigger depth, events per action, status stacks and spawned entities. Explicitly decide whether triggered effects can trigger more effects; default to no for the first version.

**Names and descriptions:** derive mechanical text from the canonical effect data, including range, duration, damage, stacking and costs. An LLM may produce a short name and flavor sentence, but cannot add mechanical promises. Validate length, uniqueness and forbidden unsupported claims. Keep icons, attack cues and effect colors consistent across generated variants.

**LLM validation sequence:** JSON schema → known IDs/enums → semantic compatibility → numeric budgets → termination checks → deterministic battle simulations → visual/telegraph review → approved catalog. Schema-valid JSON can still describe an impossible or broken ability. Rejected candidates receive structured reasons and a bounded repair attempt; exhausted attempts fall back to authored content.

## 4. Quality control loops agents can actually use

### A local acceptance pipeline

Run these as local scripts in the permitted development environment, following desktop isolation rules. Do not add remote CI validation jobs. Save seed, generator/version, parameters, asset hashes, browser/renderer settings, metrics, screenshots and reasons together for each candidate.

| Check | Concrete tools / evidence | Proposed wiring and limitations |
| --- | --- | --- |
| Reproducible screenshots | [Playwright visual comparisons](https://playwright.dev/docs/test-snapshots) | Extend E10 shots: fixed viewport/DPR/camera/exposure, seeded randomness, explicit animation time, assets-ready signal. CSS animation disabling does not freeze a Three.js animation loop. |
| Pixel regression | [pixelmatch](https://github.com/mapbox/pixelmatch) | Compare same-seed/same-machine baseline; save difference heatmap and changed-pixel fraction. Detects changes, not artistic improvement. |
| Structural comparison | [SSIM](https://www.ece.uwaterloo.ca/~z70wang/publications/ssim.html) | Useful supplementary signal for brightness/structural drift. Can hide a small but crucial changed object; include object crops. |
| Perceptual comparison | [LPIPS](https://richzhang.github.io/PerceptualSimilarity/), [shift-tolerant follow-up](https://arxiv.org/abs/2207.13686) (2022) | Use for triage across moderate appearance changes, not a sole pass/fail gate. Neural distance does not establish role readability or physical correctness. |
| File correctness | [Khronos glTF Validator](https://github.khronos.org/glTF-Validator/) | Gate schema/spec errors, accessor/skin issues and missing resources. A valid glTF can still contain ugly geometry, bad UVs or intersections. |
| Asset optimization | [glTF Transform](https://gltf-transform.dev/) | Inspect sizes and apply selected simplify/compression passes; compare before/after renders and deformations. Blind optimization can damage thin details. |
| Geometry/UV/deformation | Blender mesh inspection plus render passes | Count degenerate faces, open/non-manifold edges where inappropriate, invalid normals, unweighted vertices, weight sums and bounds. Check UV coverage, texel density and bake overlap with exclusions for intentional mirroring. Non-manifold is not universally invalid for cloth/cards. |
| Runtime budgets | [Three.js renderer documentation](https://threejs.org/docs/pages/WebGLRenderer) | Collect draw calls, triangles, texture/geometry counts across the full postprocessing frame. Hardware frame timings need a separate run from software screenshots. |

**Contact sheet proposal:** rows = seeds/archetypes; columns = front, side, back, silhouette, idle, movement, attack wind-up/strike, hit and death. Add close-up joint renders and actual grid-view renders. A single sampled attack frame can miss penetration: sample a time series and calculate foot-floor error, joint bounds, weapon reach and mesh bounds throughout it. For levels, capture doorway views, interaction positions and the brightest/darkest zone transitions.

### VLM judging: useful critic, weak final authority

[Prometheus-Vision](https://arxiv.org/abs/2401.06591) (2024) studies rubric-conditioned judging of vision-language outputs; it is not direct proof of reliable game-art grading. A closer 2026 reference is [A Cross-Model VLM-Judge Protocol for Single-Image 3D Mesh Quality](https://arxiv.org/abs/2606.18451): it uses 24-view headless renders, independent judge families and reversed presentation order, retaining order-consistent comparisons. Its tested scope is limited to its generators/dataset/degradations; judge agreement is not a substitute for human artistic approval.

**Our proposed rubric, 0–4 each:** role/silhouette readability; painted material consistency; anatomy and attachment coherence; attack cue clarity; floor contact and penetration; match to approved reference; readability under game lighting. Define anchors with approved and rejected examples. Keep numerical geometry/performance failures outside the aesthetic average: excellent paint must not compensate for a broken skeleton.

Prefer blinded A/B comparisons against an approved baseline, with equal framing and both presentation orders. Ask for visible evidence with image coordinates/crop references, defect severity and uncertainty. Route disagreements and novel art directions to the human. Keep a small human-rated calibration set and track judge agreement over time.

Known practical failure cases to test: preference for a brighter or more detailed image, order sensitivity, flattering its own style, missed rear-view defects, invented anatomy criticism, and praising a static image whose animation is broken. These are **risks to evaluate in our judge setup**, not measured failure rates. Do not let an agent rewrite its own rubric or approve its new baseline. Freeze prompts and a holdout seed set to reduce metric gaming.

### Playtesting and balance

Use an engine-independent deterministic combat simulator, then verify selected cases in the rendered runtime. Run baseline greedy, cautious/ranged and deliberately inefficient agents with the same seed sets; an omniscient bot alone conceals readability and exploration problems. Record win rate, turns to kill, damage received, resource spend, deaths by cause, status uptime and dominant strategy frequency.

A proposed normal encounter target might be 70–90% survival for a specified reference build and competent policy; this is **not a genre standard**. Separate ordinary/elite/boss bands and evaluate weak/strong builds. With 1,000 independent fights and an observed win rate near 50%, sampling uncertainty is roughly ±3 percentage points at 95%; correlated seeds and policy errors can matter more. Use paired seeds for candidate/baseline comparisons and a held-out set before acceptance.

Level checks should include:

- Reachability over tile + inventory + door/switch state, with directed edges for one-way travel.
- Key-before-lock, reachable exit, usable interaction position, floor support, no spawn inside collision and no decoration blocking critical links.
- Main-route length in player actions, optional-route payoff, loops/shortcuts, dead-end proportion, consecutive combat distance and resource availability before mandatory fights.
- Duplicate template/composition frequency and visible POI spacing, evaluated across a seed distribution rather than one attractive map.
- Retry counts and timeouts: a generator that silently retries until it finds a rare valid seed is a reliability problem.

### Performance gates and examples of feedback loops

Start with the project's 1080p/60 fps goal: 16.7 ms per frame is the total frame-time budget. Proposal: measure warmed-up p50/p95/p99 over a fixed camera route on the MacBook; separately record loading and shader-compilation spikes. Establish actual passing-scene draw-call, texture-memory and triangle baselines before enforcing limits. An initial asset guideline of 3–8k triangles and a 1k texture for ordinary enemies is a **trial budget**, not a proven ceiling. Account for materials, overdraw, shadow passes and animation cost, not just triangles.

E3 already demonstrates why this matters: reported performance improved by changing shadow updates and AO resolution without changing monster triangle count. Static shadow maps also need an explicit policy for moving monsters and changed geometry.

Concrete agent-loop precedents:

- [Voyager](https://arxiv.org/abs/2305.16291) (2023) combines environment feedback, execution errors and self-verification while developing Minecraft skills. Borrow structured execution feedback and reusable successful recipes; its result does not establish game-art quality assurance.
- [PCGRLLM](https://arxiv.org/abs/2502.10906) iterates reward design with generation feedback. Borrow measurable objectives, but inspect outputs independently to catch reward exploitation.
- The [2026 mesh-judge protocol](https://arxiv.org/abs/2606.18451) supplies a concrete multi-view render-and-compare setup. Borrow blinded order checks and separate judge families.
- E10 is our existing local example: generate → render named states → inspect contact sheet/metrics → fix specific defect → rerender.

**Proposed controller:** candidate → cheap deterministic checks → simulation → controlled renders → visual comparison → targeted repair → repeat at most three times → accept or quarantine. Quarantine retains seed, failure and best candidate; it must not quietly replace a failed candidate with unrelated content. Human approval establishes new art references and gameplay targets; agents can then enforce them at scale.

## 5. AI game master and director

| Reference | Supported lesson | Application / caveat |
| --- | --- | --- |
| Mike Booth, [The AI Systems of Left 4 Dead](https://cdn.akamai.steamstatic.com/apps/valve/2009/ai_systems_of_l4d_mike_booth.pdf) (2009) | Director tracks player intensity and alternates pressure with relief. | Build a deterministic pacing controller first; player state changes encounter selection within rules. It does not need an LLM. |
| [RimWorld official console description](https://rimworld.double11.com/) | Storyteller selects incidents such as raids, weather and visitors. | Separate event selection from event implementation. Exact Cassandra/Phoebe/Randy schedules were not checked in primary source here; treat their familiar pacing differences as study leads. |
| Hades, [Breathing Life into Greek Myth](https://www.gdcvault.com/play/1026975/Breathing-Life-into-Greek-Myth) | First-party talk on implementing a large authored dialogue system. | Supports studying authored variation; **not evidence for exact encounter allocation rules**. Recommended design: curated arenas, eligible enemy groups, encounter budgets and controlled rewards; Hades' precise implementation is unverified here. |
| Darkest Dungeon curios | Useful design analogy: a recognizable object with a bounded choice/outcome table. | Exact odds and present implementation unverified. Build our own authored curio contracts: eligibility, offered choices, resource costs, outcome probabilities and repeat limits. |
| [AI Dungeon scripting](https://help.aidungeon.com/scripting), [memory system](https://help.aidungeon.com/faq/the-memory-system) | Provides context/memory and hooks around generated narrative. | Useful precedent for separating persistent context and generation. Narrative continuity does not guarantee mechanical consistency. |
| [CALYPSO](https://arxiv.org/abs/2308.07540) (2023) | LLM interfaces support human DMs with scenario-specific inspiration/information. | Strong fit for an assistant that proposes encounters and fiction; not a demonstration of a fully autonomous authoritative rules engine. |
| [Dungeons and Dragons as a Dialog Challenge](https://arxiv.org/abs/2210.07109) (2022) | Studies language interaction in D&D, including DM responses. | Relevant to dialogue generation; does not prove simulation or long-run state correctness. |

### Proposed constrained GM architecture

**Authoritative engine state → compact observation → director chooses eligible options → LLM proposes a data command → validators → engine applies atomically → event log.** The LLM never writes player health, inventory, collision or arbitrary scripts directly.

Observation includes current biome, discovered rooms, recent encounter IDs, player resources, recent damage, deaths, build tags, unfulfilled narrative facts and explicit difficulty preference. Avoid exposing every hidden fact when it is unnecessary. Player text and retrieved lore are data, not authority to override the command contract.

Allowed proposal types might be `chooseEncounter`, `chooseCurio`, `offerReward`, `requestRoomRecipe` and `writeFlavor`. Each uses catalog IDs, bounded numeric fields, prerequisites, cooldowns and a state version. Validate against the current state immediately before application; a valid proposal for a previous room must not spawn into the current fight. Log rejection reasons and use a deterministic default when the model is slow or unavailable.

For adaptation, smooth a player-pressure score over recent encounters, use minimum intervals between changes, and choose among budgeted eligible events. Prefer extra recovery, different enemy roles or optional risk/reward routes over silently changing a visible monster's rules mid-fight. Respect selected difficulty and avoid automatically cancelling every strong build with its perfect counter.

Separate time scales: offline agents generate and qualify new assets; between runs they add approved catalog entries; during play the GM selects IDs and writes bounded fiction. A new monster mesh, untested spell or revised collision layout should not enter a live run simply because the LLM requested it.

## Recommendations for us

Priority is dependency order. Effort: S = roughly 0.5–2 focused days, M = 3–5, L = 1–2+ weeks for this small team; estimates are uncertain and exclude service setup or major rework. All acceptance targets below are proposed first bars.

| Priority | What to build | Why | Effort | How an agent verifies it |
| --- | --- | --- | --- | --- |
| 1 | Shared seeded capture/report contract extending E10 | Gives every later experiment reproducible evidence. | S | Same seed/time produces stable captures; missing assets/page errors fail; report records camera, renderer and asset versions. |
| 2 | Asset acceptance gate: glTF + Blender checks + animation contact sheets | Reject broken assets before art judging. | M | Known broken fixtures fail; approved E10 monsters pass; checks cover weights, bounds, scale, UVs and sampled motion. |
| 3 | E10 silhouette/attachment library with 3 clearly different roles | Directly addresses the reported tubular appearance. | M | Grid-distance grayscale sheets; human establishes role examples; blind role classification and clipping checks on held-out variants. |
| 4 | Three graph recipes and 8–12 socketed room templates | Produces intentional routes with controlled art cost. | M | Batch 1,000 seeds; state-aware solver proves exits and keys; failure/retry distributions and map sheets are saved. |
| 5 | Biome palettes, POI sockets and zone lighting presets | Provides variety while retaining a consistent painted look. | M | Doorway captures, contrast/readability crops, blocked-route assertions and repetition report; fixed approved references. |
| 6 | Reproducible MacBook performance route | Prevents quality work from losing the 60 fps goal. | S | Warmed hardware timing distribution at fixed settings; full-frame draw/material/texture statistics; compare with E3 baseline. |
| 7 | Small typed effects catalog and constrained ability/item grammar | Makes generated mechanics executable, explainable and bounded. | M | Schema and semantic rejection cases; trigger termination; descriptions match data; all combinations use known effects. |
| 8 | Deterministic fight simulator plus three bot policies | Finds broken combinations before play sessions. | M | Paired-seed combat reports, held-out builds, confidence intervals and replay of outliers in the runtime. |
| 9 | Bounded visual critic with approved/rejected calibration set | Lets agents identify concrete visual defects without automatic rubric drift. | M | Blinded A/B and reversed order; human agreement on held-out images; disagreements go to review, hard failures remain hard failures. |
| 10 | Small image-to-3D/rigging bake-off: same prop and humanoid briefs | Establishes whether AI assets save time end to end. | M | Installed TRELLIS config documented; compare code+parts and one AI route; log VRAM, total time, cleanup minutes, deformation failures and actual game renders. |
| 11 | Deterministic director, then optional LLM proposal adapter | Tests adaptation and pacing before making play depend on generation. | M, then L | Scripted low/high-pressure runs; budgets/cooldowns enforced; stale/invalid/timeout proposals fall back; no unapproved IDs enter a run. |

Do these before unrestricted runtime content generation. The intended result is a growing library of tested ingredients and recipes that agents can combine and inspect cheaply, with human judgment concentrated on new art directions and whether the game is enjoyable.
