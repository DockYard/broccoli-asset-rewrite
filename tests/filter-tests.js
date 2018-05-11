const fs       = require('fs');
const path     = require('path');
const assert   = require('assert');
const walkSync = require('walk-sync');
const broccoli = require('broccoli');

const AssetRewrite  = require('..');

let builder;

function confirmOutput(actualPath, expectedPath) {
  let actualFiles = walkSync(actualPath);
  let expectedFiles = walkSync(expectedPath);

  assert.deepEqual(actualFiles, expectedFiles, 'files output should be the same as those input');

  expectedFiles.forEach((relativePath) => {
    if (relativePath.slice(-1) === '/') { return; }

    let actual   = fs.readFileSync(path.join(actualPath, relativePath), { encoding: 'utf8'});
    let expected = fs.readFileSync(path.join(expectedPath, relativePath), { encoding: 'utf8' });

    assert.equal(actual, expected, relativePath + ': does not match expected output');
  });
}

describe('broccoli-asset-rev', () => {
  afterEach(() => {
    if (builder) {
      builder.cleanup();
    }
  });

  it('uses the provided assetMap to replace strings', () => {
    let sourcePath = 'tests/fixtures/basic';
    let node = new AssetRewrite(sourcePath + '/input', {
      assetMap: {
        'foo/bar/widget.js': 'blahzorz-1.js',
        'images/sample.png': 'images/fingerprinted-sample.png',
        'fonts/OpenSans/Light/OpenSans-Light.eot': 'fonts/OpenSans/Light/fingerprinted-OpenSans-Light.eot',
        'fonts/OpenSans/Light/OpenSans-Light.woff': 'fonts/OpenSans/Light/fingerprinted-OpenSans-Light.woff',
        'fonts/OpenSans/Light/OpenSans-Light.ttf': 'fonts/OpenSans/Light/fingerprinted-OpenSans-Light.ttf',
        'fonts/OpenSans/Light/OpenSans-Light.svg': 'fonts/OpenSans/Light/fingerprinted-OpenSans-Light.svg',
        'fonts/OpenSans/Medium/OpenSans-Medium.eot': 'fonts/OpenSans/Medium/fingerprinted-OpenSans-Medium.eot',
        'fonts/OpenSans/Medium/OpenSans-Medium.woff': 'fonts/OpenSans/Medium/fingerprinted-OpenSans-Medium.woff',
        'fonts/OpenSans/Medium/OpenSans-Medium.ttf': 'fonts/OpenSans/Medium/fingerprinted-OpenSans-Medium.ttf',
        'fonts/OpenSans/Medium/OpenSans-Medium.svg': 'fonts/OpenSans/Medium/fingerprinted-OpenSans-Medium.svg'
      }
    });

    builder = new broccoli.Builder(node);
    return builder.build().then((graph) => {
      confirmOutput(graph.directory, sourcePath + '/output');
    });
  })

  it('ignore option tell filter what files should not be processed', () => {
    let sourcePath = 'tests/fixtures/with-ignore';
    let node = new AssetRewrite(sourcePath + '/input', {
      assetMap: {
        'foo/bar/widget.js': 'blahzorz-1.js',
        'images/sample.png': 'images/fingerprinted-sample.png',
      },
      ignore: ['ignore-this-file.html']
    });

    builder = new broccoli.Builder(node);
    return builder.build().then((graph) => {
      confirmOutput(graph.directory, sourcePath + '/output');
    });
  });

  it('rewrites relative urls', () => {
    let sourcePath = 'tests/fixtures/relative-urls';
    let node = new AssetRewrite(sourcePath + '/input', {
      assetMap: {
        'foo/bar/widget.js': 'blahzorz-1.js',
        'images/sample.png': 'images/fingerprinted-sample.png',
        'assets/images/foobar.png': 'assets/images/foobar-fingerprint.png',
        'assets/images/baz.png': 'assets/images/baz-fingerprint.png'
      }
    });

    builder = new broccoli.Builder(node);
    return builder.build().then((graph) => {
      confirmOutput(graph.directory, sourcePath + '/output');
    });
  });

  it('rewrites relative urls with prepend', () => {
    let sourcePath = 'tests/fixtures/relative-urls-prepend';
    let node = new AssetRewrite(sourcePath + '/input', {
      assetMap: {
        'foo/bar/widget.js': 'blahzorz-1.js',
        'dont/fingerprint/me.js': 'dont/fingerprint/me.js',
        'images/sample.png': 'images/fingerprinted-sample.png',
        'assets/images/foobar.png': 'assets/images/foobar-fingerprint.png',
        'img/saturation.png': 'assets/img/saturation-fingerprint.png'
      },
      prepend: 'https://cloudfront.net/'
    });

    builder = new broccoli.Builder(node);
    return builder.build().then((graph) => {
      confirmOutput(graph.directory, sourcePath + '/output');
    });

  });

  it('replaces the correct match for the file extension', () => {
    let sourcePath = 'tests/fixtures/extensions';

    let node = new AssetRewrite(sourcePath + '/input', {
      assetMap: {
        'fonts/roboto-regular.eot': 'fonts/roboto-regular-f1.eot',
        'fonts/roboto-regular.woff': 'fonts/roboto-regular-f3.woff',
        'fonts/roboto-regular.ttf': 'fonts/roboto-regular-f4.ttf',
        'fonts/roboto-regular.svg': 'fonts/roboto-regular-f5.svg',
        'fonts/roboto-regular.woff2': 'fonts/roboto-regular-f2.woff2'
      }
    });

    builder = new broccoli.Builder(node);
    return builder.build().then((graph) => {
      confirmOutput(graph.directory, sourcePath + '/output');
    });
  });

  it('replaces source map URLs', () => {
    let sourcePath = 'tests/fixtures/sourcemaps';

    let node = new AssetRewrite(sourcePath + '/input', {
      replaceExtensions: ['js'],
      assetMap: {
        'the.map' : 'the-other-map',
        'http://absolute.com/source.map' : 'http://cdn.absolute.com/other-map'
      }
    });
    builder = new broccoli.Builder(node);
    return builder.build().then((graph) => {
      confirmOutput(graph.directory, sourcePath + '/output');
    });
  });

  it('replaces source map URLs with prepend', () => {
    let sourcePath = 'tests/fixtures/sourcemaps-prepend';

    let node = new AssetRewrite(sourcePath + '/input', {
      replaceExtensions: ['js'],
      assetMap: {
        'the.map' : 'the-other-map',
        'http://absolute.com/source.map' : 'http://cdn.absolute.com/other-map'
      },
      prepend: 'https://cloudfront.net/'
    });
    builder = new broccoli.Builder(node);
    return builder.build().then((graph) => {
      confirmOutput(graph.directory, sourcePath + '/output');
    });
  });

  it('maintains fragments', () => {
    let sourcePath = 'tests/fixtures/fragments';
    let node = new AssetRewrite(sourcePath + '/input', {
      assetMap: {
        'images/defs.svg': 'images/fingerprinted-defs.svg'
      }
    });

    builder = new broccoli.Builder(node);
    return builder.build().then((graph) => {
      confirmOutput(graph.directory, sourcePath + '/output');
    });
  });

  it('maintains fragments with prepend', () => {
    let sourcePath = 'tests/fixtures/fragments-prepend';
    let node = new AssetRewrite(sourcePath + '/input', {
      assetMap: {
        'images/defs.svg': 'images/fingerprinted-defs.svg'
      },
      prepend: 'https://cloudfront.net/'
    });

    builder = new broccoli.Builder(node);
    return builder.build().then((graph) => {
      confirmOutput(graph.directory, sourcePath + '/output');
    });
  });

  it('replaces absolute URLs with prepend', () => {
    let sourcePath = 'tests/fixtures/absolute-prepend';
    let node = new AssetRewrite(sourcePath + '/input', {
      assetMap: {
        'my-image.png': 'my-image-fingerprinted.png',
        'dont/fingerprint/me.js': 'dont/fingerprint/me.js'
      },
      prepend: 'https://cloudfront.net/'
    });

    builder = new broccoli.Builder(node);
    return builder.build().then((graph) => {
      confirmOutput(graph.directory, sourcePath + '/output');
    });
  });

  it('handles URLs with query parameters in them', () => {
    let sourcePath = 'tests/fixtures/query-strings';
    let node = new AssetRewrite(sourcePath + '/input', {
      assetMap: {
        'foo/bar/widget.js': 'foo/bar/fingerprinted-widget.js',
        'script-tag-with-query-parameters.html': 'script-tag-with-query-parameters.html',
      },
    });

    builder = new broccoli.Builder(node);
    return builder.build().then((graph) => {
      confirmOutput(graph.directory, sourcePath + '/output');
    });
  });


  it('handles JavaScript files in a reasonable amount of time', function () {
    this.timeout(500);
    let sourcePath = 'tests/fixtures/js-perf';
    let node = new AssetRewrite(sourcePath + '/input', {
      assetMap: JSON.parse(fs.readFileSync(__dirname + '/fixtures/js-perf/asset-map.json')),
      replaceExtensions: ['js'],
    });

    builder = new broccoli.Builder(node);
    return builder.build().then((graph) => {
      confirmOutput(graph.directory, sourcePath + '/output');
    })
  });

  it('replaces assets in srcset attributes', function(){
    var sourcePath = 'tests/fixtures/srcset';
    var node = new AssetRewrite(sourcePath + '/input', {
      assetMap: {
        '/assets/img/small.png': '/assets/img/other-small.png',
        '/assets/img/medium.png': '/assets/img/other-medium.png',
        '/assets/img/big.png': '/assets/img/other-big.png'
      }
    });

    builder = new broccoli.Builder(node);
    return builder.build().then(function(graph) {
      confirmOutput(graph.directory, sourcePath + '/output');
    });
  });

  it('replaces assets in srcset attributes with prepend option', function(){
    var sourcePath = 'tests/fixtures/srcset-prepend';
    var node = new AssetRewrite(sourcePath + '/input', {
      assetMap: {
        '/assets/img/small.png': '/assets/img/other-small.png',
        '/assets/img/medium.png': '/assets/img/other-medium.png',
        '/assets/img/big.png': '/assets/img/other-big.png'
      },
      prepend: 'https://subdomain.cloudfront.net/'
    });

    builder = new broccoli.Builder(node);
    return builder.build().then(function(graph) {
      confirmOutput(graph.directory, sourcePath + '/output');
    });
  });
});
