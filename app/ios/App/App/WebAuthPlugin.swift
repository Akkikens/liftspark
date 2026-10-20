import Foundation
import Capacitor
import AuthenticationServices

/**
 * OAuth sign-in for Strava, WHOOP and Oura through ASWebAuthenticationSession (the system's
 * secure sign-in sheet, sharing Safari's cookies). JS name "WebAuth".
 *
 *   const { url } = await WebAuth.authenticate({ url: 'https://…/authorize?…', scheme: 'liftspark' })
 *
 * Resolves with the callback URL (liftspark://oauth/<provider>?code=…); the code is exchanged for
 * tokens on the backend, which holds the client secrets.
 */
@objc(WebAuthPlugin)
public class WebAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "WebAuthPlugin"
    public let jsName = "WebAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authenticate", returnType: CAPPluginReturnPromise),
    ]

    private var session: ASWebAuthenticationSession?

    @objc func authenticate(_ call: CAPPluginCall) {
        guard let s = call.getString("url"), let url = URL(string: s) else { call.reject("url is required"); return }
        let scheme = call.getString("scheme") ?? "liftspark"
        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { callback, error in
                self.session = nil
                if let callback { call.resolve(["url": callback.absoluteString]); return }
                if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin {
                    call.reject("cancelled", "cancelled"); return
                }
                call.reject(error?.localizedDescription ?? "Sign-in failed")
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() { call.reject("Couldn't open the sign-in sheet") }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }
}
