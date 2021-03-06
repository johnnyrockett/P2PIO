var Stack = require("./stack");
var Color = require("./color");
var Grid = require("./grid");
var { consts } = require("../../config.json");

function defineGetter(getter) {
	return {
		get: getter,
		enumerable: true
	};
}

function defineInstanceMethods(thisobj, data /*, methods...*/) {
	for (var i = 2; i < arguments.length; i++) {
		thisobj[arguments[i].name] = arguments[i].bind(this, data);
	}
}

function defineAccessorProperties(thisobj, data /*, names...*/) {
	var descript = {};
	function getAt(name) {
		return () => {
			return data[name];
		};
	}
	for (var i = 2; i < arguments.length; i++) {
		descript[arguments[i]] = defineGetter(getAt(arguments[i]));
	}
	Object.defineProperties(thisobj, descript);
}

function TailMove(orientation, startRow, startCol) {
  this.move = 1;
  this.startRow = startRow;
  this.startCol = startCol;
  this.onTail = function onTail(c) {
    switch(this.orientation) {
      case 0: // UP
        return c[1] === this.startCol && c[0] <= this.startRow && c[0] >= this.startRow - this.move;
      case 2: // DOWN
        return c[1] === this.startCol && c[0] >= this.startRow && c[0] <= this.startRow + this.move;
      case 1: // RIGHT
        return c[0] === this.startRow && c[1] >= this.startCol && c[1] <= this.startCol + this.move;
      case 3: // LEFT
        return c[0] === this.startRow && c[1] <= this.startCol && c[1] >= this.startCol - this.move;
      case 4: // STILL (no tail)
        return false;
    }
  }
	Object.defineProperty(this, "orientation", {
		value: orientation,
		enumerable: true
  });
}

function Tail(player, sdata) {
	var data = {
		tail: [],
		prev: null,
		startRow: 0,
		startCol: 0,
		prevRow: 0,
		prevCol: 0,
		player
	};

	data.grid = player.grid;

	defineInstanceMethods(this, data, getTail, addTail, getPrevRow, getPrevCol, hitsTail, fillTail, renderTail, reposition);
	Object.defineProperty(this, "moves", {
		get: function() {
			return data.tail.slice(0);
		},
		enumerable: true
	});
}

function getTail(data) {
  return data.tail;
}

function getPrevRow(data) {
  return data.prevRow;
}

function getPrevCol(data) {
  return data.prevCol;
}

function addTail(data, orientation, count) {
  // Discounts bad counts
	if (count === undefined) count = 1;
  if (!count || count == 0) return;

	var prev = data.prev;
	var r = data.prevRow, c = data.prevCol;

	if (!prev || prev.orientation !== orientation) {
    prev = data.prev = new TailMove(orientation, r, c);
		data.tail.push(prev);
		prev.move += count - 1;
	}
	else prev.move += count;

  var pos = walk([data.prevRow, data.prevCol], null, orientation, count);
  data.prevRow = pos[0];
  data.prevCol = pos[1];
}

function reposition(data, row, col) {
	data.prevRow = data.startRow = row;
	data.prevCol = data.startCol = col;
	data.prev = null;
	if (data.tail.length === 0) return;
	else {
		var ret = data.tail;
		data.tail = [];
		return ret;
	}
}

//Helper methods
function renderTail(data, ctx) {
	if (data.tail.length === 0) return;

	ctx.fillStyle = data.player.tailColor.rgbString();

	var prevOrient = -1;
	var start = [data.startRow, data.startCol];

	//fillTailRect(ctx, start, start);
	data.tail.forEach(tail => {
		var negDir = tail.orientation === 0 || tail.orientation === 3;

		var back = start;
		if (!negDir) start = walk(start, null, tail.orientation, 1);
		var finish = walk(start, null, tail.orientation, tail.move - 1);

		if (tail.move > 1) fillTailRect(ctx, start, finish);
		if (prevOrient !== -1) renderCorner(ctx, back, prevOrient, tail.orientation);
		//Draw folding triangle.
		start = finish;
		if (negDir) walk(start, start, tail.orientation, 1);
		prevOrient = tail.orientation;
	});

	var curOrient = data.player.currentHeading;
	if (prevOrient === curOrient) fillTailRect(ctx, start, start);
	else renderCorner(ctx, start, prevOrient, curOrient);
}

