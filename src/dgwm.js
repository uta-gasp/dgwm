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
    init: function (settings) {
        settings = settings || {};
        _settings = settings.dgwm || {};

        Line.init( settings.line );

        TextModel.init( settings.textModel );

        _fixationDetector = Fixations.Detector;
        _fixationDetector.init( settings.fixationDetector );

        _logger = Logger.forModule( 'DGWM' );
    },

    feedFixation: function (fixation) {
        if (!fixation) {
            return;
        }

        _lastFixation = fixation;

        _log = _logger.start( '--- fix ---' );
        _log.push( fixation.toString() );

        _currentLine = lineFromSaccade( fixation.saccade.y ); // line, null, or false

        if (!_currentLine) {
            _currentLine = lineFromAbsolutePosition( fixation );
        }
        else {  // check how far the fixation from the currentlt mapped line
            _currentLine = ensureFixationIsClose( fixation );
        }

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

    reset: function (targets) {
        TextModel.reset();
        _fixationDetector.reset();

        _currentLine = null;
        _lastMapped = null;
        _lastFixation = null;
        _textModel = null;

        if (targets) {
            _textModel = TextModel.create( targets );
        }
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
let _settings;

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
    var saccadeThreshold = _textModel.lineHeight * 1.2;
    var nextLineSaccadeThreshold = _textModel.lineSpacing * 1.75;

    var lineChange = Number.NaN;

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

    var result = null;
    if (_currentLine && !Number.isNaN( lineChange )) {
        var newLineIndex = _currentLine.index + lineChange;
        if (newLineIndex >= 0 && newLineIndex < _textModel.lines.length) {
            result = _textModel.lines[ newLineIndex ];
            _log.push( 'line #', result.index );
        }
        else {
            _log.push( 'jump outside the line' );
        }
    }
    else {
        result = false;
        _log.push( 'cannot estimate line from saccade' );
    }


    return result;
}

function lineFromAbsolutePosition (fixation) {
    var verticalThreshold = _textModel.lineSpacing * 0.5;
    var horizontalThreshold = 200;
    var result = _textModel.lines.find( (line) => {
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
    var fixOffsetY = fixation.y - _currentLine.center.y;
    _log.push( 'checking the Y offset', fixOffsetY );

    var doesNotFollow = _textModel.lines.find( line => {
        if (!line.fixations.length) {
            return false;
        }

        var y = line.center.y;
        _log.push( '    ly =', y );
        var avgOffsetY = line.fixations.reduce( (sum, fix) => {
            _log.push( '    :', (fix[1] - y) );
            return sum + (fix[1] - y);
        }, 0) / line.fixations.length;

        _log.push( '    d = ', avgOffsetY );

        if (avgOffsetY === undefined) {
            return false;
        }

        return fixOffsetY < avgOffsetY - _textModel.lineHeight ||
               fixOffsetY > avgOffsetY + _textModel.lineHeight;
    });

    if (doesNotFollow) {
        _log.push( 'the line is too far, mapping naively' );
        return lineFromAbsolutePosition( fixation );
    }

    return _currentLine;
}

function mapToWord (fixation) {
    if (!_currentLine) {
        return null;
    }

    _currentLine.addFixation( fixation );
    fixation.line = _currentLine.index;

    var x = fixation.x;
    var result = null;
    var minDist = Number.MAX_VALUE;

    var words = _currentLine.words;
    for (var i = 0; i < words.length; ++i) {
        var word = words[i];
        var rect = word.rect;

        var dist = x < rect.left ? (rect.left - x) : (x > rect.right ? x - rect.right : 0);
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

    _log.push( '[d=', Math.floor( minDist ), ']', result ? result.line.index + ',' + result.index : '' );

    return result;
}

// Publication
module.exports = DGWM;
