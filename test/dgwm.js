'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('chai').assert;

const Logger = require('../src/utils/logger.js');
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

function Fix (x, y, prevFix) {
	this.x = x;
	this.y = y;
	this.saccade = { };
	this.saccade.x = prevFix ? x - prevFix.x : 0;
	this.saccade.y = prevFix ? y - prevFix.y : 0;
	this.saccade.newLine = prevFix ? (x < prevFix.x && y > prevFix.y + 50) : false;
	this.previous = prevFix;
	this.next = null;
	this.id = Fix.counter++;
}

Fix.prototype.toString = function () {
	return `${this.x}, ${this.y}`;
};

Fix.counter = 0;

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
        fixationXDistFromLineThresholdInPixels: 100,
        fixationYDistFromLineThresholdInSpaces: 0.7,
        fixationYOffsetDiffThresholdInLines: 0.49,
        emptyLineSuperority: 0.3,
        effectiveLengthReductionMinWordLength: 5,
        effectiveLengthReductionInChars: 3
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

function getDataFile( name ) {
	let dataFolder = process.cwd();
	if (!/test$/.test( dataFolder )) {
		dataFolder = path.join( dataFolder, 'test' );
	}
	return path.join( dataFolder, 'data', name );
}

function runTestOnFile( filename, expectedFixations, hasFixationsNotMapped = true, firstLineIndex = 0 ) {
	// console.log( filename );

	const file = fs.readFileSync( getDataFile( filename ) );
	const data = JSON.parse( file );

	const targets = data.words.map( word => {
		return new Target( word.x, word.y, word.width, word.height, word.text );
	});

	let prevFix = null;
	Fix.counter = 0;
	const fixations = data.fixations.map( fix => {
		const f = new Fix( fix.x, fix.y, prevFix );
		prevFix = f;
		return f;
	});

	describe( `mapping ${filename}`, function () {
		DGWM.setWords( targets );
		fixations.forEach( fix => {
			DGWM.feedFixation( fix );
		});

		const lineIndexes = new Set();
		fixations.forEach( fix => {
			lineIndexes.add( fix.line );
		});

    	it( `should have ${expectedFixations.length} lines ${hasFixationsNotMapped ? '+ undefined' : ''}`, function () {
			assert.equal( expectedFixations.length + (hasFixationsNotMapped ? 1 : 0), lineIndexes.size );
		});

		const fixOnLine = [];
		fixations.forEach( fix => {
			if (fix.line !== undefined) {
				fixOnLine[ fix.line ] = (fixOnLine[ fix.line ] || 0) + 1;
			}
		});

		expectedFixations.forEach( (expectation, index) => {
	    	it( `should have ${expectation} fixations on the lines #${index+firstLineIndex+1}`, function () {
				assert.equal( expectation, fixOnLine[ index + firstLineIndex ] );
			});
		})
	});
}

describe( 'Real data', function() {
	Logger.enabled = false;
	runTestOnFile( 'p10_0_2.json', [10, 8, 9, 8] );
	runTestOnFile( 'p10_2_2.json', [6, 12, 11, 8, 15, 10] );
 	runTestOnFile( 'p13_0_4.json', [7, 7, 7, 5] );
	runTestOnFile( 'p16_2_2.json', [7, 7, 5, 5, 7, 8] );
	runTestOnFile( 'p17_0_2.json', [9, 9, 6, 8] );
	runTestOnFile( 'p17_1_3.json', [11, 7, 7, 11, 9] );
	runTestOnFile( 'p17_2_1.json', [13, 13, 13, 4, 11, 10] );
	runTestOnFile( 'p18_0_2.json', [3, 6, 4, 5]);
	runTestOnFile( 'p1_2_0.json', [5, 6, 8, 7, 8, 9] );
	runTestOnFile( 'p20_1_3.json', [8, 7, 10, 10, 6] );
	runTestOnFile( 'p20_2_0.json', [10, 9, 8, 6, 8, 12] );
	runTestOnFile( 'p22_1_2.json', [9, 9, 11, 9, 8] );
	runTestOnFile( 'p23_2_1.json', [9, 10, 7, 4, 9, 8] );
	runTestOnFile( 'p2_1_3.json', [6, 8, 13, 9, 8] );
	runTestOnFile( 'p2_2_0.json', [6, 10, 7, 6, 11, 7] );
	runTestOnFile( 'p3_1_1.json', [12, 16, 24, 9] ); // > ideal = [11, 17, 24, 9]
	runTestOnFile( 'p4_0_2.json', [8, 6, 4, 12] );
	runTestOnFile( 'p4_1_2.json', [6, 3, 8, 7, 7] );
	runTestOnFile( 'p4_2_2.json', [6, 10, 6, 5, 5, 7] );
	runTestOnFile( 'p5_2_1.json', [8, 6, 7, 5, 13, 11] );
	runTestOnFile( 'p6_1_1.json', [10, 10, 9, 9, 8] );
	runTestOnFile( 'p6_2_1.json', [8, 6, 7, 6, 9, 14] );
	runTestOnFile( 'p7_2_0.json', [3, 11, 7, 7, 7, 16] );
	runTestOnFile( 'p9_1_1.json', [13, 9, 9, 10, 5] );
	runTestOnFile( 'p9_2_2.json', [9, 12, 8, 9, 6, 14] );
});

describe( 'Debugging', function() {
	Logger.enabled = true;
 	runTestOnFile( 'p13_0_4.json', [7, 7, 7, 5] );
});
