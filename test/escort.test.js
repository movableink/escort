/*jshint strict: false */

var connect = require("connect"),
    http = require('http'),
    assert = require("./assertions"),
    escort = require("../index"),
    urlParser = require('url');

var methods = ["get", "post", "put", "delete"];
var exampleNames = ["neil", "bob", "windsor"];
var exampleUnicodeNames = ["nøgel", "über", "cliché"];

var makeBadString = (function (Ctor) {
    return function (value) {
        return new Ctor(value);
    };
}(String));

function makeConnect(...apps) {
  const c = connect();

  for (let app of apps) {
    c.use(app);
  }

  return c;
}

describe("escort", function() {
  after(function() {
    // apps leave references that don't get cleaned up
    process._getActiveHandles()
      .filter(h => h instanceof http.Server)
      .forEach(h => h.unref());
  });

  it("methods static", async function() {
    var url;
    var app = makeConnect(
      escort(function (routes) {
        url = routes.url;

        methods.forEach(function (method) {
          routes[method]("home_" + method, "/" + method, function (req, res) {
            res.end(method.toUpperCase() + " /" + method);
          });
        });
      })
    );

    for (let method of methods) {
      await assert.response(app,
                            { url: "/" + method, method: method.toUpperCase() },
                            { body: method.toUpperCase() + " /" + method });

      assert.strictEqual("/" + method, url["home_" + method]());

      for(let otherMethod of methods) {
        if (method !== otherMethod) {
          await assert.response(app,
                                { url: "/" + method, method: otherMethod.toUpperCase() },
                                { statusCode: 405 });
        }
      }
    }
  });

  it("bind static", async function() {
    var url;
    var app = makeConnect(
      escort(function (routes) {
        url = routes.url;

        var descriptor = {};
        methods.forEach(function (method) {
          descriptor[method] = function (req, res) {
            res.end(method.toUpperCase() + " /");
          };
        });
        routes.bind("home", "/", descriptor);
      })
    );

    assert.strictEqual("/", url.home());

    for(let method of methods) {
      await assert.response(app,
                            { url: "/", method: method.toUpperCase() },
                            { body: method.toUpperCase() + " /" });
    }
  });

  it("methods dynamic", async function() {
    var url;
    var app = makeConnect(
      escort(function (routes) {
        url = routes.url;

        methods.forEach(function (method) {
          routes[method]("name_" + method, "/{name}/" + method, function (req, res, params) {
            res.end(method.toUpperCase() + " /" + params.name + "/" + method);
          });
        });
      })
    );

    for (let name of exampleNames) {
      for (let method of methods) {
        await assert.response(app,
                              { url: "/" + name + "/" + method, method: method.toUpperCase() },
                              { body: method.toUpperCase() + " /" + name + "/" + method });

        assert.strictEqual("/" + name + "/" + method, url["name_" + method](name));
        assert.strictEqual("/" + name + "/" + method, url["name_" + method]({ name: name }));
        assert.strictEqual("/" + name + "/" + method, url["name_" + method](makeBadString(name)));
        assert.strictEqual("/" + name + "/" + method, url["name_" + method]({ name: makeBadString(name) }));

        for(let otherMethod of methods) {
          if (method !== otherMethod) {
            await assert.response(app,
                                  { url: "/" + name + "/" + method, method: otherMethod.toUpperCase() },
                                  { statusCode: 405 });
          }
        }
      }
    }
  });

  it("bind dynamic", async function() {
    var url;
    var app = makeConnect(
      escort(function (routes) {
        url = routes.url;

        var descriptor = {};
        methods.forEach(function (method) {
          descriptor[method] = function (req, res, params) {
            res.end(method.toUpperCase() + " /" + params.name);
          };
        });
        routes.bind("name", "/{name}", descriptor);
      })
    );

    exampleNames.forEach(function (name) {
      assert.strictEqual("/" + name, url.name(name));
      assert.strictEqual("/" + name, url.name({ name: name }));
    });

    for (let method of methods) {
      for (let name of exampleNames) {
        assert.response(app,
                        { url: "/" + name, method: method.toUpperCase() },
                        { body: method.toUpperCase() + " /" + name });
      }
    }
  });

  it("calling other methods", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.bind("doSomething", "/do-something", {
          get: function (req, res) {
            this.post(req, res);
          },
          post: function (req, res) {
            res.end(req.method + " /do-something");
          }
        });
      })
    );

    await assert.response(app,
                          { url: "/do-something", method: "GET" },
                          { body: "GET /do-something" });
    await assert.response(app,
                          { url: "/do-something", method: "POST" },
                          { body: "POST /do-something" });
  });

  it("calling HEAD on a GET route", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.bind("root", "/", {
          get: function (req, res, params) {
            res.writeHead(201, {});
            res.end("GET /");
          }
        });
      })
    );

    await assert.response(app,
                          { url: "/", method: "HEAD" },
                          { body: {}, statusCode: 201 });
  });

  it("calling HEAD on a HEAD route", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.bind("root", "/", {
          get: function (req, res, params) {
            res.writeHead(201, {});
            res.end("GET /");
          },
          head: function (req, res, params) {
            res.writeHead(200, {});
            res.end("HEAD /");
          }
        });
      })
    );

    await assert.response(app,
                          { url: "/", method: "HEAD" },
                          { body: {}, statusCode: 200 });
  });

  it("guessed route names", async function() {
    var routesToExpectedNames = {
      "/do-something": "doSomething",
      "/posts": "posts",
      "/": "root",
    };

    Object.keys(routesToExpectedNames).forEach(function (route) {
      var name = routesToExpectedNames[route];

      var url;
      var app = makeConnect(
        escort(function (routes) {
          url = routes.url;
          routes.get(route, function (req, res) {
            res.end("GET " + route);
          });
        })
      );
      assert.strictEqual(route, url[name]());
    });
  });

  it("int converter", async function() {
    var url;
    var app = makeConnect(
      escort(function (routes) {
        url = routes.url;

        routes.get("post", "/posts/{id:int({min: 1, max: 99})}", function (req, res, params) {
          assert.strictEqual("number", typeof params.id);

          res.end("GET /posts/" + params.id);
        });
      })
    );

    await assert.response(app,
                          { url: "/posts/0", method: "GET" },
                          { statusCode: 404 });
    await assert.response(app,
                          { url: "/posts/100", method: "GET" },
                          { statusCode: 404 });

    for (var i = 1; i <= 99; i += 1) {
      assert.strictEqual("/posts/" + i, url.post(i));
      assert.strictEqual("/posts/" + i, url.post({ id: i }));

      await assert.response(app,
                            { url: "/posts/" + i, method: "GET" },
                            { body: "GET /posts/" + i });
    }
  });

  it("int converter (fixedDigits)", async function() {
    var url;
    var app = makeConnect(
      escort(function (routes) {
        url = routes.url;

        routes.get("post", "/posts/{id:int({fixedDigits: 4})}", function (req, res, params) {
          assert.strictEqual("number", typeof params.id);

          res.end("GET /posts/" + params.id);
        });
      })
    );

    await assert.response(app,
                          { url: "/posts/0", method: "GET" },
                          { statusCode: 404 });
    await assert.response(app,
                          { url: "/posts/100", method: "GET" },
                          { statusCode: 404 });

    for (var i = 1; i <= 9; i += 1) {
      assert.strictEqual("/posts/000" + i, url.post(i));
      assert.strictEqual("/posts/000" + i, url.post({ id: i }));

      await assert.response(app,
                            { url: "/posts/000" + i, method: "GET" },
                            { body: "GET /posts/" + i });
    }
  });

  it("string converter", async function() {
    var url;
    var app = makeConnect(
      escort(function (routes) {
        url = routes.url;

        routes.get("post", "/posts/{id:string({minLength: 3, maxLength: 8})}", function (req, res, params) {
          assert.strictEqual("string", typeof params.id);

          res.end("GET /posts/" + params.id);
        });
      })
    );

    await assert.response(app,
                          { url: "/posts/hi", method: "GET" },
                          { statusCode: 404 });
    await assert.response(app,
                          { url: "/posts/howdypartner", method: "GET" },
                          { statusCode: 404 });
    for (var i = 0; i < 20; i += 1) {
      await assert.response(app,
                            { url: "/posts/" + "howdypartner".substr(0, i), method: "GET" },
                            { statusCode: i < 3 || i > 8 ? 404 : 200 });
    }

    for (i = 1; i <= 9; i += 1) {
      assert.strictEqual("/posts/hey" + i, url.post("hey" + i));
      assert.strictEqual("/posts/hey" + i, url.post({ id: "hey" + i }));

      await assert.response(app,
                            { url: "/posts/hey" + i, method: "GET" },
                            { body: "GET /posts/hey" + i });
    }
  });

  it("path converter", async function() {
    var url;
    var app = makeConnect(
      escort(function (routes) {
        url = routes.url;

        routes.get("post", "/posts/{id:path}", function (req, res, params) {
          assert.strictEqual("string", typeof params.id);

          res.end("GET /posts/" + params.id);
        });
      })
    );

    for (var i = 1; i < "howdy/partner/how/are/you".length; i += 1) {
      var part = "howdy/partner/how/are/you".substr(0, i);
      if (part.charAt(part.length - 1) !== "/") {
        await assert.response(app,
                              { url: "/posts/" + part, method: "GET" },
                              { body: "GET /posts/" + part });
        assert.strictEqual("/posts/" + part, url.post(part));
      } else {
        await assert.response(app,
                              { url: "/posts/" + part, method: "GET" },
                              { statusCode: 301, headers: { Location: "/posts/" + part.substr(0, part.length - 1) } });
      }
    }
  });

  it("any converter", async function() {
    var url;
    var app = makeConnect(
      escort(function (routes) {
        url = routes.url;

        routes.get("post", "/posts/{id:any('alpha', 'bravo', 'charlie')}", function (req, res, params) {
          assert.strictEqual("string", typeof params.id);

          res.end("GET /posts/" + params.id);
        });
      })
    );

    await assert.response(app,
                          { url: "/posts/alpha", method: "GET" },
                          { body: "GET /posts/alpha" });

    await assert.response(app,
                          { url: "/posts/bravo", method: "GET" },
                          { body: "GET /posts/bravo" });

    await assert.response(app,
                          { url: "/posts/charlie", method: "GET" },
                          { body: "GET /posts/charlie" });

    await assert.response(app,
                          { url: "/posts/delta", method: "GET" },
                          { statusCode: 404 });
  });

  it("custom converter", async function() {
    var CustomConverter = function () {
      return {
        regex: "(?:yes|no)",
        fromUrl: function (value) {
          return value === "yes";
        },
        toUrl: function (value) {
          return value ? "yes" : "no";
        },
        serialize: function () {
          return { type: "bool" };
        }
      };
    };

    var url;
    var app = makeConnect(
      escort({ converters: { custom: CustomConverter } }, function (routes) {
        url = routes.url;

        routes.get("post", "/posts/{id:custom}", function (req, res, params) {
          assert.strictEqual("boolean", typeof params.id);

          res.end("GET /posts/" + (params.id ? "yes" : "no"));
        });
      })
    );

    await assert.response(app,
                          { url: "/posts/yes", method: "GET" },
                          { body: "GET /posts/yes" });

    await assert.response(app,
                          { url: "/posts/no", method: "GET" },
                          { body: "GET /posts/no" });

    await assert.response(app,
                          { url: "/posts/maybe", method: "GET" },
                          { statusCode: 404 });

    assert.strictEqual("/posts/yes", url.post(true));
    assert.strictEqual("/posts/no", url.post(false));
  });

  it("notFound handler", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("/", function (req, res) {
          res.end("Found the root");
        });

        routes.notFound(function (req, res, next) {
          res.writeHead(404);
          res.end("Not found, oh noes!");
        });
      })
    );

    await assert.response(app,
                          { url: "/", method: "GET" },
                          { body: "Found the root" });

    await assert.response(app,
                          { url: "/other", method: "GET" },
                          { body: "Not found, oh noes!", statusCode: 404 });
  });

  it("calling next in the notFound handler should go to the next middleware", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("/", function (req, res) {
          res.end("Found the root");
        });

        routes.notFound(function (req, res, next) {
          next();
        });
      }),
      function (req, res) {
        res.end("Next middleware");
      }
    );

    await assert.response(app,
                          { url: "/", method: "GET" },
                          { body: "Found the root" });

    await assert.response(app,
                          { url: "/other", method: "GET" },
                          { body: "Next middleware" });
  });

  it("methodNotAllowed handler", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("/", function (req, res) {
          res.end("Found the root");
        });

        routes.methodNotAllowed(function (req, res, next) {
          res.writeHead(405);
          res.end("No such method, nuh-uh.");
        });
      })
    );

    await assert.response(app,
                          { url: "/", method: "GET" },
                          { body: "Found the root" });

    await assert.response(app,
                          { url: "/", method: "POST" },
                          { body: "No such method, nuh-uh.", statusCode: 405 });
  });

  it("calling next in the methodNotAllowed handler should go to the next middleware", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("/", function (req, res) {
          res.end("Found the root");
        });

        routes.methodNotAllowed(function (req, res, next) {
          next();
        });
      }),
      function (req, res) {
        res.end("Next middleware");
      }
    );

    await assert.response(app,
                          { url: "/", method: "GET" },
                          { body: "Found the root" });

    await assert.response(app,
                          { url: "/", method: "POST" },
                          { body: "Next middleware" });
  });

  it("dynamic caching", async function() {
    var doneParts = {};
    var CustomConverter = function () {
      return {
        regex: "[a-z]+",
        fromUrl: function (value) {
          if (doneParts[value]) {
            throw new Error("Already seen " + value);
          }
          return value;
        },
        toUrl: function (value) {
          return value;
        },
        serialize: function () {
          return { type: "thing" };
        }
      };
    };

    var app = makeConnect(
      escort({ converters: { custom: CustomConverter } }, function (routes) {
        routes.bind("user", "/users/{name:custom}", {
          get: function (req, res, params) {
            res.end("GET /users/" + params.name);
          },
          post: function (req, res, params) {
            res.end("POST /users/" + params.name);
          },
        });
      })
    );

    for (var i = 0; i < 100; i += 1) {
      for (var j = 0, len = exampleNames.length; j < len; j += 1) {
        var name = exampleNames[j];

        await assert.response(app,
                              { url: "/users/" + name, method: "GET" },
                              { body: "GET /users/" + name });

        await assert.response(app,
                              { url: "/users/" + name, method: "POST" },
                              { body: "POST /users/" + name });
      }
    }
  });

  it("submounting", async function() {
    var url;
    var app = makeConnect(
      escort(function (routes) {
        url = routes.url;

        routes.submount("/users", function (users) {
          users.get("user", "/{name}", function (req, res, params) {
            res.end("GET /users/" + params.name);
          });
        });
      })
    );

    for (let name of exampleNames) {
      await assert.response(app,
                            { url: "/users/" + name, method: "GET" },
                            { body: "GET /users/" + name });
    }
  });

  it("dynamic submounting", async function() {
    var url;
    var app = makeConnect(
      escort(function (routes) {
        url = routes.url;

        routes.submount("/users/{name}", function (users) {
          users.get("userInfo", "/info", function (req, res, params) {
            res.end("GET /users/" + params.name + "/info");
          });
        });
      })
    );

    for (let name of exampleNames) {
      await assert.response(app,
                            { url: "/users/" + name + "/info", method: "GET" },
                            { body: "GET /users/" + name + "/info" });
    }
  });

  it("submount within submount", async function() {
    var url;
    var app = makeConnect(
      escort(function (routes) {
        url = routes.url;

        routes.submount("/alpha", function (alpha) {
          alpha.submount("/bravo", function (bravo) {
            bravo.submount("/charlie", function (charlie) {
              charlie.get("item", "/{name}", function (req, res, params) {
                res.end("GET /alpha/bravo/charlie/" + params.name);
              });
            });
          });
        });
      })
    );

    for (let name of exampleNames) {
      await assert.response(app,
                            { url: "/alpha/bravo/charlie/" + name, method: "GET" },
                            { body: "GET /alpha/bravo/charlie/" + name });
    }
  });

  it("conflicts", async function() {
    var url;
    var app = makeConnect(
      escort(function (routes) {
        url = routes.url;

        routes.submount("/forums", function (forums) {
          forums.get("forum", "/{forumSlug}", function (req, res, params) {
            res.end("GET /forums/" + params.forumSlug);
          });
          forums.get("thread", "/{threadID:int}", function (req, res, params) {
            res.end("GET /forums/" + params.threadID + " (thread)");
          });
        });
      })
    );

    for (var i = 1; i < 10; i += 1) {
      await assert.response(app,
                            { url: "/forums/" + i, method: "GET" },
                            { body: "GET /forums/" + i + " (thread)" });
    }

    for (let name of exampleNames) {
      await assert.response(app,
                            { url: "/forums/" + name, method: "GET" },
                            { body: "GET /forums/" + name });
    }
  });

  it("multiple routes per callback", async function() {
    var url;
    var app = makeConnect(
      escort(function (routes) {
        url = routes.url;

        routes.get("home", ["/", "/home"], function (req, res, params) {
          res.end("GET " + req.url);
        });
      })
    );

    assert.strictEqual("/", url.home());

    await assert.response(app,
                          { url: "/", method: "GET" },
                          { body: "GET /" });

    await assert.response(app,
                          { url: "/home", method: "GET" },
                          { body: "GET /home" });

    await assert.response(app,
                          { url: "/ho", method: "GET" },
                          { statusCode: 404 });
  });

  it("multiple routes per callback with [] syntax", async function() {
    var url;
    var app = makeConnect(
      escort(function (routes) {
        url = routes.url;

        routes.get("home", "/[home]", function (req, res, params) {
          res.end("GET " + req.url);
        });
      })
    );

    assert.strictEqual("/", url.home());

    await assert.response(app,
                          { url: "/", method: "GET" },
                          { body: "GET /" });

    await assert.response(app,
                          { url: "/home", method: "GET" },
                          { body: "GET /home" });

    await assert.response(app,
                          { url: "/ho", method: "GET" },
                          { statusCode: 404 });
  });

  it("submounted multiple routes per callback", async function() {
    var url;
    var app = makeConnect(
      escort(function (routes) {
        url = routes.url;

        routes.submount("/forums", function (forums) {
          forums.get("forum", ["", "/home"], function (req, res, params) {
            res.end("GET " + req.url);
          });
        });
      })
    );

    assert.strictEqual("/forums", url.forum());

    await assert.response(app,
                          { url: "/forums", method: "GET" },
                          { body: "GET /forums" });

    await assert.response(app,
                          { url: "/forums/home", method: "GET" },
                          { body: "GET /forums/home" });

    await assert.response(app,
                          { url: "/forums/ho", method: "GET" },
                          { statusCode: 404 });
  });

  it("submounted multiple routes per callback with [] syntax", async function() {
    var url;
    var app = makeConnect(
      escort(function (routes) {
        url = routes.url;

        routes.submount("/forums", function (forums) {
          forums.get("forum", "[/home]", function (req, res, params) {
            res.end("GET " + req.url);
          });
        });
      })
    );

    assert.strictEqual("/forums", url.forum());

    await assert.response(app,
                          { url: "/forums", method: "GET" },
                          { body: "GET /forums" });

    await assert.response(app,
                          { url: "/forums/home", method: "GET" },
                          { body: "GET /forums/home" });

    await assert.response(app,
                          { url: "/forums/ho", method: "GET" },
                          { statusCode: 404 });
  });

  it("dynamic multiple routes per callback", async function() {
    var url;
    var app = makeConnect(
      escort(function (routes) {
        url = routes.url;

        routes.get("page", ["/", "/page/{pageNum:int({min: 1})}"], function (req, res, params) {
          var pageNum = params.pageNum || 1;
          res.end("Viewing page #" + pageNum);
        });
      })
    );

    assert.strictEqual("/", url.page());
    assert.strictEqual("/page/2", url.page(2));
    assert.strictEqual("/page/2", url.page({pageNum: 2}));

    await assert.response(app,
                          { url: "/", method: "GET" },
                          { body: "Viewing page #1" });

    await assert.response(app,
                          { url: "/page/1", method: "GET" },
                          { body: "Viewing page #1" });

    await assert.response(app,
                          { url: "/page/2", method: "GET" },
                          { body: "Viewing page #2" });
  });

  it("dynamic multiple routes per callback with [] syntax", async function() {
    var url;
    var app = makeConnect(
      escort(function (routes) {
        url = routes.url;

        routes.get("page", "/[page/{pageNum:int({min: 1})}]", function (req, res, params) {
          var pageNum = params.pageNum || 1;
          res.end("Viewing page #" + pageNum);
        });
      })
    );

    assert.strictEqual("/", url.page());
    assert.strictEqual("/page/2", url.page(2));
    assert.strictEqual("/page/2", url.page({pageNum: 2}));

    await assert.response(app,
                          { url: "/", method: "GET" },
                          { body: "Viewing page #1" });

    await assert.response(app,
                          { url: "/page/1", method: "GET" },
                          { body: "Viewing page #1" });

    await assert.response(app,
                          { url: "/page/2", method: "GET" },
                          { body: "Viewing page #2" });
  });

  it("error handling", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("/", function (req, res, params) {
          throw new Error("fake error");
        });
      }),
      function (err, req, res, next) {
        res.writeHead(500);
        res.end(err.toString());
      }
    );

    await assert.response(app,
                          { url: "/", method: "GET" },
                          { statusCode: 500, body: "Error: fake error" });
  });

  it("escaping regexp characters", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("blah", "/blah.txt", function (req, res, params) {
          res.end("Blah!");
        });
        routes.get("name", "/{name}.txt", function (req, res, params) {
          res.end("Blah: " + params.name + "!");
        });
      })
    );

    await assert.response(app,
                          { url: "/blah.txt", method: "GET" },
                          { body: "Blah!" });

    await assert.response(app,
                          { url: "/blahxtxt", method: "GET" },
                          { statusCode: 404 });

    for (let name of exampleNames) {
      await assert.response(app,
                            { url: "/" + name + ".txt", method: "GET" },
                            { body: "Blah: " + name + "!" });

      await assert.response(app,
                            { url: "/" + name + "xtxt", method: "GET" },
                            { statusCode: 404 });
    }
  });

  it("options", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("/", function (req, res) {
          res.end("GET /");
        });
        routes.bind("/item", {
          get: function (req, res) {
            res.end("GET /item");
          },
          post: function (req, res) {
            res.end("POST /item");
          }
        });
      })
    );

    await assert.response(app,
                          { url: "/", method: "OPTIONS" },
                          { body: "GET", headers: { Allow: "GET" }, statusCode: 200 });

    await assert.response(app,
                          { url: "/item", method: "OPTIONS" },
                          { body: "GET,POST", headers: { Allow: "GET,POST" }, statusCode: 200 });
  });

  it("querystring", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("/", function (req, res) {
          res.end("GET /");
        });
      })
    );

    await assert.response(app,
                          { url: "/?q=stuff", method: "GET" },
                          { body: "GET /", statusCode: 200 });
  });

  it("multiple methods defined by the same callback", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.bind("doSomething", "/do-something", {
          "get,post": function (req, res) {
            res.end(req.method + " /do-something");
          },
        });
      })
    );

    await assert.response(app,
                          { url: "/do-something", method: "GET" },
                          { body: "GET /do-something" });
    await assert.response(app,
                          { url: "/do-something", method: "POST" },
                          { body: "POST /do-something" });
  });

  it("run without connect", async function() {
    var routing = escort(function (routes) {
      routes.get("/", function (req, res) {
        res.end("GET /");
      });

      routes.get("/error", function (req, res) {
        throw new Error("This is an error");
      });
    });
    var app = http.createServer(function (req, res) {
      routing(req, res);
    });

    await assert.response(app,
                          { url: "/", method: "GET" },
                          { body: "GET /" });

    await assert.response(app,
                          { url: "/not-found", method: "GET" },
                          { statusCode: 404 });

    await assert.response(app,
                          { url: "/error", method: "GET" },
                          { statusCode: 500 });
  });

  it("allow lack of callback", async function() {
    var routing = escort();
    routing.get("/", function (req, res) {
      res.end("GET /");
    });

    await assert.response(makeConnect(routing),
                          { url: "/", method: "GET" },
                          { body: "GET /" });
  });

  it("work with options but no callback", async function() {
    var routing = escort({ converters: { custom: escort.StringConverter } });
    routing.get("post", "/{post:custom}", function (req, res, params) {
      res.end("GET /" + params.post);
    });

    var app = makeConnect(routing);

    for (let name of exampleNames) {
      await assert.response(app,
                            { url: "/" + name, method: "GET" },
                            { body: "GET /" + name });

      assert.strictEqual("/" + name, routing.url.post(name));
    }
  });

  it("multiple parameters", async function() {
    var url;
    var app = makeConnect(escort(function (routes) {
      url = routes.url;
      routes.get("multi", "/{alpha}/{bravo}/{charlie}/{delta}", function (req, res, params) {
        res.end("GET /" + params.alpha + "/" + params.bravo + "/" + params.charlie + "/" + params.delta);
      });
    }));

    for (let alpha of exampleNames) {
      for (let bravo of exampleNames) {
        for (let charlie of exampleNames) {
          for (let delta of exampleNames) {
            await assert.response(app,
                                  { url: "/" + alpha + "/" + bravo + "/" + charlie + "/" + delta, method: "GET" },
                                  { body: "GET /" + alpha + "/" + bravo + "/" + charlie + "/" + delta });

            assert.strictEqual("/" + alpha + "/" + bravo + "/" + charlie + "/" + delta, url.multi(alpha, bravo, charlie, delta));
            assert.strictEqual("/" + alpha + "/" + bravo + "/" + charlie + "/" + delta, url.multi({alpha: alpha, bravo: bravo, charlie: charlie, delta: delta}));
          }
        }
      }
    }
  });

  it("calling next will call the next middleware", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("/", function (req, res, params, next) {
          next();
        });
      }),
      function (req, res) {
        res.end("Next middleware");
      }
    );

    await assert.response(app,
                          { url: "/", method: "GET"},
                          { body: "Next middleware" });
  });

  it("calling next will not call an unreferenced middleware", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("/", function (req, res, params, next) {
          next();
        });
      }),
      function (req, res) {
        res.end("Next middleware");
      },
      function (req, res) {
        res.end("Unreferenced");
      }
    );

    await assert.response(app,
                          { url: "/", method: "GET"},
                          { body: "Next middleware" });
  });

  it("calling next will call the middleware after next", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("/", function (req, res, params, next) {
          next();
        });
      }),
      function (req, res, next) {
        next();
      },
      function (req, res) {
        res.end("Next middleware");
      }
    );

    await assert.response(app,
                          { url: "/", method: "GET" },
                          { body: "Next middleware" });
  });

  it("calling next will call the notFound handler", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("/", function (req, res, params, next) {
          next();
        });

        routes.notFound(function (req, res) {
          res.end("Not found!");
        });
      }),
      function (req, res) {
        res.end("Should not be hit");
      }
    );

    await assert.response(app,
                          { url: "/", method: "GET" },
                          { body: "Not found!" });
  });

  it("calling next with an error will not call the notFound handler", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("/", function (req, res, params, next) {
          next(new Error("Blah!"));
        });

        routes.notFound(function (req, res) {
          res.end("Not found!");
        });
      }),
      function (req, res) {
        res.end("Should not be hit");
      }
    );

    await assert.response(app,
                          { url: "/", method: "GET" },
                          { statusCode: 500 });
  });

  it("calling next with an error will call the first middleware that can handle it", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("/", function (req, res, params, next) {
          next(new Error("Blah!"));
        });

        routes.notFound(function (req, res) {
          res.end("Not found!");
        });
      }),
      function (req, res) {
        res.end("Should not be hit");
      },
      function (err, req, res, next) {
        res.writeHead(500);
        res.end("Oh noes!");
      }
    );

    await assert.response(app,
                          { url: "/", method: "GET" },
                          { statusCode: 500, body: "Oh noes!" });
  });

  it("calling next will call the next middleware after the notFound handler", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("/", function (req, res, params, next) {
          next();
        });

        routes.notFound(function (req, res, next) {
          next();
        });
      }),
      function (req, res) {
        res.end("Next middleware");
      }
    );

    await assert.response(app,
                          { url: "/", method: "GET" },
                          { body: "Next middleware" });
  });

  it("calling next in notFound with an error will call the first middleware that can handle it", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("/", function (req, res, params, next) {
          next();
        });

        routes.notFound(function (req, res, next) {
          next(new Error("Stuff"));
        });
      }),
      function (req, res) {
        res.end("Shouldn't be hit");
      },
      function (err, req, res, next) {
        res.writeHead(500);
        res.end("Oh noes!");
      }
    );

    await assert.response(app,
                          { url: "/", method: "GET" },
                          { statusCode: 500, body: "Oh noes!" });

    await assert.response(app,
                          { url: "/other", method: "GET" },
                          { statusCode: 500, body: "Oh noes!" });
  });

  it("two slashes in a URL is an error", async function() {
    var gotError = false;
    escort(function (routes) {
      try {
        routes.get("/alpha//bravo", function (req, res) {
          res.end("GET /alpha//bravo");
        });
      } catch (err) {
        gotError = true;
      }
    });
    assert.eql(true, gotError);
  });

  it("including a question mark in a URL is an error", async function() {
    var gotError = false;
    escort(function (routes) {
      try {
        routes.get("/thing?hey", function (req, res) {
          res.end("GET /thing?hey");
        });
      } catch (err) {
        gotError = true;
      }
    });
    assert.eql(true, gotError);
  });

  it("retrieving a known URL with a slash should return a MovedPermanently", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("/thing", function (req, res) {
          res.end("GET /thing");
        });
      })
    );

    await assert.response(app,
                          { url: "/thing/", method: "GET" },
                          { statusCode: 301, headers: { Location: "/thing" } });
  });

  it("retrieving a known URL with a slash should return a MovedPermanently and preserve querystring", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("/thing", function (req, res) {
          res.end("GET /thing");
        });
      })
    );

    await assert.response(app,
                          { url: "/thing/?hello=there", method: "GET" },
                          { statusCode: 301, headers: { Location: "/thing?hello=there" } });
  });

  it("sanitizes bad redirects", async function () {
    var url;
    var app = makeConnect(
      function (req, res, next) {
        req.url = req.originalUrl = "/route/?u=\u0016ee%";
        req._parsedUrl = urlParser.parse(req.url);
        next();
      },
      escort(function (routes) {
        url = routes.url;

        routes.get("route", "/route", function (req, res) {
          res.end("ok");
        });
      })
    );

    const expectedHeaders = { Location: "%2Froute%3Fu%3D%16ee%25" };

    await assert.response(
      app,
      { url: "/this-is-ignored", method: "GET" },
      { statusCode: 301, headers: expectedHeaders }
    );
  });

  it("retrieving an unknown URL with a slash should return a NotFound", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("/thing", function (req, res) {
          res.end("GET /thing");
        });
      })
    );

    await assert.response(app,
                          { url: "/other/", method: "GET" },
                          { statusCode: 404 });
  });

  it("redirect on case difference (static)", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("/Thing", function (req, res) {
          res.end("GET /Thing");
        });
      })
    );

    await assert.response(app,
                          { url: "/Thing", method: "GET" },
                          { statusCode: 200, body: "GET /Thing" });

    await assert.response(app,
                          { url: "/thing", method: "GET" },
                          { statusCode: 301, headers: { Location: "/Thing" } });

    await assert.response(app,
                          { url: "/THING", method: "GET" },
                          { statusCode: 301, headers: { Location: "/Thing" } });
  });

  it("redirect on case difference (dynamic)", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("thing", "/Thing/{item}", function (req, res, params) {
          res.end("GET /Thing/" + params.item);
        });

        routes.get("other", "/Thing/{item}/Blah", function (req, res, params) {
          res.end("GET /Thing/" + params.item + "/Blah");
        });
      })
    );

    for (let name of exampleNames) {
      await assert.response(app,
                            { url: "/Thing/" + name, method: "GET" },
                            { statusCode: 200, body: "GET /Thing/" + name });

      await assert.response(app,
                            { url: "/thing/" + name, method: "GET" },
                            { statusCode: 301, headers: { Location: "/Thing/" + name } });

      await assert.response(app,
                            { url: "/THING/" + name, method: "GET" },
                            { statusCode: 301, headers: { Location: "/Thing/" + name } });

      await assert.response(app,
                            { url: "/Thing/" + name + "/Blah", method: "GET" },
                            { statusCode: 200, body: "GET /Thing/" + name + "/Blah" });

      await assert.response(app,
                            { url: "/thing/" + name + "/blah", method: "GET" },
                            { statusCode: 301, headers: { Location: "/Thing/" + name + "/Blah" } });

      await assert.response(app,
                            { url: "/THING/" + name + "/BLAH", method: "GET" },
                            { statusCode: 301, headers: { Location: "/Thing/" + name + "/Blah" } });
    }
  });

  it("any converter case sensitivity", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("post", "/posts/{id:any('Alpha', 'Bravo', 'Charlie')}", function (req, res, params) {
          assert.strictEqual("string", typeof params.id);

          res.end("GET /posts/" + params.id);
        });
      })
    );

    for (let name of ["Alpha", "Bravo", "Charlie"]) {
      await assert.response(app,
                            { url: "/posts/" + name, method: "GET" },
                            { body: "GET /posts/" + name });

      await assert.response(app,
                            { url: "/posts/" + name.toLowerCase(), method: "GET" },
                            { statusCode: 301, headers: { Location: "/posts/" + name } });

      await assert.response(app,
                            { url: "/posts/" + name.toUpperCase(), method: "GET" },
                            { statusCode: 301, headers: { Location: "/posts/" + name } });
    }
  });

  it("string converter case sensitivity", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("alpha", "/alpha/{name:string}", function (req, res, params) {
          res.end("GET /alpha/" + params.name);
        });

        routes.get("bravo", "/bravo/{name:string({allowUpperCase: true})}", function (req, res, params) {
          res.end("GET /bravo/" + params.name);
        });
      })
    );

    for (let name of ["Alpha", "Bravo", "Charlie"]) {
      await assert.response(app,
                            { url: "/alpha/" + name.toLowerCase(), method: "GET" },
                            { body: "GET /alpha/" + name.toLowerCase() });

      await assert.response(app,
                            { url: "/alpha/" + name, method: "GET" },
                            { statusCode: 301, headers: { Location: "/alpha/" + name.toLowerCase() } });

      await assert.response(app,
                            { url: "/alpha/" + name.toUpperCase(), method: "GET" },
                            { statusCode: 301, headers: { Location: "/alpha/" + name.toLowerCase() } });

      await assert.response(app,
                            { url: "/bravo/" + name.toLowerCase(), method: "GET" },
                            { body: "GET /bravo/" + name.toLowerCase() });

      await assert.response(app,
                            { url: "/bravo/" + name, method: "GET" },
                            { body: "GET /bravo/" + name });

      await assert.response(app,
                            { url: "/bravo/" + name.toUpperCase(), method: "GET" },
                            { body: "GET /bravo/" + name.toUpperCase() });
    }
  });

  it("path converter case sensitivity", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("alpha", "/alpha/{name:path}", function (req, res, params) {
          res.end("GET /alpha/" + params.name);
        });

        routes.get("bravo", "/bravo/{name:path({allowUpperCase: true})}", function (req, res, params) {
          res.end("GET /bravo/" + params.name);
        });
      })
    );

    for (let name of ["Alpha", "Alpha/Bravo", "Alpha/Bravo/Charlie"]) {
      await assert.response(app,
                            { url: "/alpha/" + name.toLowerCase(), method: "GET" },
                            { body: "GET /alpha/" + name.toLowerCase() });

      await assert.response(app,
                            { url: "/alpha/" + name, method: "GET" },
                            { statusCode: 301, headers: { Location: "/alpha/" + name.toLowerCase() } });

      await assert.response(app,
                            { url: "/alpha/" + name.toUpperCase(), method: "GET" },
                            { statusCode: 301, headers: { Location: "/alpha/" + name.toLowerCase() } });

      await assert.response(app,
                            { url: "/bravo/" + name.toLowerCase(), method: "GET" },
                            { body: "GET /bravo/" + name.toLowerCase() });

      await assert.response(app,
                            { url: "/bravo/" + name, method: "GET" },
                            { body: "GET /bravo/" + name });

      await assert.response(app,
                            { url: "/bravo/" + name.toUpperCase(), method: "GET" },
                            { body: "GET /bravo/" + name.toUpperCase() });
    }
  });

  it("ending a URL in a slash (static)", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("/thing/", function (req, res) {
          res.end("GET /thing/");
        });
      })
    );

    await assert.response(app,
                          { url: "/thing/", method: "GET" },
                          { body: "GET /thing/" });

    await assert.response(app,
                          { url: "/thing", method: "GET" },
                          { statusCode: 301, headers: { Location: "/thing/" } });
  });

  it("ending a URL in a slash (dynamic)", async function() {
    var app = makeConnect(
      escort(function (routes) {
        routes.get("thing", "/thing/{name}/", function (req, res, params) {
          res.end("GET /thing/" + params.name + "/");
        });
      })
    );

    for (let name of exampleNames) {
      await assert.response(app,
                            { url: "/thing/" + name + "/", method: "GET" },
                            { body: "GET /thing/" + name + "/" });

      await assert.response(app,
                            { url: "/thing/" + name, method: "GET" },
                            { statusCode: 301, headers: { Location: "/thing/" + name + "/" } });
    }
  });

  it("use this instead of first argument for configuration", async function() {
    var app = makeConnect(
      escort(function () {
        this.get("/", function (req, res) {
          res.end("GET /");
        });

        this.submount("/alpha", function () {
          this.get("", function (req, res) {
            res.end("GET /alpha");
          });
        });
      })
    );

    await assert.response(app,
                          { url: "/", method: "GET" },
                          { body: "GET /" });

    await assert.response(app,
                          { url: "/alpha", method: "GET" },
                          { body: "GET /alpha" });
  });

  it("handle unicode parameters", async function() {
    var url;
    var app = makeConnect(
      escort(function () {
        url = this.url;
        this.get("post", "/unicode/{name:string({allowNonASCII: true})}", function (req, res, params) {
          res.end("GET /unicode/" + params.name);
        });
      })
    );

    for (let name of exampleUnicodeNames) {
      assert.strictEqual("/unicode/" + encodeURIComponent(name), url.post(name));

      await assert.response(app,
                            { url: "/unicode/" + encodeURIComponent(name), method: "GET" },
                            { body: "GET /unicode/" + name });
    }
  });

  it("handle unicode literal paths", async function() {
    var url;
    var app = makeConnect(
      escort(function () {
        url = this.url;
        exampleUnicodeNames.forEach(function (name) {
          this.get(name, "/" + name, function (req, res) {
            res.end("GET /" + name);
          });
        }, this);
      })
    );

    for (let name of exampleUnicodeNames) {
      assert.strictEqual("/" + encodeURIComponent(name), url[name]());

      await assert.response(app,
                            { url: "/" + encodeURIComponent(name), method: "GET" },
                            { body: "GET /" + name });
    }
  });

  it("handle unicode literal paths (dynamic)", async function() {
    var url;
    var app = makeConnect(
      escort(function () {
        url = this.url;
        exampleUnicodeNames.forEach(function (name) {
          this.get(name, "/pöst/{postName:string({allowNonASCII: true})}/" + name, function (req, res, params) {
            res.end("GET /pöst/" + params.postName + "/" + name);
          });
        }, this);
      })
    );

    for (let postName of exampleUnicodeNames) {
      for (let name of exampleUnicodeNames) {

        assert.strictEqual("/" + encodeURIComponent("pöst") + "/" + encodeURIComponent(postName) + "/" + encodeURIComponent(name), url[name](postName));

        await assert.response(app,
                              { url: "/" + encodeURIComponent("pöst") + "/" + encodeURIComponent(postName) + "/" + encodeURIComponent(name), method: "GET" },
                              { body: "GET /pöst/" + postName + "/" + name });
      }
    }
  });

  it("serialize", async function() {
    var serialization;
    var app = makeConnect(
      escort(function () {
        this.get("/", function (req, res) {
          res.end("GET /");
        });

        this.get("/posts", function (req, res) {
          res.end("GET /posts");
        });

        this.get("post", "/posts/{post}", function (req, res, params) {
          res.end("GET /posts/" + params.post);
        });

        this.get("optional", "/optional[/{dynamic}]", function (req, res, params) {
          res.end("optional");
        });

        this.get("multi", "/multi/{alpha}/{bravo}/{charlie}", function (req, res, params) {
          res.end("multi");
        });

        this.get("int", "/int/{value:int({fixedDigits: 4})}", function (req, res, params) {
          res.end("int");
        });

        this.get("any", "/any/{value:any('alpha', 'bravo', 'charlie')}", function (req, res, params) {
          res.end("any");
        });

        this.get("path", "/path/{value:path}", function (req, res, params) {
          res.end("path");
        });

        this.get("trailing", "/alpha/{value}/bravo", function (req, res, params) {
          res.end("trailing");
        });

        serialization = this.serialize();
      })
    );

    assert.deepEqual({
      root: [{
        path: "/"
      }],
      posts: [{
        path: "/posts"
      }],
      post: [{
        literals: ["/posts/"],
        params: [
          {
            name: "post",
            type: "string"
          }
        ]
      }],
      optional: [
        {
          path: "/optional"
        },
        {
          literals: ["/optional/"],
          params: [
            {
              name: "dynamic",
              type: "string"
            }
          ]
        }
      ],
      multi: [{
        literals: ["/multi/", "/", "/"],
        params: [
          {
            name: "alpha",
            type: "string",
          },
          {
            name: "bravo",
            type: "string",
          },
          {
            name: "charlie",
            type: "string",
          }
        ]
      }],
      int: [{
        literals: ["/int/"],
        params: [
          {
            name: "value",
            type: "int",
            fixedDigits: 4
          }
        ]
      }],
      any: [{
        literals: ["/any/"],
        params: [
          {
            name: "value",
            type: "any"
          }
        ]
      }],
      path: [{
        literals: ["/path/"],
        params: [
          {
            name: "value",
            type: "path"
          }
        ]
      }],
      trailing: [{
        literals: ["/alpha/", "/bravo"],
        params: [
          {
            name: "value",
            type: "string"
          }
        ]
      }]
    }, serialization);
  });
});
