extends RefCounted
## Pure movement logic: grid position, facing, can_move, and a one-slot input
## buffer. No nodes, no rendering, so tests can drive it directly.
##
## Usage by the visual layer:
##   var action = mover.submit(cmd)     # returns an action dict, or null if buffered
##   ... animate action ...
##   var next = mover.finish_action()   # returns the buffered action, or null

enum Facing { NORTH, EAST, SOUTH, WEST }
enum Cmd { FORWARD, BACK, STRAFE_LEFT, STRAFE_RIGHT, TURN_LEFT, TURN_RIGHT }

const DIRS := [Vector2i(0, -1), Vector2i(1, 0), Vector2i(0, 1), Vector2i(-1, 0)]

var map: RefCounted
var pos := Vector2i.ZERO
var facing := 0
var busy := false
var queued := -1 # one queued Cmd, -1 = empty


func _init(p_map: RefCounted) -> void:
	map = p_map
	pos = map.start
	facing = map.start_facing


static func dir_vec(f: int) -> Vector2i:
	return DIRS[posmod(f, 4)]


## Grid offset for a step command, relative to the current facing.
func step_offset(cmd: int) -> Vector2i:
	match cmd:
		Cmd.FORWARD: return dir_vec(facing)
		Cmd.BACK: return dir_vec(facing + 2)
		Cmd.STRAFE_LEFT: return dir_vec(facing - 1)
		Cmd.STRAFE_RIGHT: return dir_vec(facing + 1)
	return Vector2i.ZERO


func can_move(cmd: int) -> bool:
	return map.is_walkable(pos + step_offset(cmd))


## Applies a command to the grid state at once and returns what to animate:
##   {type="move", from=Vector2i, to=Vector2i}
##   {type="bump", from=Vector2i, offset=Vector2i}
##   {type="turn", from=int, to=int, delta=-1|1}
func apply(cmd: int) -> Dictionary:
	if cmd == Cmd.TURN_LEFT or cmd == Cmd.TURN_RIGHT:
		var d := -1 if cmd == Cmd.TURN_LEFT else 1
		var old := facing
		facing = posmod(facing + d, 4)
		return {"type": "turn", "from": old, "to": facing, "delta": d}
	var off := step_offset(cmd)
	if map.is_walkable(pos + off):
		var old_pos := pos
		pos += off
		return {"type": "move", "from": old_pos, "to": pos}
	return {"type": "bump", "from": pos, "offset": off}


## Input entry point. While an action is animating the command goes into the
## one-slot buffer (newest wins) and null is returned.
func submit(cmd: int) -> Variant:
	if busy:
		queued = cmd
		return null
	busy = true
	return apply(cmd)


## Call when the current animation ends. Returns the buffered action (and
## stays busy) or null (and becomes idle).
func finish_action() -> Variant:
	if queued >= 0:
		var cmd := queued
		queued = -1
		return apply(cmd)
	busy = false
	return null