function renderCorner(ctx, cornerStart, dir1, dir2) {
	if (dir1 === 0 || dir2 === 0) walk(cornerStart, cornerStart, 2, 1);
	if (dir1 === 3 || dir2 === 3) walk(cornerStart, cornerStart, 1, 1);

	var a = walk(cornerStart, null, dir2, 1);
	var b = walk(a, null, dir1, 1);

	var triangle = new Path2D();
	triangle.moveTo(cornerStart[1] * consts.CELL_WIDTH, cornerStart[0] * consts.CELL_WIDTH);
	triangle.lineTo(a[1] * consts.CELL_WIDTH, a[0] * consts.CELL_WIDTH);
	triangle.lineTo(b[1] * consts.CELL_WIDTH, b[0] * consts.CELL_WIDTH);
	triangle.closePath();
	for (var i = 0; i < 2; i++) {
		ctx.fill(triangle);
	}
}

function walk(from, ret, orient, dist) {
	ret = ret || [];
	ret[0] = from[0];
	ret[1] = from[1];
	switch (orient) {
		case 0: ret[0] -= dist; break; //UP
		case 1: ret[1] += dist; break; //RIGHT
		case 2: ret[0] += dist; break; //DOWN
		case 3: ret[1] -= dist; break; //LEFT
	}
	return ret;
}

function fillTailRect(ctx, start, end) {
	var x = start[1] * consts.CELL_WIDTH;
	var y = start[0] * consts.CELL_WIDTH;
	var width = (end[1] - start[1]) * consts.CELL_WIDTH;
	var height = (end[0] - start[0]) * consts.CELL_WIDTH;

	if (width === 0) width += consts.CELL_WIDTH;
	if (height === 0) height += consts.CELL_WIDTH;

	if (width < 0) {
		x += width;
		width = -width;
	}
	if (height < 0) {
		y += height;
		height = -height;
	}
	ctx.fillRect(x, y, width, height);
}

function fillTail(data) {
	if (data.tail.length === 0) return;

	function onTail(c) {
    for (var i=0; i<data.tail.length; i++) {
      if (data.tail[i].onTail(c))
        return true;
    }
    return false;
	}

	var grid = data.grid;
	var start = [data.startRow, data.startCol];
	var been = new Grid(grid.size);
	var coords = [];

	coords.push(start);
	while (coords.length > 0) { //BFS for all tail spaces
		var coord = coords.shift();
		var r = coord[0];
		var c = coord[1];

		if (grid.isOutOfBounds(r, c) || been.get(r, c)) continue;

		if (onTail(coord)) {//On the tail
			been.set(r, c, true);
			grid.set(r, c, data.player);

			//Find all spots that this tail encloses
			floodFill(data, grid, r + 1, c, been);
			floodFill(data, grid, r - 1, c, been);
			floodFill(data, grid, r, c + 1, been);
			floodFill(data, grid, r, c - 1, been);

			coords.push([r + 1, c]);
			coords.push([r - 1, c]);
			coords.push([r, c + 1]);
			coords.push([r, c - 1]);
		}
	}
}

function floodFill(data, grid, row, col, been) {
	function onTail(c) {
    for (var i=0; i<data.tail.length; i++) {
      if (data.tail[i].onTail(c))
        return true;
    }

    return false;
	}

	var start = [row, col];
	if (grid.isOutOfBounds(row, col) || been.get(row, col) || onTail(start) || grid.get(row, col) === data.player) return;
	//Avoid allocating too many resources
	var coords = [];
	var filled = new Stack(consts.GRID_COUNT * consts.GRID_COUNT + 1);
	var surrounded = true;

	coords.push(start);
	while (coords.length > 0) {
		var coord = coords.shift();
		var r = coord[0];
		var c = coord[1];

		if (grid.isOutOfBounds(r, c)) {
			surrounded = false;
			continue;
		}

		//End this traverse on boundaries (where we been, on the tail, and when we enter our territory)
		if (been.get(r, c) || onTail(coord) || grid.get(r, c) === data.player) continue;

		been.set(r, c, true);

		if (surrounded) filled.push(coord);

		coords.push([r + 1, c]);
		coords.push([r - 1, c]);
		coords.push([r, c + 1]);
		coords.push([r, c - 1]);
	}
	if (surrounded) {
		while (!filled.isEmpty()) {
			coord = filled.pop();
			grid.set(coord[0], coord[1], data.player);
		}
	}
	return surrounded;
}

