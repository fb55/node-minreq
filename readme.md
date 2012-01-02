#minreq
A minimalistic request library for node.

###This is currently far from finished, it's just a (working) prototype!

##Why?

The most common library used to perform requests is [request](https://github.com/mikeal/request). While it works, it has a lot of features that aren't needed in most cases (eg. cookies, oauth). Besides, the code isn't as fast as it can be. This project is intended to replace `request` in cases where it's simply too heavy.

##Features
* `request` like api
* provides a callback that's called when a response was received (like request)
* forwards events
* follows redirects (not finished yet, it currently just emits a `redirect` event)

-

License: Public domain