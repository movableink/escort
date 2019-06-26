const assert = require('assert');
const util = require('util');
const http = require('http');
const agent = require('supertest');

assert.eql = assert.deepEqual;

/**
 * Assert that `val` is null.
 *
 * @param {Mixed} val
 * @param {String} msg
 */

assert.isNull = function(val, msg) {
  assert.strictEqual(null, val, msg);
};

/**
 * Assert that `val` is not null.
 *
 * @param {Mixed} val
 * @param {String} msg
 */

assert.isNotNull = function(val, msg) {
  assert.notStrictEqual(null, val, msg);
};

/**
 * Assert that `val` is undefined.
 *
 * @param {Mixed} val
 * @param {String} msg
 */

assert.isUndefined = function(val, msg) {
  assert.strictEqual(undefined, val, msg);
};

/**
 * Assert that `val` is not undefined.
 *
 * @param {Mixed} val
 * @param {String} msg
 */

assert.isDefined = function(val, msg) {
  assert.notStrictEqual(undefined, val, msg);
};

/**
 * Assert that `obj` is `type`.
 *
 * @param {Mixed} obj
 * @param {String} type
 * @api public
 */

assert.type = function(obj, type, msg) {
  var real = typeof obj;
  msg = msg || 'typeof ' + util.inspect(obj) + ' is ' + real + ', expected ' + type;
  assert.ok(type === real, msg);
};

/**
 * Assert that `str` matches `regexp`.
 *
 * @param {String} str
 * @param {RegExp} regexp
 * @param {String} msg
 */

assert.match = function(str, regexp, msg) {
  msg = msg || util.inspect(str) + ' does not match ' + util.inspect(regexp);
  assert.ok(regexp.test(str), msg);
};

/**
 * Assert that `val` is within `obj`.
 *
 * Examples:
 *
 *    assert.includes('foobar', 'bar');
 *    assert.includes(['foo', 'bar'], 'foo');
 *
 * @param {String|Array} obj
 * @param {Mixed} val
 * @param {String} msg
 */

assert.includes = function(obj, val, msg) {
  msg = msg || util.inspect(obj) + ' does not include ' + util.inspect(val);
  assert.ok(obj.indexOf(val) >= 0, msg);
};

/**
 * Assert length of `val` is `n`.
 *
 * @param {Mixed} val
 * @param {Number} n
 * @param {String} msg
 */

assert.length = function(val, n, msg) {
  msg = msg || util.inspect(val) + ' has length of ' + val.length + ', expected ' + n;
  assert.equal(n, val.length, msg);
};

/**
 * Assert an app, given a particular request, produces the correct response.
 *
 * @param {Object} app
 * @param {Object} req
 * @param {Object} res
 */

assert.response = function(app, req, res) {
  const method = (req.method || 'GET').toLowerCase();
  const statusCode = res.statusCode;

  let a = agent(app)[method](req.url)
      .set('Accept', 'text/plain');

  if (res.headers) {
    for (let [header, value] of Object.entries(res.headers)) {
      a = a.expect(header, value);
    }
  }

  if (res.statusCode) {
    a = a.expect(res.statusCode);
  }

  if (typeof(res.body) !== 'undefined') {
    a = a.expect(res.body);
  }

  return a;
};

module.exports = assert;
