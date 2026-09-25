import SwiftUI

/// Wallet & Portfolio: watch any Robinhood Chain address and read real balances
/// (ETH, CASEPAD, every Casepad-launched coin) straight from the RPC.
/// Signing lives in MetaMask via the website until the native WalletConnect slice ships.
struct WalletView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.openURL) private var openURL
    @State private var input: String = ""
    @State private var invalid = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SectionHead(title: "Portfolio", eyebrow: "Robinhood Chain · id \(Chain.id)")
                if let wallet = store.watchedWallet {
                    connected(wallet)
                } else {
                    connect
                }
                signingCard
            }.padding(16)
        }
        .background(Theme.background)
        .refreshable { await store.refreshBalances() }
    }

    private var connect: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Watch a wallet").font(.system(size: 17, weight: .bold))
            Text("Paste your MetaMask address to see its live ETH, CASEPAD and launched-coin balances from Robinhood Chain. This is read-only; the app never asks for a seed phrase or private key.").font(.system(size: 12)).foregroundStyle(Theme.muted)
            HStack {
                TextField("0x…", text: $input).font(.system(size: 13, design: .monospaced)).textInputAutocapitalization(.never).autocorrectionDisabled()
                    .padding(.horizontal, 12).frame(height: 44).background(Theme.secondary, in: .rect(cornerRadius: 10))
                Button {
                    let v = input.trimmingCharacters(in: .whitespacesAndNewlines)
                    if Chain.isAddress(v) { store.watchedWallet = v.lowercased(); invalid = false; Haptics.success() } else { invalid = true; Haptics.warning() }
                } label: { Text("Watch") }.buttonStyle(PrimaryButtonStyle())
                Button { if let s = UIPasteboard.general.string { input = s } } label: { Image(systemName: "doc.on.clipboard").frame(width: 44, height: 44).background(Theme.secondary, in: .rect(cornerRadius: 10)) }
            }
            if invalid { Text("That is not a valid 0x address.").font(.system(size: 11)).foregroundStyle(Theme.down) }
        }.card(raised: true)
    }

    private func connected(_ wallet: String) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                VStack(alignment: .leading, spacing: 3) {
                    Eyebrow("watching")
                    Text(Format.shortAddress(wallet)).font(.system(size: 16, weight: .bold, design: .monospaced))
                }
                Spacer()
                Button { store.copy(wallet, label: "Address") } label: { Image(systemName: "doc.on.doc") }
                Button { openURL(Chain.addressURL(wallet)) } label: { Image(systemName: "arrow.up.right.square") }
                Button(role: .destructive) { store.watchedWallet = nil } label: { Image(systemName: "xmark.circle") }
            }.foregroundStyle(Theme.foreground)
            Divider().overlay(Theme.border)
            balanceRow("ETH", "Robinhood Chain ETH", store.ethBalance, usd: store.ethUsd)
            balanceRow("CASEPAD", "Official CasePad token", store.casepadBalance, usd: nil)
            if !store.coinBalances.isEmpty {
                Eyebrow("launched coins held")
                ForEach(store.coins.filter { store.coinBalances[$0.token] != nil }) { coin in
                    NavigationLink(value: Route.token(coin.token)) {
                        HStack(spacing: 10) {
                            CoinImage(image: coin.image, ticker: coin.ticker, size: 30)
                            Text("$\(coin.ticker)").font(.system(size: 13, weight: .bold))
                            Spacer()
                            VStack(alignment: .trailing, spacing: 1) {
                                Text(Format.tokens(store.coinBalances[coin.token] ?? 0)).font(.system(size: 13, weight: .semibold, design: .monospaced))
                                if let p = coin.market?.priceUsd { Text(Format.usd(p * (store.coinBalances[coin.token] ?? 0))).font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted) }
                            }
                        }.foregroundStyle(Theme.foreground).padding(.vertical, 6)
                    }
                }
            } else if store.balancesUpdated != nil {
                Text("No Casepad-launched coins held by this wallet.").font(.system(size: 11)).foregroundStyle(Theme.muted)
            }
            HStack { Eyebrow(store.balancesUpdated.map { "balances read \(Format.timeAgo($0)) · rpc.mainnet.chain.robinhood.com" } ?? "reading chain…"); Spacer(); if store.ethUsd > 0 { Eyebrow("ETH \(Format.usd(store.ethUsd)) · casepad backend") } }
        }.card(raised: true)
    }

    private func balanceRow(_ symbol: String, _ label: String, _ amount: Double?, usd: Double?) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) { Text(symbol).font(.system(size: 13, weight: .bold)); Text(label).font(.system(size: 10)).foregroundStyle(Theme.muted) }
            Spacer()
            if let amount {
                VStack(alignment: .trailing, spacing: 2) {
                    Text(Format.tokens(amount) + (symbol == "ETH" ? "" : "")).font(.system(size: 14, weight: .semibold, design: .monospaced))
                    if let usd, usd > 0 { Text(Format.usd(amount * usd)).font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted) }
                }
            } else { ProgressView().controlSize(.small) }
        }.padding(.vertical, 4)
    }

    private var signingCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Eyebrow("signing & account")
            Text("Trades, launches, burns, claims and X linking are signed with MetaMask on casepad.fun. Your account, keys, rewards and vault are the same there and here.").font(.system(size: 12)).foregroundStyle(Theme.muted)
            Button { openURL(URL(string: "https://metamask.app.link/dapp/casepad.fun/portfolio")!) } label: { Label("Open casepad.fun in MetaMask", systemImage: "arrow.up.right").frame(maxWidth: .infinity) }.buttonStyle(PrimaryButtonStyle())
            Button { openURL(URL(string: "https://casepad.fun/portfolio")!) } label: { Label("Open in Safari", systemImage: "safari").frame(maxWidth: .infinity) }.buttonStyle(SecondaryButtonStyle())
            Text("Native in-app signing (WalletConnect) and the X-linked account session are the next slice; nothing here pretends a transaction happened.").font(.system(size: 10)).foregroundStyle(Theme.muted)
        }.card()
    }
}

