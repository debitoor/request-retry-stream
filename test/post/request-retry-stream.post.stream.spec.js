var express = require('express');
var concat = require('concat-stream');
var pump = require('pump');
var app = express();
var responses = [];
var rrs = require('../..');

//** This doesn't work yet  WORK IN PROGRESS **//
describe.skip('request-retry-stream POST stream', function () {
	before(function () {


		app.disable('x-powered-by');
		app.post('/test', function (req, res, next) {
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
			console.log(err.stack);
			var e = Object.assign(err);
			e.stack = err.stack;
			res.statusCode = 500;
			res.json(e);
		});

		var server = app.listen(4305, function () {
			var host = server.address().address;
			var port = server.address().port;
			console.log('Example app listening at http://%s:%s', host, port);
		});
	});

	var result;

	function post(msg, r, callback) {
		responses = r;
		result = {};
		var stream = rrs.post({
			url: 'http://localhost:4305/test',
			timeout: 500,
			json: true,
			logFunction: console.warn
		});
		stream.on('response', function (resp) {
			result.statusCode = resp.statusCode;
			result.headers = resp.headers;
		});
		var concatStream = concat(function (body) {
			result.body = body.toString();
		});
		pump(stream, concatStream, function (err) {
			if (err) {
				result.err = Object.assign({stack: err.stack}, err);
			}
			callback && callback();
		});
		sendRequest();
		return {req: stream, dest: concatStream};

		function sendRequest() {
			var buf = new Buffer(msg, 'utf-8');
			return sendByte();

			function sendByte() {
				if (!buf.length) {
					return stream.end();
				}
				stream.write(new Buffer([buf.readUInt8(0)]));
				buf = buf.slice(1);
				process.nextTick(sendByte);
			}
		}

	}

	describe('returning success', function () {
		before(done => post('success', [{statusCode: 200}], done));

		it('calls with success', ()=> {
			expect(result).to.containSubset({
				body: 'success',
				statusCode: 200,
				headers: {'content-type': 'application/json'}
			});
		});
	});

	describe('returning 503 and then success', function () {
		before(done => post('success', [{statusCode: 503}, {statusCode: 200}], done));

		it('calls with success', ()=> {
			expect(result).to.containSubset({body: 'success', 'statusCode': 200});
		});
	});

	describe('returning 503, 503 and then success', function () {
		before(done => post('success', [{statusCode: 503}, {statusCode: 503}, {statusCode: 200}], done));

		it('calls with success', ()=> {
			expect(result).to.containSubset({body: 'success', 'statusCode': 200});
		});
	});

	describe('returning 503, 503 and 503', function () {
		before(done => post('err', [{statusCode: 503}, {statusCode: 503}, {statusCode: 503}], done));

		it('calls with err', ()=> {
			expect(result).to.containSubset({
				err: {
					attemptsDone: 3,
					body: 'err',
					method: 'POST',
					statusCode: 503,
					url: 'http://localhost:4305/test'
				}
			});
		});
	});

	describe('returning 400', function () {
		before(done => post('err', [{statusCode: 400}], done));

		it('calls with err', ()=> {
			expect(result).to.containSubset({
				err: {
					attemptsDone: 1,
					body: 'err',
					method: 'POST',
					statusCode: 400,
					url: 'http://localhost:4305/test'
				}
			});
		});
	});

	describe('returning 503 then 400', function () {
		before(done => post('err', [{statusCode: 503}, {statusCode: 400}], done));

		it('calls with err', ()=> {
			expect(result).to.containSubset({
				err: {
					attemptsDone: 2,
					body: 'err',
					method: 'POST',
					statusCode: 400,
					url: 'http://localhost:4305/test'
				}
			});
		});
	});

	describe('timing out then 200', function () {
		before(done => post('success', [{timeout: true}, {statusCode: 200}], done));

		it('calls with success', ()=> {
			expect(result).to.containSubset({body: 'success', 'statusCode': 200});
		});
	});
});
