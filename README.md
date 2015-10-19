# request-retry-stream

Request wrapper with retries, focused on streaming. Also non-2XX http statusCodes are returned as errors with
the information needed for debugging.

	npm install request-retry-stream

## Simple usage in express middleware with pump

```javascript
var rrs = require('request-retry-stream');
var pump = require('pump');

function(req, res, next){
	pump(rrs.get('http://google.com'), {timeout: 5000}, res, next);
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
