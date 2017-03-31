// Requires:
//      libs/regression
//      utils/logger
'use strict';

const regression = require('../libs/regression');
const Logger = require('./utils/logger');

// Line object
function Line (word, wordID, element, index, prevLine) {
    this.left = Number.MAX_VALUE;
    this.top = Number.MAX_VALUE;
    this.right = Number.MIN_VALUE;
    this.bottom = Number.MIN_VALUE;
    this.center = undefined;

    this.index = index || 0;
    this.previous = prevLine || null;
    this.next = null;
    if (this.previous) {
        this.previous.next = this;
    }

    this.fixations = [];
    this.fitEq = null;

    this.words = [];

    if (word) {
        this.addWord( word, wordID, element );
    }
}

Line.init = function (options) {
    _logger = Logger.forModule( 'Line' );

    options = options || {};

    _useModel = options.useModel || false;
    _modelMaxGradient = options.modelMaxGradient || 0.15;
    _modelTypeSwitchThreshold = options.modelTypeSwitchThreshold || 8;
    _modelRemoveOldFixThreshold = options.modelRemoveOldFixThreshold || 10;
};

Line.prototype.width = function () {
    return this.right - this.left;
};

Line.prototype.addWord = function (word, wordID, element) {
    this.left = Math.min( this.left, word.left );
    this.right = Math.max( this.right, word.right );
    this.top = Math.min( this.top, word.top );
    this.bottom = Math.max( this.bottom, word.bottom );

    this.center = {
        x: (this.left + this.right) / 2,
        y: (this.top + this.bottom) / 2
    };

    this.words.push( new Word( word, wordID, element, this ) );
};

Line.prototype.addFixation = function (fixation) {

    this.fixations.push( [fixation.x, fixation.y, fixation.saccade, fixation.id] );
    if (!_useModel || this.fixations.length < 2) {
        return;
    }

    _log = _logger.start( 'addFixation' );

    this._removeOldFixation();
    const type = this.fixations.length < _modelTypeSwitchThreshold ? 'linear' : 'polynomial';
    const model = regression.model( type, this.fixations, 2 );
    this.fitEq = model.equation;
    _log.push( 'model for line', this.index, ':', this.fitEq.map( x => x.toFixed(3) ) );

    if (type === 'linear') {    // put restriction on the gradient
        if (this.fitEq[1] < -_modelMaxGradient) {
            this.fitEq = fixLinearModel( this.fixations, -_modelMaxGradient );
            _log.push( 'model reset to', this.fitEq[0].toFixed(0), ',', this.fitEq[1].toFixed(3) );
        }
        else if (this.fitEq[1] > _modelMaxGradient) {
            this.fitEq = fixLinearModel( this.fixations, _modelMaxGradient );
            _log.push( 'model reset to', this.fitEq[0].toFixed(0), ',', this.fitEq[1].toFixed(3) );
        }
    }

    _logger.end( _log );
};

// returns difference between model x and the actual x
Line.prototype.fit = function (x, y) {
    if (this.fitEq) {
        const result = y - regression.fit( this.fitEq, x );
        //_logger.log( 'fitting', x, 'to line', this.index, ': error is ', result );
        const log = _logger.start( 'fit' );
        log.push( 'e[', this.index, '|', x, y, '] =', Math.floor( result ) );
        _logger.end( log );

        return result;
    }
    return Number.MAX_VALUE;
};

Line.prototype._removeOldFixation = function () {
    const lastIndex = this.fixations.length - 1;
    if (lastIndex < 5) {
        return;
    }

    let index = lastIndex;
    let fix;
    while (index > 0) {
        fix = this.fixations[ index ];
        if (index > 0 && fix[2].newLine) {       // the current line started here
            if (lastIndex - index + 1 > _modelRemoveOldFixThreshold) {     // lets have at least N fixations
                this.fixations = this.fixations.slice( index );
                _log.push( 'line fixations: reduced' );
            }
            break;
        }
        index -= 1;
    }
};

// internal
let _useModel;
let _modelMaxGradient;
let _modelTypeSwitchThreshold;
let _modelRemoveOldFixThreshold;

let _logger;
let _log;

function fixLinearModel (fixations, gradient) {
    let sum = 0;
    for (let i = 0; i < fixations.length; ++i) {
        const fix = fixations[i];
        sum += fix[1] - gradient * fix[0];
    }
    return [sum / fixations.length, gradient];
}

// Word object
function Word (rect, id, element, line) {
    this.left = rect.left;
    this.top = rect.top;
    this.right = rect.right;
    this.bottom = rect.bottom;

    this.id = id;
    this.index = line.words.length;
    this.text = element.textContent;

    this.element = element;
    this.line = line;
    this.fixations = [];
}

Word.prototype.toString = function () {
    return this.left + ',' + this.top + ' / ' + this.line.index;
};

// Publication
module.exports = {
    Line,
    Word
};
