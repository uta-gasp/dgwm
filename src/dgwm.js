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

        Logger.enabled = options.verbose;

        _saccadeYThresholdInLines = options.dgwm.saccadeYThresholdInLines || 1.2;
        _saccadeYThresholdInSpacings = options.dgwm.saccadeYThresholdInSpacings || 1.75;
        _fixationXDistFromLineThresholdInPixels = options.dgwm.fixationXDistFromLineThresholdInPixels || 200;
        _fixationYDistFromLineThresholdInSpaces = options.dgwm.fixationYDistFromLineThresholdInSpaces || 0.65;
        _fixationYOffsetDiffThresholdInLines = options.dgwm.fixationYOffsetDiffThresholdInLines || 1.0;
        _emptyLineSuperority = options.dgwm.emptyLineSuperority || 0.3;
        _effectiveLengthReductionMinWordLength = options.dgwm.effectiveLengthReductionMinWordLength || 2;
        _effectiveLengthReductionInChars = options.dgwm.effectiveLengthReductionInChars || 3;

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

        if (fixation.x === 0 && fixation.y === -1) {
            _log.push( '...invalid' );
            // _currentLine = null;
            _logger.end( _log );
            return null;
        }

        _currentLine = lineFromSaccade( fixation.saccade.x, fixation.saccade.y ); // line, null, or false

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

        _currentWord = mapToWord( fixation, _currentLine.words );

        fixation.word = _currentWord;
        if (_currentWord && _currentLine) {
            fixation.line = _currentLine.index;
            _currentWord.fixations.push( fixation );
            _currentLine.addFixation( fixation );
        }

        if (_currentWord && _callbacks.onMapped) {
            _callbacks.onMapped( fixation );
        }

        _logger.end( _log );

        return _currentWord ? _currentWord.element : null;
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

    setWords: function (elements) {
        if (elements) {
            this.reset();
            _textModel = TextModel.create( elements );
        }
        return _textModel;
    },

    reset: function () {
        TextModel.reset();
        _fixationDetector.reset();

        _currentLine = null;
        _currentWord = null;
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
        return _currentWord;
    },

    mappedFix: function () {
        return _lastFixation;
    }
};

// internal
let _saccadeYThresholdInLines;
let _saccadeYThresholdInSpacings;
let _fixationXDistFromLineThresholdInPixels;
let _fixationYDistFromLineThresholdInSpaces;
let _fixationYOffsetDiffThresholdInLines;
let _emptyLineSuperority;

let _effectiveLengthReductionMinWordLength;
let _effectiveLengthReductionInChars;

let _fixationDetector;
let _logger;
let _log;

let _textModel;
let _currentLine;
let _currentWord;
let _lastFixation;

const _callbacks = {
    onMapped: null
};

function hasValuableFixations (line) {
    const progressiveFixations = line.fixations.filter( (fix, fi) => {
        const isProgressive =
            fix[3] &&           // ignore the first fixation in the session (id == 0)
            (fix[2].x > 0 ||    // it should be progressive fixation, or
                (fi === line.fixations.length - 1 &&    // the last fixation mapped to this line
                    line.fixations.length > 1));        // if there are other fixations as well
        return isProgressive;
    });

    if (!_currentLine || line === _currentLine) {
        return progressiveFixations.length > 0;
    }
    else {
        return progressiveFixations.length > 1;
    }
}

function getAverageOffsetY (lines, reference) {
    let sum = 0;
    let weights = 0;
    lines.forEach( line => {
        const y = line.center.y;

        let lineSum = 0;
        let lineWeights = 0;
        line.fixations.forEach( fix => {
            let weight = 1;
            if (reference) {
                const dy = Math.abs( reference.y - fix[1] );
                weight = Math.sqrt( 100 / (dy > 1 ? dy : 1) );
            }
            lineSum += (fix[1] - y);
            lineWeights += weight;
        });

        const averageLineWeight = lineWeights / line.fixations.length;
        const averageOffsetY = lineSum / line.fixations.length;
        _log.push( '    ly =', y.toFixed(0), 'd =', averageOffsetY.toFixed(0), 'w =', averageLineWeight.toFixed(3) );

        sum += averageLineWeight * averageOffsetY;
        weights += averageLineWeight;
    });

    return sum / weights;
}

