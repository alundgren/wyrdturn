extends SceneTree
## Headless tests. Run:
##   godot --headless --path <project> --script res://tests/run_tests.gd
## Exit code 0 = all passed, 1 = failures.

const DungeonMap := preload("res://scripts/dungeon_map.gd")
const GridMover := preload("res://scripts/grid_mover.gd")
const Cmd := GridMover.Cmd
const F := GridMover.Facing

var failures := 0
var checks := 0

# integration test state (runs over several frames)
var main: Node
var frame := 0
var phase := 0
var phase_start := 0


func check(cond: bool, what: String) -> void:
	checks += 1
	if cond:
		print("  ok   ", what)
	else:
		failures += 1
		printerr("  FAIL ", what)


func fresh() -> RefCounted:
	return GridMover.new(DungeonMap.from_file("res://maps/test01.txt"))


func _init() -> void:
	print("Unit tests (pure logic)")
	test_map_parse()
	test_start()
	test_walls_block()
	test_turns_wrap()
	test_strafe()
	test_door()
	test_pillar()
	test_input_buffer()
	print("Integration test (main scene, headless, no rendering)")
	main = load("res://main.tscn").instantiate()
	root.add_child(main)


func test_map_parse() -> void:
	var m = DungeonMap.from_file("res://maps/test01.txt")
	check(m != null, "map file loads")
	check(m.width == 10 and m.height == 10, "map is 10x10 (got %dx%d)" % [m.width, m.height])
	check(m.tile(Vector2i(-1, 0)) == " " and not m.is_walkable(Vector2i(20, 20)), "outside the map is not walkable")


func test_start() -> void:
	var g = fresh()
	check(g.pos == Vector2i(2, 8), "start position is S at (2,8) (got %s)" % g.pos)
	check(g.facing == F.NORTH, "start facing is north")


func test_walls_block() -> void:
	var g = fresh()
	check(not g.can_move(Cmd.BACK), "wall south of start blocks BACK")
	var a: Dictionary = g.apply(Cmd.BACK)
	check(a.type == "bump" and g.pos == Vector2i(2, 8), "bumping a wall does not move")
	a = g.apply(Cmd.FORWARD)
	check(a.type == "move" and g.pos == Vector2i(2, 7), "forward into floor moves to (2,7)")


func test_turns_wrap() -> void:
	var g = fresh()
	g.apply(Cmd.TURN_LEFT)
	check(g.facing == F.WEST, "left from north wraps to west")
	g.apply(Cmd.TURN_RIGHT)
	check(g.facing == F.NORTH, "right from west wraps to north")
	for i in 4:
		g.apply(Cmd.TURN_RIGHT)
	check(g.facing == F.NORTH, "four right turns return to north")
	for i in 5:
		g.apply(Cmd.TURN_LEFT)
	check(g.facing == F.WEST, "five left turns end at west")


func test_strafe() -> void:
	var g = fresh()
	g.apply(Cmd.STRAFE_LEFT)
	check(g.pos == Vector2i(1, 8) and g.facing == F.NORTH, "strafe left moves west, keeps facing")
	g.apply(Cmd.TURN_RIGHT) # east
	g.apply(Cmd.STRAFE_RIGHT) # south of (1,8) is wall
	check(g.pos == Vector2i(1, 8), "strafe right while facing east is blocked by wall")


func test_door() -> void:
	var g = fresh()
	check(g.map.tile(Vector2i(5, 3)) == "D", "map has door at (5,3)")
	g.pos = Vector2i(4, 3)
	g.facing = F.EAST
	check(g.can_move(Cmd.FORWARD), "door tile is walkable")
	g.apply(Cmd.FORWARD)
	g.apply(Cmd.FORWARD)
	check(g.pos == Vector2i(6, 3), "walk through door to (6,3)")


func test_pillar() -> void:
	var g = fresh()
	check(g.map.tile(Vector2i(7, 5)) == "P", "map has pillar at (7,5)")
	g.pos = Vector2i(6, 5)
	g.facing = F.EAST
	check(not g.can_move(Cmd.FORWARD), "pillar blocks")
	var a: Dictionary = g.apply(Cmd.FORWARD)
	check(a.type == "bump" and g.pos == Vector2i(6, 5), "bump into pillar, no move")


func test_input_buffer() -> void:
	var g = fresh()
	var a = g.submit(Cmd.FORWARD)
	check(a != null and a.type == "move" and g.busy, "first input starts an action")
	check(g.submit(Cmd.TURN_RIGHT) == null and g.queued == Cmd.TURN_RIGHT, "input during action is buffered, not run")
	g.submit(Cmd.TURN_LEFT)
	check(g.queued == Cmd.TURN_LEFT, "buffer holds one input, newest wins")
	check(g.facing == F.NORTH, "buffered input has not changed state yet")
	var n = g.finish_action()
	check(n != null and n.type == "turn" and g.facing == F.WEST, "finishing runs the buffered turn")
	check(g.busy and g.queued == -1, "still busy while buffered action animates; buffer empty")
	check(g.finish_action() == null and not g.busy, "finishing with empty buffer goes idle")
	check(g.submit(Cmd.FORWARD) != null, "idle mover accepts input again")


func key(k: Key) -> InputEventKey:
	var e := InputEventKey.new()
	e.keycode = k
	e.pressed = true
	return e


func _process(_delta: float) -> bool:
	frame += 1
	var cam: Camera3D = main.camera
	match phase:
		0:
			check(cam.position.is_equal_approx(Vector3(4, 1.6, 16)), "camera starts at S, eye height 1.6 (got %s)" % cam.position)
			main._unhandled_input(key(KEY_W))
			main._unhandled_input(key(KEY_E)) # buffered during the step
			phase = 1
			phase_start = frame
		1:
			if not main.mover.busy:
				check(cam.position.is_equal_approx(Vector3(4, 1.6, 14)), "W stepped camera one tile north (got %s)" % cam.position)
				check(is_equal_approx(cam.rotation.y, -PI / 2.0), "buffered E turned camera to east (yaw %.3f)" % cam.rotation.y)
				main._unhandled_input(key(KEY_UP)) # east of (2,7) is (3,7) floor
				phase = 2
		2:
			if not main.mover.busy:
				check(cam.position.is_equal_approx(Vector3(6, 1.6, 14)), "Up arrow stepped east (got %s)" % cam.position)
				var lights := main.find_children("*", "OmniLight3D", true, false)
				check(lights.size() == 1 and lights[0].get_parent() == cam, "one OmniLight on the camera")
				phase = 3
	if phase == 3 or frame > 600:
		if phase != 3:
			check(false, "integration test timed out at phase %d" % phase)
		print("%d checks, %d failures" % [checks, failures])
		quit(1 if failures > 0 else 0)
	return false