/// Launch flow: real terms from the Pons factory and the exact website steps.
/// Submission requires a signature, so the final step hands off to MetaMask.
struct LaunchView: View {
    @Environment(AppStore.self) private var store
    @Environment(\.openURL) private var openURL
    @State private var name = ""
    @State private var ticker = ""
    @State private var description = ""
    @State private var website = ""
    @State private var twitter = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                SectionHead(title: "Launch a coin", eyebrow: "Pons V2 · 1B supply · graduates at 4.2 ETH")
                VStack(alignment: .leading, spacing: 10) {
                    field("Name", $name, "e.g. Third Coin")
                    field("Ticker", $ticker, "THIRD").textInputAutocapitalization(.characters)
                    field("Description", $description, "What is this coin about?")
                    field("Website (optional)", $website, "https://")
                    field("X (optional)", $twitter, "https://x.com/…")
                }.card(raised: true)
                VStack(alignment: .leading, spacing: 8) {
                    Eyebrow("what you get")
                    bullet("Its own isolated treasury address, funded by trade fees.")
                    bullet("Cases funded in this coin; holders burn it for keys.")
                    bullet(String(format: "%.1f%% creator payout on every trade, paid automatically to the launching wallet.", Double(store.status?.contribution.devBps ?? 50) / 100))
                    bullet("1% Pons curve fee. Launch fee is read live from the factory at signing time.")
                }.card()
                let valid = !name.trimmingCharacters(in: .whitespaces).isEmpty && ticker.count >= 2 && ticker.count <= 10
                Button {
                    var c = URLComponents(string: "https://casepad.fun/launch")!
                    c.queryItems = [URLQueryItem(name: "name", value: name), URLQueryItem(name: "ticker", value: ticker.uppercased()), URLQueryItem(name: "description", value: description), URLQueryItem(name: "website", value: website), URLQueryItem(name: "twitter", value: twitter)].filter { !($0.value ?? "").isEmpty }
                    let path = c.url!.absoluteString.replacingOccurrences(of: "https://", with: "")
                    openURL(URL(string: "https://metamask.app.link/dapp/\(path)")!)
                } label: { Label("Continue in MetaMask to sign", systemImage: "signature").frame(maxWidth: .infinity) }.buttonStyle(PrimaryButtonStyle()).disabled(!valid).opacity(valid ? 1 : 0.5)
                Text("Your details are carried into the website's launch form where the image upload, live launch-fee quote and `launchAndBuy` signature happen. A coin is only shown as launched once the chain and indexer confirm it.").font(.system(size: 10)).foregroundStyle(Theme.muted)
            }.padding(16)
        }.background(Theme.background)
    }
    private func field(_ label: String, _ text: Binding<String>, _ placeholder: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Eyebrow(label)
            TextField(placeholder, text: text).font(.system(size: 14)).padding(.horizontal, 12).frame(height: 44).background(Theme.secondary, in: .rect(cornerRadius: 10)).autocorrectionDisabled()
        }
    }
    private func bullet(_ s: String) -> some View { HStack(alignment: .top, spacing: 8) { Circle().fill(Theme.gold).frame(width: 5, height: 5).padding(.top, 6); Text(s).font(.system(size: 12)).foregroundStyle(Theme.muted) } }
}