function hitsTail(data, other) {
  var hits = false;
  for (var i=0; i<data.tail.length; i++) {
    if (data.tail[i].onTail([other.row, other.col])) {
      hits = true;
      break;
    }
  }

	return (data.prevRow !== other.row || data.prevCol !== other.col)
	&& (data.startRow !== other.row || data.startCol !== other.col)
  && hits;
}

var SHADOW_OFFSET = 10;

function Player(grid, sdata) {
	var data = {};

	//Parameters
	data.num = sdata.num; // player id
	data.name = sdata.name || "Player " + (data.num + 1); // player name
	data.grid = grid; // their own copy of who owns what territory?
	data.posX = sdata.posX; // x coord
  data.posY = sdata.posY; // y coord
  data.originX = sdata.posX;
  data.originY = sdata.posY;
	this.heading = data.currentHeading = sdata.currentHeading; //0 is up, 1 is right, 2 is down, 3 is left
	data.waitLag = sdata.waitLag || 0;
  data.dead = false;
  data.referenceTime = null;

	//Only need colors for client side
	var base;
	if (sdata.base) base = this.baseColor = sdata.base instanceof Color ? sdata.base : Color.fromData(sdata.base);
	else {
		var hue = Math.random();
		this.baseColor = base = new Color(hue, .8, .5);
	}
	this.lightBaseColor = base.deriveLumination(.1);
	this.shadowColor = base.deriveLumination(-.3);
	this.tailColor = base.deriveLumination(.2).deriveAlpha(0.98);

	//Tail requires special handling
	this.grid = grid; //Temporary
	if (sdata.tail) data.tail = new Tail(this, sdata.tail);
	else {
		data.tail = new Tail(this);
		data.tail.reposition(calcRow(data), calcCol(data));
	}

    //Instance methods
    this.reConfigure = reConfigure.bind(data);
  this.move = move.bind(this, data);
  this.updateReferencePoint = updateReferencePoint.bind(this, data);
	this.die = () => { data.dead = true; };

	//Read-only Properties
	defineAccessorProperties(this, data, "currentHeading", "dead", "name", "num", "posX", "posY", "grid", "tail", "waitLag");
	Object.defineProperties(this, {
		row: defineGetter(() => calcRow(data)),
		col: defineGetter(() => calcCol(data))
	});
}

//Gets the next integer in positive or negative direction
function nearestInteger(positive, val) {
	return positive ? Math.ceil(val) : Math.floor(val);
}

function calcRow(data) {
	return nearestInteger(data.currentHeading === 2 /*DOWN*/, data.posY / consts.CELL_WIDTH);
}

function calcCol(data) {
	return nearestInteger(data.currentHeading === 1 /*RIGHT*/, data.posX / consts.CELL_WIDTH);
}

//Instance methods
Player.prototype.render = function(ctx, fade) {
	//Render tail
	this.tail.renderTail(ctx);
	//Render player
	fade = fade || 1;
	ctx.fillStyle = this.shadowColor.deriveAlpha(fade).rgbString();
	ctx.fillRect(this.posX, this.posY, consts.CELL_WIDTH, consts.CELL_WIDTH);

	var mid = consts.CELL_WIDTH / 2;
	var grd = ctx.createRadialGradient(this.posX + mid, this.posY + mid - SHADOW_OFFSET, 1, this.posX + mid, this.posY + mid - SHADOW_OFFSET, consts.CELL_WIDTH);
	//grd.addColorStop(0, this.baseColor.deriveAlpha(fade).rgbString());
	//grd.addColorStop(1, new Color(0, 0, 1, fade).rgbString());
	//ctx.fillStyle = grd;
	ctx.fillStyle = this.shadowColor.deriveLumination(.2).rgbString();
	ctx.fillRect(this.posX - 1, this.posY - SHADOW_OFFSET, consts.CELL_WIDTH + 2, consts.CELL_WIDTH);

	//Render name
	ctx.fillStyle = this.shadowColor.deriveAlpha(fade).rgbString();
	ctx.textAlign = "center";

	var yoff = -SHADOW_OFFSET * 2;
	if (this.row === 0) yoff = SHADOW_OFFSET * 2 + consts.CELL_WIDTH;
	ctx.font = "18px Changa";
	ctx.fillText(this.name, this.posX + consts.CELL_WIDTH / 2, this.posY + yoff);
};

function reConfigure(x, y, lag, heading) {
    this.posX = x;
    this.posY = y;
    this.waitLag = lag;
    this.heading = this.currentHeading = heading;
}

