package com.objectpad.app.ui

import java.text.NumberFormat
import java.util.Locale
import kotlin.math.abs
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.pow
import kotlin.math.roundToLong

/** Display helpers, identical in behaviour to `web-handlesend/src/lib/format.ts`. Nothing is estimated here. */
object Fmt {
    private val subs = "₀₁₂₃₄₅₆₇₈₉"

    fun usd(value: Double?, digits: Int = 2): String {
        if (value == null || !value.isFinite()) return "—"
        val a = abs(value)
        return when {
            a >= 1e9 -> "$%.2fB".format(Locale.US, value / 1e9)
            a >= 1e6 -> "$%.2fM".format(Locale.US, value / 1e6)
            a >= 1e4 -> "$%.1fK".format(Locale.US, value / 1e3)
            a >= 1 -> "$" + NumberFormat.getNumberInstance(Locale.US).apply { maximumFractionDigits = digits }.format(value)
            else -> tinyUsd(value)
        }
    }

    /** Tiny token prices with a subscript zero count: $0.0₅412. */
    fun tinyUsd(value: Double): String {
        if (!value.isFinite() || value <= 0) return "$0"
        if (value >= 0.01) return "$%.4f".format(Locale.US, value)
        val zeros = floor(-log10(value)).toInt()
        val digits = (value * 10.0.pow(zeros + 3)).roundToLong().toString().take(3)
        return "$0.0" + (zeros - 1).toString().map { subs[it.digitToInt()] }.joinToString("") + digits
    }

    fun eth(value: Double?, digits: Int = 4): String {
        if (value == null || !value.isFinite()) return "—"
        if (value == 0.0) return "0 ETH"
        if (value < 10.0.pow(-digits)) return "<${10.0.pow(-digits).toBigDecimal().stripTrailingZeros().toPlainString()} ETH"
        return NumberFormat.getNumberInstance(Locale.US).apply { maximumFractionDigits = digits }.format(value) + " ETH"
    }

    fun money(ethValue: Double?, ethUsd: Double?, digits: Int = 4): String = if (ethValue == null) "…" else if (ethUsd != null && ethUsd > 0) usd(ethValue * ethUsd) else eth(ethValue, digits)

    fun price(ethValue: Double, ethUsd: Double?): String = if (ethUsd != null && ethUsd > 0) tinyUsd(ethValue * ethUsd) else priceEth(ethValue)

    fun priceEth(eth: Double): String {
        if (eth == 0.0) return "—"
        if (eth >= 0.0001) return "%.3g ETH".format(Locale.US, eth)
        val e = floor(log10(eth)).toInt(); return "%.2fe%d ETH".format(Locale.US, eth / 10.0.pow(e), e)
    }

    fun pct(value: Double?): String {
        if (value == null || !value.isFinite()) return "—"
        val sign = if (value > 0) "+" else ""
        return sign + (if (abs(value) >= 100) "%.0f" else "%.1f").format(Locale.US, value) + "%"
    }

    fun compact(value: Double): String {
        if (!value.isFinite()) return "—"
        val a = abs(value)
        return when {
            a >= 1e12 -> "%.1fT".format(Locale.US, value / 1e12)
            a >= 1e9 -> "%.1fB".format(Locale.US, value / 1e9)
            a >= 1e6 -> "%.1fM".format(Locale.US, value / 1e6)
            a >= 1e4 -> "%.1fK".format(Locale.US, value / 1e3)
            else -> NumberFormat.getNumberInstance(Locale.US).apply { maximumFractionDigits = if (a < 1) 4 else 1 }.format(value)
        }
    }

    fun short(value: String?, lead: Int = 6, tail: Int = 4): String {
        if (value.isNullOrEmpty()) return "—"
        return if (value.length > lead + tail + 1) "${value.take(lead)}…${value.takeLast(tail)}" else value
    }

    fun timeAgo(at: Long, now: Long = System.currentTimeMillis()): String {
        val s = max(0L, (now - at) / 1000)
        if (s < 60) return "${s}s ago"
        val m = (s + 30) / 60; if (m < 60) return "${m}m ago"
        val h = (m + 30) / 60; if (h < 48) return "${h}h ago"
        return "${(h + 12) / 24}d ago"
    }

    fun clock(ms: Long): String { val s = max(0L, ms / 1000); return "%d:%02d".format(s / 60, s % 60) }
}
