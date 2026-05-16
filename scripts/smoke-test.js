const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
execFileSync(process.execPath, ['--check', path.join(root, 'server.js')], { stdio: 'inherit' });
execFileSync(process.execPath, ['--check', path.join(root, 'public', 'app.js')], { stdio: 'inherit' });

const tasks = JSON.parse(fs.readFileSync(path.join(root, 'tasks', 'catalog.json'), 'utf8'));
const ids = new Set();
for (const task of tasks) {
  if (!task.id || !task.difficulty || !task.description || !task.kind) throw new Error(`bad task: ${JSON.stringify(task)}`);
  if (ids.has(task.id)) throw new Error(`duplicate task id: ${task.id}`);
  ids.add(task.id);
  const md = path.join(root, 'tasks', `${task.id}.md`);
  if (!fs.existsSync(md)) throw new Error(`missing task description: ${task.id}.md`);
}
if (tasks.length !== 73) throw new Error(`expected 73 tasks, got ${tasks.length}`);
console.log(`smoke ok: ${tasks.length} tasks, syntax checked`);
