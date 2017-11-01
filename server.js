var path = require('path')
var fs = require('fs')

var dirResolve = require('dir-resolve');

var yaml = require('js-yaml');
var config = yaml.load(fs.readFileSync(__dirname + "/plugins.yml"));

var express = require('express')
var http = require('http')
var socket = require('socket.io')
var chokidar = require('chokidar')
var parser = require('body-parser')
var request = require('request')
var markdownIt = require('markdown-it')
var markdownItUtils = require('markdown-it/lib/common/utils');

const themeRegex = /^prism-(.*).css$/;
const codeRegex = /<pre><code(.*)?>([\s\S]*?)<\/code><\/pre>/igm;
const captionRegex = /<p><code>(?![\s\S]*<code)(.*?)\s(.*?)\n([\s\S]*)<\/code><\/p>/igm;

const map = {
  '&#39;': '\'',
  '&amp;': '&',
  '&gt;': '>',
  '&lt;': '<',
  '&quot;': '"'
};

function unescape(str) {
  if (!str || str === null) return '';
  const re = new RegExp('(' + Object.keys(map).join('|') + ')', 'g');
  return String(str).replace(re, (match) => map[match]);
}

function toThemeMap(basePath, filename) {
  const matches = filename.match(themeRegex);
  if (!matches)
    return;

  return {
    name: matches[1],
    filename,
    path: path.join(basePath, filename)
  };
}

function checkPrismPlugins(plugin) {
  var _t = [];
  for(var i = 0; i < plugin.length;i ++) {
    if(!(plugin[i] instanceof Object) || !(plugin[i].plugin instanceof Object)) continue;
    var pug_name = plugin[i].plugin.name;
    if(!pug_name) continue;
    if(plugin[i].plugin.css == null || plugin[i].plugin.css == undefined || plugin[i].plugin.css != true)
      plugin[i].plugin.css = false;
    if(plugin[i].plugin.enable == null || plugin[i].plugin.enable == undefined || plugin[i].plugin.enable != true)
      plugin[i].plugin.enable = false;
    else _t.push(plugin[i].plugin);
  }

  return _t;
}

const prismThemeDir = dirResolve('prismjs/themes');
const extraThemeDir = dirResolve('prism-themes/themes');
const prismMainFile = require.resolve('prismjs');
const standardThemes = fs.readdirSync(prismThemeDir)
  .map(themeFileName => toThemeMap(prismThemeDir, themeFileName));
const extraThemes = fs.readdirSync(extraThemeDir)
  .map(themeFileName => toThemeMap(extraThemeDir, themeFileName));

const themes = standardThemes.concat(extraThemes).filter(Boolean);
themes.push({
  name: 'default',
  filename: 'prism.css',
  path: path.join(prismThemeDir, 'prism.css')
});

// Plugin settings from config
const prismThemeName = config.prismJS.theme || 'default';
const prismPlugins = checkPrismPlugins(config.prismJS.plugins);
const prismTheme = themes.find(theme => theme.name === prismThemeName);
const prismThemeFileName = prismTheme.filename;
const prismThemeFilePath = prismTheme.path;

function PrismPlugin(data) {
  return data.replace(codeRegex, (origin, code_data, code) => {
    var lang = "none";
    if (code_data != undefined)
      lang = code_data.replace(/.*language-(.*?)".*/, (origin, language) => {
        return language});
    else
      code_data = ' class="language-none"'
    const startTag = `<pre${code_data}><code class="language-${lang}">`;
    const endTag = `</code></pre>`;
    code = unescape(code);
    return startTag + code + endTag;
  });

  return data;
}

function copyAssets() {
  const assets = [{
    path: path.join(__dirname, `public/css/${prismThemeFileName}`),
    data: () => fs.createReadStream(prismThemeFilePath)
  }];

  prismPlugins.forEach(function (plugin) {
    if(plugin.enable && plugin.css) {
      assets.push({
          path: path.join(__dirname, 'public/css/prism-' + plugin.name + '.css'),
          data: () => fs.createReadStream(path.join(dirResolve('prismjs/plugins/' + plugin.name), 'prism-' + plugin.name + '.css'))
      });
    }
  });

  // If prism plugin config mode is realtime include prism.js and line-numbers.js
  assets.push({
    path: path.join(__dirname, 'public/js/prism.min.js'),
    data: () => fs.createReadStream(prismMainFile)
  });
  prismPlugins.forEach(function (plugin) {
    if(plugin.enable) {
      assets.push({
        path: path.join(__dirname, 'public/js/prism-' + plugin.name + '.min.js'),
        data: () => fs.createReadStream(path.join(dirResolve('prismjs/plugins/' + plugin.name), 'prism-' + plugin.name + '.min.js'))
      });
    }
  });

  assets.forEach(function (plugin) {
    plugin.data().pipe(fs.createWriteStream(plugin.path));
  });
}

