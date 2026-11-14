extends Node3D
## Visual layer: builds grey-box geometry from the map and animates the camera
## from the actions that GridMover returns.

const DungeonMap := preload("res://scripts/dungeon_map.gd")
const GridMover := preload("res://scripts/grid_mover.gd")
const Cmd := GridMover.Cmd

const MAP_PATH := "res://maps/test01.txt"
const TILE := 2.0
const WALL_H := 3.0
const EYE_H := 1.6
const MOVE_TIME := 0.18
const TURN_TIME := 0.15
const BUMP_TIME := 0.14
const BUMP_DIST := 0.25

const KEYS := {
	KEY_W: Cmd.FORWARD, KEY_UP: Cmd.FORWARD,
	KEY_S: Cmd.BACK, KEY_DOWN: Cmd.BACK,
	KEY_A: Cmd.STRAFE_LEFT,
	KEY_D: Cmd.STRAFE_RIGHT,
	KEY_Q: Cmd.TURN_LEFT, KEY_LEFT: Cmd.TURN_LEFT,
	KEY_E: Cmd.TURN_RIGHT, KEY_RIGHT: Cmd.TURN_RIGHT,
}

var map: RefCounted
var mover: RefCounted
var camera: Camera3D
var yaw := 0.0 # accumulated, so turns never spin the long way round
var tween: Tween


func _ready() -> void:
	map = DungeonMap.from_file(MAP_PATH)
	mover = GridMover.new(map)
	_build_environment()
	_build_level()
	camera = Camera3D.new()
	camera.fov = 75.0
	camera.near = 0.05
	add_child(camera)
	var torch := OmniLight3D.new()
	torch.light_color = Color(1.0, 0.68, 0.38)
	torch.light_energy = 2.0
	torch.omni_range = 9.0
	torch.omni_attenuation = 1.2
	torch.shadow_enabled = true
	torch.position = Vector3(0.25, -0.15, 0.0) # held a bit to the right and low
	camera.add_child(torch)
	yaw = _facing_yaw(mover.facing)
	camera.position = grid_to_world(mover.pos)
	camera.rotation.y = yaw


static func grid_to_world(p: Vector2i) -> Vector3:
	return Vector3(p.x * TILE, EYE_H, p.y * TILE)


static func _facing_yaw(f: int) -> float:
	# Camera looks down -Z (north). Facing east (+X) is a right turn = -90 degrees.
	return -f * PI / 2.0


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventKey and event.pressed and KEYS.has(event.keycode):
		var cmd: int = KEYS[event.keycode]
		if event.echo and (cmd == Cmd.TURN_LEFT or cmd == Cmd.TURN_RIGHT):
			return # holding a turn key should not spin
		var action = mover.submit(cmd)
		if action != null:
			_play(action)
		get_viewport().set_input_as_handled()


func _play(action: Dictionary) -> void:
	tween = create_tween()
	match action.type:
		"move":
			tween.tween_property(camera, "position", grid_to_world(action.to), MOVE_TIME) \
				.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		"turn":
			yaw += -action.delta * PI / 2.0
			tween.tween_property(camera, "rotation:y", yaw, TURN_TIME) \
				.set_trans(Tween.TRANS_SINE).set_ease(Tween.EASE_IN_OUT)
		"bump":
			var base := grid_to_world(action.from)
			var off: Vector2i = action.offset
			var nudge := Vector3(off.x, 0, off.y) * BUMP_DIST
			tween.tween_property(camera, "position", base + nudge, BUMP_TIME * 0.4) \
				.set_ease(Tween.EASE_OUT)
			tween.tween_property(camera, "position", base, BUMP_TIME * 0.6) \
				.set_ease(Tween.EASE_IN_OUT)
	tween.finished.connect(_on_action_done)


func _on_action_done() -> void:
	var next = mover.finish_action()
	if next != null:
		_play(next)


# --- grey boxes -------------------------------------------------------------

func _mat(c: Color) -> StandardMaterial3D:
	var m := StandardMaterial3D.new()
	m.albedo_color = c
	m.roughness = 0.9
	return m


func _add_mesh(mesh: Mesh, pos: Vector3, mat: Material, rot := Vector3.ZERO) -> MeshInstance3D:
	var mi := MeshInstance3D.new()
	mi.mesh = mesh
	mi.material_override = mat
	mi.position = pos
	mi.rotation = rot
	add_child(mi)
	return mi


func _build_environment() -> void:
	var env := Environment.new()
	env.background_mode = Environment.BG_COLOR
	env.background_color = Color(0.01, 0.01, 0.015)
	env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.ambient_light_color = Color(0.25, 0.27, 0.32)
	env.ambient_light_energy = 0.15
	var we := WorldEnvironment.new()
	we.environment = env
	add_child(we)


func _build_level() -> void:
	var wall_mat := _mat(Color(0.55, 0.55, 0.55))
	var floor_mat := _mat(Color(0.35, 0.35, 0.35))
	var ceil_mat := _mat(Color(0.25, 0.25, 0.27))
	var pillar_mat := _mat(Color(0.65, 0.62, 0.58))
	var door_mat := _mat(Color(0.45, 0.33, 0.22))

	var wall_box := BoxMesh.new()
	wall_box.size = Vector3(TILE, WALL_H, TILE)
	var tile_plane := PlaneMesh.new()
	tile_plane.size = Vector2(TILE, TILE)
	var pillar := CylinderMesh.new()
	pillar.top_radius = 0.22
	pillar.bottom_radius = 0.22
	pillar.height = WALL_H
	var post := BoxMesh.new()
	post.size = Vector3(0.3, WALL_H, 0.3)
	var lintel := BoxMesh.new()
	lintel.size = Vector3(TILE, 0.6, 0.3)

	for y in map.height:
		for x in map.width:
			var p := Vector2i(x, y)
			var c := Vector3(x * TILE, 0.0, y * TILE)
			var t: String = map.tile(p)
			if t == DungeonMap.WALL or t == DungeonMap.OUTSIDE:
				_add_mesh(wall_box, c + Vector3(0, WALL_H / 2.0, 0), wall_mat)
				continue
			# floor faces up; ceiling is the same plane flipped to face down
			_add_mesh(tile_plane, c, floor_mat)
			_add_mesh(tile_plane, c + Vector3(0, WALL_H, 0), ceil_mat, Vector3(PI, 0, 0))
			if t == DungeonMap.PILLAR:
				_add_mesh(pillar, c + Vector3(0, WALL_H / 2.0, 0), pillar_mat)
			elif t == DungeonMap.DOOR:
				# Passage runs east-west if both side tiles are open, else north-south.
				var ew: bool = map.is_walkable(p + Vector2i(-1, 0)) and map.is_walkable(p + Vector2i(1, 0))
				var rot := Vector3(0, PI / 2.0, 0) if ew else Vector3.ZERO
				var side := Vector3(0, 0, 1) if ew else Vector3(1, 0, 0)
				var h := TILE / 2.0 - 0.15
				_add_mesh(post, c + side * h + Vector3(0, WALL_H / 2.0, 0), door_mat)
				_add_mesh(post, c - side * h + Vector3(0, WALL_H / 2.0, 0), door_mat)
				_add_mesh(lintel, c + Vector3(0, WALL_H - 0.3, 0), door_mat, rot)
