const vscode = require('vscode');
const { spawn, exec } = require('child_process');

// Global variables to track state
let currentPanel = undefined;
let adbProcess = undefined;
let gstProcess = undefined;

/**
 * Activate the extension
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Mobile Automation extension is now active');

    // Register the command to open the mobile panel
    let disposable = vscode.commands.registerCommand('extension.openMobilePanel', function () {
        if (currentPanel) {
            // If panel already exists, reveal it
            currentPanel.reveal(vscode.ViewColumn.One);
            return;
        }

        // Create a new panel
        currentPanel = vscode.window.createWebviewPanel(
            'mobileAutomation',
            'Mobile Automation Panel',
            vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );

        // Set initial HTML content
        updateWebviewContent(currentPanel);

        // Handle messages from the webview
        currentPanel.webview.onDidReceiveMessage(
            message => handleWebviewMessage(message, currentPanel),
            undefined,
            context.subscriptions
        );

        // Clean up resources when panel is closed
        currentPanel.onDidDispose(
            () => {
                // Kill any running processes
                if (adbProcess) {
                    adbProcess.kill();
                    adbProcess = undefined;
                }
                if (gstProcess) {
                    gstProcess.kill();
                    gstProcess = undefined;
                }
                currentPanel = undefined;
                console.log('WebView panel disposed');
            },
            null,
            context.subscriptions
        );
    });

    context.subscriptions.push(disposable);
}

/**
 * Update the webview content
 * @param {vscode.WebviewPanel} panel
 */
function updateWebviewContent(panel) {
    panel.webview.html = `<!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mobile Automation</title>
        <style>
            body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
                padding: 20px;
                color: #333;
            }
            .container {
                display: flex;
                flex-direction: column;
                gap: 20px;
            }
            .button-container {
                display: flex;
                flex-wrap: wrap;
                gap: 10px;
                margin-bottom: 10px;
            }
            .section {
                margin-bottom: 20px;
            }
            .section-title {
                font-size: 1.2em;
                margin-bottom: 10px;
                color: #444;
            }
            button {
                padding: 8px 16px;
                background-color: #007acc;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            }
            button:hover {
                background-color: #005999;
            }
            button.secondary {
                background-color: #6c757d;
            }
            button.secondary:hover {
                background-color: #5a6268;
            }
            #log-container {
                border: 1px solid #ddd;
                border-radius: 4px;
                padding: 10px;
                margin-top: 10px;
            }
            #logs {
                font-family: monospace;
                white-space: pre-wrap;
                height: 300px;
                overflow-y: auto;
                background-color: #f5f5f5;
                padding: 10px;
                border-radius: 4px;
            }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>Mobile Automation Panel</h1>
            
            <div class="section">
                <div class="section-title">Device Management</div>
                <div class="button-container">
                    <button id="listDevicesBtn" class="secondary">List Connected Devices</button>
                    <button id="startEmulatorBtn" class="secondary">Start Emulator</button>
                </div>
            </div>
            
            <div class="section">
                <div class="section-title">Streaming Controls</div>
                <div class="button-container">
                    <button id="testBtn">Test Communication</button>
                    <button id="startBtn">Start Streaming</button>
                    <button id="stopBtn">Stop Streaming</button>
                </div>
            </div>
            
            <div id="log-container">
                <h3>Logs:</h3>
                <div id="logs">Initializing WebView...</div>
            </div>
        </div>

        <script>
            (function() {
                // Get VS Code API
                const vscode = acquireVsCodeApi();
                const logsElement = document.getElementById('logs');
                
                // Log function
                function log(message) {
                    const timestamp = new Date().toLocaleTimeString();
                    logsElement.innerHTML += '\n[' + timestamp + '] ' + message;
                    logsElement.scrollTop = logsElement.scrollHeight;
                }
                
                // Add event listeners to buttons
                document.getElementById('testBtn').addEventListener('click', function() {
                    log('Sending test message to extension...');
                    vscode.postMessage({
                        command: 'test',
                        data: 'Hello from WebView!'
                    });
                });
                
                document.getElementById('startBtn').addEventListener('click', function() {
                    log('Requesting to start streaming...');
                    vscode.postMessage({
                        command: 'startStream'
                    });
                });
                
                document.getElementById('stopBtn').addEventListener('click', function() {
                    log('Requesting to stop streaming...');
                    vscode.postMessage({
                        command: 'stopStream'
                    });
                });
                
                document.getElementById('listDevicesBtn').addEventListener('click', function() {
                    log('Requesting device list...');
                    vscode.postMessage({
                        command: 'listDevices'
                    });
                });
                
                document.getElementById('startEmulatorBtn').addEventListener('click', function() {
                    log('Requesting to start an emulator...');
                    vscode.postMessage({
                        command: 'startEmulator'
                    });
                });
                
                // Handle messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    if (message.type === 'log') {
                        log(message.content);
                    } else {
                        log('Received message: ' + JSON.stringify(message));
                    }
                });
                
                // Send ready message
                log('WebView initialized');
                vscode.postMessage({
                    command: 'ready'
                });
            })();
        </script>
    </body>
    </html>`;

    // Send initial message after a delay
    setTimeout(() => {
        if (panel) {
            panel.webview.postMessage({
                type: 'log',
                content: 'Extension connected to WebView'
            });
        }
    }, 1000);
}

