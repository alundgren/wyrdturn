# Graphics prior art: agent-assisted first-person grid crawlers

Research date: 13 November 2026. Focus: 2024–2026, with older games retained where their documented art pipelines are useful.

## Reading this report

**Verified** means a linked public source supports the statement, not that I independently reproduced the result. **Author report** means self-reported experience. **Inference/proposal** marks my assessment. **Unverified** means the requested detail was not established. No games, generators, or engines were run for this research; visual references link to public galleries/trailers rather than measured comparisons. Search-result publication dates and relative Reddit dates sometimes disagree, so uncertain dates are identified rather than reconstructed.

**Finding:** there are credible public examples of coding agents helping make blobbers, including a reportedly shipped sprite-based game. I found no verified production example combining agent-written code, modern non-pixel dark-fantasy 3D, tile movement, turn-based combat, and roguelite progression. The examples below support narrower conclusions. [Captive 3000 interview](https://vibe1up.com/game/captive-3000/), [Springless](https://cannelloni.itch.io/springless), [Godot prototype](https://github.com/imjonathanwilson/dungeon-crawler).

## 1. Games and prototypes built with agents

### Captive 3000 — Twin / Twin-FX, November 2026

- **Fit:** first-person grid-based science-fiction crawler; real-time combat and traditional sprites, so not a turn-based modern-3D match. The creator interview reports Steam launch on 6 November 2026 and a browser version. **Engine:** custom JavaScript engine and map designer. [Interview and playable/store links](https://vibe1up.com/game/captive-3000/).
- **Code/assets:** first 2,000 lines in ChatGPT, then Cursor primarily with Claude Opus; creator reports roughly 100,000 JavaScript lines. Graphics used ChatGPT/OpenArt; the pipeline also names Grok, Canva and PowerPoint. Flat front-facing wall art was perspective-adjusted in PowerPoint: this is faux 3D, not evidence that generated dungeon meshes worked. [Creator interview/development notes](https://vibe1up.com/game/captive-3000/).
- **What went well/badly:** improving models allowed replacement of early graphics. Development still took a year of spare-time work, hundreds of hours and substantial credits. His advice: “Treat each tool as one step in a pipeline rather than a magic button.” Independent code audit, costs and modern-3D quality: **unverified**. [Source](https://vibe1up.com/game/captive-3000/).

### Roguelike Dungeon Crawler — imjonathanwilson, public Godot project

- **Fit/engine:** README describes first-person tile movement, Q/E turns, procedural 3D dungeons, Godot 4.5.1 and GDScript. Claude Code is the primary development environment; Godot-builder MCP handles scenes. It describes specialized agents and shared development logs. [README](https://github.com/imjonathanwilson/dungeon-crawler).
- **Important limit:** the repository says it contains planning/coordination tools and that the actual Godot game should live separately. Combat is marked planned, equipment in progress. This verifies a documented agent workflow, **not a complete reproducible game**. Asset provenance, modern visual quality, measured success rate, author postmortem and development date: **unverified**. [README](https://github.com/imjonathanwilson/dungeon-crawler).

### Springless demo — cannelloni / KMYsqHRK, October 2026

- **Fit/engine:** Godot first-person crawler; tactical combat on two facing 3×3 grids, telegraphed attacks, traps and planted seeds. HTML5 and Windows demo. Exploration step/turn rules and roguelite meta progression: **unverified**. [Developer page](https://cannelloni.itch.io/springless).
- **Code/assets/look:** developer credits Claude/Claude Code for coding assistance and Gemini for art and music. The description places design, battle systems and balance with the human author. It is an illustrated fantasy reference, not verified realistic 3D; the proportion of code written by agents is undisclosed. [Credits and screenshots](https://cannelloni.itch.io/springless).
- **Outcome:** a downloadable demo exists; author is seeking artists and composers. No detailed account of graphics failures or measured asset-production savings was found. [Developer page](https://cannelloni.itch.io/springless).

### Avemolech / Wizardry-style tabletop-world prototype — u/morbidgames, 2026

- **Author report:** about 12 hours with Claude Code writing the core; Vite + vanilla JavaScript, Supabase saves/auth, Vercel hosting, Gemini art. First-person pseudo-3D 320×240 canvas, three dungeon levels, turn-based combat and 11 monsters with painted portraits. This is expressly a low-resolution illustrated reference, not modern rendered 3D. [Author's showcase](https://www.reddit.com/r/vibecoding/comments/1tg4v46/vibe_coded_a_firstperson_dungeon_crawler_based_on/).
- **Outcome/limits:** author reports a playable result they like. Independent completion verification, detailed art iteration costs and a failure postmortem were not found. [Same report](https://www.reddit.com/r/vibecoding/comments/1tg4v46/vibe_coded_a_firstperson_dungeon_crawler_based_on/).

### Adjacent evidence, not confirmed blobbers

u/Cosmonan's November 2026 turn-based dungeon-crawler trailer credits Unity, Claude Code for orchestration/UI/mechanics, Codex for concept art/text/tutorial, Meshy for models, and Blender for model cleanup. Pixel Lab sprites were improved with Aseprite cleanup. The author says the game remains incomplete. First-person tile exploration, title and modern non-pixel presentation are **unverified**; do not count it as a matching game. [Author's workflow](https://www.reddit.com/r/aigamedev/comments/1xub15i/my_first_proper_gameplay_trailer_almost_2_months/).

**Search boundary:** searched combinations of blobber/grid/first-person/dungeon crawler with Claude Code, Codex, Cursor and Three.js, plus creator forums and public project pages. Nothing verified a shipped Three.js blobber with the complete requested graphics/gameplay combination. This is a search result, not proof none exists.

## 2. Non-agent references and what their art pipelines actually establish

“Non-agent” here means no agent-development claim found, unless explicitly stated otherwise. It does not prove that every developer avoided AI tools. Distinguish a modern presentation from realistic art: an illustrated game can have smooth movement and contemporary UI while remaining an unsuitable target for our non-pixel requirement.

| Reference | Relevance and appearance evidence | Verified technique; missing details |
|---|---|---|
| **StarCrawlers Chimera, 13 May 2024** | First-person turn-based cyberpunk RPG; procedural facility setting and contemporary 3D visual reference. [Store/gallery](https://store.steampowered.com/app/1487560/StarCrawlers_Chimera/) | Useful reference for repeated facility interiors and run content. Exact modular kit, trim-sheet implementation, monster asset workflow and fog/post stack: **unverified**. Do not infer those just from repeated corridors. [Developer news](https://steamcommunity.com/app/1487560/allnews/). |
| **Wizardry: Proving Grounds of the Mad Overlord, 23 May 2024** | Full 3D remake; relevant turn-based first-person presentation and creature reference. [Publisher](https://store.steampowered.com/publisher/Wizardry/), [Digital Eclipse](https://www.digitaleclipse.com/our-games) | Full 3D is explicitly documented; exact retopology, modular construction, lighting and texture methods: **unverified**. Not evidence that an agent-sized team can reproduce its asset volume. |
| **Tower of Mask, 7 December 2024** | Papertip Studio's survival-horror crawler, a useful recent dark dungeon reference; action combat rather than our turn-based design. [Store/gallery](https://store.steampowered.com/app/2918410/Tower_of_Mask/) | No reliable developer breakdown of trims, fog, monster topology or lighting was found. Treat gallery presentation as a reference, not a documented pipeline. |
| **Ludus Mortis, 6 March 2024** | Dark-fantasy Imperial Rome, first-person grid-based crawler, demons/undead and gladiator-school management. Strong thematic/mechanical reference; hand-drawn presentation rather than proof of realistic animated 3D. [Store](https://store.steampowered.com/app/2197650/Ludus_Mortis/) | Store establishes setting and grid gameplay. Billboard implementation, engine and texture methods: **unverified**. |
| **Underkeep, Rake in Grass, 5 November 2026** | Grid movement and turn-based combat, hand-drawn art. Strong recent mechanics reference; not the requested non-pixel 3D target. [Correct Steam listing, app 2411200](https://store.steampowered.com/app/2411200/Underkeep/) | Developer explains that movement uses moving sprites with tricks/deformations, rather than 3D. This is a concrete alternative to rigged monsters and full 3D architecture. [Developer showcase](https://www.reddit.com/r/indiegames/comments/1os3biw). |
| **Vaporum / Vaporum: Lockdown, older baseline** | Atmospheric steampunk grid crawler; useful material and lighting target. [Developer blog](https://www.vaporum-game.com/category/development/) | Fatbot explicitly names Unity, Maya, ZBrush, Substance Designer and Grid Cartographer; development blog identifies Alloy PBR shaders. Exact trim-sheet usage or fog stack: **unverified**. [Developer FAQ](https://fatbot-games.com/faqs/). |
| **Operencia, older baseline** | Modern first-person crawler with 3D environments and 2D character portraits/hand-drawn cutscenes. [Developer](https://zenstudios.com/games/operencia-the-stolen-sun/) | UE4; team used and modified Marketplace assets, with Blueprints for level logic. This supports purchased-and-adapted content as a legitimate small-team pipeline. Exact modular dimensions, trims and post effects: **unverified**. [Developer interview](https://www.unrealengine.com/developer-interviews/zen-studios-explains-how-they-re-modernizing-old-school-turn-based-rpgs-with-operencia-the-stolen-sun). |
| **Legend of Grimrock 1/2, older baseline** | Relevant full-3D grid dungeon reference. [Official editor introduction](https://www.grimrock.net/modding/dungeon-editor-introduction/) | Official documentation exposes tile drawing, object placement and named dungeon-wall assets. That supports tile/object reuse; it does **not** establish a specific trim-sheet technique. [Official scripting reference](https://www.grimrock.net/modding/scripting-reference/). |

### Important corrections and gaps

- **Two Underkeeps:** Steam app **5084990**, by LSH studio, discloses generated visual assets and AI coding assistance. It is a different game from Rake in Grass's app **2411200**. Never attribute its disclosure to Rake in Grass. [LSH listing](https://store.steampowered.com/app/5084990/Underkeep/), [Rake in Grass listing](https://store.steampowered.com/app/2411200/Underkeep/).
- **Grimlord** is a UE5 VR action Souls-like, not a tile-movement blobber. Its dark-fantasy art is an adjacent target, not direct production precedent. [Official Steam description](https://store.steampowered.com/app/1910860/Grimlord/).
- I found **nothing verifiable under the exact name “Heroes of the Tiny Planet.”** Heroes of the Monkey Tavern is a real first-person grid crawler, but I cannot establish that it is the intended title. [Store](https://store.steampowered.com/app/492500/Heroes_of_the_Monkey_Tavern/).
- I found **no authoritative trim-sheet breakdown for the named blobbers**. Recommending trims is an implementation proposal, not a discovered fact about those games.

### Transferable techniques, with evidence separated from proposals

**Documented:** Vaporum demonstrates PBR materials; Grimrock documents tile/object construction; Operencia documents modified purchased assets; Underkeep demonstrates sprite-based perspective tricks. These are separate choices rather than a mandatory all-3D pipeline. [Vaporum](https://www.vaporum-game.com/category/development/), [Grimrock](https://www.grimrock.net/modding/dungeon-editor-introduction/), [Operencia](https://www.unrealengine.com/developer-interviews/zen-studios-explains-how-they-re-modernizing-old-school-turn-based-rpgs-with-operencia-the-stolen-sun), [Underkeep](https://www.reddit.com/r/indiegames/comments/1os3biw).

**Proposal:** use exact-size reusable floor/wall/ceiling/corner/door modules; share stone materials and ornamental trim textures, then vary rubble, stains and props. Use torch pools, restrained ambient light, distance fog and restrained bloom. Godot documents volumetric fog; Three.js documents bloom, grain and color-adjustment passes. Neither source proves any named game uses that exact combination. [Godot fog](https://docs.godotengine.org/en/latest/tutorials/3d/volumetric_fog.html), [Three.js post-processing](https://threejs.org/manual/pages/post-processing.html).

**Proposal:** high-resolution rendered monster billboards are a valid scope reduction if 3D deformation fails. They remove skeletal-animation production but still require consistent frames and views. Underkeep demonstrates a sprite-based crawler; its particular illustrated aesthetic need not be ours. A modern non-pixel implementation would need its own visual test. [Developer explanation](https://www.reddit.com/r/indiegames/comments/1os3biw).

## 3. AI 3D assets: capability versus production experience

### TRELLIS / TRELLIS.2

**Official capability:** TRELLIS.2 is a 4B-parameter image-to-3D system with PBR materials, arbitrary topology and output resolution up to 1536³. The project explicitly describes itself as research. Voxel resolution is **not** final triangle count or an animation-quality guarantee. [Research project](https://trellis2.netlify.app/), [CVPR 2026 paper](https://openaccess.thecvf.com/content/CVPR2026/papers/Xiang_Native_and_Compact_Structured_Latents_for_3D_Generation_CVPR_2026_paper.pdf).

**Concrete November 2026 author report:** a generated street used TRELLIS.2 props at 1536 cascade resolution, decimated to **200k–500k faces each**; character 400k, car 500k, bench 300k. Buildings/road were simple blocks. With remeshing disabled the author saw broken/flipped triangles. They explicitly say these meshes are suitable for renders, not retopologized/game-ready. Their useful prompt lesson: request intact geometry and add rust/cracks/moss in the texture stage; damage words had produced unwanted geometric noise. [Workflow and numbers](https://www.reddit.com/r/TopologyAI/comments/1xmgkdl/generated_the_props_and_the_character_with/).

**Counterexample:** another developer trying buildings for a toy game reports deformed/squashed geometry, hundreds of thousands of polygons and stretched mismatched textures. A respondent reports better results with higher-quality reference images. These are anecdotes, not controlled generator comparisons. [Discussion](https://www.reddit.com/r/TopologyAI/comments/1wcvyxz/real_world_trellis2_comfyui_tips/).

**Inference:** TRELLIS.2 is promising for isolated statues, rocks, urns and other irregular static objects. It is a poor default for dimension-critical wall kits until demonstrated otherwise: an arch must meet the adjoining floor and wall precisely. Neither these reports nor the official model evidence establishes a dependable automatic rigged-monster pipeline. [Positive prop workflow](https://www.reddit.com/r/TopologyAI/comments/1xmgkdl/generated_the_props_and_the_character_with/), [Building failure report](https://www.reddit.com/r/TopologyAI/comments/1wcvyxz/real_world_trellis2_comfyui_tips/).

### Hunyuan3D

**Research evidence:** Hunyuan3D 2.1 separates geometry generation from PBR texture synthesis. This supports generating a mesh and material appearance, not automatically obtaining usable collision, deformation topology or animation clips. [Authors' paper, June 2025](https://arxiv.org/abs/2506.15442).

**Experience gap:** I found no sufficiently documented shipped modern blobber using Hunyuan-generated wall kits and animated monsters. A comparative forum post includes Hunyuan, but its methodology is inadequate for a reliable production forecast; see below.

### Meshy

**Practical author experience, April 2026:** a developer describes fixing topology, reducing polygon count, separating fused components and repairing UVs in Blender. Simple props were easier than characters. They prefer selecting an approximate result and editing it over repeatedly regenerating. Critically, their experience covers static assets and basic rig preparation, **not serious AI animation testing**. [First-person report and follow-up answers](https://www.reddit.com/r/meshyai/comments/1sjig1n/using_ai_generated_3d_assets_in_my_game_3_months/).

**Vendor-supported workflow:** Meshy's guide explicitly includes generation → remesh → PBR texturing → character rigging → export, with illustrative budgets of 5K polygons for mobile and 20K for PC. These are vendor examples, not universal limits. A November 2026 cookbook demonstrates a requested 30,000-poly A-pose character and a separate rigging step. This is pipeline documentation, not an independently verified production success. [Guide](https://docs.meshy.cn/en/webapp/guides/use-cases/game-assets), [Cookbook](https://www.meshy.ai/developers/cookbook/recipes/game-character-for-unreal/).

### Tripo

Tripo documents a sequence including segmentation, retopology, texturing, rigging and export; high-detail output can reach 2M polygons. That is a source mesh tier, not an appropriate repeated in-game prop budget. [Official capabilities](https://www.tripo3d.ai/help/getting-started/what-features-does-tripo-have).

A commenter in the cross-tool thread reports **50+ Tripo and 40+ Meshy models through Claude Code APIs**, and useful Tripo retopology for level blockouts. This is self-report without downloadable test assets or measured deformation results. I did not verify a shipped blobber's Tripo pipeline. [Discussion](https://www.reddit.com/r/aigamedev/comments/1ucirid/meshy_vs_tripo_vs_rodin_vs_hunyuan_for_game/).

### Rodin

Hyper3D documents triangle/quad topology and target detail controls; its documentation itself advises inspection rather than treating a topology label as proof of rig quality. A separate rigging API preserves input topology and textures: rigging does not necessarily repair a bad mesh. [Topology controls](https://hyper3d.ai/help/articles/control-topology-polycount-and-lods), [Rigging API](https://docs.hyper3d.ai/en/api-specification/rigging).

A 2026 creator report describes Rodin Gen 2.5 → GLB → reconstruction in code → rigging/animation → interactive browser demo. This is evidence of an integration experiment, **not proof that the raw generated GLB arrived game-ready**. I found no independently audited Rodin wall/monster pipeline in a shipped blobber. [Author workflow](https://www.reddit.com/r/TopologyAI/comments/1xjjf9d/from_a_single_image_to_a_rigged_animated_3d/).

### Do not use this comparison as a forecast

A forum post headed “200 generations” describes **100 assets** in its body and claims production-ready rates of **78% Meshy, 72% Tripo, 81% Rodin, 61% Hunyuan**, defining ready as under 30 minutes cleanup. It does not establish version-matched models, per-tool sample sizes, shared downloadable results or independent evaluation. **Unverified benchmark; not decision-grade evidence.** I include the figures to make the source's limitations visible, not endorse a ranking. [Original post](https://www.reddit.com/r/aigamedev/comments/1ucirid/meshy_vs_tripo_vs_rodin_vs_hunyuan_for_game/).

### Blender controlled by an LLM / MCP

**Official status:** Blender Lab describes an MCP interface to Blender's Python API and states that operation success depends on the model used. MCP grants tool access; it does not establish artistic judgment or reliable asset optimization. [Blender Lab](https://www.blender.org/lab/mcp-server/).

**First-person tooling experience:** a contributor to Blender's MCP project reports high error rates when models had many specialized tools to choose from, and better composition of complex operations with fewer general-purpose tools. This is a developer observation, not an asset-quality benchmark. [Blender project discussion](https://projects.blender.org/lab/blender_mcp/issues/4).

**Controlled research, 2025:** BlenderGym reports problems in long procedural material/geometry scripts and a gap between model and human visual evaluation. The quoted alignment result is **0.66** for Claude 3.5 Sonnet against **0.79** inter-human alignment; these are evaluation-alignment scores, **not percentages of successfully completed game assets**. [CVPR paper](https://openaccess.thecvf.com/content/CVPR2025/papers/Gu_BlenderGym_Benchmarking_Foundational_Model_Systems_for_Graphics_Editing_CVPR_2025_paper.pdf).

**Proposal:** use Blender MCP for exact dimensions, origins, repeated kit construction, material assignment, export and inspection. Give it small explicit operations and inspect results from several views. Reserve judgment on sculpted monster quality until a real rig/deformation test. This recommendation follows the documented API access and error reports, not a claim that MCP can replace an experienced character artist. [Official tool](https://www.blender.org/lab/mcp-server/), [Tooling experience](https://projects.blender.org/lab/blender_mcp/issues/4).

## 4. Dark, gritty concept art and textures

### What is actually established

Black Forest Labs recommends subject/action/style/context prompting, explicit camera/lighting choices, palette control and reference-image editing. **FLUX.2 does not support negative prompts.** Therefore a long exclusion list is not a portable technique across generators. [Official prompting guide](https://docs.bfl.ai/guides/prompting_guide_flux2).

SDXL exposes a negative-prompt parameter and supports a different controllability workflow. LoRA and ControlNet are established add-on approaches, but this research did not verify a specific currently available dark-fantasy LoRA as both high-quality and suitable for commercial use. **No named LoRA recommendation is substantiated here.** [SDXL API](https://huggingface.co/docs/diffusers/en/api/pipelines/stable_diffusion/stable_diffusion_xl), [2024 research on SDXL add-ons](https://arxiv.org/abs/2407.02031).

### Proposed prompt experiments — not tested results

Use concrete visible features instead of relying on “dark fantasy” alone. Proposed concept prompt:

> An emaciated crypt sentinel with adult human proportions, a narrow skull and a severe expression. Corroded iron plates over filthy linen; dry cracked leather; irregular hand-forged rivets. Restrained charcoal, bone and oxidized brown palette. Harsh directional torchlight, deep shadow, grounded archaeological detail, austere horror production concept painting.

For a model-generation reference, replace dramatic lighting with neutral even illumination and specify one complete subject, a plain background and separated limbs. Keep the approved proportions, materials and palette. This separates mood exploration from mesh reconstruction. The recommendation combines BFL's concrete prompting guidance with creators' reports that better references and intact geometry improve TRELLIS results; **the exact prompt has not been tested**. [BFL](https://docs.bfl.ai/guides/prompting_guide_flux2), [TRELLIS experience](https://www.reddit.com/r/TopologyAI/comments/1wcvyxz/real_world_trellis2_comfyui_tips/), [Geometry versus wear](https://www.reddit.com/r/TopologyAI/comments/1xmgkdl/generated_the_props_and_the_character_with/).

For SDXL, experiment with negative terms such as “chibi, toy, plush, oversized eyes, smiling, rounded armor, pastel, polished plastic.” For FLUX.2, positively describe gaunt proportions, severe expressions, rough surfaces and austere lighting instead. These are **proposed experiments**, not a demonstrated cure for the user's reported image_gen friendliness. [FLUX limitations](https://help.bfl.ai/articles/7734566352-does-flux-2-support-negative-prompting), [SDXL API](https://huggingface.co/docs/diffusers/en/api/pipelines/stable_diffusion/stable_diffusion_xl).

Use a chosen reference sheet for subsequent generations rather than independently prompting every prop. FLUX.2 officially supports multi-reference editing. It offers an alternative worth testing; no source here establishes that it consistently beats image_gen for this specific art direction. [Official feature description](https://help.bfl.ai/articles/4292391522-what-is-flux-2).

### Textures: choose a dependable material pipeline

- **Existing PBR surfaces:** ambientCG supplies PBR materials, HDRIs and models under CC0, including commercial use. Poly Haven also publishes its assets under CC0. These provide an immediate alternative to inventing every stone/wood/metal surface with image generation. [ambientCG](https://ambientcg.com/), [Poly Haven license](https://polyhaven.com/license).
- **Generated materials:** ReflectanceFusion is a 2024 research example of text-to-SVBRDF generation with editable, relightable material maps. It establishes a research direction, not a turnkey production service we have validated. [Authors' paper](https://arxiv.org/abs/2406.14565).
- **Proposal for generated texture references:** request an orthographic, evenly illuminated material sample, consistent physical scale and no scene objects or cast shadows. Inspect a repeated grid before acceptance. An RGB image alone does not establish correct roughness, normals or metallic response; compare against documented PBR workflows. [Hunyuan PBR paper](https://arxiv.org/abs/2506.15442), [Three.js texture color roles](https://threejs.org/manual/pages/color-management.html).
- **Unverified:** I did not validate a tileable-texture generator that guarantees mutually consistent PBR maps for this project. Prompting “tileable” should be treated as a request to test, not a technical guarantee.

## 5. Three.js versus Godot when agents write the code

There is **no verified controlled comparison here showing agents are more successful in one engine**. The following compares documented facilities and labels the resulting judgment.

| Concern | Three.js | Godot |
|---|---|---|
| Asset import | GLTFLoader supports glTF scenes/materials/animations and extensions. [Docs](https://threejs.org/docs/pages/GLTFLoader.html) | glTF import and direct `.blend` import; the latter invokes Blender's glTF export, not arbitrary Blender rendering. [Docs](https://docs.godotengine.org/en/latest/tutorials/assets_pipeline/importing_3d_scenes/available_formats.html) |
| Lighting/post | EffectComposer chains passes; OutputPass handles final color conversion/tone mapping. Agents must configure and maintain the pipeline. [Manual](https://threejs.org/manual/pages/post-processing.html) | Integrated renderer choices and fog controls. Volumetric fog requires Forward+ and is unavailable in Mobile/Compatibility. [Renderers](https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html), [Fog](https://docs.godotengine.org/en/latest/tutorials/3d/volumetric_fog.html) |
| Automated images | Playwright captures pages and performs screenshot comparisons. Browser/OS/GPU/headless differences affect images; a headless screenshot is not identical to every user's GPU output. [Screenshots](https://playwright.dev/docs/screenshots), [Comparison caveats](https://playwright.dev/docs/test-snapshots) | CLI has fixed-frame movie/PNG capture and frame-limited execution. **Do not combine this with an assumption that `--headless` renders:** headless disables rendering. Graphics capture needs a real rendering driver/display context. [CLI](https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html), [RenderingServer](https://docs.godotengine.org/en/latest/classes/class_renderingserver.html) |
| Asset iteration | Inference: direct code-driven setup is convenient for agents, but the team must assemble the game's editing/import conventions. glTF is the documented interchange. [Loader](https://threejs.org/docs/pages/GLTFLoader.html) | Native editor/import pipeline can reimport saved Blender work. Inference: less custom asset tooling for a desktop content-heavy game. [Import guide](https://docs.godotengine.org/en/latest/tutorials/assets_pipeline/importing_3d_scenes/available_formats.html) |
| Browser target | Natural browser runtime; established browser automation. [Three.js manual](https://threejs.org/manual/pages/post-processing.html), [Playwright browsers](https://playwright.dev/docs/browsers) | Renderer features differ by target; validate target renderer before choosing fog/lighting. Do not approve a Forward+ desktop image as proof of equivalent web appearance. [Renderer comparison](https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html) |

**Graphics correctness applies to both:** Three.js explicitly distinguishes sRGB color textures from non-color roughness/normal data, and warns that incorrect conversions can make individual assets or the whole scene too bright/dark. An agent trying to fix that only by changing light intensity can mask the actual material bug. Use glTF and a shared reference scene to inspect imports. [Official color-management guide](https://threejs.org/manual/pages/color-management.html).

**Recommendation/inference:** favor Godot for a desktop-first game whose main uncertainty is atmospheric 3D and the Blender asset workflow. Favor Three.js if rapid browser delivery and browser-based visual inspection dominate. Neither choice removes mesh cleanup or monster-animation work. Ground this choice in a small imported scene rather than claims that agents are inherently better at JavaScript or GDScript. [Godot import](https://docs.godotengine.org/en/latest/tutorials/assets_pipeline/importing_3d_scenes/available_formats.html), [Three.js loader](https://threejs.org/docs/pages/GLTFLoader.html), [Asset cleanup experience](https://www.reddit.com/r/meshyai/comments/1sjig1n/using_ai_generated_3d_assets_in_my_game_3_months/).

## What this means for us

- **A convincing graphics prototype is plausible; a fully automated modern-3D production pipeline is unproven.** Agent-built crawlers exist, but the strongest close examples use illustrated/faux-3D presentation. [Captive 3000](https://vibe1up.com/game/captive-3000/), [Springless](https://cannelloni.itch.io/springless).
- **Build exact architecture in Blender; generate irregular props.** This is a proposed division of work supported by TRELLIS prop successes and building failures. [Props](https://www.reddit.com/r/TopologyAI/comments/1xmgkdl/generated_the_props_and_the_character_with/), [Buildings](https://www.reddit.com/r/TopologyAI/comments/1wcvyxz/real_world_trellis2_comfyui_tips/).
- **Start with real PBR stone, iron and wood.** Free CC0 libraries already cover the material foundation, reducing the need for generated texture repair. [ambientCG](https://ambientcg.com/), [Poly Haven](https://polyhaven.com/license).
- **Budget explicit cleanup time per generated asset.** Inspect geometry, polygon count, UVs and fused components before engine import; generator previews are insufficient evidence. [Developer experience](https://www.reddit.com/r/meshyai/comments/1sjig1n/using_ai_generated_3d_assets_in_my_game_3_months/).
- **Make one monster pass animation acceptance before planning a bestiary.** Proposed acceptance: idle, attack, hit and death, with joint deformation checked at gameplay distance. Separate rigging stages and creator limitations justify this gate. [Meshy workflow](https://docs.meshy.cn/en/webapp/guides/use-cases/game-assets), [Creator limitations](https://www.reddit.com/r/meshyai/comments/1sjig1n/using_ai_generated_3d_assets_in_my_game_3_months/).
- **Test austere references and concrete anatomy/material prompts.** FLUX.2 reference editing and SDXL negative prompting offer different controls; neither is verified here as a guaranteed fix for friendly-looking outputs. [BFL](https://docs.bfl.ai/guides/prompting_guide_flux2), [SDXL](https://huggingface.co/docs/diffusers/en/api/pipelines/stable_diffusion/stable_diffusion_xl).
- **Choose the target renderer early.** Godot Forward+ fog cannot be assumed to transfer to Compatibility/web; Three.js needs an explicitly configured post/color pipeline. [Godot](https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html), [Three.js](https://threejs.org/manual/pages/post-processing.html).
- **Proposed next evidence:** one short corridor, doorway, dressed room and animated monster, captured at fixed tile positions and during a 90-degree turn. Record cleanup minutes, final triangles, texture memory and frame time on target hardware. No cited prototype supplies those measurements for our full combination; measuring our own scene is the remaining decision step. [Closest agent prototype's limits](https://github.com/imjonathanwilson/dungeon-crawler), [Capture facilities](https://docs.godotengine.org/en/stable/tutorials/editor/command_line_tutorial.html).
