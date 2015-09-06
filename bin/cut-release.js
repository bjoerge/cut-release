#!/usr/bin/env node
'use strict'

var inquirer = require('inquirer')
var chalk = require('chalk')
var parseArgs = require('minimist')
var semver = require('semver')
var fs = require('fs')
var path = require('path')
var exec = require('child_process').exec
var spawn = require('child_process').spawn
var async = require('async')

var SEMVER_INCREMENTS = ['patch', 'minor', 'major', 'prepatch', 'preminor', 'premajor', 'prerelease']

Object.keys(inquirer.prompt.prompts).forEach(function (prompt) {
  inquirer.prompt.prompts[prompt].prototype.prefix = function (str) {
    return str
  }
})

var argv = parseArgs(process.argv.slice(2), {
  alias: {
    y: 'yes',
    t: 'tag',
    m: 'message',
    h: 'help'
  },
  unknown: function (opt) {
    if (semver.valid(opt) || SEMVER_INCREMENTS.indexOf(opt) > -1) {
      return
    }
    log()
    if (opt.substring(0, 1) === '-') {
      log('Error: Invalid option "%s"', opt)
    } else {
      log('Error: Invalid version "%s"', opt)
    }
    log()
    log(help())
    process.exit(1)
  }
})

var version = argv._[0]

function log (args) {
  console.log.apply(console, arguments)
}

var selfPkg = require('../package.json')

function help () {
  return fs.readFileSync(__dirname + '/usage.txt', 'utf-8')
}

var pkg
try {
  pkg = require(path.join(process.cwd(), 'package.json'))
} catch (e) {
  if (e.code === 'MODULE_NOT_FOUND') {
    log('Error: No package.json exists in current working directory')
  } else {
    log('Error: Unable to read package.json from current working directory: %s', e.message)
  }
  process.exit(1)
}

var prompts = {
  version: {
    type: 'list',
    name: 'version',
    message: 'Select semver increment or specify new version',
    choices: SEMVER_INCREMENTS.concat([
      new inquirer.Separator(),
      {
        name: 'Other (specify)',
        value: '_other'
      }
    ])
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
    message: 'Version'
  }
}

function gotVersion (callback) {
  if (version) {
    return process.nextTick(callback.bind(null, maybeInc(version)))
  }
  inquirer.prompt(prompts.version, function (answers) {
    if (answers.version === '_other') {
      return specifyVersion(callback)
    }
    callback(maybeInc(answers.version))
  })
}

function maybeInc (version) {
  return SEMVER_INCREMENTS.indexOf(version) > -1 ? semver.inc(pkg.version, version) : version
}

function specifyVersion (callback) {
  inquirer.prompt(prompts.specify, function (answers) {
    callback(maybeInc(answers.specify))
  })
}

function confirm (version, callback) {
  if (argv.yes) {
    return process.nextTick(callback.bind(null, true))
  }
  var prompt = {
    type: 'confirm',
    name: 'confirm',
    message: 'Will bump from ' + pkg.version + ' to ' + version + '. Continue?'
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

function execCmd (cmd, callback) {
  exec(cmd, {maxBuffer: 1024 * 1024 * 5}, function (err, stdout, stderr) {
    if (err) {
      err = new Error('The command `' + cmd + '` failed:\n' + err.message)
      err.stderr = stderr
      err.stdout = stdout
      return callback(err)
    }
    if (stdout.trim().length > 0) {
      log(stdout)
    }
    callback(null, stdout)
  })
}

function maybeSelfUpdate (callback) {
  exec('npm view cut-release@latest version', {timeout: 2000}, function (error, stdout, stderr) {
    if (error) {
      return callback(error)
    }
    if (stderr) {
      return callback(new Error('unable to check for latest version: ' + stderr.toString()))
    }

    var latestVersion = stdout.trim()

    if (!semver.lt(selfPkg.version, latestVersion)) {
      return callback(null, false)
    }

    var prompt = {
      type: 'confirm',
      name: 'confirm',
      message: 'A new version of ' + selfPkg.name + ' (' + latestVersion + ' - you\'ve got ' + selfPkg.version + ') is available. Would you like to update?'
    }

    inquirer.prompt(prompt, function (answers) {
      callback(null, answers.confirm)
    })
  })
}

function selfUpdate () {
  log(chalk.blue('Running selfupdate. Please hang on...'))
  var cmd = 'npm i -g cut-release@latest'
  execCmd(cmd, function () {
    log(chalk.blue('Self update completed'))
    spawn('cut-release', process.argv.slice(2), {stdio: 'inherit'})
  })
}

maybeSelfUpdate(function (err, shouldSelfUpdate) {
  if (err) {
    // log('Selfupdate check failed: ' + err.stack)
    // log('')
  }
  if (shouldSelfUpdate) {
    return selfUpdate()
  }
  log('Releasing a new version of `%s` (current version: %s)', pkg.name, pkg.version)
  log('')
  gotVersion(function (version) {
    confirm(version, function (yes) {
      isGitRepo(function (isGitRepo) {
        var commands = [
          'npm version ' + version + (argv.message ? ' --message ' + argv.message : ''),
          isGitRepo && 'git push origin',
          isGitRepo && 'git push origin --tags',
          'npm publish' + (argv.tag ? ' --tag ' + argv.tag : '')
        ]
          .filter(Boolean)

        if (!yes) {
          return process.exit(0)
        }

        var remaining = commands.slice()
        async.eachSeries(commands, function (command, callback) {
            log('=> ' + command)
            execCmd(command, function (err, result) {
              callback(err, result)
              remaining.shift()
            })
          },
          function (err) {
            if (err) {
              return showError(err)
            }
            log(chalk.green('Done'))
          })

        function showError (error) {
          log('')
          log(chalk.red(error.stdout))
          log('')
          log(chalk.red(error.message))
          log('')
          log(chalk.yellow('You can try again by running these commands manually:'))
          log(chalk.white(remaining.join('\n')))
          process.exit(1)
        }
      })
    })
  })
})
