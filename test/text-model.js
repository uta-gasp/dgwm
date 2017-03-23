'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('chai').assert;

const TextModel = require('../src/text-model.js');

TextModel.init({
	isTextFixed: true
});

function Target (x, y, w = 100, h = 35) {
	this.left = x;
	this.top = y;
	this.right = x + w;
	this.bottom = y + h;
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

describe( 'TextModel', function() {
	describe( '#create( targets )', function () {
		TextModel.reset();
		const model = TextModel.create( targets );
    	it( `should have 2 lines`, function () {
			assert.equal( 2, model.lines.length );
		});
    	it( `should be 650 px wide`, function () {
			assert.equal( 650, model.lineWidth );
		});
    	it( `should have 35 px high lines`, function () {
			assert.equal( 35, model.lineHeight );
		});
    	it( `should have 65 px spacing`, function () {
			assert.equal( 100, model.lineSpacing );
		});
	});
});


describe( 'Real text', function() {
	const data = fs.readFileSync( getDataFile() );
	const words = JSON.parse( data ).words;

	const targets = words.map( word => {
		return new Target( word.x, word.y, word.width, word.height );
	});

	describe( '#addWord( word )', function () {
		TextModel.reset();
		const model = TextModel.create( targets );
    	it( `should have 4 lines`, function () {
			assert.equal( 4, model.lines.length );
		});
	});
});
