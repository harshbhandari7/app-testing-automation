const vscode = require('vscode');
const { exec, spawn } = require('child_process');
const { createServer } = require('http');
const { Server: WebSocketServer } = require('ws');


function activate(context) {
    let welcomeNotif = vscode.commands.registerCommand('app-testing-automation.helloWorld', function () {
        vscode.window.showInformationMessage('Hello World from app-testing-automation!');
    });

    context.subscriptions.push(welcomeNotif);


    // Create WebRTC signaling server
    const server = createServer();
    const wss = new WebSocketServer({ server });
    let gstProcess = null;
    let adbProcess = null;
    wss.on('connection', (ws) => {
        console.log('WebRTC signaling connected');

        // When a new WebSocket client connects, start the GStreamer process
        if (!gstProcess) {
            startGStreamerWebRTC(ws);
        }

        ws.on('message', (message) => {
            try {
                const strMessage = message.toString('utf8');
                const parsedMessage = JSON.parse(strMessage);
                console.log('Received WebRTC message type:', parsedMessage.type);

                // Forward ICE candidates and SDP answers to GStreamer via stdin
                if (gstProcess && (parsedMessage.sdp || parsedMessage.candidate)) {
                    gstProcess.stdin.write(JSON.stringify(parsedMessage) + '\n');
                }
            } catch (e) {
                console.error('Error parsing WebSocket message:', e);
            }
        });

        ws.on('close', () => {
            console.log('WebRTC signaling disconnected');
            if (gstProcess) {
                gstProcess.kill();
                gstProcess = null;
            }
            if (adbProcess) {
                adbProcess.kill();
                adbProcess = null;
            }
        });
    });
    server.listen(8080, () => console.log('WebRTC signaling server running on port 8080'));
    function startGStreamerWebRTC(ws) {
        // Now, stream the file from the Android device using cat
        adbProcess = spawn('adb', [
            'exec-out', 'screenrecord', '--output-format=h264', '-'
        ]);

        const gstPath = '/Library/Frameworks/GStreamer.framework/Versions/Current/bin/gst-launch-1.0';


        gstProcess = spawn(gstPath, [
            'fdsrc', 'fd=0',
            '!', 'h264parse',
            '!', 'avdec_h264',
            '!', 'videoconvert',
            '!', 'videoscale',
            '!', 'video/x-raw,width=1280,height=720',
            '!', 'x264enc', 'tune=zerolatency', 'speed-preset=ultrafast',
            '!', 'rtph264pay', 'config-interval=1', 'pt=96',
            '!', 'application/x-rtp,media=video,encoding-name=H264,payload=96',
            '!', 'webrtcbin', 'name=sendrecv',
            'bundle-policy=max-bundle',
            'stun-server=stun://stun.l.google.com:19302'
        ]);

        console.log("GStreamer Process Spawned.");


        adbProcess.stdout.on('data', (data) => {
            console.log('ADB Output (Partial):', data.toString().slice(0, 100)); // Display first 100 characters
        });

        // Connect the ADB output to GStreamer input
        console.log('Connecting ADB output to GStreamer input...');


        adbProcess.stdout.on('data', (data) => {
            console.log('ADB Output (Bytes):', data.length);


            try {
                const flushed = gstProcess.stdin.write(data);

                if (!flushed) {
                    console.log('GStreamer input buffer is full, pausing ADB data feed...');
                    adbProcess.stdout.pause();

                    gstProcess.stdin.once('drain', () => {
                        console.log('GStreamer input buffer drained, resuming ADB data feed...');
                        adbProcess.stdout.resume();
                    });
                }
            } catch (error) {
                if (error.code === 'EPIPE') {
                    console.error('GStreamer process terminated. Stopping ADB stream to avoid SIGPIPE.');
                    adbProcess.kill();
                } else {
                    console.error('Unexpected error while writing to GStreamer:', error);
                }
            }
        });


        gstProcess.stderr.on('data', (data) => {
            const output = data.toString();
            console.log('GStreamer STDERR:', output);

            // Look for WebRTC offer or ICE candidate messages in GStreamer output

            const sdpOfferMatch = output.match(/sdp-offer:({.*})/);
            const iceCandidateMatch = output.match(/ice-candidate:({.*})/);


            console.log('Sending SDP offer to client...');
            if (sdpOfferMatch) {
                try {
                    console.log('sdpOfferMatch Success', sdpOfferMatch);
                    const sdpOffer = JSON.parse(sdpOfferMatch[1]);
                    ws.send(JSON.stringify({ type: 'offer', sdp: sdpOffer }));
                } catch (e) {
                    console.error('Error parsing SDP offer:', e);
                }
            }


            if (iceCandidateMatch) {
                try {
                    const candidate = JSON.parse(iceCandidateMatch[1]);
                    console.log('Sending ICE candidate to client...', iceCandidateMatch);
                    ws.send(JSON.stringify({ type: 'candidate', candidate }));
                } catch (e) {
                    console.error('Error parsing ICE candidate:', e);
                }
            }

        });


        adbProcess.on('error', (err) => console.error('ADB Error:', err));

        adbProcess.on('exit', (code, signal) => {
            console.log(`ADB Streaming Process exited with code ${code}, signal ${signal}`);
        });


        gstProcess.on('error', (err) => console.error('GStreamer Error:', err));


        gstProcess.on('exit', (code, signal) => {
            console.log(`GStreamer process exited with code ${code}, signal ${signal}`);
            gstProcess = null;


            if (adbProcess) {
                console.log('Killing ADB process due to GStreamer exit...');
                adbProcess.kill();
            }
        });
    }




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
                            executeAdbCommands(message.script, panel);
                        } else {
                            vscode.window.showErrorMessage('No script provided');
                        }
                        break;
                }
            },
            undefined,
            context.subscriptions
        );
        panel.onDidDispose(() => {
            // Clean up resources when panel is closed
            if (gstProcess) {
                gstProcess.kill();
                gstProcess = null;
            }
        });
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
          .left-panel { display: flex; flex-direction: column; border-right: 1px solid #ccc; padding: 10px; width: 50%; }
          .right-panel { display: flex; flex-direction: column; width: 50%; }
          .panel { flex: 1; border-bottom: 1px solid #ccc; padding: 10px; resize: vertical; overflow: auto; min-height: 100px }
          .panel:last-child { border-right: none; }
          button { margin-top: 10px; }
          video { width: 100%; max-height: 80%; background: #fff }
          emulatorLogs { font-family: monospace; font-size: 12px; white-space: pre-wrap; max-height: 150px; overflow: auto; }
      </style>
  </head>
  <body>
      <div class="left-panel">
          <div class="panel">  
              <h3>Test Script Editor</h3>
              <textarea id="script" rows="18" cols="50"></textarea>
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
              <video id="video" autoplay playsinline></video>
              <p id="status">Connecting...</p>
              <pre id="emulatorLogs">Emulator logs will be displayed here...</pre>
          </div>
      </div>
      <script>
          const vscode = acquireVsCodeApi();
          let peerConnection = null;
        
          function logMessage(initiator, message) {
              const logElement = document.getElementById('emulatorLogs');
              const entry = \`[\${initiator}] \${message}\`;
              console.log(entry);
              logElement.textContent += entry + "\\n";
              logElement.scrollTop = logElement.scrollHeight;
          }




          function initWebRTC() {
               logMessage('Script', 'Initializing WebRTC...');
            
              // Create WebRTC peer connection with STUN server
              const configuration = {
                   iceServers: [
                       { urls: 'stun:stun.l.google.com:19302' },
                       { urls: 'stun:stun.stunprotocol.org' }
                  ],
                  sdpSemantics: 'unified-plan'
              };
            
              peerConnection = new RTCPeerConnection(configuration);
            
              // Set up event handlers
              peerConnection.ontrack = (event) => {
                  logMessage('WebRTC', 'Received video track');
                  const videoElement = document.getElementById('video');
                  videoElement.srcObject = event.streams[0];
                  document.getElementById('status').textContent = "Connected to Android device";


                   videoElement.play().catch(e => {
                       logMessage('Video Play', 'Video play error: e.message');
                   });
               };
            
              peerConnection.oniceconnectionstatechange = () => {
                  logMessage('WebRTC', \`ICE connection state: \${peerConnection.iceConnectionState}\`);


                  switch(peerConnection.iceConnectionState) {
                       case 'failed':
                           document.getElementById('status').textContent = "Connection failed";
                           break;
                       case 'closed':
                           document.getElementById('status').textContent = "Connection closed";
                           break;
                   }  
               };
            
              peerConnection.onicecandidate = (event) => {
                  if (event.candidate) {
                      logMessage('WebRTC', 'Sending ICE candidate');
                      ws.send(JSON.stringify({ candidate: event.candidate }));
                  }
              };
            
              // Connect to signaling server
              const ws = new WebSocket('ws://localhost:8080');
            
              ws.onopen = () => {
                  logMessage('WebSocket', 'Connected to signaling server');
              };
            
              ws.onerror = (error) => {
                  logMessage('WebSocket', \`Error: \${error.message}\`);
                  document.getElementById('status').textContent = "Connection error";
              };
            
              ws.onclose = () => {
                  logMessage('WebSocket', 'Disconnected from signaling server');
                  document.getElementById('status').textContent = "Disconnected";
              };
            
              ws.onmessage = async (event) => {
                  try {
                      const msg = JSON.parse(event.data);
                    
                      if (msg.sdp && msg.sdp.type === 'offer') {
                          logMessage('WebRTC', 'Received SDP offer');
                          await peerConnection.setRemoteDescription(new RTCSessionDescription(msg.sdp));
                        
                          logMessage('WebRTC', 'Creating answer');
                          const answer = await peerConnection.createAnswer();
                          await peerConnection.setLocalDescription(answer);
                        
                          logMessage('WebRTC', 'Sending SDP answer');
                          ws.send(JSON.stringify({
                              sdp: peerConnection.localDescription
                          }));
                      } else if (msg.candidate) {
                          logMessage('WebRTC', 'Received ICE candidate');
                          await peerConnection.addIceCandidate(new RTCIceCandidate(msg.candidate));
                      }
                  } catch (e) {
                      logMessage('WebRTC', \`Error processing message: \${e.message}\`);
                  }
              };
          }
        
          // Initialize WebRTC on page load
          initWebRTC();
        
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
                  const logsElement = document.getElementById('logs');
                  logsElement.textContent += message.content + '\\n';
                  logsElement.scrollTop = logsElement.scrollHeight;
              }
          });
      </script>
  </body>
  </html>`;
}


function executeAdbCommands(script, panel) {
    const commands = script.split('\n').filter(cmd => cmd.trim() !== '');
    commands.forEach(command => {
        exec(`adb shell ${command}`, (error, stdout, stderr) => {
            const timestamp = new Date().toISOString();
            if (error) {
                vscode.window.showErrorMessage(`ADB Error: ${stderr}`);
                panel.webview.postMessage({
                    type: 'log',
                    content: `[${timestamp}] Command '${command}' failed: ${stderr}`
                });
            } else {
                panel.webview.postMessage({
                    type: 'log',
                    content: `[${timestamp}] Command '${command}' succeeded\nOutput: ${stdout}`
                });
            }
        });
    });
}






function deactivate() { }


module.exports = { activate, deactivate };
