const vscode = require('vscode');
const { exec, spawn } = require('child_process');
const https = require('https');

function activate(context) {
	let welcomeNotif = vscode.commands.registerCommand('app-testing-automation.helloWorld', function () {
		vscode.window.showInformationMessage('Hello World from app-testing-automation!');
	});
		
	context.subscriptions.push(welcomeNotif);

    let disposable = vscode.commands.registerCommand('extension.openMobilePanel', function () {
        const panel = vscode.window.createWebviewPanel(
            'mobileAutomation',
            'Mobile Automation',
            vscode.ViewColumn.One,
            { 
                enableScripts: true,
                localResourceRoots: [vscode.Uri.file(context.extensionPath)],
                retainContextWhenHidden: true
            }
        );

        panel.webview.html = getWebviewContent();

		// Check if we should start Android emulator view
		checkDevicesBeforeStartingScrcpy(panel);

		panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'runTestScript':
                        if (message.script) {
                            executeAdbCommands(message.script, panel);
                        } else {
                            vscode.window.showErrorMessage('No script provided');
                        }
                        break;
                    case 'listConnectedDevices':
                        listConnectedDevices(panel);
                        break;
                    case 'startEmulator':
                        startAndroidEmulator(panel);
                        break;
                    case 'loadAppetizeEmulator':
                        loadAppetizeEmulator(panel, message.deviceType);
                        break;
                }
            },
            undefined,
            context.subscriptions
        );
	
    });

    context.subscriptions.push(disposable);
}

function getWebviewContent() {
    return `<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src https: data:; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; frame-src https://appetize.io https://*.appetize.io;">
		<title>Mobile Automation</title>
		<style>
			body { display: flex; height: 100vh; margin: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; }
			.left-panel { display: flex; flex-direction: column; border-right: 1px solid #ccc; padding: 10px; width: 50%; }
			.right-panel { display: flex; flex-direction: column; width: 50%; }
			.panel { flex: 1; border-bottom: 1px solid #ccc; padding: 10px; resize: vertical; overflow: auto; min-height: 100px }
			.panel:last-child { border-right: none; }
			button { margin: 5px; padding: 6px 12px; background-color: #0078D4; color: white; border: none; border-radius: 2px; cursor: pointer; }
			button:hover { background-color: #106EBE; }
			.emulator-container { display: flex; flex-direction: column; height: 100%; }
			.emulator-controls { display: flex; margin-bottom: 10px; }
			.emulator-frame { flex: 1; border: none; width: 100%; height: 100%; min-height: 400px; }
			.emulator-placeholder { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: #666; }
			.platform-toggle { display: flex; margin-bottom: 10px; }
			.platform-btn { background-color: #f0f0f0; color: #333; }
			.platform-btn.active { background-color: #0078D4; color: white; }
			.device-select { padding: 5px; margin: 5px; }
		</style>
	</head>
	<body>
		<div class="left-panel">
			<div class="panel">	
				<h3>Test Script Editor</h3>
				<textarea id="script" rows="18" cols="70"></textarea>
				<button onclick="runTest()">Run</button>
			</div>
			<div class="panel">
				<h3>Logs</h3>
				<pre id="logs">Logs will appear here...</pre>
			</div>
		</div>
		<div class="right-panel">
			<div class="panel">
				<h3>Emulator</h3>
				<div class="platform-toggle">
					<button id="android-btn" class="platform-btn" onclick="switchPlatform('android')">Android</button>
					<button id="ios-btn" class="platform-btn active" onclick="switchPlatform('ios')">iOS (Appetize)</button>
				</div>
				<div id="android-emulator" class="emulator-container" style="display: none;">
					<div class="emulator-controls">
						<button onclick="listDevices()">List Connected Devices</button>
						<button onclick="startAndroidEmulator()">Start Emulator</button>
					</div>
					<pre id="android-output">Android emulator output will be displayed here...</pre>
				</div>
				<div id="ios-emulator" class="emulator-container" style="display: flex;">
					<div class="emulator-controls">
						<select id="ios-device" class="device-select">
							<option value="iphone15pro">iPhone 15 Pro</option>
							<option value="iphone14">iPhone 14</option>
							<option value="iphone13mini">iPhone 13 Mini</option>
							<option value="ipadpro">iPad Pro</option>
						</select>
						<button onclick="loadAppetizeEmulator()">Load iOS Emulator</button>
					</div>
					<div id="appetize-container" class="emulator-placeholder" style="height: 500px;">
						<p>Loading iOS emulator...</p>
					</div>
				</div>
			</div>
		</div>
		<script>
			const vscode = acquireVsCodeApi();
			
			// Auto-load iOS emulator on page load
			window.addEventListener('DOMContentLoaded', function() {
				console.log('DOM loaded, loading iOS emulator');
				// Default to iOS platform
				switchPlatform('ios');
				// Auto-load the iOS emulator
				loadAppetizeEmulator();
			});
			
			function runTest() {
				const scriptContent = document.getElementById('script').value;
				vscode.postMessage({ 
					command: 'runTestScript',
					script: scriptContent 
				});
			}

			function switchPlatform(platform) {
				console.log('Switching to platform:', platform);
				if (platform === 'android') {
					document.getElementById('android-emulator').style.display = 'flex';
					document.getElementById('ios-emulator').style.display = 'none';
					document.getElementById('android-btn').classList.add('active');
					document.getElementById('ios-btn').classList.remove('active');
				} else {
					document.getElementById('android-emulator').style.display = 'none';
					document.getElementById('ios-emulator').style.display = 'flex';
					document.getElementById('android-btn').classList.remove('active');
					document.getElementById('ios-btn').classList.add('active');
				}
			}

			function listDevices() {
				vscode.postMessage({ command: 'listConnectedDevices' });
			}

			function startAndroidEmulator() {
				vscode.postMessage({ command: 'startEmulator' });
			}

			function loadAppetizeEmulator() {
				console.log('Requesting iOS emulator from extension');
				const deviceType = document.getElementById('ios-device').value;
				vscode.postMessage({ 
					command: 'loadAppetizeEmulator',
					deviceType: deviceType 
				});
			}

			window.addEventListener('message', event => {
				const message = event.data;
				console.log('Received message:', message);
				
				if (message.type === 'log') {
					document.getElementById('logs').textContent += message.content + '\\n';
				}

				if (message.type === 'emulator') {
                    console.log('Android emulator update');
					document.getElementById('android-output').textContent += message.content + '\\n';
                }

				if (message.type === 'appetize-emulator') {
					console.log('Creating Appetize iframe with URL:', message.url);
					const container = document.getElementById('appetize-container');
					// Clear the container
					container.innerHTML = '';
					
					// Create the iframe
					const iframe = document.createElement('iframe');
					iframe.src = message.url;
					iframe.className = 'emulator-frame';
					iframe.allow = 'camera; microphone; autoplay; clipboard-write';
					iframe.style.width = '100%';
					iframe.style.height = '500px';
					iframe.style.border = 'none';
					
					// Add the iframe to the container
					container.appendChild(iframe);
					console.log('Appetize iframe added to DOM');
				}
				
				if (message.type === 'switch-platform') {
					switchPlatform(message.platform);
				}
        	});
			
			// Immediately load the iOS emulator when the page loads
			window.onload = function() {
				console.log('Window loaded, auto-loading iOS emulator');
				loadAppetizeEmulator();
			};
		</script>
	</body>
	</html>`;
}

