import Foundation
import Capacitor
import AVFoundation
import Vision
import UIKit

/**
 * Barcode and QR scanning with Apple's own frameworks (AVFoundation live, Vision for a picture), in
 * place of Google ML Kit: no third-party SDK, and it builds for every simulator. JS name "Scanner".
 *
 *   scan()              → { value, format } | { cancelled: true }   full-screen camera, first code wins
 *   readImage({ path }) → { value, format } | {}                    a picture already on the phone
 */
@objc(ScannerPlugin)
public class ScannerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "ScannerPlugin"
    public let jsName = "Scanner"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "scan", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readImage", returnType: CAPPluginReturnPromise),
    ]


    @objc func scan(_ call: CAPPluginCall) {
        let start = {
            DispatchQueue.main.async {
                let vc = ScannerViewController()
                vc.onResult = { value, format in
                    vc.dismiss(animated: true)
                    if let value { call.resolve(["value": value, "format": format ?? ""]) } else { call.resolve(["cancelled": true]) }
                }
                vc.modalPresentationStyle = .fullScreen
                self.bridge?.viewController?.present(vc, animated: true)
            }
        }
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: start()
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { ok in ok ? start() : call.reject("permission-denied", "permission") }
        default: call.reject("permission-denied", "permission")
        }
    }

    @objc func readImage(_ call: CAPPluginCall) {
        guard let path = call.getString("path"), let url = URL(string: path) ?? URL(fileURLWithPath: path) as URL?,
              let image = UIImage(contentsOfFile: url.path)?.cgImage else { call.reject("Couldn't open the image"); return }
        let req = VNDetectBarcodesRequest { req, _ in
            let best = (req.results as? [VNBarcodeObservation])?.first { $0.payloadStringValue?.isEmpty == false }
            if let best { call.resolve(["value": best.payloadStringValue!, "format": best.symbology.rawValue]) } else { call.resolve([:]) }
        }
        DispatchQueue.global(qos: .userInitiated).async {
            do { try VNImageRequestHandler(cgImage: image).perform([req]) } catch { call.resolve([:]) }
        }
    }
}

final class ScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    var onResult: ((String?, String?) -> Void)?
    private let session = AVCaptureSession()
    private var done = false

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        if let device = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) {
            session.addInput(input)
            let out = AVCaptureMetadataOutput()
            if session.canAddOutput(out) {
                session.addOutput(out)
                out.setMetadataObjectsDelegate(self, queue: .main)
                let wanted: [AVMetadataObject.ObjectType] = [.ean13, .ean8, .upce, .code128, .code39, .qr, .dataMatrix, .pdf417, .aztec, .itf14]
                out.metadataObjectTypes = wanted.filter { out.availableMetadataObjectTypes.contains($0) }
            }
            let preview = AVCaptureVideoPreviewLayer(session: session)
            preview.videoGravity = .resizeAspectFill
            preview.frame = view.bounds
            view.layer.addSublayer(preview)
        } else {
            let label = UILabel()
            label.text = "No camera available"
            label.textColor = .white
            label.translatesAutoresizingMaskIntoConstraints = false
            view.addSubview(label)
            NSLayoutConstraint.activate([label.centerXAnchor.constraint(equalTo: view.centerXAnchor), label.centerYAnchor.constraint(equalTo: view.centerYAnchor)])
        }
        let frame = UIView()
        frame.layer.borderColor = UIColor(red: 1, green: 0.42, blue: 0.17, alpha: 1).cgColor
        frame.layer.borderWidth = 3
        frame.layer.cornerRadius = 18
        frame.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(frame)
        let close = UIButton(type: .system)
        close.setTitle("Cancel", for: .normal)
        close.setTitleColor(.white, for: .normal)
        close.titleLabel?.font = .systemFont(ofSize: 18, weight: .semibold)
        close.addTarget(self, action: #selector(cancel), for: .touchUpInside)
        close.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(close)
        NSLayoutConstraint.activate([
            frame.centerXAnchor.constraint(equalTo: view.centerXAnchor), frame.centerYAnchor.constraint(equalTo: view.centerYAnchor),
            frame.widthAnchor.constraint(equalTo: view.widthAnchor, multiplier: 0.78), frame.heightAnchor.constraint(equalTo: frame.widthAnchor, multiplier: 0.6),
            close.centerXAnchor.constraint(equalTo: view.centerXAnchor), close.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
        ])
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        DispatchQueue.global(qos: .userInitiated).async { self.session.startRunning() }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        session.stopRunning()
    }

    @objc private func cancel() { finish(nil, nil) }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput objects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard let code = objects.compactMap({ $0 as? AVMetadataMachineReadableCodeObject }).first(where: { $0.stringValue?.isEmpty == false }) else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        finish(code.stringValue, code.type.rawValue)
    }

    private func finish(_ value: String?, _ format: String?) {
        guard !done else { return }
        done = true
        onResult?(value, format)
    }
}
