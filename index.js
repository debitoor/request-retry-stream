var request = require('request');
var concat = require('concat-stream');
var util = require('util');
var once = require('once');
var pump = require('pump');
var ProxyStream = require('./ProxyStream');

module.exports = verbFunc();
module.exports.get = verbFunc('get');
module.exports.head = verbFunc('head');
module.exports.post = verbFunc('post');
module.exports.put = verbFunc('put');
module.exports.patch = verbFunc('patch');
module.exports.del = verbFunc('del');
function noop() {
}

var supportedMethods = ['POST', 'PUT', 'PATCH', 'GET', 'DELETE'];
function verbFunc(verb) {
	return function () {
		var params = request.initParams.apply(request, arguments);
		if (verb) {
			params.method = verb === 'del' ? 'DELETE' : verb.toUpperCase();
		}
		var maxAttempts = params.attempts || 3;
		var delay = params.delay || 500;
		var logFunction = params.logFunction || noop;
		var attempts = 0;
		var stream = new ProxyStream();
		if (!params.timeout) {
			throw new Error('request-retry-stream you have to specify a timeout');
		}
		if (supportedMethods.indexOf(params.method) === -1) {
			throw new Error(`request-retry-stream only supports ${supportedMethods.join(', ')} for now. PRs are welcome if you want to add support for other verbs`);
		}
		var callback = params.callback;
		makeRequest();
		var originalPipe = stream.pipe;
		var destination = null;
		stream.pipe = function (dest) {
			destination = dest;
			return originalPipe.apply(stream, arguments);
		};
		return stream;

		function makeRequest() {
			attempts++;
			var potentialStream = new ProxyStream();
			var success = false;
			var handler = once(function (err, resp) {
				if (shouldRetry(err, resp) && attempts < maxAttempts) {
					potentialStream.destroy(err || new Error('request-retry-stream is retrying this request'));
					logFunction(err || 'request-retry-stream is retrying to perform request');
					return setTimeout(makeRequest, attempts * delay);
				}
				if (err || (!params.passThrough && !/2\d\d/.test(resp && resp.statusCode))) {
					//unrecoverable error
					if (callback) {
						return;
					}
					var cb = once(returnError);
					var concatStream = concat(cb);
					return pump(potentialStream, concatStream, cb);
				}
				//all good
				success = true;
				Object.keys(resp.headers).forEach(function (key) {
					stream.setHeader(key, resp.headers[key]);
				});
				stream.statusCode = resp.statusCode;
				stream.emit('response', resp);
				stream.on('data', noop);
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
			if (callback) {
				params.callback = function (err, resp) {
					if (attempts >= maxAttempts || (err && !isRetryableError(err) ) ) {
						if (err || !/2\d\d/.test(resp && resp.statusCode)) {
							//unrecoverable error
							err = err || new Error('Error in request ' + ((err && err.message) || 'statusCode: ' + (resp && resp.statusCode)));
							err.statusCode = (resp && resp.statusCode);
							Object.assign(err, params);
							err.attemptsDone = attempts;
							err.body = resp && resp.body;
							return callback(err);
						}
						callback.apply(this, arguments);
					}
				}
			}
			var req = request(params);

			req.on('response', function (resp) {
				handler(null, resp);
			});

			req.on('error', handler);

			req.pipefilter = function (resp, proxy) {
				if (success && destination) {
					try {
						for (var i in proxy._headers) {
							destination.setHeader && destination.setHeader(i, proxy._headers[i]);
						}
					} catch (ex) {
						logFunction(ex);
					}
					if (stream.pipefilter) {
						try {
							stream.pipefilter(resp, destination);
						} catch (ex) {
							logFunction(ex);
						}
					}
				}
			};

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
function isRetryableError(err) {
	return RETRIABLE_ERRORS.indexOf(err.code) !== -1;
}
function shouldRetry(err, resp) {
	if (err) {
		return isRetryableError(err);
	}
	return resp && /5\d\d/.test(resp.statusCode);
}
