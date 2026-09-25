import Charts
import SwiftUI

enum ChartRange: String, CaseIterable, Identifiable {
    case h1 = "1H", h6 = "6H", d1 = "1D", all = "ALL"
    var id: String { rawValue }
    var seconds: TimeInterval? {
        switch self { case .h1: 3600; case .h6: 6 * 3600; case .d1: 86_400; case .all: nil }
    }
}

nonisolated struct PricePoint: Identifiable, Hashable {
    var id: Int64 { t }
    let t: Int64
    let price: Double
    var date: Date { Date(timeIntervalSince1970: Double(t) / 1000) }
}

/// Real curve-trade history plus the live spot, drawn with Swift Charts. Touch
/// scrubbing shows a crosshair with the exact trade price; no synthetic points.
struct PriceChart: View {
    let points: [PricePoint]
    let range: ChartRange
    let markers: [(t: Int64, label: String)]
    @State private var selected: PricePoint?

    private var shown: [PricePoint] {
        guard let s = range.seconds else { return points }
        let cutoff = Int64((Date().timeIntervalSince1970 - s) * 1000)
        let inRange = points.filter { $0.t >= cutoff }
        return inRange.count >= 2 ? inRange : Array(points.suffix(2))
    }

    var body: some View {
        let data = shown
        let first = data.first?.price ?? 0
        let last = data.last?.price ?? 0
        let tint = last >= first ? Theme.up : Theme.down
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Text(Format.usd(selected?.price ?? last)).font(.system(size: 22, weight: .heavy, design: .monospaced)).contentTransition(.numericText())
                if let sel = selected { Text(sel.date.formatted(date: .abbreviated, time: .shortened)).font(.system(size: 10, design: .monospaced)).foregroundStyle(Theme.muted) }
                Spacer()
                if first > 0 { Text(Format.pct((last - first) / first * 100)).font(.system(size: 12, weight: .bold, design: .monospaced)).foregroundStyle(tint) }
            }
            if data.count < 2 {
                Text("Not enough trades for a chart yet.").font(.system(size: 12)).foregroundStyle(Theme.muted).frame(height: 180).frame(maxWidth: .infinity)
            } else {
                Chart {
                    ForEach(data) { p in
                        AreaMark(x: .value("Time", p.date), y: .value("Price", p.price))
                            .foregroundStyle(LinearGradient(colors: [tint.opacity(0.28), tint.opacity(0)], startPoint: .top, endPoint: .bottom))
                            .interpolationMethod(.monotone)
                        LineMark(x: .value("Time", p.date), y: .value("Price", p.price))
                            .foregroundStyle(tint).lineStyle(StrokeStyle(lineWidth: 2)).interpolationMethod(.monotone)
                    }
                    ForEach(markers.indices, id: \.self) { i in
                        RuleMark(x: .value("Event", Date(timeIntervalSince1970: Double(markers[i].t) / 1000)))
                            .foregroundStyle(Theme.gold.opacity(0.5)).lineStyle(StrokeStyle(lineWidth: 1, dash: [3, 3]))
                            .annotation(position: .top, alignment: .leading) { Text(markers[i].label).font(.system(size: 8, design: .monospaced)).foregroundStyle(Theme.gold) }
                    }
                    if let sel = selected {
                        RuleMark(x: .value("Selected", sel.date)).foregroundStyle(Theme.foreground.opacity(0.4)).lineStyle(StrokeStyle(lineWidth: 1))
                        PointMark(x: .value("Selected", sel.date), y: .value("Price", sel.price)).foregroundStyle(tint).symbolSize(60)
                    }
                }
                .chartYScale(domain: .automatic(includesZero: false))
                .chartXAxis { AxisMarks(values: .automatic(desiredCount: 4)) { _ in AxisGridLine().foregroundStyle(Theme.border); AxisValueLabel().font(.system(size: 9, design: .monospaced)).foregroundStyle(Theme.muted) } }
                .chartYAxis { AxisMarks(position: .trailing, values: .automatic(desiredCount: 4)) { v in AxisGridLine().foregroundStyle(Theme.border); AxisValueLabel { if let d = v.as(Double.self) { Text(Format.usd(d)).font(.system(size: 9, design: .monospaced)).foregroundStyle(Theme.muted) } } } }
                .chartOverlay { proxy in
                    GeometryReader { geo in
                        Rectangle().fill(.clear).contentShape(.rect)
                            .gesture(DragGesture(minimumDistance: 0)
                                .onChanged { g in
                                    let x = g.location.x - geo[proxy.plotFrame!].origin.x
                                    guard let date: Date = proxy.value(atX: x) else { return }
                                    let nearest = data.min { abs($0.date.timeIntervalSince(date)) < abs($1.date.timeIntervalSince(date)) }
                                    if nearest != selected { selected = nearest; Haptics.light() }
                                }
                                .onEnded { _ in selected = nil })
                    }
                }
                .frame(height: 200)
            }
        }
    }
}
