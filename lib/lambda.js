var url = require('url');
var Orchestrator = require('orchestrator');
var identify = require('identify-github-event');
var Task = require('./task');

function Lambda() {
  this.tasks = [];
  this.config = {};
}

Lambda.prototype.config = function(task, defaults) {
  this.config[task] = defaults;
};

Lambda.prototype.task = function(target, deps, fn) {
  // allow calling task(target, fn)
  if (arguments.length === 2) {
    fn = deps;
    deps = [];
  }
  var parts = url.parse('fake://' + target);
  // push task
  this.tasks.push({
    user: parts.host,
    repo: parts.path.replace(/^\//, ''),
    branch: parts.hash.substr(1),
    deps: deps,
    fn: fn
  });
};

Lambda.prototype.getTasks = function(event) {
  var self = this,
      user = event.repository.owner.name,
      repo = event.repository.name,
      branch = event.ref.substr('refs/heads/'.length);

  console.log(user, repo, branch);

  var tasks = this.tasks.filter(function(task) {
    console.log(task);
    return task.user === user &&
           task.repo === repo &&
           task.branch === branch;
  }).map(function(spec, i) {
    var task = new Task({
      config: self.config,
      user: user,
      repo: repo,
      branch: branch
    });
    return {
      name: 'task-' + i,
      // if the task wants two params, convert it into a two-param callback that
      // looks like a one-item callback to Orchestrator
      fn: spec.fn.length < 2 ? function() { return spec.fn(task); } :
                          function(onDone) { return spec.fn(task, onDone); },
    };
  });
  return tasks;
};

Lambda.prototype.exec = function(event, onDone) {
  // also accept AWS context
  if (typeof onDone !== 'function') {
    onDone = onDone.done;
  }

  // find the tasks that match the event
  var tasks = this.getTasks(event);
  if (tasks.length === 0) {
    return onDone();
  }

  // add the tasks to orchestrator
  var orchestrator = new Orchestrator();
  tasks.forEach(function(task) {
    orchestrator.add(task.name, task.fn);
  });
  // run the tasks using orchestrator against the current repository
  orchestrator.start(tasks.map(function(t) { return t.name; }), onDone);
};

Lambda.prototype.identifyGithubEvent = identify;

Lambda.prototype.create = function() {
  return new Lambda();
};

module.exports = Lambda;