import Testing
@testable import Tagstock

struct FormatTests {
    @Test func weiToEthMatchesWebsite() {
        #expect(Format.eth("64350000000000000", digits: 4) == "0.0643 ETH")
        #expect(Format.eth("1000000000000000000") == "1 ETH")
        #expect(Format.units("1847523414000000000000000") == "1.85M")
    }

    @Test func hexQuantities() {
        #expect(Wei.hexToDouble("0xde0b6b3a7640000") == 1.0)
        #expect(Wei.hexToDouble("0x1", decimals: 0) == 1)
    }

    @Test func addresses() {
        #expect(Chain.isAddress("0x03de80661ac0766ad1da66e024b9e4cc91af407a"))
        #expect(!Chain.isAddress("0x03de"))
        #expect(Format.shortAddress("0x03de80661ac0766ad1da66e024b9e4cc91af407a") == "0x03de...407a")
    }

    @Test func deepLinks() {
        #expect(Route.from(url: URL(string: "https://casepad.fun/token/0x03de80661ac0766ad1da66e024b9e4cc91af407a")!) == .token("0x03de80661ac0766ad1da66e024b9e4cc91af407a"))
        #expect(Route.from(url: URL(string: "https://casepad.fun/transactions")!) == .transactions)
    }
}
