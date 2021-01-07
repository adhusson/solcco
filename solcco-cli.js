#!/usr/bin/env node
const meow = require('meow');
const path = require('path');
const fs   = require('fs');
const cli  = meow(`
Usage
  $ solcco [--write] [--code] [--file <file>] [--level <level>] file1 [... fileN]

Options
  --code  (-c) Strip comments, display code on stdout. Takes precedence over output options.
  --level (-l) Maximum header level to generate TOC for (default: 2)
  --noop  (-n) Do not output the documentation. Takes precedence over output options.
  --write (-w) Writes to out.html instead of stdout
  --file  (-f) Writes to given filename
  --help       Displays this help text
  --version    Displays this help text

Examples
  $ solcco -w contracts/*.sol

  Will write generated documentation for solidity files in contracts/ directory to file out.html.

  $ solcco -c contracts/*.sol

  Will show the code stripped of comments on stdout

For more on the documentation syntax, see https://github.com/adhusson/solcco.
`,
  {
    flags: {
      code:  { type: 'boolean', alias: 'c', default: false },
      noop:  { type: 'boolean', alias: 'n', default: false },
      write: { type: 'boolean', alias: 'w', default: false },
      file:  { type: 'string',  alias: 'f', default: '' },
      level: { type: 'number',  alias: 'l', default: 2 }
    }
  }
);

const solcco = require(`${__dirname}/solcco.js`)({
  code: cli.flags.code,
  level: cli.flags.level
});

if (cli.input.length === 0) {
  cli.showHelp();
} else {
  const files = cli.input.map(arg => {
    return {
      file: path.basename(arg),
      content: fs.readFileSync(arg,'utf8')
    };
  });
  if (cli.flags.code) {
    code = solcco.run(files);
    console.log(code);
  } else {
    const file = cli.flags.file || (cli.flags.write && './out.html') || undefined;
    const html = solcco.run(files);
    console.log(file);
    if (!cli.flags.noop) {
      if (file) {
        fs.writeFileSync(file, html, "utf8");
      } else {
        console.log(html);
      }
    }
  }
}

