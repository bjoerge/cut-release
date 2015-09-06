# cut-release

A command line tool that helps you make faster npm releases.

![](https://raw.githubusercontent.com/bjoerge/cut-release/master/demo.gif)

# What it does:

  * runs [`npm version`][npm version] with the version you specify. If run in a git repo, it will also create a version commit and tag, just like what [`npm version`][npm version] does.
  * pushes commits and tags to origin
  * runs `npm publish`, unless the [`private` flag][private flag] is set in [package.json][private flag].

###### Note:

The release of `npm` version `2.13.0`, introduced a few [enhancements][enhancements] to how the [`npm version`][npm version] command works.

In combination with `preversion`, `version`, and `postversion` scripts, your release workflow can now be reduced
to a single `cut-release` command. See the [npm documentation][npm version] and [this issue][enhancements] for more details.

# Install

    npm install -g cut-release

# Usage 

```
Usage: cut-release [<newversion> | patch | minor | major | prepatch | preminor | premajor | prerelease]


  Options:

    --yes, -y       Don't confirm, just release right away. The new version must be supplied.

    --message, -m   If supplied, npm will use it as a commit message when
                    creating a version commit. If the message contains %s then
                    that will be replaced with the resulting version number

    --tag, -t       The NPM tag to use when publishing. Defaults to 'latest'. Use this option with
                    no value to choose from a list of existing tags.

    --preid, -p     The NPM prerelease identifier to be used when a prerelease version is specified.

    --dry-run, -d   Print the commands to be executed without actually running them.
```

# Contributing
This is an OPEN Open Source Project. See [contributing.md](https://github.com/bjoerge/cut-release/blob/master/contributing.md)

[private flag]: https://docs.npmjs.com/files/package.json#private
[npm version]: https://docs.npmjs.com/cli/version
[enhancements]: https://github.com/npm/npm/issues/8620