function updateReferencePoint(data, referenceTime) {
  if (data.referenceTime != null) {
    var difTime = referenceTime - data.referenceTime;
    var positionOffset = difTime / (1000 / consts.SPEEDFPS) * consts.SPEED;

    var { heading } = this;

    var diff = positionOffset % consts.CELL_WIDTH;
    if (diff < consts.CELL_WIDTH/2) {
      positionOffset -= diff;
    } else {
      positionOffset += consts.CELL_WIDTH - diff;
    }

    switch (heading) {
      case 0: data.originY -= positionOffset; break; //UP
      case 1: data.originX += positionOffset; break; //RIGHT
      case 2: data.originY += positionOffset; break; //DOWN
      case 3: data.originX -= positionOffset; break; //LEFT
      case 4: break;
    }
    data.posX = data.originX;
    data.posY = data.originY;

    var { row, col } = this;

    if (data.grid.isOutOfBounds(row, col)) {
      data.dead = true;
      return;
    }
    var oldr = this.tail.getPrevRow();
    var oldc = this.tail.getPrevCol();
    var count = 0;
    switch (heading) {
      case 0: count = oldr - row; break; //UP
      case 1: count = col - oldc; break; //RIGHT
      case 2: count = row - oldr; break; //DOWN
      case 3: count = oldc - col; break; //LEFT
      case 4: break; // Do nothing
    }
    // if (count > 0)
    this.tail.addTail(heading, count);
    //Update tail position
    if (data.grid.get(row, col) === this) {
      //Safe zone!
      this.tail.fillTail();
      this.tail.reposition(row, col);
    }
  }
  data.referenceTime = referenceTime;
}

function move(data, currentTime) {
	if (data.waitLag < consts.NEW_PLAYER_LAG) { //Wait for a second at least
		data.waitLag++;
		return;
	}
	//Move to new position
  var { heading } = this;
	// if (this.posX % consts.CELL_WIDTH !== 0 || this.posY % consts.CELL_WIDTH !== 0) heading = data.currentHeading;
  // else data.currentHeading = heading;
  data.currentHeading = heading;

  var difTime = currentTime - data.referenceTime;
  var offset = difTime / (1000 / consts.SPEEDFPS) * consts.SPEED;
  // console.log(offset);

	switch (heading) {
		case 0: data.posY = data.originY - offset; break; //UP
		case 1: data.posX = data.originX + offset; break; //RIGHT
		case 2: data.posY = data.originY + offset; break; //DOWN
    case 3: data.posX = data.originX - offset; break; //LEFT
    case 4: return; // Do nothing
  }

	//Check for out of bounds
	var { row, col } = this;
	if (data.grid.isOutOfBounds(row, col)) {
		data.dead = true;
		return;
  }
  var oldr = this.tail.getPrevRow();
  var oldc = this.tail.getPrevCol();
  var count = 0;
  switch (heading) {
		case 0: count = oldr - row; break; //UP
		case 1: count = col - oldc; break; //RIGHT
		case 2: count = row - oldr; break; //DOWN
    case 3: count = oldc - col; break; //LEFT
    case 4: return; // Do nothing
  }

  // if (count > 0)
  this.tail.addTail(heading, count-1);
	//Update tail position
	if (data.grid.get(row, col) === this) {
		//Safe zone!
		this.tail.fillTail();
    this.tail.reposition(row, col);
  }

}

function moveInverse(oldData, freshData) {
    //Move to new position
    var { heading } = this;
    switch (heading) {
		case 0: data.posY += consts.SPEED; break; //UP
		case 1: data.posX -= consts.SPEED; break; //RIGHT
		case 2: data.posY -= consts.SPEED; break; //DOWN
		case 3: data.posX += consts.SPEED; break; //LEFT
	}
    heading = oldData.currentHeading;

	//Check for out of bounds
	var { row, col } = this;
	//Update tail position
	if (data.grid.get(row, col) === this) { // If the row and column we are on is already our territory
		//Safe zone!
		this.tail.fillTail(); // collect the loop created by the tail as player territory
		this.tail.reposition(row, col);
	}
    //If we are completely in a new cell (not in our safe zone), we add to the tail
    // so posX and posY are relative positions to where it used to be? I should see where they are set
    else if (this.posX % consts.CELL_WIDTH === 0 && this.posY % consts.CELL_WIDTH === 0) this.tail.addTail(heading);
}

module.exports = Player;