function executeAdbCommands(script, panel) {
    const commands = script.split('\n');
    commands.forEach(command => {
        exec(`adb shell ${command}`, (error, stdout, stderr) => {
            if (error) {
                vscode.window.showErrorMessage(`ADB Error: ${stderr}`);
				panel.webview.postMessage({ type: 'log', content: `\n${new Date().toISOString()}: Command '${command}' Failed with error ${stderr}` });
            } else {
				console.log(' --- STD OUT ---', { stdout });
                vscode.window.showInformationMessage(`ADB Output: ${stdout}`);
				panel.webview.postMessage({ type: 'log', content: `\n${new Date().toISOString()}: Command '${command}' ran successfully.` });
				panel.webview.postMessage({ type: 'log', content: `Output for Command '${command}': ${stdout}` });
            }
        });
    });
}

function checkDevicesBeforeStartingScrcpy(panel) {
    // Check if any Android devices are connected before starting scrcpy
    exec('adb devices', (error, stdout, stderr) => {
        if (error) {
            console.error('ADB Error:', stderr);
            panel.webview.postMessage({ type: 'log', content: `\n${new Date().toISOString()}: ADB Error: ${stderr}` });
            // Load iOS emulator by default since no Android devices are available
            loadAppetizeEmulator(panel, 'iphone15pro');
            return;
        }

        const devices = stdout.trim().split('\n').slice(1).filter(line => line.trim() !== '');
        if (devices.length === 0) {
            console.log('No Android devices connected, loading iOS emulator by default');
            panel.webview.postMessage({ type: 'log', content: `\n${new Date().toISOString()}: No Android devices connected, loading iOS emulator by default` });
            // Load iOS emulator by default since no Android devices are available
            loadAppetizeEmulator(panel, 'iphone15pro');
            
            // Send message to switch UI to iOS mode
            panel.webview.postMessage({ type: 'switch-platform', platform: 'ios' });
        } else {
            console.log('Android device connected, starting scrcpy');
            startEmulatorView(panel);
        }
    });
}