/**
 * Handle messages from the webview
 * @param {any} message
 * @param {vscode.WebviewPanel} panel
 */
function handleWebviewMessage(message, panel) {
    console.log('Received message from WebView:', message);

    switch (message.command) {
        case 'ready':
            console.log('WebView is ready');
            panel.webview.postMessage({
                type: 'log',
                content: 'Connection established with extension'
            });
            break;
            
        case 'test':
            console.log('Test message received:', message.data);
            panel.webview.postMessage({
                type: 'log',
                content: 'Test successful! Extension received: ' + (message.data || 'no data')
            });
            break;
            
        case 'startStream':
            startStreaming(panel);
            break;
            
        case 'stopStream':
            // Kill any running processes
            if (adbProcess) {
                adbProcess.kill();
                adbProcess = undefined;
            }
            if (gstProcess) {
                gstProcess.kill();
                gstProcess = undefined;
            }
            panel.webview.postMessage({
                type: 'log',
                content: 'All streaming processes stopped'
            });
            break;
            
        case 'listDevices':
            listConnectedDevices(panel);
            break;
            
        case 'startEmulator':
            startEmulator(panel);
            break;
            
        default:
            console.log('Unknown command:', message.command);
            panel.webview.postMessage({
                type: 'log',
                content: 'Unknown command: ' + message.command
            });
    }
}

/**
 * List connected devices in the WebView
 * @param {vscode.WebviewPanel} panel
 */
function listConnectedDevices(panel) {
    panel.webview.postMessage({
        type: 'log',
        content: 'Checking for Android SDK tools...'
    });
    
    const paths = getAndroidSdkPaths();
    
    // First check if ADB exists
    exec(`ls -la ${paths.adb}`, (error) => {
        if (error) {
            panel.webview.postMessage({
                type: 'log',
                content: `Android Debug Bridge (ADB) not found at ${paths.adb}`
            });
            panel.webview.postMessage({
                type: 'log',
                content: 'You can install Android SDK through Android Studio: https://developer.android.com/studio'
            });
            return;
        }
        
        panel.webview.postMessage({
            type: 'log',
            content: 'Listing connected devices...'
        });
        
        exec(`${paths.adb} devices`, (adbError, stdout) => {
            if (adbError) {
                console.error('Error checking devices:', adbError);
                panel.webview.postMessage({
                    type: 'log',
                    content: `Error checking devices: ${adbError.message}`
                });
                return;
            }
            
            // Parse the device list
            const lines = stdout.trim().split('\n');
            // Remove the first line which is the header
            lines.shift();
            
            // Extract device IDs
            const devices = lines
                .filter(line => line.trim().length > 0)
                .map(line => {
                    const parts = line.trim().split('\t');
                    return {
                        id: parts[0],
                        status: parts[1] || 'unknown'
                    };
                });
            
            if (devices.length === 0) {
                panel.webview.postMessage({
                    type: 'log',
                    content: 'No devices or emulators found. Use the "Start Emulator" button to launch an emulator.'
                });
                panel.webview.postMessage({
                    type: 'log',
                    content: 'Alternatively, connect a physical Android device with USB debugging enabled.'
                });
                return;
            }
            
            // Log the found devices
            panel.webview.postMessage({
                type: 'log',
                content: `Found ${devices.length} device(s):`
            });
            
            devices.forEach(device => {
                panel.webview.postMessage({
                    type: 'log',
                    content: `  - ${device.id} (${device.status})`
                });
            });
        });
    });
}

