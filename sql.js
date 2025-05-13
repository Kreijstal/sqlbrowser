const process = require('process');
var server=require('./server.js')
/**
 * Prompts the user for input securely, masking typed characters with asterisks.
 * @param {string} query The prompt message to display.
 * @returns {Promise<string>} A promise that resolves with the entered password.
 */
function promptPassword(query = 'Password: ') {
  return new Promise((resolve, reject) => {
    // Check if stdin is a TTY (interactive terminal)
    if (!process.stdin.isTTY) {
      // Fallback for non-TTY environments (e.g., piping input)
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      readline.question(query, (password) => {
        readline.close();
        resolve(password);
      });
      return;
    }

    let password = '';
    process.stdout.write(query);

    // Set terminal to raw mode to capture individual keypresses
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    const onData = (key) => {
      switch (key) {
        case '\u0004': // Ctrl+D (End of Transmission)
        case '\u0003': // Ctrl+C (Interrupt)
          cleanup();
          console.log('\nOperation cancelled.');
          process.exit(); // Exit gracefully
          break;
        case '\r': // Enter key
        case '\n': // Enter key (sometimes needed)
          cleanup();
          process.stdout.write('\n'); // Move cursor to the next line
          resolve(password);
          break;
        case '\u007f': // Backspace (often Delete on macOS/Linux)
        case '\u0008': // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
            // Move cursor back, write space, move cursor back again to erase asterisk
            process.stdout.write('\b \b');
          }
          break;
        default:
          // Check if it's a printable character (basic check)
          // You might want a more robust check depending on requirements
          if (key >= ' ' && key <= '~') {
            password += key;
            process.stdout.write('*');
          }
          // Ignore other keys like arrow keys, function keys, etc.
          break;
      }
    };

    const cleanup = () => {
      process.stdin.off('data', onData); // Remove the listener
      process.stdin.setRawMode(false); // Restore normal terminal mode
      process.stdin.pause(); // Allow the Node.js process to exit if nothing else is pending
    };

    // Attach the listener
    process.stdin.on('data', onData);
  });
}

async function runCli() {
  try {

    const enteredPassword = await promptPassword('Please enter DB URI:');
	  server.startServer(enteredPassword);



  } catch (error) {
    console.error('\nAn error occurred during password prompt:', error);
  } finally {
      if (process.stdin.isTTY && !process.stdin.isPaused()) {
          process.stdin.pause();
      }
  }
}

runCli();
