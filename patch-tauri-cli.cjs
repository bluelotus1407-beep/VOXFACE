const fs = require('fs');
const path = require('path');

const targetFile = path.join(__dirname, 'node_modules', '@tauri-apps', 'cli', 'tauri.js');

if (fs.existsSync(targetFile)) {
  let content = fs.readFileSync(targetFile, 'utf8');
  if (content.includes('/(nodejs|node|bun|electron)\\-?([0-9]*)*$/g')) {
    content = content.replace(
      '/(nodejs|node|bun|electron)\\-?([0-9]*)*$/g',
      '/(nodejs|node|nsolid|bun|electron)\\-?([0-9]*)*$/g'
    );
    fs.writeFileSync(targetFile, content, 'utf8');
    console.log('Successfully patched @tauri-apps/cli to support nsolid runtime!');
  } else if (content.includes('nsolid')) {
    console.log('@tauri-apps/cli is already patched for nsolid.');
  } else {
    console.warn('Could not find target regex in tauri.js, patch skipped.');
  }
} else {
  console.warn('@tauri-apps/cli/tauri.js not found, patch skipped.');
}
