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
    p: 'preid',
    d: 'dry-run',
    m: 'message',
    h: 'help'
  },
  string: ['p'],
  boolean: ['y', 'd'],
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

var version = argv._[0],
    confirm = argv.yes,
    tag = argv.tag,
    preid = argv.preid,
    dryRun = argv.d

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

var prompts = [
  {
    type: 'list',
    name: 'version',
    message: 'Select semver increment or specify new version',
    when: function (answers) {
      if (version) {
        answers.version = version
      }
      return !version
    },
    choices: SEMVER_INCREMENTS.concat([
      new inquirer.Separator(),
      {
        name: 'Other (specify)',
        value: null
      }
    ])
  },
  {
    type: 'input',
    name: 'version',
    message: 'Version',
    when: function (answers) {
      return !answers.version
    },
    validate: function (input) {
      if (!semver.valid(input)) {
        return 'Please specify a valid semver, e.g. 1.2.3. See http://semver.org/'
      }
      return true
    }
  },
  {
    type: 'list',
    name: 'preid',
    message: function (answers) {
      return 'Select a ' + answers.version + ' identifier'
    },
    when: function (answers) {
      if (preid) {
        answers.preid = preid
        return false
      }
      if (!answers.version.match(/^pre/) || semver.valid(answers.version)) {
        return false
      }
      var done = this.async()
      exec('npm show . versions', function (err, stdout) {
        if (err) {
          throw err
        }
        var semvers = JSON.parse(stdout.replace(/'/g, '"'))
          .map(function (version) {
            return semver.parse(version.replace(/[^0-9.a-z\-]/g, ''))
          })
          .filter(function (sver) {
            return sver && sver.prerelease && sver.prerelease.length > 1
          })
        if (semvers.length >= 1) {
          answers.preid = semvers[0].prerelease[0]
          done(false)
        } else {
          done(true)
        }
      })
    },
    choices: ['rc', 'alpha', 'beta'].concat([
      new inquirer.Separator(),
      {
        name: 'Other (specify)',
        value: null
      }
    ])
  },
  {
    type: 'input',
    name: 'preid',
    message: 'Identifier',
    when: function (answers) {
      return !answers.preid && answers.version.match(/^pre/)
    },
    validate: function (input) {
      if (!input.match(/[a-z]+/)) {
        return 'Please specify a valid identifier'
      }
      return true
    }
  },
  {
    type: 'list',
    name: 'tag',
    message: 'How should this version be tagged in NPM?',
    when: function (answers) {
      if (tag === true) {
        return true
      }
      answers.tag = tag || 'latest'
      return false
    },
    choices: function () {
      var done = this.async()
      exec('npm dist-tag ls', function (err, stdout) {
        if (err) {
          throw err
        }
        var choices = stdout.split('\n')
          .map(function (line) {
            return line.split(':')[0].replace(/^\s|\s$/, '')
          })
          .filter(function (line) {
            return line
          })
          .concat([
            new inquirer.Separator(),
            {
              name: 'Other (specify)',
              value: null
            }
          ])
        done(choices)
      })
    }
  },
  {
    type: 'input',
    name: 'tag',
    message: 'Tag',
    when: function (answers) {
      return !answers.tag
    },
    default: 'latest'
  },
  {
    type: 'confirm',
    name: 'confirm',
    message: function (answers) {
      var msg = 'Will bump from ' + pkg.version + ' to ' + maybeInc(answers.version, answers.preid) + ' and tag as ' + answers.tag + '. Continue'
      if (dryRun) {
        msg += ' with dry run'
      }
      msg += '?'
      return msg
    },
    when: function (answers) {
      if (confirm) {
        answers.confirm = confirm
      }
      return !confirm
    }
  }
]

function maybeInc (version, preid) {
  return SEMVER_INCREMENTS.indexOf(version) > -1 ? semver.inc(pkg.version, version, preid) : version
}

function isGitRepo (callback) {
  fs.stat(path.join(process.cwd(), '.git'), function (err, stat) {
    callback(!err && stat.isDirectory())
  })
}

function execCmd (cmd, callback) {
  if (dryRun) {
    return callback()
  }
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
  if (dryRun) {
    log('Dry run release of new version of `%s` (current version: %s)', pkg.name, pkg.version)
  } else {
    log('Releasing a new version of `%s` (current version: %s)', pkg.name, pkg.version)
  }

  log('')
  inquirer.prompt(prompts, function (answers) {
    if (!answers.confirm) {
      process.exit(0)
    }
    isGitRepo(function (isGitRepo) {
      var commands = [
        'npm version ' + maybeInc(answers.version, answers.preid) + (argv.message ? ' --message ' + argv.message : ''),
        isGitRepo && 'git push origin',
        isGitRepo && 'git push origin --tags',
        !pkg.private && ('npm publish' + (answers.tag ? ' --tag ' + answers.tag : ''))
      ]
        .filter(Boolean)

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
