const Filter = require('broccoli-filter');
const path = require('path');
const Cache = require('broccoli-filter/lib/cache');

const REMOVE_LEADING_RELATIVE_OR_SLASH_REGEX = new RegExp('^(\\.*/)*(.*)$');

/*
 * /([.*+?^=!:${}()|\[\]\/\\])/g - Replace .*+?^=!:${}()|[]/\ in filenames with an escaped version for an exact name match
 */
function escapeRegExp(string) {
  return string.replace(/([.*+?^${}()|\[\]\/\\])/g, "\\$1");
}

function normalize(str) {
  return str.replace(/[\\\/]+/g, '/');
}

function relative(a, b) {
  if (/\./.test(path.basename(a))) {
    a = path.dirname(a);
  }

  let relativePath = path.relative(a, b);
  // path.relative might have added back \-s on windows
  relativePath = normalize(relativePath);
  return relativePath.startsWith('.') ? relativePath : `./${relativePath}`;
}

/*
 * Checks if there is already a prepend in the current match.
 */
function alreadyHasPrepend(string, prepend, offset, submatch='') {
  let startIndex = offset + submatch.length - prepend.length;

  // Can be a problem if startIndex is -1 and there is no
  // prepend in string.
  if (startIndex < 0) {
    return false;
  }

  return string.indexOf(prepend, startIndex) === startIndex;
}

/**
 * Creates a function to use as second argument in String.prototype.replace.
 * The function avoids prepending twice. If the prepend needs to be applied,
 * it removes leading relative path from the replacement.
 * 
 * @param {String} replacement the string that will replace the match
 * @param {String} prepend an string to prepend the replacement with.
 */
function replacer(replacement, prepend) {
  return (match, submatch, ...args) => {
    let offset = args[args.length - 2];
    let string = args[args.length - 1];

    if (alreadyHasPrepend(string, prepend, offset, submatch)) {
      return submatch + replacement;
    }

    // submatch would have been removed by removeLeadingRelativeOrSlashRegex,
    // so no need to concat.
    return prepend + REMOVE_LEADING_RELATIVE_OR_SLASH_REGEX.exec(replacement)[2];
  }
}
class AssetRewrite extends Filter {

  constructor(inputNode, options = {}) {
    super(inputNode, {
      extensions: options.replaceExtensions || ['html', 'css'],
      // We should drop support for `description` in the next major release
      annotation: options.description || options.annotation
    })

    this.assetMap = options.assetMap || {};
    this.prepend = options.prepend || '';
    this.ignore = options.ignore || []; // files to ignore

    this.assetMapKeys = null;
  }

  /**
   * Checks that file is not being ignored and destination doesn't already have a file
   * 
   * @method canProcessFile
   * @param {String} relativePath
   * @returns {Boolean}
   */
  canProcessFile(relativePath) {
    if (!this.assetMapKeys) {
      this.generateAssetMapKeys();
    }

    if (!this.inverseAssetMap) {
      this.inverseAssetMap = Object.create(null);
      Object.keys(this.assetMap).forEach((key) => {
        let value = this.assetMap[key];
        this.inverseAssetMap[value] = key;
      });
    }

    /*
    * relativePath can be fingerprinted or not.
    * Check that neither of these variations are being ignored
    */
    
    if (this.ignore.includes(relativePath) || this.ignore.includes(this.inverseAssetMap[relativePath])) {
      return false;
    }

    return super.canProcessFile(...arguments);
  }

  generateAssetMapKeys() {
    this.assetMapKeys = Object.keys(this.assetMap);
  
    this.assetMapKeys.sort((a, b) => {
      if (a.length < b.length) {
        return 1;
      }

      if (a.length > b.length) {
        return -1;
      }

      return 0;
    });
  }

  processAndCacheFile(srcDir, destDir, relativePath) {
    this._cache = new Cache();

    return super.processAndCacheFile(...arguments);
  }

  processString(string, relativePath) {
    let newString = string;

    return this.assetMapKeys.reduce((memo, key) => {
      if (this.assetMap.hasOwnProperty(key)) {
        /*
        * Rewrite absolute URLs
        */

        memo = this.rewriteAssetPath(memo, key, this.assetMap[key]);

        /*
        * Rewrite relative URLs. If there is a prepend, use the full absolute path.
        */

        let pathDiff = relative(relativePath, key).replace(/^\.\//, "");
        let replacementDiff = relative(relativePath, this.assetMap[key]).replace(/^\.\//, "");

        if (this.prepend && this.prepend !== '') {
          replacementDiff = this.assetMap[key];
        }

        memo = this.rewriteAssetPath(memo, pathDiff, replacementDiff);
      }
      return memo;
    }, string);
  }

  rewriteAssetPath(string, assetPath, replacementPath) {
    // Early exit: does the file contain the asset path?
    if (!string.includes(assetPath)) {
      return string;
    }

    let newString = string;

    /*
    * Replace all of the assets with their new fingerprint name
    *
    * Uses a regular expression to find assets in html tags, css backgrounds, handlebars pre-compiled templates, etc.
    *
    * ["\'(=] - Match one of "'(= exactly one time
    * \\s* - Any amount of white space
    * ( - Starts the first capture group
    * [^"\'()=]* - Do not match any of ^"'()= 0 or more times
    * [^"\'()\\>=]* - Do not match any of ^"'()\>= 0 or more times - Explicitly add \ here because of handlebars compilation
    * ) - End first capture group
    * (\\?[^"\')> ]*)? - Allow for query parameters to be present after the URL of an asset
    * \\s* - Any amount of white space
    * \\\\* - Allow any amount of \ - For handlebars compilation (includes \\\)
    * \\s* - Any amount of white space
    * ["\')> ] - Match one of "'( > exactly one time
    */
    let re = new RegExp('["\'(=]\\s*([^"\'()=]*' + escapeRegExp(assetPath) + '[^"\'()\\>=]*)(\\?[^"\')> ]*)?\\s*\\\\*\\s*["\')> ]', 'g');
    let match;

    /*
    * This is to ignore matches that should not be changed
    * Any URL encoded match that would be ignored above will be ignored by this: "'()=\
    */
    let ignoreLibraryCode = new RegExp('%(22|27|5C|28|29|3D)[^"\'()=]*' + escapeRegExp(assetPath));

    while(match = re.exec(newString)) {
      let replaceString = '';
      if (ignoreLibraryCode.exec(match[1])) {
        continue;
      }

      if (this.prepend) {
        replaceString = match[1].replace(new RegExp('(\\.*/)*' + assetPath, 'g'),
          replacer(replacementPath, this.prepend));
      } else {
        replaceString = match[1].replace(new RegExp(assetPath, 'g'), replacementPath)
      }


      newString = newString.replace(new RegExp(escapeRegExp(match[1]), 'g'), replaceString);
    }

    return newString.replace(new RegExp('sourceMappingURL=' + escapeRegExp(assetPath)), (wholeMatch) => {
      let replaceString = replacementPath;
      if (this.prepend && (!/^sourceMappingURL=(http|https|\/\/)/.test(wholeMatch))) {
        replaceString = this.prepend + replacementPath;
      }
      return wholeMatch.replace(assetPath, replaceString);
    });
  }
}

module.exports = AssetRewrite;
