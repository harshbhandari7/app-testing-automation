const vscode = require('vscode');

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
			function runTest() {
				document.getElementById('logs').innerText = "Running test...";
				// Future step: Execute ADB command here
			}
		</script>
	</body>
	</html>`;
}

function deactivate() {}

module.exports = { activate, deactivate };
