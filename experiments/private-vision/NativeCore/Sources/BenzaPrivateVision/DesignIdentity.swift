import Foundation

public enum BenzaDesign: String, Sendable {
    case americanEagle = "american_eagle" // legacy broad ID accepted for compatibility
    case americanSilverEagle = "american_silver_eagle"
    case americanGoldEagle = "american_gold_eagle"
    case americanPlatinumEagle = "american_platinum_eagle"
    case americanPalladiumEagle = "american_palladium_eagle"
    case americanBuffalo = "american_buffalo"
    case canadianMapleLeaf = "canadian_maple_leaf"
    case britannia = "britannia"
    case philharmonic = "philharmonic"
    case kangaroo = "kangaroo"
    case lunar = "lunar"
    case panda = "panda"
    case libertad = "libertad"
    case krugerrand = "krugerrand"
    case kookaburra = "kookaburra"
    case koala = "koala"
    case noahsArk = "noahs_ark"
    case somaliElephant = "somali_elephant"
    case platinumNoble = "platinum_noble"
    case palladiumBallerina = "palladium_ballerina"
    case morganDollar = "morgan_dollar"
    case peaceDollar = "peace_dollar"
    case walkingLibertyHalfDollar = "walking_liberty_half_dollar"
    case genericCoin = "generic_coin"
    case genericBar = "generic_bar"
    case genericRound = "generic_round"
    case unknown
}

public struct BenzaDesignIdentity: Sendable {
    public let design: BenzaDesign
    // This type intentionally cannot supply metal, weight or holding fields.
    public var canCreateHolding: Bool { false }
    public var requiresIndependentSpecifications: Bool { design != .unknown }

    public enum ParseError: Error { case invalidResponse }

    public static func parse(_ reply: String) throws -> BenzaDesignIdentity {
        guard reply.utf8.count <= 1024 else { throw ParseError.invalidResponse }
        var text = reply.trimmingCharacters(in: .whitespacesAndNewlines)
        if text.hasPrefix("```json\n"), text.hasSuffix("\n```") {
            text = String(text.dropFirst(8).dropLast(4)).trimmingCharacters(in: .whitespacesAndNewlines)
        }
        // Exact one-field grammar rejects duplicate keys and escaped/injected IDs.
        let pattern = #"\A\s*\{\s*"design_id"\s*:\s*"(american_eagle|american_silver_eagle|american_gold_eagle|american_platinum_eagle|american_palladium_eagle|american_buffalo|canadian_maple_leaf|britannia|philharmonic|kangaroo|lunar|panda|libertad|krugerrand|kookaburra|koala|noahs_ark|somali_elephant|platinum_noble|palladium_ballerina|morgan_dollar|peace_dollar|walking_liberty_half_dollar|generic_coin|generic_bar|generic_round|unknown)"\s*\}\s*\z"#
        let expression = try NSRegularExpression(pattern: pattern)
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        guard let match = expression.firstMatch(in: text, range: range),
              let idRange = Range(match.range(at: 1), in: text),
              let design = BenzaDesign(rawValue: String(text[idRange])) else {
            throw ParseError.invalidResponse
        }
        return BenzaDesignIdentity(design: design)
    }
}