function importStyle() {
  const css = [
    '<link rel="stylesheet" href="/vendor/github-markdown.css">',
    '<link rel="stylesheet" href="/style.css">',
    `<link rel="stylesheet" href="/css/${prismThemeFileName}" type="text/css">`
  ];

  prismPlugins.forEach(function (plugin) {
    if(plugin.enable && plugin.css) {
      css.push('<link rel="stylesheet" href="/css/prism-' + plugin.name + '.css" type="text/css">');
    }
  });

  return css.join("\n");
}

function importJavascript() {
  const js = [
    '<script src="/js/prism.min.js" defer></script>'
  ];

  js.push();
  prismPlugins.forEach(function (plugin) {
    if(plugin.enable) {
      js.push('<script src="/js/prism-' + plugin.name + '.min.js" defer></script>');
    }
  });

  return js.join("\n");
}

function checkValue(config, res, key, trueVal, falseVal) {
    res[key] = (config[key] == true || config[key] == undefined || config[key] == null) ? trueVal: falseVal;
}

function checkConfig(config, md) {
    var _res = {};
    checkValue(config, _res, 'highlight', function(str, lang) {
        return '<pre><code class="language-' + lang + '">' + markdownItUtils.escapeHtml(str) + '</code></pre>';
        // return '';
    }, function(str, lang) {
        return '';
    });
    checkValue(config, _res, 'html', true, false);
    checkValue(config, _res, 'xhtmlOut', true, false);
    checkValue(config, _res, 'breaks', true, false);
    checkValue(config, _res, 'linkify', true, false);
    checkValue(config, _res, 'typographer', true, false);
    _res['langPrefix'] = config['langPrefix'] ? config['langPrefix'] : '';
    _res['quotes'] = config['quotes'] ? config['quotes'] : '“”‘’';
    return _res;
}

var parseConfig = checkConfig(config.MarkdownIt);
var md = require('markdown-it')(parseConfig);

function checkMarkdownPlugins(plugin) {
  var _t = [];
  for(var i = 0;i < plugin.length;i++) {
    if(!(plugin[i] instanceof Object) || !(plugin[i].plugin instanceof Object)) continue;
    var plugin_name = plugin[i].plugin.name;
    if(!plugin_name) continue;
    if(plugin[i].plugin.enable == null || plugin[i].plugin.enable == undefined || plugin[i].plugin.enable != true)
      plugin[i].plugin.enable = false;
    _t.push(plugin[i].plugin);
  }

  return _t;
}

md = checkMarkdownPlugins(config.MarkdownIt.plugins).reduce(function (md, plugin) {
  if(plugin.enable) {
    if(plugin.name == 'markdown-it-toc-and-anchor') {
      if(plugin.options != undefined)
        return md.use(require('markdown-it-toc-and-anchor').default, plugin.options);
      return md.use(require('markdown-it-toc-and-anchor').default);
    }
    if(plugin.options != undefined)
      return md.use(require(plugin.name), plugin.options);
    return md.use(require(plugin.name));
  }
  else return md;}, md);

var app = express()
var server = http.Server(app)
var io = socket(server)

var utils = require('./utils')


function filePrepare() {
  return fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8')
    .replace('$prismJS', importJavascript())
    .replace('$style', importStyle())
}

module.exports = function (opts) {
  return new Server(opts)
}

function Server (opts) {
  opts = opts || {}

  var self = this

  this.port = opts.port || 1337
  this.URI = 'http://localhost:' + this.port
  this.sock = {emit: function () {}}

  this.listen = function (next) {
    server.listen(self.port, next)
  }

  this.watch = function (path) {
    var self = this
    chokidar.watch(path).on('change', function (path, stats) {
      fs.readFile(path, 'utf8', function (err, data) {
        if (err) throw err
        data = data || ''
        self.sock.emit('content', PrismPlugin(md.render(data)))
      })
    })
  }
}

Server.prototype.stop = function (next) {
  request.del(this.URI, {
    headers: {
      'Content-Type': 'application/json'
    }
  }, next)
}

Server.prototype.start = function (filePath, next) {
  var self = this
  var sendFileOpts = {}

  if (utils.isPathRelative(filePath)) {
    sendFileOpts.root = path.resolve(__dirname)
  }

  this.stop(function () {
    self.watch(filePath)
    self.listen(next)
  })

  io.on('connection', function (sock) {
    self.sock = sock
    self.sock.emit('title', path.basename(filePath))
    fs.readFile(filePath, 'utf8', function (err, data) {
      if (err) throw err
      data = data || ''
      self.sock.emit('content', PrismPlugin(md.render(data)))
    })
  })

  app.use(parser.json())
  app.get('/', function (req, res) {
    res.send(filePrepare())
  })
  app.use(express.static(path.join(__dirname, 'public')))
  app.use(express.static(path.dirname(filePath)))

  app.delete('/', function (req, res) {
    io.emit('kill')
    res.end()
    process.exit()
  })
}
