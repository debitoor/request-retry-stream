var express = require('express');
var concat = require('concat-stream');
var pump = require('pump');
var app = express();
var responses = [];
var rrs = require('../..');

describe('request-retry-stream DELETE callbacks', function () {
	
	before(function () {
		app.disable('x-powered-by');
		app.del('/test', function (req, res, next) {
			if (!responses.length) {
				throw new Error('no responses specified for test');
			}
			var responseToSend = responses.shift();
			if (responseToSend.timeout) {
				return null;
			}
			pump(req, concat(sendResponse), function (err) {
				if (err) {
					return next(err);
				}
			});
			function sendResponse(buf) {
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
			}
		});

		app.use(function (err, req, res, next) {
			var e = Object.assign(err);
			e.stack = err.stack;
			res.statusCode = 500;
			res.json(e);
		});

		var server = app.listen(4320, function () {
			var host = server.address().address;
			var port = server.address().port;
			console.log('Example app listening at http://%s:%s', host, port);
		});
	});

	var result;

	function del(msg, r, callback) {
		responses = r;
		result = {};
		rrs.del({
			url: 'http://localhost:4320/test',
			timeout: 1500,
			json: true,
			body: msg,
			logFunction: console.warn
		}, function (err, resp) {
			result.statusCode = resp && resp.statusCode;
			result.headers = resp && resp.headers;
			result.body = resp && resp.body;
			result.err = err;
			callback();
		});
	}

	describe('returning success', function () {
		before(done => del('success', [{statusCode: 200}], done));

		it('calls with success', ()=> {
			expect(result).to.containSubset({
				body: 'success',
				statusCode: 200,
				headers: {'content-type': 'application/json'}
			});
		});
	});

	describe('returning 503 and then success', function () {
		before(done => del('success', [{statusCode: 503}, {statusCode: 200}], done));

		it('calls with success', ()=> {
			expect(result).to.containSubset({body: 'success', 'statusCode': 200});
		});
	});

	describe('returning 503, 503 and then success', function () {
		before(done => del('success', [{statusCode: 503}, {statusCode: 503}, {statusCode: 200}], done));

		it('calls with success', ()=> {
			expect(result).to.containSubset({body: 'success', 'statusCode': 200});
		});
	});

	describe('returning 503, 503 and 503', function () {
		before(done => del('err', [{statusCode: 503}, {statusCode: 503}, {statusCode: 503}], done));

		it('calls with err', ()=> {
			expect(result).to.containSubset({
				err: {
					attemptsDone: 3,
					body: 'err',
					method: 'DELETE',
					statusCode: 503,
					url: 'http://localhost:4320/test'
				}
			});
		});
	});

	describe('returning 400', function () {
		before(done => del('err', [{statusCode: 400}], done));

		it('calls with err', ()=> {
			expect(result).to.containSubset({
				err: {
					attemptsDone: 1,
					body: 'err',
					method: 'DELETE',
					statusCode: 400,
					url: 'http://localhost:4320/test'
				}
			});
		});
	});

	describe('returning 503 then 400', function () {
		before(done => del('err', [{statusCode: 503}, {statusCode: 400}], done));

		it('calls with err', ()=> {
			expect(result).to.containSubset({
				err: {
					attemptsDone: 2,
					body: 'err',
					method: 'DELETE',
					statusCode: 400,
					url: 'http://localhost:4320/test'
				}
			});
		});
	});

	describe('timing out then 200', function () {
		before(done => del('success', [{timeout: true}, {statusCode: 200}], done));

		it('calls with success', ()=> {
			expect(result).to.containSubset({body: 'success', 'statusCode': 200});
		});
	});
});
