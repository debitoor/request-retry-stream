var express = require('express');
var concat = require('concat-stream');
var multifetch = require('multifetch');
var pump = require('pump');
var app = express();
var responses = [];
var rrs = require('..');

app.disable('x-powered-by');
app.get('/test', function (req, res, next) {
	if (!responses.length) {
		throw new Error('no responses specified for test');
	}
	var responseToSend = responses.shift();
	if (responseToSend.timeout) {
		return null;
	}
	res.statusCode = responseToSend.statusCode;
	var buf = new Buffer(responseToSend.msg, 'utf-8');
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

app.get('/multifetch', multifetch());


app.use(function (err, req, res, next) {
	var e = Object.assign(err);
	e.stack = err.stack;
	res.statusCode = 500;
	res.json(e);
});

var server = app.listen(4300, function () {
	var host = server.address().address;
	var port = server.address().port;
	console.log('Example app listening at http://%s:%s', host, port);
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
	var url = 'http://localhost:4300/test';
	if (optionalOptions.multifetch) {
		url = 'http://localhost:4300/multifetch?test=/test';
	}
	var stream = rrs.get({
		url,
		timeout: 500,
		logFunction: console.warn
	});
	stream.on('response', function (resp) {
		result.statusCode = resp.statusCode;
	});
	var concatStream = concat(function (body) {
		result.body = optionalOptions.multifetch ? JSON.parse(body.toString()) : body.toString();
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
	before(done => get([{statusCode: 200, msg: 'success'}], done));

	it('calls with success', ()=> {
		expect(result).to.containSubset({body: 'success', 'statusCode': 200});
	});
});

describe('returning success with multifetch', function () {
	before(done => get([{statusCode: 200, msg: 'success'}], {multifetch: true}, done));

	it('calls with success', ()=> {
		expect(result).to.containSubset({
			body: {
				test: {
					body: 'success',
					statusCode: 200
				}
			},
			statusCode: 200
		});
	});
});

describe('returning 503 and then success', function () {
	before(done => get([{statusCode: 503, msg: 'err'}, {statusCode: 200, msg: 'success'}], done));

	it('calls with success', ()=> {
		expect(result).to.containSubset({body: 'success', 'statusCode': 200});
	});
});

describe('returning 503, 503 and then success', function () {
	before(done => get([{statusCode: 503, msg: 'err'}, {statusCode: 503, msg: 'err'}, {
		statusCode: 200,
		msg: 'success'
	}], done));

	it('calls with success', ()=> {
		expect(result).to.containSubset({body: 'success', 'statusCode': 200});
	});
});

describe('returning 503, 503 and 503', function () {
	before(done => get([{statusCode: 503, msg: 'err'}, {statusCode: 503, msg: 'err'}, {
		statusCode: 503,
		msg: 'err'
	}], done));

	it('calls with err', ()=> {
		expect(result).to.containSubset({
			err: {
				attemptsDone: 3,
				body: 'err',
				method: 'GET',
				statusCode: 503,
				url: 'http://localhost:4300/test'
			},
			statusCode: 503
		});
	});
});

describe('returning 400', function () {
	before(done => get([{statusCode: 400, msg: 'err'}], done));

	it('calls with err', ()=> {
		expect(result).to.containSubset({
			err: {
				attemptsDone: 1,
				body: 'err',
				method: 'GET',
				statusCode: 400,
				url: 'http://localhost:4300/test'
			},
			statusCode: 400
		});
	});
});

describe('returning 503 then 400', function () {
	before(done => get([{statusCode: 503, msg: 'err'}, {statusCode: 400, msg: 'err'}], done));

	it('calls with err', ()=> {
		expect(result).to.containSubset({
			err: {
				attemptsDone: 2,
				body: 'err',
				method: 'GET',
				statusCode: 400,
				url: 'http://localhost:4300/test'
			},
			statusCode: 400
		});
	});
});

describe('timing out then 200', function () {
	before(done => get([{timeout: true}, {statusCode: 200, msg: 'success'}], done));

	it('calls with success', ()=> {
		expect(result).to.containSubset({body: 'success', 'statusCode': 200});
	});
});

describe('pipefilter', function () {
	var req, dest;
	before(done => {
		req = get([{statusCode: 200, msg: 'success'}]);
		req.req.pipefilter = function (r, d) {
			dest = d;
			done();
		};
	});

	it('calls pipefilter with correct dest', ()=> {
		expect(dest).to.eql(req.dest);
	});
	it('calls with success', ()=> {
		expect(result).to.containSubset({body: 'success', 'statusCode': 200});
	});
});

