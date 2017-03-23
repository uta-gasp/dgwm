// Reading model
'use strict';

const Logger = require('./utils/logger');
const Line = require('./line').Line;
const TextModel = require('./text-model');
const Fixations = require('./fixations');

const DGWM = {

    // Initializes the model
    // Arguments:
    //      settings
    init: function (options) {
        options = options || {};
        options.dgwm = options.dgwm || {};

        _saccadeYThresholdInLines = options.dgwm.saccadeYThresholdInLines || 1.2;
        _saccadeYThresholdInSpacings = options.dgwm.saccadeYThresholdInSpacings || 1.75;
        _fixationYThresholdInSpacings = options.dgwm.fixationYThresholdInSpacings || 0.5;
        _fixationXDistFromLineThresholdInPixels = options.dgwm.fixationXDistFromLineThresholdInPixels || 200;
        _fixationYOffsetDiffThresholdInLines = options.dgwm.fixationYOffsetDiffThresholdInLines || 1.0;

        Line.init( options.line );

        TextModel.init( options.textModel );

        _fixationDetector = Fixations.Detector;
        _fixationDetector.init( options.fixationDetector );

        _logger = Logger.forModule( 'DGWM' );
    },

    feedFixation: function (fixation) {
        if (!fixation) {
            return null;
        }

        _lastFixation = fixation;

        _log = _logger.start( 'feedFixation' );
        _log.push( 'fix', fixation.toString() );

        _currentLine = lineFromSaccade( fixation.saccade.y ); // line, null, or false

        if (!_currentLine) {
            _currentLine = lineFromAbsolutePosition( fixation );
        }
        else {  // check how far the fixation from the currentlt mapped line
            _currentLine = ensureFixationIsClose( fixation );
        }

        if (!_currentLine) {
            _logger.end( _log );
            return null;
        }

        _currentLine.addFixation( fixation );
        fixation.line = _currentLine.index;

        _lastMapped = mapToWord( fixation );

        _logger.end( _log );

        return _lastMapped ? _lastMapped.dom : null;
    },

    feed: function (targets, x, y) {
        let result = null;

        _textModel = TextModel.create( targets );

        const newFixation = _fixationDetector.feed( x, y );
        if (newFixation) {
            result = this.feedFixation( newFixation );
        }
        else {
            _lastFixation = null;
        }

        return result;
    },

    setWords: function (targets) {
        if (targets) {
            this.reset();
            _textModel = TextModel.create( targets );
        }
    },

    reset: function (targets) {
        TextModel.reset();
        _fixationDetector.reset();

        _currentLine = null;
        _lastMapped = null;
        _lastFixation = null;
        _textModel = null;
    },

    callbacks: function (callbacks) {
        if (!callbacks) {
            return _callbacks;
        }
        else {
            _callbacks.onMapped = callbacks.onMapped;
        }
    },

    currentWord: function () {
        return _lastMapped;
    },

    mappedFix: function () {
        return _lastFixation;
    }
};

// internal
let _saccadeYThresholdInLines;
let _saccadeYThresholdInSpacings;
let _fixationYThresholdInSpacings;
let _fixationXDistFromLineThresholdInPixels;
let _fixationYOffsetDiffThresholdInLines;

let _fixationDetector;
let _logger;
let _log;

let _textModel;
let _currentLine;
let _lastMapped;
let _lastFixation;

const _callbacks = {
    onMapped: null
};

function lineFromSaccade (dy) {
    const saccadeThreshold = _textModel.lineHeight * _saccadeYThresholdInLines;
    const nextLineSaccadeThreshold = _textModel.lineSpacing * _saccadeYThresholdInSpacings;

    let lineChange = Number.NaN;

    if (Math.abs( dy ) < saccadeThreshold) {
        lineChange = 0;
    }
    else if (dy > 0 && dy < nextLineSaccadeThreshold)  {
        lineChange = 1;
    }
    else if (dy < 0) {
        lineChange = Math.round( dy / _textModel.lineSpacing);
    }

    _log.push( Number.isNaN( lineChange ) ? 'chaotic jump' : 'line changed by ' + lineChange);

    let result = null;
    if (_currentLine && !Number.isNaN( lineChange )) {
        const newLineIndex = _currentLine.index + lineChange;
        if (newLineIndex >= 0 && newLineIndex < _textModel.lines.length) {
            result = _textModel.lines[ newLineIndex ];
            _log.push( 'line #', result.index );
        }
        else {
            _log.push( 'jump outside the line' );
        }
    }
    else {
        _log.push( 'cannot estimate line from saccade' );
    }


    return result;
}

function lineFromAbsolutePosition (fixation) {
    _log.push( 'estimating line naively' );
    const verticalThreshold = _textModel.lineSpacing * _fixationYThresholdInSpacings;
    const horizontalThreshold = _fixationXDistFromLineThresholdInPixels;

    const result = _textModel.lines.find( line => {
        let dy = Math.abs( fixation.y - line.center.y );
        let dx = fixation.x < line.left ? line.left - fixation.x :
                (fixation.x > line.right ? fixation.x - line.right : 0);
        return dx < horizontalThreshold && dy < verticalThreshold;
    });

    if (result) {
        _log.push( 'line #', result.index );
    }
    else {
        _log.push( 'the fixation is not on any line' );
    }

    return result;
}

function ensureFixationIsClose (fixation) {
    const fixOffsetY = fixation.y - _currentLine.center.y;
    const fixationYOffsetDiffThreshold = _textModel.lineHeight * _fixationYOffsetDiffThresholdInLines;

    _log.push( 'fix-line Y offset:', fixOffsetY.toFixed(0) );
    _log.push( '    should differ by no more than', _textModel.lineHeight.toFixed(0), 'from other offsets' );

    const doesNotFollow = _textModel.lines.find( line => {
        if (!line.fixations.length) {
            return false;
        }

        const y = line.center.y;
        _log.push( '    ly =', y.toFixed(0) );

        const avgOffsetY = line.fixations.reduce( (sum, fix) => {
            // _log.push( '        :', (fix[1] - y).toFixed(0) );
            return sum + (fix[1] - y);
        }, 0) / line.fixations.length;

        _log.push( '        d =', avgOffsetY.toFixed(0) );

        if (avgOffsetY === undefined) {
            return false;
        }

        return fixOffsetY < avgOffsetY - fixationYOffsetDiffThreshold ||
               fixOffsetY > avgOffsetY + fixationYOffsetDiffThreshold;
    });

    if (doesNotFollow) {
        _log.push( '--- the line is too far, mapping naively' );
        return lineFromAbsolutePosition( fixation );
    }

    _log.push( '--- OK' );
    return _currentLine;
}

function mapToWord (fixation) {
    _log.push( 'word search' );
    const x = fixation.x;
    let result = null;
    let minDist = Number.MAX_VALUE;

    const words = _currentLine.words;
    for (let i = 0; i < words.length; ++i) {
        const word = words[i];
        const rect = word.rect;

        const dist = x < rect.left ? (rect.left - x) : (x > rect.right ? x - rect.right : 0);
        _log.push( '   ', dist.toFixed(0), 'to', word.element.textContent );

        if (dist < minDist) {
            result = word;
            minDist = dist;
            if (dist === 0) {
                break;
            }
        }
    }

    fixation.word = result;

    if (result && _callbacks.onMapped) {
        _callbacks.onMapped( fixation );
    }

    _log.push( '    mapped to',
        result ? (result.element.textContent + ' ' + result.line.index + ',' + result.index) : '---',
        '[d=', Math.floor( minDist ), ']' );

    return result;
}

// Publication
module.exports = DGWM;
