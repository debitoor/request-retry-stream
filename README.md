# request-retry-stream 

[![npm version](https://badge.fury.io/js/request-retry-stream.svg)](https://badge.fury.io/js/request-retry-stream) [![Build Status](https://travis-ci.org/debitoor/request-retry-stream.svg?branch=master)](https://travis-ci.org/debitoor/request-retry-stream) [![Dependency Status](https://david-dm.org/debitoor/request-retry-stream.svg)](https://david-dm.org/debitoor/request-retry-stream) [![devDependency Status](https://david-dm.org/debitoor/request-retry-stream/dev-status.svg)](https://david-dm.org/debitoor/request-retry-stream#info=devDependencies) [![Coverage Status](https://coveralls.io/repos/github/debitoor/request-retry-stream/badge.svg?branch=master)](https://coveralls.io/github/debitoor/request-retry-stream?branch=master)


Request wrapper with retries, focused on streaming. Also non-2XX http statusCodes are returned as errors with
the information needed for debugging.

	npm install request-retry-stream

## Simple usage in express middleware with pump

```javascript
var rrs = require('request-retry-stream');
var pump = require('pump');

function(req, res, next){
	pump(rrs.get('http://google.com', {timeout: 5000}), res, next);
}

```
## Usage in express middleware with pump

```javascript
var rrs = require('request-retry-stream');
var pump = require('pump');

function(req, res, next){
	var stream = rrs.get({
			url: 'http://google.com'
			attempts: 3, //default
			delay: 500, //default
			timeout: 2000
		});	
	pump(stream, res, next);
}

```


## License

[MIT](http://opensource.org/licenses/MIT)
