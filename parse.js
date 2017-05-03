const path = require('path');
const fs = require('fs');

const phantom = require('phantom');

const Sequelize = require('sequelize');

const contentDir = 'Contents/Resources/Documents/';

const storageFile = 'es2015.docset/Contents/Resources/docSet.dsidx';

var sequelize = new Sequelize('database', 'username', 'password', {
  dialect: 'sqlite',
  storage: storageFile
});

var SearchIndex = sequelize.define('searchIndex', {
  id: {
    type: Sequelize.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: Sequelize.STRING
  },
  type: {
    type: Sequelize.STRING
  },
  path: {
    type: Sequelize.STRING
  }
}, {
  freezeTableName: true,
  timestamps: false
});

const filePath = 'file://' + path.resolve(__dirname, 'index.html');

let phantomInstance,
    pageInstance;

function buildRecord(name, type, path) {
  return SearchIndex
    .build({
      name,
      type,
      path
    })
    .save();
}

function saveSearchIndex(key, pathList) {
  var promises = pathList.map(({name, path}) => {
    return buildRecord(
      name,
      'Section',
      key + '#' + path
    );
  });

  return Promise.all(promises);
}

function writeFile(name, content) {
  return new Promise(function(resolve, reject) {
    var fileName = path.resolve(
      __dirname,
      'es2015.docset/',
      contentDir,
      name
    );

    var fileContent = htmlFileTemplate(content);

    fs.writeFile(fileName, fileContent, err => {
      if (err) {
        reject(err);

        return;
      }

      resolve();
    });
  });
}

function htmlFileTemplate(content) {
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <link rel="stylesheet" type="text/css" href="css/es6.css" />
      </head>
      <body>
        ${content}
      </body>
    </html>
    `;
}

phantom.create()
  .then(instance => {
    phantomInstance = instance;

    return instance.createPage();
  })
  .then(page => {
    pageInstance = page;

    page.property('onConsoleMessage', function(msg) {
      console.log(msg);
    });

    return page.open(filePath);
  })
  .then(() => {
    return pageInstance.evaluate(function() {
      var slice = Array.prototype.slice;

      var firstLevel = slice.call(document.querySelectorAll('#contents > ol > li'));

      return firstLevel.filter(function(elem) {
        var aLinks = elem.querySelectorAll('.secnum a');

        return aLinks.length;
      }).map(function(elem) {
        var aLinks = elem.querySelectorAll('.secnum a');

        aLinks = slice.call(aLinks);

        var fileName = aLinks[0].href.split('#')[1];

        var pathList = aLinks.map(function(elem) {
          return {
            path: elem.href.split('#')[1],
            name: elem.parentNode.nextSibling.nodeValue.trim()
          }
        });

        var text = document.querySelector('#' + fileName).innerHTML;

        return [fileName + '.html', text, pathList];
      });
    });
  })
  .then(ret => {
    return SearchIndex
      .sync({force: true})
      .then(() => ret);
  })
  .then(ret => {
    return Promise.all(ret.map(([key, value, pathList]) =>
      Promise.all([
        writeFile(key, value),
        saveSearchIndex(key, pathList)
      ])
    ))
  })
  .then(() => {
    phantomInstance.exit();
  });