/**
 * Get the full path to Android SDK tools
 * @returns {Object} Paths to ADB and emulator
 */
function getAndroidSdkPaths() {
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    return {
        adb: `${homeDir}/Library/Android/sdk/platform-tools/adb`,
        emulator: `${homeDir}/Library/Android/sdk/emulator/emulator`
    };
}

/**
 * Check if Android SDK tools are available
 * @param {vscode.WebviewPanel} panel
 * @returns {Promise<boolean>}
 */
function checkAndroidSdkTools(panel) {
    return new Promise((resolve) => {
        const paths = getAndroidSdkPaths();
        
        // Check if ADB exists
        exec(`ls -la ${paths.adb}`, (adbError) => {
            if (adbError) {
                panel.webview.postMessage({
                    type: 'log',
                    content: `Android Debug Bridge (ADB) not found at ${paths.adb}`
                });
                panel.webview.postMessage({
                    type: 'log',
                    content: 'You can install Android SDK through Android Studio: https://developer.android.com/studio'
                });
                resolve(false);
                return;
            }
            
            // Check if emulator exists
            exec(`ls -la ${paths.emulator}`, (emulatorError) => {
                if (emulatorError) {
                    panel.webview.postMessage({
                        type: 'log',
                        content: `Android emulator not found at ${paths.emulator}`
                    });
                    panel.webview.postMessage({
                        type: 'log',
                        content: 'You can install the emulator through Android Studio SDK Manager.'
                    });
                    resolve(false);
                } else {
                    panel.webview.postMessage({
                        type: 'log',
                        content: 'Android SDK tools found successfully.'
                    });
                    resolve(true);
                }
            });
        });
    });
}

/**
 * Start an Android emulator
 * @param {vscode.WebviewPanel} panel
 */
