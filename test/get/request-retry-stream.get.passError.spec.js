var express = require('express');
var concat = require('concat-stream');
var pump = require('pump');
var app = express();
var responses = [];
var rrs = require('../..');

describe('request-retry-stream GET basics', function () {
	var msg;
	before(function () {

		msg = JSON.stringify({err: true});

		app.disable('x-powered-by');
		app.get('/test', function (req, res, next) {
			if (!responses.length) {
				throw new Error('no responses specified for test');
			}
			var responseToSend = responses.shift();
			if (responseToSend.timeout) {
				return null;
			}
			var buf = new Buffer(responseToSend.msg, 'utf-8');
			res.writeHeader(responseToSend.statusCode, {
				'content-type': 'application/json',
				'content-length': buf.length
			});
			return sendByte();

			function sendByte() {
				if (!buf.length) {
					return res.end();
				}
				res.write(new Buffer([buf.readUInt8(0)]));
				buf = buf.slice(1);
				process.nextTick(sendByte);
			}
		});

		app.use(function (err, req, res, next) {
			var e = Object.assign(err);
			e.stack = err.stack;
			res.statusCode = 500;
			res.json(e);
		});

		var server = app.listen(4330, function () {
			var host = server.address().address;
			var port = server.address().port;
			console.log('Example app listening at http://%s:%s', host, port);
		});
	});

	var result;

	function get(r, callback) {
		responses = r;
		result = {};
		var stream;
		stream = rrs.get({
			url: 'http://localhost:4330/test',
			timeout: 500,
			logFunction: console.warn,
			passThrough: true
		});
		stream.on('response', function (resp) {
			result.statusCode = resp.statusCode;
			result.headers = resp.headers;
		});
		var concatStream = concat(function (body) {
			//console.error(body.toString());
			try {
				result.body = JSON.parse(body.toString());
			} catch (ex) {
				result.body = ex;
				result.bodyString = body.toString();
			}
		});
		pump(stream, concatStream, function (err) {
			if (err) {
				result.err = Object.assign({stack: err.stack}, err);
			}
			callback && callback();
		});
		return {req: stream, dest: concatStream};
	}

	describe('returning success', function () {
		before(done => get([{statusCode: 200, msg: '"success"'}], done));

		it('calls with success', ()=> {
			expect(result).to.containSubset({
				body: 'success',
				statusCode: 200,
				headers: {'content-type': 'application/json'}
			});
		});
	});

	describe('returning 503 and then success', function () {
		before(done => get([{statusCode: 503, msg: 'err'}, {statusCode: 200, msg: '"success"'}], done));

		it('calls with success', ()=> {
			expect(result).to.containSubset({body: 'success', 'statusCode': 200});
		});
	});

	describe('returning 503, 503 and then success', function () {
		before(done => get([{statusCode: 503, msg: 'err'}, {statusCode: 503, msg: 'err'}, {
			statusCode: 200,
			msg: '"success"'
		}], done));

		it('calls with success', ()=> {
			expect(result).to.containSubset({body: 'success', 'statusCode': 200});
		});
	});

	describe('returning 503, 503 and 503', function () {
		before(done => get([{statusCode: 503, msg: 'err'}, {statusCode: 503, msg: 'err'}, {
			statusCode: 503,
			msg
		}], done));

		it('should pass error through', ()=> {
			expect(result).to.containSubset({
				body: {
					err: true
				},
				statusCode: 503
			});
		});
	});

	describe('returning 400', function () {
		before(done => get([{statusCode: 400, msg}], done));

		it('should pass error through', ()=> {
			expect(result).to.containSubset({
				body: {
					err: true
				},
				statusCode: 400
			});
		});
	});

	describe('returning 503 then 400', function () {
		before(done => get([{statusCode: 503, msg: 'err'}, {statusCode: 400, msg}], done));

		it('calls with err', ()=> {
			expect(result).to.containSubset({
				body: {
					err: true
				},
				statusCode: 400
			});
		});
	});

	describe('timing out then 200', function () {
		before(done => get([{timeout: true}, {statusCode: 200, msg: '"success"'}], done));

		it('calls with success', ()=> {
			expect(result).to.containSubset({body: 'success', 'statusCode': 200});
		});
	});
});
