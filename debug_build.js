const { exec } = require('child_process');

console.log("Starting build check...");
exec('npx tsc --noEmit', { encoding: 'utf8' }, (error, stdout, stderr) => {
    console.log("--- STDOUT ---");
    console.log(stdout);
    console.log("--- STDERR ---");
    console.log(stderr);
    if (error) {
        console.log("--- ERROR ---");
        console.log("Exit Code:", error.code);
    }
});
