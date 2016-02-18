var express = require('express');
var concat = require('concat-stream');
var multifetch = require('multifetch');
var request = require('request');
var pump = require('pump');
var ProxyStream = require('../../ProxyStream');
var app = express();
var responses = [];
var rrs = require('../..');

describe('GET multifetch sync', function () {
	before(function () {

		app.disable('x-powered-by');
		app.set('etag', false);
		app.get('/test', function (req, res, next) {
			if (!responses.length) {
				throw new Error('no responses specified for test');
			}
			var responseToSend = responses.shift();
			if (responseToSend.timeout) {
				return null;
			}
			res.writeHeader(responseToSend.statusCode, {
				'content-type': 'application/json',
				'content-length': responseToSend.msg.length
			});
			res.write(responseToSend.msg);
			res.end();
		});

		app.get('/rrs', function (req, res, next) {
			var stream = rrs.get({
				url: 'http://localhost:4302/test',
				attempts: 3, //default
				delay: 500, //default
				timeout: 2000,
				json: true,
				logFunction: console.warn // optional, if you want to be notified about retry
			});
			var ps = new ProxyStream();
			stream.on('response', function onResponse(proxyRes) {
				Object.keys(proxyRes.headers).forEach(function (headerName) {
					res.setHeader(headerName.toLowerCase(), proxyRes.headers[headerName]);
				});
				res.statusCode = proxyRes.statusCode;
			});
			stream.pipefilter = function (response, proxy) {
				for (var i in ps._headers) {
					res.setHeader(i, ps._headers[i]);
				}
			};
			pump(stream, ps, res, next);
		});

		app.get('/request', function (req, res, next) {
			var stream = request.get({
				url: 'http://localhost:4302/test',
				timeout: 2000
			});
			pump(stream, res, next);
		});

		app.get('/multifetch', multifetch());


		app.use(function (err, req, res, next) {
			var e = Object.assign(err);
			e.stack = err.stack;
			res.statusCode = 500;
			res.json(e);
		});

		var server = app.listen(4302, function () {
			var host = server.address().address;
			var port = server.address().port;
			console.log('Example app listening at http://%s:%s', host, port);
		});
	});

	var result;

	function get(r, optionalOptions, callback) {
		if (typeof optionalOptions === 'function') {
			callback = optionalOptions;
			optionalOptions = {};
		}
		optionalOptions = optionalOptions || {};
		responses = r;
		result = {};
		var stream;
		if (optionalOptions.multifetch) {
			stream = request.get({
				url: 'http://localhost:4302/multifetch?rrs=/rrs',
				timeout: 5000
			});
		} else {
			stream = request.get({
				url: 'http://localhost:4302/test',
				timeout: 5000,
				logFunction: console.warn
			});
		}
		stream.on('response', function (resp) {
			result.statusCode = resp.statusCode;
			result.headers = resp.headers;
		});
		var concatStream = concat(function (body) {
			result.body = JSON.parse(body.toString());
		});
		pump(stream, concatStream, function (err) {
			if (err) {
				result.err = Object.assign({stack: err.stack}, err);
			}
			callback && callback();
		});
		return {req: stream, dest: concatStream};
	}

	describe('returning success with multifetch', function () {
		var requestResult, rrsResult;
		before(done => get([{statusCode: 200, msg: '"success"'}], {multifetch: true}, done));
		before(()=> rrsResult = result.body.rrs);

		before(done => get([{statusCode: 200, msg: '"success"'}], done));
		before(()=> requestResult = result);

		it('calls with success', ()=> {
			delete rrsResult.headers.date;
			delete requestResult.headers.date;
			expect(rrsResult).to.eql(requestResult);
		});
	});

	describe('returning 503 then success with multifetch', function () {
		this.timeout(6000);
		var requestResult, rrsResult;
		before(done => get([{statusCode: 503, msg: 'err'}, {
			statusCode: 200,
			msg: '"success"'
		}], {multifetch: true}, done));
		before(()=> rrsResult = result.body.rrs);

		before(done => get([{statusCode: 200, msg: '"success"'}], done));
		before(()=> requestResult = result);

		it('calls with success', ()=> {
			delete rrsResult.headers.date;
			delete requestResult.headers.date;
			expect(rrsResult).to.eql(requestResult);
		});
	});

	describe('returning 503, 503, 503 with multifetch', function () {
		this.timeout(6000);
		var rrsResult;
		before(done => get([{statusCode: 503, msg: 'err'}, {statusCode: 503, msg: 'err'}, {
			statusCode: 503,
			msg: 'err'
		}], {multifetch: true}, done));
		before(()=> rrsResult = result.body.rrs);

		it('calls with success', ()=> {
			delete rrsResult.headers.date;
			expect(rrsResult).to.eql({
				body: {
					statusCode: 503,
					url: 'http://localhost:4302/test',
					attempts: 3,
					delay: 500,
					timeout: 2000,
					json: true,
					method: 'GET',
					attemptsDone: 3,
					body: 'err'
				},
				statusCode: 500,
				headers: {
					'content-type': 'application/json; charset=utf-8',
					'content-length': '150'
				}
			});
		});
	});

	describe('timeout then success with multifetch', function () {
		this.timeout(6000);
		var requestResult, rrsResult;
		before(done => get([{timeout: true}, {statusCode: 200, msg: '"success"'}], {multifetch: true}, done));
		before(()=> rrsResult = result.body.rrs);

		before(done => get([{statusCode: 200, msg: '"success"'}], done));
		before(()=> requestResult = result);

		it('calls with success', ()=> {
			delete rrsResult.headers.date;
			delete requestResult.headers.date;
			expect(rrsResult).to.eql(requestResult);
		});
	});
});
