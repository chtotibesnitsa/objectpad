import Testing
@testable import Tagstock

struct CryptoTests {
    @Test func keccakMatchesEthereum() {
        #expect(Hex.string(Keccak.hash("")) == "0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470")
        #expect(Keccak.selector("balanceOf(address)") == "0x70a08231")
        #expect(Keccak.selector("claim()") == "0x4e71d92d")
    }

    @Test func bigUIntParsing() {
        #expect(BigUInt.parse("1")?.decimalString == "1000000000000000000")
        #expect(BigUInt.parse("0.015")?.formatUnits(digits: 6) == "0.015")
        #expect(BigUInt(hex: "0xde0b6b3a7640000") == BigUInt.weiPerEth)
        #expect(BigUInt.parse("abc") == nil)
    }

    @Test func deepLinks() {
        #expect(Route.from(url: URL(string: "https://objectpad.fun/rewards/payphone")!) == .reward("payphone"))
        #expect(Route.from(url: URL(string: "https://www.objectpad.fun/burn")!) == .burn)
    }
}
