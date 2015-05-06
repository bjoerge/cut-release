#!/usr/bin/env node

var inquirer = require('inquirer')
var chalk = require('chalk')
var parseArgs = require('minimist')
var semver = require('semver')
var fs = require('fs')
var path = require('path')
var exec = require('child_process').exec
var async = require('async')

var VALID_VERSIONS = ['patch', 'minor', 'major', 'prepatch', 'preminor', 'premajor', 'prerelease']

var argv = parseArgs(process.argv.slice(2), {
  alias: {
    y: 'yes',
    h: 'help'
  },
  unknown: function (opt) {
    if (VALID_VERSIONS.indexOf(opt) > -1) {
      return
    }
    console.log()
    console.log('Error: Invalid option: %s', opt)
    console.log()
    console.log(help())
    process.exit(1)
  }
})

function help () {
  return fs.readFileSync(__dirname + '/usage.txt', 'utf-8')
}

var pkg
try {
  pkg = require(path.join(process.cwd(), 'package.json'))
} catch (e) {
  if (e.code === 'MODULE_NOT_FOUND') {
    console.log('No package.json exists in current working directory')
  } else {
    console.log('Error reading package.json from current working directory: %s', e.message)
  }
  process.exit(1)
}

var prompts = {
  version: {
    type: 'list',
    name: 'version',
    message: 'What version would you like to release',
    choices: VALID_VERSIONS.concat({
      name: 'other (specify)',
      value: '_other'
    })
  },
  specify: {
    type: 'input',
    validate: function (input) {
      if (!semver.valid(input)) {
        return 'Please specify a valid semver, e.g. 1.2.3. See http://semver.org/'
      }
      return true
    },
    name: 'specify',
    message: 'Specify version'
  }
}

var ui = new inquirer.ui.BottomBar()

ui.log.write('Releasing a new version of `' + pkg.name + '` (current version: ' + pkg.version + ')')

var version = argv._[0]

function gotVersion (callback) {
  if (version) {
    return process.nextTick(callback.bind(null, version))
  }
  inquirer.prompt(prompts.version, function (answers) {
    if (answers.version === '_other') {
      return specifyVersion(callback)
    }
    callback(answers.version)
  })
}

function specifyVersion (callback) {
  inquirer.prompt(prompts.specify, function (answers) {
    callback(answers.specify)
  })
}

function confirm (version, callback) {
  if (argv.yes) {
    return process.nextTick(callback.bind(null, true))
  }
  var newVer = semver.inc(pkg.version, version)
  var prompt = {
    type: 'confirm',
    name: 'confirm',
    message: 'This will tag and release a new version from ' + pkg.version + ' to ' + newVer + '. Are you sure?'
  }

  inquirer.prompt(prompt, function (answers) {
    callback(answers.confirm)
  })
}

function isGitRepo (callback) {
  fs.stat(path.join(process.cwd(), '.git'), function (err, stat) {
    callback(!err && stat.isDirectory())
  })
}

function maybePush (callback) {
  isGitRepo(function (yes) {
    if (!yes) {
      return callback()
    }
    return async.parallel([
      execCmd.bind(null, 'git push origin'),
      execCmd.bind(null, 'git push origin --tags')
    ], callback)
  })
}

function bump (version, callback) {
  execCmd('npm version ' + version, callback)
}

function publish (callback) {
  execCmd('npm publish', callback)
}

function execCmd (cmd, callback) {
  exec(cmd, function (err, stdout, stderr) {
    if (err) {
      err = new Error('`' + cmd + '` failed:\n' + err.message)
      err.stderr = stderr
      err.stdout = stdout
      return callback(err)
    }
    ui.log.write(stdout)
    callback(null, stdout)
  })
}

function handleError (error) {
  ui.log.write(chalk.red(error.message))
  process.exit(1)
}

gotVersion(function (version) {
  confirm(version, function (yes) {
    if (!yes) {
      return process.exit(0)
    }

    async.series([
      bump.bind(null, version),
      maybePush,
      publish
    ], function (err) {
      if (err) {
        return handleError(err)
      }
      console.log(chalk.green('Done'))
    })
  })
})