function startEmulator(panel) {
    panel.webview.postMessage({
        type: 'log',
        content: 'Checking Android SDK tools...'
    });
    
    // First check if Android SDK tools are available
    checkAndroidSdkTools(panel).then(toolsAvailable => {
        if (!toolsAvailable) {
            return;
        }
        
        panel.webview.postMessage({
            type: 'log',
            content: 'Checking available emulators...'
        });
        
        // List available emulators
        exec('emulator -list-avds', (error, stdout) => {
            if (error) {
                console.error('Error listing emulators:', error);
                panel.webview.postMessage({
                    type: 'log',
                    content: `Error listing emulators: ${error.message}`
                });
                return;
            }
            
            const avds = stdout.trim().split('\n').filter(line => line.trim().length > 0);
            
            if (avds.length === 0) {
                panel.webview.postMessage({
                    type: 'log',
                    content: 'No emulators found. Please create an emulator using Android Studio first.'
                });
                panel.webview.postMessage({
                    type: 'log',
                    content: 'In Android Studio, go to Tools > Device Manager > Create Device'
                });
                return;
            }
            
            // Use the first available emulator
            const avdName = avds[0];
            panel.webview.postMessage({
                type: 'log',
                content: `Found emulator: ${avdName}. Attempting to start...`
            });
            
            // Start the emulator with visible window and output using full path
            const paths = getAndroidSdkPaths();
            const emulatorCommand = `${paths.emulator} -avd ${avdName}`;
            panel.webview.postMessage({
                type: 'log',
                content: `Running command: ${emulatorCommand}`
            });
            
            // Use exec instead of spawn to get more detailed output
            const emulatorProcess = exec(emulatorCommand, (err, stdout, stderr) => {
                if (err) {
                    console.error('Error starting emulator:', err);
                    panel.webview.postMessage({
                        type: 'log',
                        content: `Error starting emulator: ${err.message}`
                    });
                }
                
                if (stdout) {
                    console.log('Emulator stdout:', stdout);
                    panel.webview.postMessage({
                        type: 'log',
                        content: `Emulator output: ${stdout}`
                    });
                }
                
                if (stderr) {
                    console.error('Emulator stderr:', stderr);
                    panel.webview.postMessage({
                        type: 'log',
                        content: `Emulator error output: ${stderr}`
                    });
                }
            });
            
            // Set a timer to check if devices are available after a delay
            setTimeout(() => {
                panel.webview.postMessage({
                    type: 'log',
                    content: 'Checking if emulator is connected...' 
                });
                
                exec('adb devices', (adbErr, adbStdout) => {
                    if (adbErr) {
                        panel.webview.postMessage({
                            type: 'log',
                            content: `Error checking devices: ${adbErr.message}`
                        });
                        return;
                    }
                    
                    // Parse the device list
                    const lines = adbStdout.trim().split('\n');
                    // Remove the first line which is the header
                    lines.shift();
                    
                    // Extract device IDs
                    const devices = lines
                        .filter(line => line.trim().length > 0)
                        .map(line => {
                            const parts = line.trim().split('\t');
                            return {
                                id: parts[0],
                                status: parts[1] || 'unknown'
                            };
                        });
                    if (devices.length > 0) {
                        panel.webview.postMessage({
                            type: 'log',
                            content: `Emulator connected successfully! Found device: ${devices[0]}`
                        });
                    } else {
                        panel.webview.postMessage({
                            type: 'log',
                            content: 'Emulator is starting but not yet connected. Please wait a bit longer.'
                        });
                        
                        // Try to start the emulator in a different way as a fallback
                        panel.webview.postMessage({
                            type: 'log',
                            content: 'Trying alternative method to start emulator...'
                        });
                        
                        // Use a more direct approach with visible window and full path
                        const paths = getAndroidSdkPaths();
                        const alternativeCommand = `open -a Terminal.app && ${paths.emulator} -avd ${avdName}`;
                        exec(alternativeCommand, (altErr) => {
                            if (altErr) {
                                panel.webview.postMessage({
                                    type: 'log',
                                    content: `Alternative method failed: ${altErr.message}`
                                });
                                panel.webview.postMessage({
                                    type: 'log',
                                    content: 'Please try starting the emulator manually by running this command in Terminal:'
                                });
                                panel.webview.postMessage({
                                    type: 'log',
                                    content: `${paths.emulator} -avd ${avdName}`
                                });
                            } else {
                                panel.webview.postMessage({
                                    type: 'log',
                                    content: 'Alternative method initiated. Check if Terminal opened with emulator.'
                                });
                            }
                        });
                    }
                });
            }, 10000); // Check after 10 seconds
            
            panel.webview.postMessage({
                type: 'log',
                content: `Emulator ${avdName} is starting. This may take a minute or two.`
            });
            panel.webview.postMessage({
                type: 'log',
                content: `If the emulator doesn't appear, try starting it manually by running '${paths.emulator} -avd ${avdName}' in Terminal.`
            });
        });
    });
}

/**
 * Check for connected devices
 * @param {vscode.WebviewPanel} panel
 * @returns {Promise<string[]>} List of device IDs
 */
function checkConnectedDevices(panel) {
    return new Promise((resolve, reject) => {
        panel.webview.postMessage({
            type: 'log',
            content: 'Checking for connected devices...'
        });
        
        const paths = getAndroidSdkPaths();
        exec(`${paths.adb} devices`, (error, stdout) => {
            if (error) {
                console.error('Error checking devices:', error);
                panel.webview.postMessage({
                    type: 'log',
                    content: `Error checking devices: ${error.message}`
                });
                reject(error);
                return;
            }
            
            // Parse the device list
            const lines = stdout.trim().split('\n');
            // Remove the first line which is the header
            lines.shift();
            
            // Extract device IDs
            const devices = lines
                .filter(line => line.trim().length > 0)
                .map(line => {
                    const parts = line.trim().split('\t');
                    return {
                        id: parts[0],
                        status: parts[1] || 'unknown'
                    };
                });
            
            if (devices.length === 0) {
                const noDeviceError = new Error('No devices/emulators found');
                panel.webview.postMessage({
                    type: 'log',
                    content: 'No devices or emulators found. Use the "Device Management" section to connect a device.'
                });
                reject(noDeviceError);
                return;
            }
            
            // Log the found devices
            const deviceList = devices.map(d => `${d.id} (${d.status})`).join(', ');
            console.log(`Found devices: ${deviceList}`);
            panel.webview.postMessage({
                type: 'log',
                content: `Found devices: ${deviceList}`
            });
            
            // Return the list of device IDs
            resolve(devices.map(d => d.id));
        });
    });
}

/**
 * Start the streaming process
 * @param {vscode.WebviewPanel} panel
 */
