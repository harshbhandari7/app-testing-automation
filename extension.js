const vscode = require('vscode');
const { exec } = require('child_process');

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
            { enableScripts: true }
        );

        panel.webview.html = getWebviewContent();

		panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'runTestScript':
                        if (message.script) {
                            executeAdbCommands(message.script);
                        } else {
                            vscode.window.showErrorMessage('No script provided');
                        }
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
		<title>Mobile Automation</title>
		<style>
			body { display: flex; height: 100vh; margin: 0; }
			.left-panel { display: flex; flex-direction: column; border-right: 1px solid #ccc; padding: 10px; }
			.right-panel { display: flex; flex-direction: column; }
			.panel { flex: 1; border-bottom: 1px solid #ccc; padding: 10px; resize: vertical; overflow: auto; min-height: 100px }
			.panel:last-child { border-right: none; }
			button { margin-top: 10px; }
		</style>
	</head>
	<body>
		<div class="left-panel">
			<h3>Test Script Editor</h3>
			<textarea id="script" rows="40" cols="60"></textarea>
			<button onclick="runTest()">Run</button>
		</div>
		<div class="right-panel">
			<div class="panel">
				<h3>Emulator</h3>
				<p>Emulator output will be displayed here.</p>
			</div>
			<div class="panel">
				<h3>Logs</h3>
				<pre id="logs">Logs will appear here...</pre>
			</div>
		</div>
		<script>
			const vscode = acquireVsCodeApi();
			function runTest() {
				const scriptContent = document.getElementById('script').value;
				vscode.postMessage({ 
					command: 'runTestScript',
					script: scriptContent 
				});
			}

			window.addEventListener('message', event => {
				const message = event.data;
				if (message.type === 'log') {
					document.getElementById('logs').textContent += message.content + '\\n';
				}
        	});
		</script>
		<pre id="logs"></pre>	
	</body>
	</html>`;
}

function executeAdbCommands(script) {
    const commands = script.split('\n');
    commands.forEach(command => {
        exec(`adb shell ${command}`, (error, stdout, stderr) => {
            if (error) {
                vscode.window.showErrorMessage(`ADB Error: ${stderr}`);
            } else {
                vscode.window.showInformationMessage(`ADB Output: ${stdout}`);
            }
        });
    });
}

function deactivate() {}

module.exports = { activate, deactivate };
