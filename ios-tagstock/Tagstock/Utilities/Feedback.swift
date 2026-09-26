import AVFoundation
import UIKit

/// Interface sounds (the website's scan/launch cues plus generated UI sounds) and haptics.
/// Sounds respect the silent switch (ambient session) and the in-app sound toggle.
@MainActor
enum Feedback {
    enum Sound: String, CaseIterable {
        case tap = "glass_tap_tick"
        case swoosh = "tab_switch_swoosh"
        case success = "success_chime_sparkle"
        case coins = "coin_cascade_sparkle"
        case error = "soft_error_thud"
        case capture = "sfx_capture"
        case orbit = "sfx_orbit"
        case model = "sfx_model"
        case launch = "sfx_launch"
        case seal = "sfx_seal"
        case handoff = "sfx_handoff"
        case rejected = "sfx_rejected"
        case retry = "sfx_retry"
    }

    private static var players: [Sound: AVAudioPlayer] = [:]
    private static var prepared = false
    private static let light = UIImpactFeedbackGenerator(style: .light)
    private static let soft = UIImpactFeedbackGenerator(style: .soft)
    private static let rigid = UIImpactFeedbackGenerator(style: .rigid)
    private static let notify = UINotificationFeedbackGenerator()
    private static let select = UISelectionFeedbackGenerator()

    static var soundOn: Bool {
        get { UserDefaults.standard.object(forKey: "sound") as? Bool ?? true }
        set { UserDefaults.standard.set(newValue, forKey: "sound") }
    }

    static func prepare() {
        guard !prepared else { return }
        prepared = true
        try? AVAudioSession.sharedInstance().setCategory(.ambient, options: [.mixWithOthers])
        for sound in Sound.allCases {
            guard let url = Bundle.main.url(forResource: sound.rawValue, withExtension: "mp3"), let player = try? AVAudioPlayer(contentsOf: url) else { continue }
            player.prepareToPlay()
            players[sound] = player
        }
    }

    static func play(_ sound: Sound, volume: Float = 0.55) {
        guard soundOn else { return }
        prepare()
        guard let player = players[sound] else { return }
        player.volume = volume
        player.currentTime = 0
        player.play()
    }

    static func tap(sound: Bool = true) {
        light.impactOccurred(intensity: 0.7)
        if sound { play(.tap, volume: 0.22) }
    }
    static func selection() { select.selectionChanged() }
    static func thud() { rigid.impactOccurred() }
    static func softImpact() { soft.impactOccurred() }
    static func success(_ sound: Sound = .success) { notify.notificationOccurred(.success); play(sound) }
    static func warning() { notify.notificationOccurred(.warning); play(.error, volume: 0.4) }
    static func error() { notify.notificationOccurred(.error); play(.error) }
}