function startEmulatorView(panel) {
    const scrcpyProcess = spawn('scrcpy', ['--stay-awake', '--no-audio']);

	console.log('--- Scrcpy Object ---',  { scrcpyProcess });
    scrcpyProcess.stderr.on('data', (data) => {
        console.error("Scrcpy Error Message:", data.toString());
        
        // If scrcpy fails to connect, switch to iOS emulator
        if (data.toString().includes('Could not find any ADB device') || 
            data.toString().includes('Server connection failed')) {
            panel.webview.postMessage({ type: 'log', content: `\n${new Date().toISOString()}: Scrcpy failed to connect to Android device, switching to iOS emulator` });
            loadAppetizeEmulator(panel, 'iphone15pro');
            
            // Send message to switch UI to iOS mode
            panel.webview.postMessage({ type: 'switch-platform', platform: 'ios' });
        }
    });

	panel.webview.postMessage({ type: 'emulator', content: '\nEmulator is running' });
	
	scrcpyProcess.stdout.on('data', (data) => {
        console.log("Scrcpy Output Message:", data.toString());
		panel.webview.postMessage({ type: 'emulator', content: `\n${new Date().toISOString()}: Emulator Output ${data.toString()}` });
    });
}

// List connected Android devices using ADB
function listConnectedDevices(panel) {
    exec('adb devices', (error, stdout, stderr) => {
        if (error) {
            vscode.window.showErrorMessage(`ADB Error: ${stderr}`);
            panel.webview.postMessage({ type: 'log', content: `\n${new Date().toISOString()}: Failed to list devices: ${stderr}` });
        } else {
            console.log('Connected devices:', stdout);
            panel.webview.postMessage({ type: 'log', content: `\n${new Date().toISOString()}: Connected devices:\n${stdout}` });
            panel.webview.postMessage({ type: 'emulator', content: `\n${new Date().toISOString()}: Connected devices:\n${stdout}` });
        }
    });
}

// Start an Android emulator
function startAndroidEmulator(panel) {
    // First check available emulators
    exec(`${process.env.HOME}/Library/Android/sdk/emulator/emulator -list-avds`, (error, stdout, stderr) => {
        if (error) {
            vscode.window.showErrorMessage(`Emulator Error: ${stderr}`);
            panel.webview.postMessage({ type: 'log', content: `\n${new Date().toISOString()}: Failed to list emulators: ${stderr}` });
            return;
        }
        
        const availableEmulators = stdout.trim().split('\n');
        if (availableEmulators.length === 0) {
            vscode.window.showErrorMessage('No Android emulators found');
            panel.webview.postMessage({ type: 'log', content: `\n${new Date().toISOString()}: No Android emulators found` });
            return;
        }
        
        // Use the first available emulator
        const emulatorName = availableEmulators[0];
        panel.webview.postMessage({ type: 'log', content: `\n${new Date().toISOString()}: Starting emulator: ${emulatorName}` });
        
        // Start the emulator
        const emulatorProcess = spawn(`${process.env.HOME}/Library/Android/sdk/emulator/emulator`, ['-avd', emulatorName, '-read-only']);
        
        emulatorProcess.stderr.on('data', (data) => {
            console.error("Emulator Error:", data.toString());
            panel.webview.postMessage({ type: 'log', content: `\n${new Date().toISOString()}: Emulator Error: ${data.toString()}` });
        });
        
        emulatorProcess.stdout.on('data', (data) => {
            console.log("Emulator Output:", data.toString());
            panel.webview.postMessage({ type: 'log', content: `\n${new Date().toISOString()}: Emulator Output: ${data.toString()}` });
            panel.webview.postMessage({ type: 'emulator', content: `\n${new Date().toISOString()}: Emulator Output: ${data.toString()}` });
        });
    });
}

// Load an Appetize.io iOS emulator
function loadAppetizeEmulator(panel, deviceType = 'iphone15pro') {
    // You would normally use your own Appetize API key here
    // For this example, we'll use a public demo app URL with a real iOS app
    const appetizePublicKey = 'q7v3rx33kpfy10w0qpak8kgzxr';
    const deviceMap = {
        'iphone15pro': 'iphone15pro',
        'iphone14': 'iphone14',
        'iphone13mini': 'iphone13mini',
        'ipadpro': 'ipadpro'
    };
    
    const device = deviceMap[deviceType] || 'iphone15pro';
    // Using a real demo app that should work reliably
    const appetizeUrl = `https://appetize.io/embed/${appetizePublicKey}?device=${device}&scale=75&orientation=portrait&osVersion=17.0&autoplay=true`;
    
    console.log(`Loading Appetize iOS emulator for device: ${device} with URL: ${appetizeUrl}`);
    
    // First log that we're loading
    panel.webview.postMessage({ 
        type: 'log', 
        content: `\n${new Date().toISOString()}: Loading iOS emulator (${device}) via Appetize.io...`
    });
    
    // Send the appetize emulator message
    panel.webview.postMessage({ 
        type: 'appetize-emulator', 
        url: appetizeUrl,
        device: device
    });
    
    // Also send message to switch UI to iOS mode
    panel.webview.postMessage({ 
        type: 'switch-platform', 
        platform: 'ios'
    });
    
    // Log that we've sent the message
    panel.webview.postMessage({ 
        type: 'log', 
        content: `\n${new Date().toISOString()}: Appetize emulator iframe created for ${device}`
    });
}

function deactivate() {}

module.exports = { activate, deactivate };
