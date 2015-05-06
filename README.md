# cut-release

A command line tool that helps you make faster npm releases.

![](https://github.com/github/bjoerge/cut-release/master/demo.gif)

# What it does:

  * runs `npm version` with the version you specify. If run in a git repo, it will also create a version commit and tag, and fail if the repo is not clean (read more about the `npm version` command here: https://docs.npmjs.com/cli/version)
  * pushes commits and tags to origin
  * runs `npm publish`

# Install

  npm i -g cut-release

# Usage 

```
Usage: release [<newversion> | patch | minor | major | prepatch | preminor | premajor | prerelease]


  Options:

    --yes, -y       Never confirm, just release right away

    --message, -m   If supplied,, npm will use it as a commit message when
                    creating a version commit. If the message contains %s then
                    that will be replaced with the resulting version number
 
```