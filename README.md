Documentation generator for Solidity with a literary bent.

# Features

* Comments and code side-by-side
* Markdown in comments
* Contract code around an area
* TOC navigation bar

# Install

`npm install solcco`

# Usage

## tl;dr

### CLI

```
npx -w solcco file
```
will output the documented version of `file` in `out.html`.

### Library use
```
const solcco = require('solcco')({level: 3 /* max. heading level for toc */});
solcco.level = 1; // Changing your mind?
const html = solcco.run("/* # Heading */\n Struct s { uint s; }");
```

### How to format comments

* use markdown anywhere in comments
* `/* */` blocks for full paragraphs
* whole-line `//` comments for quick annotations

## More info

### CLI

**`npx solcco --help` for more options**

File `Hello.sol`:
```
/* Compiler version must be greater than or equal to 0.6.10 and less than 0.7.0 */
pragma solidity ^0.6.10;

/* # Hello, World.
   The canonical hello world example */ 
contract HelloWorld {
    // make accessible
    string public greet = "Hello World!";
}
```

Then

```
npx solcco -f Hello.html Hello.sol
```

Outputs the following [Hello.html](examples/Hello.html).

### How-to

* `//` comments with not just whitespace to their left are not interpreted.
* Special commands look like this: `//+<command>+`:
* `//+clear+` to force push an empty code block.
* `//+ignore+<anything here>` to leave a line comment unintepreted.
* Spaces at the beginning of lines in comment blocks (`/* */`) are ignored up to the position of the initial `/*`+3, so that Markdown's indentation-sensitivity and code block indents work well together.

# References
This style was initiated (I think) by [Docco](http://ashkenas.com/docco/). There are versions of this for plenty of languages at the link.