function startStreaming(panel) {
    panel.webview.postMessage({
        type: 'log',
        content: 'Starting streaming process...'
    });
    
    // First check if there's already a running emulator
    const paths = getAndroidSdkPaths();
    exec(`${paths.adb} devices`, (error, stdout) => {
        if (error) {
            panel.webview.postMessage({
                type: 'log',
                content: `Error checking devices: ${error.message}`
            });
            return;
        }
        
        console.log('ADB devices output before streaming:', stdout);
        
        // Parse the devices from the output
        const devices = [];
        const lines = stdout.trim().split('\n');
        
        // Skip the first line which is the header
        for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line) {
                const [deviceId] = line.split('\t');
                devices.push(deviceId);
            }
        }
        
        if (devices.length === 0) {
            panel.webview.postMessage({
                type: 'log',
                content: 'No devices found. Please connect a device or start an emulator.'
            });
            return;
        }
        
        panel.webview.postMessage({
            type: 'log',
            content: `Found device: ${devices[0]}`
        });
        
        // Execute ADB forward command
        const port = 8000; // Use a fixed port for now
        
        exec(`${paths.adb} -s ${devices[0]} forward tcp:${port} tcp:${port}`, (error, stdout, stderr) => {
            if (error) {
                panel.webview.postMessage({
                    type: 'log',
                    content: `Error setting up ADB forward: ${error.message}`
                });
                return;
            }
            
            panel.webview.postMessage({
                type: 'log',
                content: `ADB forward set up successfully on port ${port}`
            });
            
            panel.webview.postMessage({
                type: 'log',
                content: 'Streaming setup completed successfully!'
            });
        });
    });
}

/**
 * Restart ADB daemon
 * @param {vscode.WebviewPanel} panel
 * @returns {Promise<void>}
 */
function restartAdbDaemon(panel) {
    return new Promise((resolve, reject) => {
        panel.webview.postMessage({
            type: 'log',
            content: 'Restarting ADB daemon...'
        });
        
        // Kill the ADB server
        const paths = getAndroidSdkPaths();
        exec(`${paths.adb} kill-server`, (killError) => {
            if (killError) {
                console.error('Error killing ADB server:', killError);
                panel.webview.postMessage({
                    type: 'log',
                    content: `Error killing ADB server: ${killError.message}`
                });
            }
            
            // Give it a moment
            setTimeout(() => {
                // Start the ADB server
                exec(`${paths.adb} start-server`, (startError) => {
                    if (startError) {
                        console.error('Error starting ADB server:', startError);
                        panel.webview.postMessage({
                            type: 'log',
                            content: `Error starting ADB server: ${startError.message}`
                        });
                        reject(startError);
                    } else {
                        console.log('ADB server restarted successfully');
                        panel.webview.postMessage({
                            type: 'log',
                            content: 'ADB server restarted successfully'
                        });
                        // Give it a moment to fully initialize
                        setTimeout(resolve, 1000);
                    }
                });
            }, 1000);
        });
    });
}

/**
 * Setup ADB forward
 * @param {vscode.WebviewPanel} panel
 * @param {string} deviceId Optional device ID to target
 * @returns {Promise<void>}
 **/
function setupAdbForward(panel, deviceId) {
    return new Promise((resolve, reject) => {
        panel.webview.postMessage({
            type: 'log',
            content: 'Setting up ADB forward...'
        });
        
        // Double-check that the port is free before trying to use it
        checkPortInUse(panel, 5555)
            .then(inUse => {
                if (inUse) {
                    // If it's still in use, try to free it one more time
                    return freePort(panel, 5555);
                }
            })
            .then(() => {
                // Construct the command, optionally targeting a specific device
                const paths = getAndroidSdkPaths();
                let command = paths.adb;
                if (deviceId) {
                    command += ` -s ${deviceId}`;
                }
                command += ' forward tcp:5555 tcp:5555';
                
                console.log(`Executing: ${command}`);
                panel.webview.postMessage({
                    type: 'log',
                    content: `Setting up forward for ${deviceId || 'default device'}...`
                });
                
                // Now try to set up the ADB forward
                exec(command, (error) => {
                    if (error) {
                        console.error('Error setting up adb forward:', error);
                        reject(error);
                    } else {
                        console.log('ADB forward setup successful');
                        resolve();
                    }
                });
            })
            .catch(error => {
                console.error('Error preparing port for ADB forward:', error);
                reject(error);
            });
    });
}

