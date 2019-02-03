function constant(val) {
	return {
		value: val,
		enumerable: true
	};
}

var consts = {
	GRID_SIZE: constant(80),
	CELL_WIDTH: constant(40),
	SPEED: constant(5),
	BORDER_WIDTH: constant(20),
	MAX_PLAYERS: constant(81),
	PREFIXES: constant("Angry Baby Crazy Diligent Excited Fat Greedy Hungry Interesting Japanese Kind Little Magic Naïve Old Powerful Quiet Rich Superman THU Undefined Valuable Wifeless Xiangbuchulai Young Zombie".split(" ")),
	NAMES: constant("Alice Bob Carol Dave Eve Francis Grace Hans Isabella Jason Kate Louis Margaret Nathan Olivia Paul Queen Richard Susan Thomas Uma Vivian Winnie Xander Yasmine Zach".split(" "))
};

Object.defineProperties(module.exports, consts);
