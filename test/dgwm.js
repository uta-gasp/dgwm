'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('chai').assert;

const DGWM = require('../src/dgwm.js');

function Target (x, y, w = 100, h = 35, text = '') {
	this.left = x;
	this.top = y;
	this.right = x + w;
	this.bottom = y + h;
	this.textContent = text;
}

Target.prototype.getBoundingClientRect = function () {
	return this;
}

function getDataFile( name = 'p10_0_2.json' ) {
	let dataFolder = process.cwd();
	if (!/test$/.test( dataFolder )) {
		dataFolder = path.join( dataFolder, 'test' );
	}
	return path.join( dataFolder, 'data', name );
}

const targets = [
	new Target(0, 0),
	new Target(110, 0),
	new Target(220, 0),
	new Target(330, 0),
	new Target(440, 0),
	new Target(550, 0),
	new Target(0, 100),
	new Target(110, 100),
	new Target(220, 100),
	new Target(330, 100),
	new Target(440, 100),
	new Target(550, 100),
];

function Fix (x, y, prevFix) {
	this.x = x;
	this.y = y;
	this.saccade = { };
	this.saccade.x = prevFix ? x - prevFix.x : 0;
	this.saccade.y = prevFix ? y - prevFix.y : 0;
	this.saccade.newLine = prevFix ? (x < prevFix.x && y > prevFix.y + 50) : false;
	this.previous = prevFix;
	this.next = null;
}

Fix.prototype.toString = function () {
	return `${this.x}, ${this.y}`;
};

const fixations = [
	{x: 30, y: 15},
	{x: 130, y: 10},
	{x: 250, y: -5},
	{x: 370, y: 5},
	{x: 470, y: -10},
	{x: 490, y: 5},
	{x: 590, y: 0},
	{x: 200, y: 30},
	{x: 30, y: 120},
	{x: 130, y: 120},
	{x: 250, y: 115},
	{x: 370, y: 100},
	{x: 470, y: 95},
	{x: 490, y: 95},
	{x: 590, y: 90},
];

const fixes = [];
for (let i = 0, lf = null; i < fixations.length; i += 1) {
	let fix = fixations[i];
	fix = new Fix( fix.x, fix.y, lf );
	if (lf) {
		lf.next = fix;
	}
	lf = fix;
	fixes.push( fix );
}

DGWM.init({
	fixationDetector: {
		minDuration: 100,
		threshold: 35,
		sampleDuration: 30,
		filterDemph: 0.4
	},
	textModel: {
		isTextFixed: true
	},
	line: {
		useModel: false,
		modelMaxGradient: 0.15,
	    modelTypeSwitchThreshold: 8,
	    modelRemoveOldFixThreshold: 10
	},
	dgwm: {
        saccadeYThresholdInLines: 1.2,
        saccadeYThresholdInSpacings: 1.75,
        fixationYThresholdInSpacings: 0.5,
        fixationXDistFromLineThresholdInPixels: 200,
        fixationYOffsetDiffThresholdInLines: 1.0
	}
});

// describe.skip( 'DGWM', function() {
// 	describe( '#setWords( targets )', function () {
// 		DGWM.setWords( targets );
//     	it( `should be OK`, function () {
// 			assert.isOk( 'just ok' );
// 		});
// 	});
// 	describe( '#feedFixation( fix )', function () {
// 		fixes.forEach( (fix) => {
// 			DGWM.feedFixation( fix );
// 		});
//     	it( `should be OK`, function () {
// 			assert.isOk( 'just ok' );
// 		});
// 	});
// });

describe( 'Real text', function() {
	const file = fs.readFileSync( getDataFile() );
	const data = JSON.parse( file );

	const targets = data.words.map( word => {
		return new Target( word.x, word.y, word.width, word.height, word.text );
	});

	let prevFix = null;
	const fixations = data.fixations.map( fix => {
		const f = new Fix( fix.x, fix.y, prevFix );
		prevFix = f;
		return f;
	});

	describe( 'mapping', function () {
		DGWM.setWords( targets );
		fixations.forEach( fix => {
			DGWM.feedFixation( fix );
		});

		const lineIndexes = new Set();
		fixations.forEach( fix => {
			lineIndexes.add( fix.line );
		});

    	it( `should have 4 lines + undefined`, function () {
			assert.equal( 5, lineIndexes.size );
		});

		const fixOnLine = [];
		fixations.forEach( fix => {
			if (fix.line !== undefined) {
				fixOnLine[ fix.line ] = (fixOnLine[ fix.line ] || 0) + 1;
			}
		});

    	it( `should have 10 fixations on the lines #1`, function () {
			assert.equal( 10, fixOnLine[0] );
		});
    	it( `should have 8 fixations on the lines #2`, function () {
			assert.equal( 8, fixOnLine[1] );
		});
    	it( `should have 9 fixations on the lines #3`, function () {
			assert.equal( 9, fixOnLine[2] );
		});
    	it( `should have 8 fixations on the lines #4`, function () {
			assert.equal( 8, fixOnLine[3] );
		});
	});
});