/**
 * Start ADB server
 * @param {vscode.WebviewPanel} panel
 */
function startAdbServer(panel) {
    panel.webview.postMessage({
        type: 'log',
        content: 'Starting ADB server...'
    });
    
    try {
        adbProcess = spawn('adb', [
            'shell', 
            'gst-launch-1.0', 
            '-v', 
            'autovideosrc', 
            '!', 
            'video/x-raw,width=640,height=480', 
            '!', 
            'videoconvert', 
            '!', 
            'x264enc', 
            '!', 
            'rtph264pay', 
            '!', 
            'udpsink', 
            'host=127.0.0.1', 
            'port=5555'
        ]);

        adbProcess.stdout.on('data', (data) => {
            console.log(`ADB stdout: ${data}`);
            if (currentPanel) {
                currentPanel.webview.postMessage({
                    type: 'log',
                    content: `ADB: ${data}`
                });
            }
        });

        adbProcess.stderr.on('data', (data) => {
            console.error(`ADB stderr: ${data}`);
            if (currentPanel) {
                currentPanel.webview.postMessage({
                    type: 'log',
                    content: `ADB error: ${data}`
                });
            }
        });
        
        adbProcess.on('error', (error) => {
            console.error('Failed to start ADB process:', error);
            if (currentPanel) {
                currentPanel.webview.postMessage({
                    type: 'log',
                    content: `Failed to start ADB: ${error.message}`
                });
            }
        });
        
        adbProcess.on('close', (code) => {
            console.log(`ADB process exited with code ${code}`);
            if (currentPanel) {
                currentPanel.webview.postMessage({
                    type: 'log',
                    content: `ADB process exited with code ${code}`
                });
            }
        });
    } catch (error) {
        console.error('Error in startAdbServer:', error);
        if (currentPanel) {
            currentPanel.webview.postMessage({
                type: 'log',
                content: `Error starting ADB server: ${error.message}`
            });
        }
    }
}

/**
 * Start GStreamer
 * @param {vscode.WebviewPanel} panel
 */
function startGstreamer(panel) {
    panel.webview.postMessage({
        type: 'log',
        content: 'Starting GStreamer...'
    });
    
    try {
        gstProcess = spawn('gst-launch-1.0', [
            'udpsrc', 
            'port=5555',
            '!', 
            'application/x-rtp,media=video,clock-rate=90000,encoding-name=H264,payload=96',
            '!', 
            'rtph264depay',
            '!', 
            'decodebin',
            '!', 
            'videoconvert',
            '!', 
            'autovideosink'
        ]);

        gstProcess.stdout.on('data', (data) => {
            console.log(`GStreamer stdout: ${data}`);
            if (currentPanel) {
                currentPanel.webview.postMessage({
                    type: 'log',
                    content: `GStreamer: ${data}`
                });
            }
        });

        gstProcess.stderr.on('data', (data) => {
            console.error(`GStreamer stderr: ${data}`);
            if (currentPanel) {
                currentPanel.webview.postMessage({
                    type: 'log',
                    content: `GStreamer error: ${data}`
                });
            }
        });
        
        gstProcess.on('error', (error) => {
            console.error('Failed to start GStreamer process:', error);
            if (currentPanel) {
                currentPanel.webview.postMessage({
                    type: 'log',
                    content: `Failed to start GStreamer: ${error.message}`
                });
            }
        });
        
        gstProcess.on('close', (code) => {
            console.log(`GStreamer process exited with code ${code}`);
            if (currentPanel) {
                currentPanel.webview.postMessage({
                    type: 'log',
                    content: `GStreamer process exited with code ${code}`
                });
            }
        });
    } catch (error) {
        console.error('Error in startGstreamer:', error);
        if (currentPanel) {
            currentPanel.webview.postMessage({
                type: 'log',
                content: `Error starting GStreamer: ${error.message}`
            });
        }
    }
}

/**
 * Clean up ADB forward
 * @param {vscode.WebviewPanel} panel
 * @returns {Promise<void>}
 */
