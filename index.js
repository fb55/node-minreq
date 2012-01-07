var http = require("http"),
	https = require("https"),
	url = require("url");

module.exports = function(options, cb){
	if(typeof options === "string"){
		options = { uri: options };
	}
	return new Request(options, cb);
};

//Add methods for the most common cases
["GET", "POST", "HEAD", "DELETE", "UPDATE"].forEach(function(method){
	module.exports[method.toLowerCase()] = function(uri, cb){
		uri = url.parse(uri);
		uri.method = method;
		return new Request({ uri: uri }, cb);
	};
});

var protocols = {
	"http:": http,
	"https:": https
};
module.exports.addProtocol = function(name, module){
	protocols[name] = module;
};

/*
* Options:
*	uri: Object that's passed to http(s).request (http://nodejs.org/docs/latest/api/all.html#http.request)
*	followRedirect: Boolean that indicates whether redirects should be followed
*	maxRedirects: int with the maximum number of redirects (defaults to 10)
*	body: that data that should be passed to the request
*	encoding: the encoding that all data should use (the body will always be a string)
*	timeout: a request times out if it passes this limit. Defaults to 10000 (read: 10 seconds)
*/

var Request = function(options, cb){
	this._options = options;
	this._ended = false;
	this._resp = null;
	this.response = null;
	
	this._cb = cb;
	this._body = "";
	
	this._createRequest(options);
	if(!this._request) return;
	
	var scope = this;
	
	this.on("error", function(err){
		scope._cb(err);
	}).on("end", function(){
		scope._cb(null, scope._headers, scope._body);
	}).on("data", function(chunk){
		if(!scope._written) scope._written = true;
		scope._body += chunk;
	});
	
	if(options.body) this._request.write(options.body);
	
	this.writable = options.uri.method === "POST" || options.uri.method === "PUT";
	this._prepareClose();
	
	if(!this.writable){
		this._request.end();
	}
	else{
		if(options.body){
			this._request.write(options.body);
		}
		this.once("pipe", function(src){
			if(!scope.writable){
				scope.emit("error", Error("Can't write to socket!"));
				return;
			}
			scope._close = false;
			var cb = function(){
				scope._prepareClose();
			};
			src.on("end", cb);
			src.on("close", cb);
			
			scope.on("pipe", function(){
				throw Error("There is already a pipe");
			});
		});
	}
};

var Stream = require("stream").Stream;
require("util").inherits(Request, Stream);

//save the pipe function for later
var pipe = Stream.prototype.pipe;

Request.prototype.pipe = function(dest, opts){
	if(this._written){
		throw Error("Data was already emitted!");
	}
	else if(this._ended){
		throw Error("Request is closed!");
	}
	else pipe.call(this, dest, opts);
};

Request.prototype._prepareClose = function(){
	this._close = true;
	var scope = this;
	process.nextTick(function(){
		if(scope._close){
			scope._request.end();
			scope.writable = false;
		}
	});
};

var re_protocol = /^https?:/; //TODO: what about other protocols?
var moveEvents = function(from, to){
	for(var i in from._events){
		if(typeof from._events[i] === "function"){
			to.on(i, from._events[i]);
		}
		else for(var j = 0; j < from._events[i].length; j++){
			to.on(i, from._events[i][j]);
		}
	}
	from._events = to._events;
};

Request.prototype._createRequest = function(options){
	if(typeof options.uri === "string"){
		options.uri = url.parse(options.uri);
	}
	else if(typeof options.uri !== "object"){
		scope.emit("error", Error("No URI specified!"));
		return;
	}
	
	//fix for node < 0.5
	if(!options.uri.path) options.uri.path = options.uri.pathname;
	
	var req = protocols[options.uri.protocol];
	if(!req) return scope.emit("error", Error("Unknown protocol: " + options.uri.protocol));
	
	var scope = this;
	
	this._request = req.request(options.uri, function(resp){
		var method = options.uri.method;
		
		if( (options.followRedirects || typeof options.followRedirect === "undefined") && (resp.statusCode % 300 < 99) && !scope.writable && resp.headers.location){
				if(!scope._redirected) scope._redirected = 0;
				
				scope._request.abort(); //close the socket
				clearTimeout(scope._reqTimeout);
				
				scope.emit("redirect", resp.headers.location);
				
				if(scope._redirected++ < (options.maxRedirects || 10)){
					if(!re_protocol.test(resp.headers.location)){
						resp.headers.location = url.resolve(options.uri, resp.headers.location);
					}
					
					options.uri = url.parse(resp.headers.location);
					options.uri.method = method;
					
					scope._createRequest(options);
				} else {
					scope.emit("error", Error("Too many redirects"));
				}
				return;
		}
		
		//add some info to the scope
		scope.response = {
			location: url.format(options.uri),
			statusCode: response.statusCode,
			headers: resp.headers
		};
		
		scope._resp = resp;
		
		if(options.encoding){
			resp.setEncoding(options.encoding);
		}
		
		resp.on("data", function(chunk){
			scope.emit("data", chunk);
		}).on("end", function(){
			if(!scope._ended) scope.emit("end");
		}).on("close", function(){
			scope.emit("close");
		}).on("error", function(err){
			scope.emit("error", err);
		});
		
		scope.emit("response", resp);
	});
	
	if(!("timeout" in this._options) || this._options.timeout){
		this._reqTimeout = setTimeout(function(){
			if(!scope._ended){
				scope._request.abort();
				
				scope.emit("timeout");
				scope.emit("error", Error("ETIMEDOUT"));
			}
		}, this._options.timeout || 1e4);
	}
};

Request.prototype.readable = true;

Request.prototype.setEncoding = function(encoding){
	//if we are connected, send the encoding to the response
	if(this._resp) this._resp.setEncoding(encoding);
	//else, safe it for later
	else this._options.encoding = encoding;
};
Request.prototype.then = function(cb){
	//for promise-like behavior
	this._cb = cb;
};
Request.prototype.abort = function(){
	this._request.abort();
};
Request.prototype.write = function(chunk){
	if(!this.writable) throw Error("Ether request method doesn't support .write or request was sent!");
	return this._request.write(chunk);
};

module.exports.Request = Request;