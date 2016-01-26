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
		var params = request.initParams.apply(request, arguments);
		if (verb) {
			params.method = verb === 'del' ? 'DELETE' : verb.toUpperCase();
		}
		var maxAttempts = params.attempts || 3;
		var delay = params.delay || 500;
		var attempts = 0;
		var stream = through2();
		if (params.callback) {
			throw new Error('request-retry-stream does not support callbacks only streaming. PRs are welcome if you want to add support for callbacks');
		}
		if (!params.timeout) {
			throw new Error('request-retry-stream you have to specify a timeout');
		}
		if (params.method !== 'GET') {
			throw new Error('request-retry-stream only supports GETs for now. PRs are welcome if you want to add support for other verbs');
		}
		makeRequest();
		var originalPipe = stream.pipe;
		var destination = null;
		stream.pipe = function(dest){
			destination = dest;
			return originalPipe.apply(stream, arguments);
		};
		return stream;

		function makeRequest() {
			attempts++;
			var potentialStream = through2();
			var done = false;
			var handler = once(function (err, resp) {
				if (shouldRetry(err, resp) && attempts < maxAttempts) {
					potentialStream.destroy(err || new Error('request-retry-stream is retrying this request'));
					return setTimeout(makeRequest, attempts * delay);
				}
				done = true;
				if(!err){
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
					err.attemptsDone = attempts;
					if (util.isError(bodyBufferOrError)) {
						err.streamError = bodyBufferOrError;
					} else {
						err.body = bodyBufferOrError.slice(0, 1500).toString(); //max 1500 bytes
					}
					stream.destroy(err);
				}
			});
			var req = request(params);
			req.pipefilter = function(resp){
				if(done && destination && stream.pipefilter){
					stream.pipefilter(resp, destination);
				}
			};
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
