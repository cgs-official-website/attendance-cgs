const fs = require('fs');
const path = require('path');
function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = dir + '/' + file;
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else {
      if(file.endsWith('.jsx')) results.push(file);
    }
  });
  return results;
}
const files = walk('src');
const fbCode = fs.readFileSync('src/firebase.js', 'utf8');
files.forEach(f => {
  const code = fs.readFileSync(f, 'utf8');
  // Handle multiline imports from firebase
  const match = code.match(/import\s+{([^}]+)}\s+from\s+['\"]\.\.?\/firebase['\"]/);
  if(match) {
    const imports = match[1].split(',').map(s=>s.trim()).filter(Boolean);
    imports.forEach(i => {
      if(!fbCode.includes(i)) console.log(f, 'might be missing', i);
    });
  }
});