function getOffsetYFromHistory (reference) {
    const linesWithFixations = _textModel.lines.filter( hasValuableFixations );
    if (!linesWithFixations.length) {
        return 0;
    }

    return getAverageOffsetY( linesWithFixations, reference );
}

function lineFromSaccade (dx, dy) {
    if (!_currentLine) {
        _log.push( 'no reference line to apply line-from-saccade computation' );
        return null;
    }

    const saccadeThreshold = _textModel.lineHeight * _saccadeYThresholdInLines;
    const nextLineSaccadeThreshold = _textModel.lineSpacing * _saccadeYThresholdInSpacings;

    let lineChange = Number.NaN;

    _log.push( 'comparing dy =', dy.toFixed(0), 'against', saccadeThreshold.toFixed(0), '(next_max =', nextLineSaccadeThreshold.toFixed(0), ')' );
    if (Math.abs( dy ) < saccadeThreshold) {
        lineChange = 0;
    }
    else if (dy > 0 && dy < nextLineSaccadeThreshold)  {
        lineChange = 1;
    }
    else if (dy < 0)  {
        lineChange = Math.round( dy / _textModel.lineSpacing);
    }

    _log.push( Number.isNaN( lineChange ) ? 'chaotic jump' : 'line changed by ' + lineChange);

    let result = null;
    if (!Number.isNaN( lineChange )) {
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
    const verticalThreshold = _textModel.lineSpacing * _fixationYDistFromLineThresholdInSpaces;
    const horizontalThreshold = _fixationXDistFromLineThresholdInPixels;
    _log.push( 'estimating line naively, vt =', verticalThreshold.toFixed(0), 'ht =', horizontalThreshold.toFixed(0) );

    const averageOffsetY = getOffsetYFromHistory( fixation );
    _log.push( '    offset', averageOffsetY.toFixed(0) );

    const proximities = _textModel.lines.map( line => {
        let dy = Math.abs( (fixation.y - averageOffsetY) - line.center.y );
        let dx = fixation.x < line.left ? line.left - fixation.x :
                (fixation.x > line.right ? fixation.x - line.right : 0);
        _log.push( '    proximity to line', line.index, 'at y =', line.center.y.toFixed(0), ':', dx.toFixed(2), dy.toFixed(2) );
        return {
            x: dx / horizontalThreshold,
            y: dy / verticalThreshold,
            valid: dx < horizontalThreshold && dy < verticalThreshold,
            line: line
        };
    });

    const bestProximity = proximities.reduce( (best, proximity) => {
        if (!proximity.valid) {
            return best;
        }

        if (best) {
            const scoreCurrent = proximity.x + proximity.y;
            const scoreBest = best.x + best.y;
            const scoreDelta = scoreBest - scoreCurrent;    // lower is better
            const bestHasFixations = hasValuableFixations( best.line );
            const currentHasFixations = hasValuableFixations( proximity.line );

            let threshold;
            //               current
            // b        | f=yes | f=no |
            // e        |-------+------|
            // s f=yes  |   0   |  -T  |
            // t f=no   |   T   |   T  |
            if (!bestHasFixations) {
                threshold = _emptyLineSuperority;  // favor the upper line,
            }
            else if (!currentHasFixations) {
                threshold = -_emptyLineSuperority; // favor the lower line
            }
            else {
                threshold = 0;  // no favor to any line, apply simple comparison
            }

            if (scoreDelta > threshold) {
                if (best.y < _textModel.lineSpacing / 2) {
                    _log.push( '    replaced! line', proximity.line.index, 'closer than line', best.line.index );
                }
                best = proximity;
            }
        }
        else {
            best = proximity;
        }

        return best;
    }, null);

    const mappedLine = bestProximity ? bestProximity.line : null;
    if (mappedLine) {
        _log.push( 'line #', mappedLine.index );
    }
    else {
        _log.push( 'the fixation is not on any line' );
    }

    return mappedLine;
}

function ensureFixationIsClose (fixation) {
    /*
    const fixOffsetY = fixation.y - _currentLine.center.y;
    const fixationYOffsetDiffThreshold = _textModel.lineHeight * _fixationYOffsetDiffThresholdInLines;

    _log.push( 'fix-line Y offset:', fixOffsetY.toFixed(0) );
    _log.push( '    should differ by no more than', fixationYOffsetDiffThreshold.toFixed(0), 'from other offsets' );

    const doesNotFollow = _textModel.lines.find( (line, li) => {
         _log.push( '    line', li, 'has', line.fixations.length, 'fixaions' );
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
    });*/

    const fixOffsetY = fixation.y - _currentLine.center.y;
    const fixationYOffsetDiffThreshold = _textModel.lineSpacing * _fixationYOffsetDiffThresholdInLines;

    const linesWithFixations = _textModel.lines.filter( hasValuableFixations );
    if (!linesWithFixations.length) {
        _log.push( 'cannot verify mapping' );
        return lineFromAbsolutePosition( fixation );
    }

    _log.push( 'verification:' );
    _log.push( '    fix-line dy =', fixOffsetY.toFixed(0), 'should differ max', fixationYOffsetDiffThreshold.toFixed(0), 'from other offsets' );

    const averageOffsetY = getAverageOffsetY( linesWithFixations, fixation );

    _log.push( 'avg offset =', averageOffsetY.toFixed(0) );

    const doesNotFollow = fixOffsetY < averageOffsetY - fixationYOffsetDiffThreshold ||
                          fixOffsetY > averageOffsetY + fixationYOffsetDiffThreshold;

    // common

    if (doesNotFollow) {
        _log.push( '--- the line is too far, mapping naively' );
        return lineFromAbsolutePosition( fixation );
    }

    _log.push( '--- OK' );
    return _currentLine;
}

function mapToWord (fixation, words) {
    _log.push( 'word search' );

    // const mappedWord = mapToWord_Naive( fixation.x, words );
    const mappedWord = mapToWord_Advanced( fixation.x, words );

    if (mappedWord) {
        _log.push( '    mapped to', mappedWord.text, '=', mappedWord.line.index + ', ' + mappedWord.index );
    }
    else {
        _log.push( '    not mapped' );
    }

    return mappedWord;
}

function mapToWord_Naive (x, words) {
    let mappedWord = null;
    let minDist = Number.MAX_VALUE;

    for (let i = 0; i < words.length; ++i) {
        const word = words[i];
        const dist = x < word.left ? (word.left - x) : (x > word.right ? x - word.right : 0);

        if (dist < minDist) {
            mappedWord = word;
            minDist = dist;
            if (dist === 0) {
                break;
            }
        }
    }

    _log.push( '    dist =', minDist.toFixed(0) );

    if (minDist > _fixationXDistFromLineThresholdInPixels) {
        mappedWord = null;
    }

    return mappedWord;
}

function mapToWord_Advanced (x, words) {
    let minDist = Number.MAX_VALUE;
    let closestWord = null;

    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        const wordWidth = word.right - word.left;
        const textLength = word.text.length;
        let effectiveWordWidth = wordWidth;
        if (word.fixations.length > 0 || textLength > _effectiveLengthReductionMinWordLength) {
            const reduceBy = Math.min( _effectiveLengthReductionInChars, textLength - _effectiveLengthReductionMinWordLength );
            const effectiveWordWidthReduction = wordWidth * (reduceBy / textLength);
            effectiveWordWidth = wordWidth - effectiveWordWidthReduction;
        }
        const wordLeft = word.left;
        const wordRight = word.left + effectiveWordWidth;

        if (x >= wordLeft && x < wordRight) {
            closestWord = word;
            minDist = 0;
        }
        else {
            const dist = Math.max( wordLeft - x, x - wordRight );
            if (dist < minDist) {
                minDist = dist;
                closestWord = word;
            }
        }
    }

    if (minDist > _fixationXDistFromLineThresholdInPixels) {
        closestWord = null;
    }

    return closestWord;
}

// Publication
module.exports = DGWM;
