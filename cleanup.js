const fs = require('fs');
const path = require('path');

const dirPath = path.join(__dirname, 'app/dashboard/event-summaries');

function removeDirectory(dirPath) {
  if (fs.existsSync(dirPath)) {
    const files = fs.readdirSync(dirPath);
    files.forEach(file => {
      const filePath = path.join(dirPath, file);
      if (fs.statSync(filePath).isDirectory()) {
        removeDirectory(filePath);
      } else {
        fs.unlinkSync(filePath);
        console.log(`Deleted file: ${filePath}`);
      }
    });
    fs.rmdirSync(dirPath);
    console.log(`Deleted directory: ${dirPath}`);
  } else {
    console.log('Directory does not exist:', dirPath);
  }
}

removeDirectory(dirPath);
