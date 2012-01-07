#minreq
A minimalistic request library for node.

##How?
    npm install minreq

##Why?

The most common library used to perform http(s)-requests in node is [request](https://github.com/mikeal/request). While it works, it has a lot of features that aren't needed in most cases (eg. cookies, oauth). Besides, the code isn't as fast as it can be. This project is intended to replace `request` in cases where it's simply too heavy.

##What?
###Features
* `request` like api
* lightweight (compared to this lib, `request` is a giant)
* provides a callback that's called when a response was received (like request)
* works as a stream (`Stream#pipe` is supported)
* forwards events
* follows redirects
* you may add your own protocols!

-

License: Public domain