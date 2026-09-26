@preconcurrency import AVFoundation
import SwiftUI
import UIKit

/// Real AVFoundation capture pipeline (works with the cloud simulator's injected camera via `.external`).
final class CameraService: NSObject, @unchecked Sendable {
    let session = AVCaptureSession()
    private let output = AVCapturePhotoOutput()
    private let queue = DispatchQueue(label: "objectpad.camera")
    private var continuation: CheckedContinuation<Data, Error>?

    enum State { case idle, denied, unavailable, running }

    static func authorize() async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized: return true
        case .notDetermined: return await AVCaptureDevice.requestAccess(for: .video)
        default: return false
        }
    }

    /// Configures and starts the session. Returns false when no camera exists.
    func start() async -> Bool {
        await withCheckedContinuation { cont in
            queue.async { [self] in
                if session.isRunning { cont.resume(returning: true); return }
                var types: [AVCaptureDevice.DeviceType] = [.builtInWideAngleCamera, .builtInDualCamera, .builtInTripleCamera]
                types.append(.external)
                let devices = AVCaptureDevice.DiscoverySession(deviceTypes: types, mediaType: .video, position: .unspecified).devices
                guard let device = devices.first(where: { $0.position == .back }) ?? devices.first, let input = try? AVCaptureDeviceInput(device: device) else { cont.resume(returning: false); return }
                session.beginConfiguration()
                session.sessionPreset = .photo
                if session.canAddInput(input) { session.addInput(input) }
                if session.canAddOutput(output) { session.addOutput(output); output.maxPhotoQualityPrioritization = .balanced }
                session.commitConfiguration()
                session.startRunning()
                cont.resume(returning: session.isRunning)
            }
        }
    }

    func stop() { queue.async { [session] in if session.isRunning { session.stopRunning() } } }

    /// Takes one photo and returns a ≤1600px JPEG.
    func capture() async throws -> Data {
        try await withCheckedThrowingContinuation { cont in
            queue.async { [self] in
                continuation = cont
                let settings = AVCapturePhotoSettings(format: [AVVideoCodecKey: AVVideoCodecType.jpeg])
                settings.photoQualityPrioritization = .balanced
                output.capturePhoto(with: settings, delegate: self)
            }
        }
    }
}

extension CameraService: AVCapturePhotoCaptureDelegate {
    nonisolated func photoOutput(_ output: AVCapturePhotoOutput, didFinishProcessingPhoto photo: AVCapturePhoto, error: Error?) {
        let cont = continuation; continuation = nil
        if let error { cont?.resume(throwing: error); return }
        guard let data = photo.fileDataRepresentation(), let image = UIImage(data: data), let jpeg = image.jpeg(max: 1600, quality: 0.9) else {
            cont?.resume(throwing: ChainError.message("The photo couldn’t be read. Try again.")); return
        }
        cont?.resume(returning: jpeg)
    }
}

struct CameraPreview: UIViewRepresentable {
    let session: AVCaptureSession
    final class PreviewView: UIView {
        override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
        var preview: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
    }
    func makeUIView(context: Context) -> PreviewView {
        let v = PreviewView(); v.preview.session = session; v.preview.videoGravity = .resizeAspectFill; v.backgroundColor = .black; return v
    }
    func updateUIView(_ uiView: PreviewView, context: Context) {}
}