function cleanupAdbForward(panel) {
    return new Promise((resolve) => {
        panel.webview.postMessage({
            type: 'log',
            content: 'Cleaning up any existing ADB forwards...'
        });
        
        // First try to remove any ADB forwards
        exec('adb forward --remove tcp:5555', () => {
            // Now check if the port is still in use by any process
            checkPortInUse(panel, 5555)
                .then(inUse => {
                    if (inUse) {
                        panel.webview.postMessage({
                            type: 'log',
                            content: 'Port 5555 is still in use by another process. Attempting to free it...'
                        });
                        
                        // On macOS, we can use lsof to find and kill the process using the port
                        return freePort(panel, 5555);
                    }
                })
                .then(() => {
                    resolve();
                })
                .catch(error => {
                    console.error('Error during port cleanup:', error);
                    // We still resolve even if there's an error, as this is just cleanup
                    resolve();
                });
        });
    });
}

/**
 * Check if a port is in use
 * @param {vscode.WebviewPanel} panel
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function checkPortInUse(panel, port) {
    return new Promise((resolve) => {
        // On macOS, we can use lsof to check if a port is in use
        exec(`lsof -i :${port}`, (error, stdout) => {
            if (error) {
                // If there's an error, it likely means no process is using the port
                console.log(`Port ${port} is not in use`);
                resolve(false);
            } else {
                // If we get output, a process is using the port
                console.log(`Port ${port} is in use:\n${stdout}`);
                if (panel) {
                    panel.webview.postMessage({
                        type: 'log',
                        content: `Port ${port} is currently in use by another process`
                    });
                }
                resolve(true);
            }
        });
    });
}

/**
 * Free up a port by killing the process using it
 * @param {vscode.WebviewPanel} panel
 * @param {number} port
 * @returns {Promise<void>}
 */
function freePort(panel, port) {
    return new Promise((resolve, reject) => {
        // First get the PID of the process using the port
        exec(`lsof -t -i :${port}`, (error, stdout) => {
            if (error) {
                console.log(`No process found using port ${port}`);
                resolve();
                return;
            }
            
            // Split by newlines to handle multiple PIDs
            const pids = stdout.trim().split('\n');
            if (!pids.length) {
                console.log(`No process ID found for port ${port}`);
                resolve();
                return;
            }
            
            console.log(`Found processes ${pids.join(', ')} using port ${port}, attempting to kill them`);
            if (panel) {
                panel.webview.postMessage({
                    type: 'log',
                    content: `Attempting to free port ${port} (process IDs: ${pids.join(', ')})...`
                });
            }
            
            // Kill each process one by one
            let killedCount = 0;
            let errorCount = 0;
            
            pids.forEach(pid => {
                exec(`kill -9 ${pid.trim()}`, (killError) => {
                    if (killError) {
                        console.error(`Error killing process ${pid}:`, killError);
                        errorCount++;
                    } else {
                        console.log(`Successfully killed process ${pid}`);
                        killedCount++;
                    }
                    
                    // When all processes have been handled
                    if (killedCount + errorCount === pids.length) {
                        if (killedCount > 0) {
                            if (panel) {
                                panel.webview.postMessage({
                                    type: 'log',
                                    content: `Successfully freed port ${port} (killed ${killedCount}/${pids.length} processes)`
                                });
                            }
                            // Give the system a moment to release the port
                            setTimeout(resolve, 1000);
                        } else {
                            if (panel) {
                                panel.webview.postMessage({
                                    type: 'log',
                                    content: `Failed to kill any processes using port ${port}`
                                });
                            }
                            reject(new Error('Failed to kill any processes'));
                        }
                    }
                });
            });
        });
    });
}

/**
 * Stop all processes
 */
function stopAllProcesses() {
    if (adbProcess) {
        adbProcess.kill();
        adbProcess = undefined;
        console.log('ADB process terminated');
    }
    
    if (gstProcess) {
        gstProcess.kill();
        gstProcess = undefined;
        console.log('GStreamer process terminated');
    }
    
    // Also clean up any port forwards
    exec('adb forward --remove tcp:5555', (error) => {
        if (error) {
            console.log('Error removing ADB forward during cleanup:', error);
        } else {
            console.log('Successfully removed ADB forward during cleanup');
        }
    });
}

/**
 * Deactivate the extension
 */
function deactivate() {
    // Kill any running processes
    if (adbProcess) {
        adbProcess.kill();
        adbProcess = undefined;
    }
    if (gstProcess) {
        gstProcess.kill();
        gstProcess = undefined;
    }
    console.log('Mobile Automation extension deactivated');
}

module.exports = {
    activate,
    deactivate
};
