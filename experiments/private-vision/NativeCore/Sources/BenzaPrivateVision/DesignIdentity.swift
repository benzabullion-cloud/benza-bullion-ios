import Foundation

public enum BenzaDesign: String, Sendable {
    case americanEagle = "american_eagle"
    case walkingLibertyHalfDollar = "walking_liberty_half_dollar"
    case canadianMapleLeaf = "canadian_maple_leaf"
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
        let pattern = #"\A\s*\{\s*"design_id"\s*:\s*"(american_eagle|walking_liberty_half_dollar|canadian_maple_leaf|unknown)"\s*\}\s*\z"#
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
