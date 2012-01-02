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
*/

var Request = function(options, cb){
	this._options = options;
	this._headers = null;
	this._resp = null;
	
	this._createRequest(options);
	if(!this._request) return;
	
	this._events = this._request._events = this._request._events || {};
	
	var scope = this;
	if(cb){
		var body = "";
		this.on("error", cb).on("end", function(){
			cb(null, scope._headers, body);
		}).on("data", function(chunk){
			body += chunk;
		});
	}
	
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
		this.on("pipe", function(src){
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
		});
	}
};

require("util").inherits(Request, require("stream"));

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
		
		if( (options.followRedirects || typeof options.followRedirect === "undefined")
			&& (resp.statusCode % 300 < 99) && !scope.writable){
				if(!scope._redirected) scope._redirected = 0;
				
				scope._request.destroy(); //close the socket - TODO: doesn't work in node < 0.3.8
				
				if(scope._redirected++ < (options.maxRedirects || 10)){
					if(!re_protocol.test(resp.headers.location)){
						resp.headers.location = url.resolve(options.uri, resp.headers.location);
					}
					
					this.emit("redirect", resp.headers.location);
					
					/* //TODO
					options.uri = url.parse(resp.headers.location);
					options.uri.method = method;
					scope._createRequest(options);
					
					//pass the event handlers
					moveEvents(scope._request, scope);
					*/
				} else {
					scope._emit("error", Error("Too many redirects"));
				}
				return;
		}
		
		//add some info to the headers object - TODO: find a better way of doing this
		resp.headers.statusCode = resp.statusCode;
		resp.headers.location = url.format(options.uri);
		
		scope._headers = resp.headers;
		scope._resp = resp;
		if(options.encoding){
			resp.setEncoding(options.encoding);
		}
		
		//lets use the same event handlers as before
		moveEvents(resp, scope);
	});
};

Request.prototype.readable = true;

Request.prototype.setEncoding = function(encoding){
	//if we are connected, send the encoding to the response
	if(this._resp) this._resp.setEncoding(encoding);
	//else, safe it for later
	else this._options.encoding = encoding;
};
Request.prototype.destroy = function(){
	this._request.destroy();
};
Request.prototype.write = function(chunk){
	this._request.write(chunk);
};

module.exports.Request = Request;