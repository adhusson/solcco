const path = require('path');
const debug = require("debug")("solcco");
const fs = require("fs");
const handlebars = require("handlebars");
const prism = require("prismjs");
const markdownIt = require("markdown-it");

/* Load code highlighters and make language map */
const loadLanguages = require("prismjs/components/");
loadLanguages(["solidity"]);
loadLanguages(["javascript"]);

const languages = {
  ".js": {name: "javascript", object: prism.languages.javascript},
  ".sol": {name: "solidity", object: prism.languages.solidity}
};

const runner = (config, input, extra) => {


  /* Table of contents */
  const toc = [];
  const packedFiles = [];

  // markdown-it-anchor already has slug deduplication, but every comment
  // block creates a new markdown context so it doesn't remember old slugs.
  const slugs = new Set();

  const slugify = s => {
    const slug = encodeURIComponent(String(s).trim().toLowerCase().replace(/\s+/g, '-'));
    let key = slug;
    let i = 0 ;
    while (slugs.has(key)) key = `${slug}-${i++}`;
    slugs.add(key);
    return key;
  };

  const isString = s => typeof s === 'string' || s instanceof String;

  let code = "";


  if (isString(input)) {
    if (isString(extra)) { // input is file title, extra is content
      input = [{file: input, content: extra}];
    } else { // input is content, ignore extra
      input = [{file:'stdin', content: input}];
    }
  } // otherwise assume all is good (input type is [{file:string,content:string}])

  for (const {file,content} of input) {
    let rest = content;

    /* Add file to TOC */
    const fileSlug = slugify(file);
    toc.push({title: file, slug: fileSlug, tag: 'file'});

    /* Configure highlight language */
    const language = languages[path.extname(file)];
    if (!language) {
      throw `Unknown file extension: ${path.extname(file)}`;
    }


    /* Parser routines */

    let results = [];

    let _lineno = 1;

    /* Error objects */
    const parseError = (msg) => {
      const line = rest.match(/.*/)[0];
      return new Error(`Parse error, file: ${file}, line ${_lineno}: ${msg}\n${line}`);
    };

    const parse = (pattern, {move = false, buffer = false, error = false}) => {
      const match = rest.match(new RegExp(pattern));
      if (!match || match.index != 0) {
        if (error) {
          throw parseError(error);
        }
        return false;
      } else {
        if (move) {
          rest = rest.slice(match[0].length);
          _lineno += Math.max(0,match[0].split('\n').length - 1);
        }
        if (buffer) {
          _buffer = _buffer.concat(match[0]);
        }
        return match;
      }
    };
    const lookAhead = (pattern) => parse(pattern, {});

    const skip = (pattern) => parse(pattern, {move: true});

    let _buffer = "";
    const buffer = (pattern) => {
      parse(pattern, {move: true, buffer: true, error: `${pattern}: cannot buffer, no match`});
    };
    const tryBuffer = (pattern) => parse(pattern, {move: true, buffer: true});
    const bufferString = (string) => {
      _buffer = _buffer.concat(string);
    };

    const isDone = () => rest == "";

    const flush = (type,force) => {
      debug(`Flushing ${type} at lineno ${_lineno}, force: ${!!force}`);
      //if (_buffer !== '' || force) {
        const numbuflines = Math.max(0,_buffer.split('\n').length - 1);
        results.push({type, content: _buffer, lineno: _lineno-numbuflines});
      //}
      _buffer = '';
    };

    // horizontal whitespace
    const raw = String.raw;
    const singlehws = raw`[^\S\r\n]`;
    const hws = raw`${singlehws}*`;

    let mode = "base";

    /* Core parsing */
    while (true) {
      debug("at %o", rest.substring(0, 30));
      debug(`| mode: ${mode}`);
      if (["base", "code"].includes(mode)) {
        if (isDone()) {
          flush("code");
          break;
        } else if (lookAhead('"')) {
          // ignore comment markers in "" string
          //
          debug("| double string");
          buffer(/"[^]*?(?<!\\)"/);
          mode = "code";
        } else if (lookAhead("'")) {
          // ignore comment markers in '' strings
          debug("| single string");
          buffer(/'[^]*?(?<!\\)'/); // ?<! is negative lookbehind
          mode = "code";
        } else if (mode === "base") {
          if (lookAhead(raw`${hws}/\*`)) {
            // comment block on its own line
            debug("| open block comment");
            flush("code");
            mode = "blockComment";
            /* whitespace prefix length.
            Comments in solidity block below a "/*" usually start 1 space after the *,
            so the left edge is 3 characters to the right of the comment start.
            Schematically :

            /*<---- comment starts here
            |<---- left edge is here

            This is important because markdown has significant whitespace prefix.
            For instance 4 spaces before a line starts mean a blockquote

            */
            modeParam = skip(hws)[0].length + 3;
            skip(raw`/\*`);
          } else if (lookAhead(raw`${hws}//`)) {
            // comment line on its own line.
            debug("| standalone line comment");
            if (skip(raw`${hws}//${hws}SPDX-License-Identifier:.*\r?\n`)) {
              debug("| (excluded (SPDX))");
            } else if (lookAhead(raw`${hws}//\+.*\+.*\r?\n`)) {
              debug("| (+...+ flag))");
              const flag = skip(raw`${hws}//\+(.*?)\+`)[1];
                if (flag == "ignore") {
                  debug("| (+ignore+ flag))");
                  skip(raw`.*\r?\n`);
                } else if (flag == "clear") {
                  // useful for inserting clearing lines
                  debug("| (+clear+ flag))");
                  flush("code");
                  skip(/[^]*?\r?\n/);
                  bufferString("");
                  flush("clear");
                  //flush("code",true);
                } else {
                  throw parseError(`unknown solcco line comment flag: ${flag}`);
                }
                //debug('| (excluded (+ flag))');
                //buffer(/[^]*?$/m);
            } else {
              debug("| (included)");
              flush("code");
              skip(raw`${hws}//${hws}`);
              buffer(/[^]*?$/m); // m flag interprets $ as endofline
              skip('\r?\n');
              flush("lineComment");
            }
          } else if (lookAhead(/\s/)) {
            // whitespace
            debug("| whitespace");
            buffer(/[^]/);
          } else {
            // non-whitespace
            debug("| non-whitespace, going to code");
            mode = "code";
            buffer(/[^]/);
          }
        } else if (mode === "code") {
          if (lookAhead(/\/\*/)) {
            // embedded comment block (ignored for now)
            debug("| excluded block comment");
            buffer(raw`/\*[^]*?\*/`);
          } else if (lookAhead(raw`//`)) {
            debug("| excluded line comment, going to base");
            buffer(raw`//[^]*?\r?\n`);
            mode = "base";
          } else if (lookAhead(/\r?\n/)) {
            debug("| newline, going to base");
            buffer(/[^]/);
            mode = "base";
          } else {
            debug("| single char");
            buffer(/[^]/);
          }
        }
      } else if (mode === "blockComment") {
        debug(`| mode blockComment, modeParam:${modeParam}`);
        // in blockComment mode, 'modeParam' is the amount of whitespace to skip after newlines
        // we should always enter this branch at the beginning of a new comment line
        if (isDone()) {
          throw parseError('non terminated block comment');
        } else {
          skip(raw`${singlehws}{0,${modeParam}}`);
          if (tryBuffer(raw`.*?(?=\*/)`)) {
            debug("| last block comment line");
            skip(raw`\*/(${hws}\r?\n)?`);
            flush("blockComment");
            mode = "base";
          } else {
            debug("| ongoing block comment line");
            buffer(raw`.*\r?\n`);
          }
        }
      } else {
        throw parseError(`unknown mode: ${mode}`);
      }
    }


    /* Load code highlighter, markdown parser */

    const md = markdownIt({
      typographer: true,
      breaks: false,
      html: true,
    })
    .use(require('@gerhobbelt/markdown-it-anchor'),{
      slugify: s => {
        return `${fileSlug}-${slugify(s)}`;
      },
      level: config.level,
      callback: ({tag},{title,slug}) => {
        toc.push({tag,title,slug});
      }
    })
    .use(require('markdown-it-sup'))
    .use(require('markdown-it-sub'))
    .use(require('@iktakahiro/markdown-it-katex'));


    /* Remove extra \r?\n in comments */

    const trimPreNL = (s) => {
      return s.replace(/^\r?\n*/, "");
    };

    /* Turn linear parsed blocks into structured content */

    const freshPack = () => {
      return {lineno: 0, lineComment: [], blockComment: [], code: []};
    };
    const packedResults = [freshPack()];

    debug(results);

    for (const result of results) {
      let last = packedResults[packedResults.length - 1];
      const c = result.type === "code" ? result.content : trimPreNL(result.content || "");
      if (result.type === "code") {
        if (last.closed) {
          last = freshPack();
          packedResults.push(last);
        }
        if (last.code.length === 0) {
          last.lineno = result.lineno;
        }
        last["code"].push(result.content);
      }
      if (result.type === "clear") {
        last.closed = true;
      }
      if (["lineComment","blockComment"].includes(result.type)) {
        if (last.code.length > 0) {
          last.closed = true;
        }
        last = freshPack();
        packedResults.push(last);
        last[result.type].push(trimPreNL(result.content));
      }
    }

    /* Generate spans of lines (the left line gutter in the code panel) */

    const makeLines = (from,code) => {
      const lines = code.split('\n').map((_,i) => `${from+i}`).join('\n');
      return lines;
    };

    /* Replace parsed input with rendered output */

    for (const pack of packedResults) {
      pack.blockComment = md.render(pack.blockComment.join("\n\n"));
      pack.lineComment = md.render(pack.lineComment.join("\n\n"));
      let joined = pack.code.join("");
      if (joined.match(/\n$/)) {
        joined = joined.slice(0,-1);
      }
      //Skip only-spaces
      if (!joined.match(/^\s*$/)) {
        pack.lines = makeLines(pack.lineno,joined);
        pack.rawCode = joined;
        pack.code = prism.highlight(
          joined,
          language.object,
          language.name
          ).split('\r?\n').join('<br>');
      } else {
        pack.lines = '';
        pack.code = '';
        pack.rawCode = '';
      }
    }

    packedFiles.push({fileSlug, file, packedResults});
  }

  debug(packedFiles); // depth null often useful

  const util = require('util');
  debug("packedFiles, %s",util.inspect(packedFiles,{depth:null}));

  /* Compile with handlebars */
  if (config.code) {
    const template = `{{#each toc}}
{{title}}
{{/each}}

{{#each packedFiles}}
================
{{file}}
================
{{#each packedResults}}
{{{rawCode}}}
{{/each}}
{{/each}}`;
    const newPackedFiles = packedFiles.map(({fileSlug,file,packedResults}) => {
      const newPackedResults = packedResults.filter(({rawCode}) => { return rawCode !== ''; });
      return {fileSlug,file,packedResults:newPackedResults};
    });
    const code = handlebars.compile(template)({toc,packedFiles: newPackedFiles, level: 0});
    return code;
  } else {
    const template = fs.readFileSync(path.join(__dirname,'solcco.html'), "utf8");
    const html = handlebars.compile(template)({toc, packedFiles, level: config.level});
    return html;
  }
}

module.exports = (_config={}) => {
  const config = {
    code: !!_config.code,
    level: Number.isInteger(_config.level) ? _config.level : 2,
    run(input) { return runner(this,input); }
  }
  return config;
}
