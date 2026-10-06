import Foundation
import KairoIOSHostCore
#if os(macOS)
import AppKit
import WebKit

/// macOS WebKit evidence for the shared local host, explicitly not iOS/device
/// verification. Use one isolated persistent store UUID for seed then reopen.
@MainActor
final class Probe: NSObject, WKNavigationDelegate {
    var server: LoopbackServer?
    var webView: WKWebView?
    var window: NSWindow?
    var finished = false
    let args: [String]
    init(_ args: [String]) { self.args = args }

    func run() {
        if args.count == 2 && args[0] == "--intake-checks" {
            Task { finish(await NativeIntakeChecks.run()) }
            return
        }
#if HOST_CHECKS
        if args.count == 2 && args[0] == "--sync-checks" {
            Task { finish(await NativeSyncChecks.run()) }
            return
        }
#endif
        if args.count == 2 && args[0] == "--checks" {
            Task { finish(await CoreChecks.run()) }
            return
        }
        do {
            guard args.count == 6, let store = UUID(uuidString: args[3]), ["seed", "reopen"].contains(args[4]) else { throw HostError.invalidRequest }
            let root = URL(fileURLWithPath: args[0])
            let catalog = try AssetCatalog(root: root, expectedArtifactSHA256: args[1], expectedManifestSHA256: args[2])
            let server = LoopbackServer(catalog: catalog)
            self.server = server
            let config = WKWebViewConfiguration()
            config.websiteDataStore = WKWebsiteDataStore(forIdentifier: store)
            let webView = WKWebView(frame: NSRect(x: 0, y: 0, width: 390, height: 844), configuration: config)
            webView.navigationDelegate = self
            self.webView = webView
            let window = NSWindow(contentRect: webView.frame, styleMask: [.titled], backing: .buffered, defer: false)
            window.contentView = webView
            self.window = window
            server.start { [weak self] result in
                DispatchQueue.main.async {
                    switch result {
                    case .success: self?.webView?.load(URLRequest(url: HostPolicy.entryURL))
                    case .failure: self?.finish(["status": "failed", "code": "listener-unavailable"])
                    }
                }
            }
            DispatchQueue.main.asyncAfter(deadline: .now() + 45) { [weak self] in self?.finish(["status": "failed", "code": "timeout"]) }
        } catch { finish(["status": "failed", "code": "setup-failed"]) }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        let seed = args[4] == "seed"
        let script = """
        const result = { platform: 'macOS-WebKit', origin: location.origin, secureContext: isSecureContext,
          indexedDB: !!indexedDB, webLocks: !!navigator.locks?.request, phase: phase };
        for (let attempt = 0; attempt < 60 && !localStorage.getItem('kairo-local-record-binding-v1'); attempt++) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
        const binding = localStorage.getItem('kairo-local-record-binding-v1');
        if (phase === 'seed' && binding) localStorage.setItem('kairo-ios-probe-binding', binding);
        result.canonicalProfilePreserved = !!binding && localStorage.getItem('kairo-ios-probe-binding') === binding;
        if (phase === 'seed') localStorage.setItem('kairo-ios-probe', 'durable');
        result.localStorage = localStorage.getItem('kairo-ios-probe') === 'durable';
        const db = await new Promise((resolve, reject) => {
          const open = indexedDB.open('kairo-ios-probe', 1);
          open.onupgradeneeded = () => open.result.createObjectStore('record');
          open.onerror = () => reject(new Error('idb-open'));
          open.onsuccess = () => resolve(open.result);
        });
        if (phase === 'seed') await new Promise((resolve, reject) => {
          const tx = db.transaction('record', 'readwrite'); tx.objectStore('record').put('durable', 'probe');
          tx.oncomplete = resolve; tx.onerror = () => reject(new Error('idb-write'));
        });
        result.indexedDBDurable = await new Promise((resolve, reject) => {
          const request = db.transaction('record').objectStore('record').get('probe');
          request.onsuccess = () => resolve(request.result === 'durable'); request.onerror = reject;
        });
        db.close();
        const identity = await (await fetch('/build-identity.json')).json();
        result.artifactSha256 = identity.artifactSha256;
        const audio = identity.files.find(file => /[.](mp3|m4a|aac|wav)$/.test(file.path));
        const response = await fetch('/' + audio.path, { headers: { Range: 'bytes=0-15' } });
        result.audioRange = response.status === 206 && (await response.arrayBuffer()).byteLength === 16;
        for (let attempt = 0; attempt < 100 && !document.querySelector('#app')?.children.length; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        result.canonicalApp = document.title.includes('KAIRO') && !!document.querySelector('#app')?.children.length;
        result.status = Object.entries(result).every(([key,value]) => typeof value !== 'boolean' || value) ? 'passed' : 'failed';
        return result;
        """
        webView.callAsyncJavaScript(script, arguments: ["phase": seed ? "seed" : "reopen"], in: nil, in: .page) { [weak self] result in
            guard let self else { return }
            switch result {
            case .success(let value):
                let receipt = value as? [String: Any] ?? ["status": "failed", "code": "invalid-result"]
                // Allow WebKit to flush the persistent store before process exit.
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { self.finish(receipt) }
            case .failure(let error):
                let native = error as NSError
                self.finish(["status": "failed", "code": "webkit-evaluation-failed", "errorDomain": native.domain,
                             "errorCode": native.code, "javascriptException": native.userInfo["WKJavaScriptExceptionMessage"] as? String ?? "unavailable"])
            }
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        finish(["status": "failed", "code": "webkit-load-failed"])
    }

    func finish(_ receipt: [String: Any]) {
        guard !finished else { return }; finished = true
        if let data = try? JSONSerialization.data(withJSONObject: receipt, options: [.prettyPrinted, .sortedKeys]) {
            if args.count == 6 || (args.count == 2 && ["--checks", "--sync-checks", "--intake-checks"].contains(args[0])) {
                try? data.write(to: URL(fileURLWithPath: args.last!))
            }
            FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data("\n".utf8))
        }
        server?.stop()
        Darwin.exit(receipt["status"] as? String == "passed" ? 0 : 1)
    }
}

let arguments = Array(CommandLine.arguments.dropFirst())
let probe = Probe(arguments)
if arguments.count == 2 && ["--checks", "--sync-checks", "--intake-checks"].contains(arguments[0]) {
    // CLI checks never create NSApplication, activate an app, or open WebKit.
    DispatchQueue.main.async { probe.run() }
    CFRunLoopRun()
} else {
    let app = NSApplication.shared
    app.setActivationPolicy(.prohibited)
    DispatchQueue.main.async { probe.run() }
    app.run()
}
#else
fatalError("The host probe is a macOS check, not an iOS app target.")
#endif
