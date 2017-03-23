'use strict';

const Logger = require('./utils/logger');
const Line = require('./line').Line;

const TextModel = {

    init: function (options) {
        options = options || {};

        _isTextFixed = options.isTextFixed || true;

        _logger = Logger.forModule( 'TextModel' );
    },

    create: function (targets) {
        if (_isTextFixed && _lines.length > 0) {
            return null;
        }

        this.reset();

        compute( targets );

        return this.model();
    },

    reset: function () {
        // _lines.forEach(function (line) {
        //     line.forEach(function (w) {
        //         _logger.log('new Word({ left: ' + w.rect.left +
        //             ', top: ' + w.rect.top +
        //             ', right: ' + w.rect.right +
        //             ', bottom: ' + w.rect.bottom + ' }),');
        //     });
        // });
        _lines = [];
        _lineSpacing = 0;
        _lineHeight = 0;
        _lineWidth = 0;
    },

    model: function () {
        return {
            lines: _lines,
            lineSpacing: _lineSpacing,
            lineHeight: _lineHeight,
            lineWidth: _lineWidth
        };
    }
};

let _isTextFixed;

let _lines = [];
let _lineSpacing;
let _lineHeight;
let _lineWidth;

let _logger;

function compute (targets) {

    let lineY = 0;
    let currentLine = null;

    for (let i = 0; i < targets.length; i += 1) {
        const target = targets[i];
        const rect = target.getBoundingClientRect();
        if (lineY < rect.top || !currentLine) {
            if (currentLine) {
                _lineSpacing += rect.top - currentLine.top;
                _lineHeight += currentLine.bottom - currentLine.top;
                if (_lineWidth < currentLine.right - currentLine.left) {
                    _lineWidth = currentLine.right - currentLine.left;
                }
            }
            currentLine = new Line( rect, i, target, _lines.length, _lines[ _lines.length - 1 ] );
            _lines.push( currentLine );
            lineY = rect.top;
        }
        else {
            currentLine.add( rect, i, target );
        }
//                _logger.log('{ left: ' + Math.round(rect.left) + ', top: ' + Math.round(rect.top) + ', right: ' + Math.round(rect.right) + ', bottom: ' + Math.round(rect.bottom) + ' }');
    }

    if (currentLine) {
        _lineHeight += currentLine.bottom - currentLine.top;
        _lineHeight /= _lines.length;
        if (_lineWidth < currentLine.right - currentLine.left) {
            _lineWidth = currentLine.right - currentLine.left;
        }
    }

    if (_lines.length > 1) {
        _lineSpacing /= _lines.length - 1;
    }
    else if (_lines.length > 0) {
        const line = _lines[0];
        _lineSpacing = 2 * (line.bottom - line.top);
    }

    const log = _logger.start( _lines.length + ' lines' );
    _logger.end( log );
}

// Publication
module.exports = TextModel;
