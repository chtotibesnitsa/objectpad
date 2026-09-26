import SwiftUI

@main
struct TagstockApp: App {
    @State private var account: AccountStore
    @State private var store: AppStore

    init() {
        Typeface.register()
        let account = AccountStore()
        _account = State(initialValue: account)
        _store = State(initialValue: AppStore(account: account))
    }

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environment(account)
                .environment(store)
                .preferredColorScheme(.light)
                .task { Feedback.prepare(); account.start(); store.start() }
        }
    }
}
