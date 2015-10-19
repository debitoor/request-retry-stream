var express = require('express');
var concat = require('concat-stream');
var pump = require('pump');
var app = express();
var responses = [];
var rrs = require('..');

// respond with "hello world" when a GET request is made to the homepage
app.get('/', function (req, res, next) {
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
function get(r, callback) {
	responses = r;
	result = {};
	var stream = rrs.get('http://localhost:4300', {timeout: 500});
	stream.on('response', function (resp) {
		result.statusCode = resp.statusCode;
	});
	var concatStream = concat(function (body) {
		result.body = body.toString();
	});
	pump(stream, concatStream, function (err) {
		if (err) {
			result.err = Object.assign({stack: err.stack}, err);
		}
		callback();
	});
}

describe('returning success', function () {
	before(done => get([{statusCode: 200, msg: 'success'}], done));

	it('calls with success', ()=> {
		expect(result).to.containSubset({body: 'success', 'statusCode': 200});
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
				uri: 'http://localhost:4300'
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
				uri: 'http://localhost:4300'
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
				uri: 'http://localhost:4300'
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

