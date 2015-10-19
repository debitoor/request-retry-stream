var request = require('request');
var through2 = require('through2');
var concat = require('concat-stream');
var util = require('util');
var once = require('once');
var pump = require('pump');

module.exports = verbFunc();
module.exports.get = verbFunc('get');
module.exports.head = verbFunc('head');
module.exports.post = verbFunc('post');
module.exports.put = verbFunc('put');
module.exports.patch = verbFunc('patch');
module.exports.del = verbFunc('del');

function verbFunc(verb) {
	return function () {
		var args = arguments;
		var params = request.initParams.apply(request, args);
		if (verb) {
			params.method = verb === 'del' ? 'DELETE' : verb.toUpperCase();
		}
		var maxAttempts = params.attempts || 3;
		var delay = params.delay || 500;
		var attempts = 0;
		var stream = through2();
		makeRequest();
		return stream;

		function makeRequest() {
			attempts++;
			var potentialStream = through2();
			var handler = once(function(err, resp){
				if (shouldRetry(err, resp) && attempts < maxAttempts) {
					potentialStream.destroy(err);
					return setTimeout(makeRequest, attempts * delay);
				}
				if(resp){
					stream.emit('response', resp);
				}
				if (err || !/2\d\d/.test(resp && resp.statusCode)) {
					//unrecoverable error
					var cb = once(returnError);
					var concatStream = concat(cb);
					return pump(potentialStream, concatStream, cb);
				}
				//all good
				return pump(potentialStream, stream);

				function returnError(bodyBufferOrError) {
					err = err || new Error('Error in request ' + ((err && err.message) || (resp && resp.statusCode)));
					err.statusCode = (resp && resp.statusCode);
					Object.assign(err, params);
					delete err.callback;
					err.attemptsDone = attempts;
					if (util.isError(bodyBufferOrError)) {
						err.streamError = bodyBufferOrError;
					} else {
						err.body = bodyBufferOrError.toString();
					}
					stream.destroy(err);
				}
			});
			var req = request(params);
			req.on('response', function (resp) {
				handler(null, resp);
			});
			req.on('error', handler);
			return pump(req, potentialStream);
		}
	};
}

const RETRIABLE_ERRORS = [
	'ECONNRESET',
	'ENOTFOUND',
	'ESOCKETTIMEDOUT',
	'ETIMEDOUT',
	'ECONNREFUSED',
	'EHOSTUNREACH',
	'EPIPE',
	'EAI_AGAIN'
];
function shouldRetry(err, resp) {
	if (err) {
		return RETRIABLE_ERRORS.indexOf(err.code) !== -1;
	}
	return resp && /5\d\d/.test(resp.statusCode);
}
