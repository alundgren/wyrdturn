extends RefCounted
## Pure map data. Parses the shared text map format (see maps/test01.txt).
## x = column (east is +x), y = row (south is +y).

const WALL := "#"
const FLOOR := "."
const DOOR := "D"
const START := "S"
const PILLAR := "P"
const OUTSIDE := " "

var rows: PackedStringArray = []
var width := 0
var height := 0
var start := Vector2i(-1, -1)
var start_facing := 0 # 0 = north


static func from_file(path: String) -> RefCounted:
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null:
		push_error("Cannot open map %s (error %d)" % [path, FileAccess.get_open_error()])
		return null
	var text := f.get_as_text()
	return from_text(text)


static func from_text(text: String) -> RefCounted:
	var m = load("res://scripts/dungeon_map.gd").new()
	for line in text.split("\n"):
		line = line.trim_suffix("\r")
		if line.begins_with("#") and line.length() > 1 and line[1] == " ":
			# Header comment ("# text"). Limitation: a map row that starts with a
			# wall followed by an outside tile would also be skipped.
			continue
		if line.strip_edges() == "" and m.rows.is_empty():
			continue
		m.rows.append(line)
	# drop trailing empty rows
	while not m.rows.is_empty() and m.rows[m.rows.size() - 1].strip_edges() == "":
		m.rows.remove_at(m.rows.size() - 1)
	m.height = m.rows.size()
	for y in m.height:
		m.width = max(m.width, m.rows[y].length())
		var sx: int = m.rows[y].find(START)
		if sx >= 0:
			m.start = Vector2i(sx, y)
	return m


func tile(p: Vector2i) -> String:
	if p.y < 0 or p.y >= height or p.x < 0:
		return OUTSIDE
	var row: String = rows[p.y]
	if p.x >= row.length():
		return OUTSIDE
	return row[p.x]


func is_walkable(p: Vector2i) -> bool:
	var t := tile(p)
	return t == FLOOR or t == DOOR or t == START
