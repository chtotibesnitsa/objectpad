package com.rork.tagstock.data

import java.math.BigDecimal
import java.math.BigInteger
import java.text.DecimalFormat
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Number formatting mirroring `web-handlesend/src/lib/format.ts`, `fmtEth`, `fmtUnits`. */
object Format {
    private val two = DecimalFormat("#,##0.00")
    private val integer = DecimalFormat("#,##0")

    fun usd(value: Double, compact: Boolean = false): String {
        if (value.isNaN() || value.isInfinite()) return "$0"
        val abs = Math.abs(value)
        if (compact && abs >= 1_000) return "$" + compactNumber(value, if (abs >= 1_000_000) 2 else 1)
        return when {
            abs == 0.0 -> "$0.00"
            abs < 0.000001 -> "$" + String.format(Locale.US, "%.2e", value)
            abs < 0.01 -> "$" + String.format(Locale.US, "%.6f", value)
            abs < 1 -> "$" + String.format(Locale.US, "%.4f", value)
            else -> "$" + two.format(value)
        }
    }

    fun compactNumber(value: Double, digits: Int = 2): String {
        val abs = Math.abs(value); val sign = if (value < 0) "-" else ""
        return when {
            abs >= 1_000_000_000 -> sign + trim(String.format(Locale.US, "%.${digits}f", abs / 1_000_000_000)) + "B"
            abs >= 1_000_000 -> sign + trim(String.format(Locale.US, "%.${digits}f", abs / 1_000_000)) + "M"
            abs >= 1_000 -> sign + trim(String.format(Locale.US, "%.${digits}f", abs / 1_000)) + "K"
            else -> sign + trim(String.format(Locale.US, "%.2f", abs))
        }
    }

    fun weiToDouble(wei: String?, decimals: Int = 18): Double? {
        val s = wei?.trim() ?: return null
        if (s.isEmpty() || !s.all { it.isDigit() }) return null
        return BigDecimal(BigInteger(s)).movePointLeft(decimals).toDouble()
    }

    fun eth(wei: String?, digits: Int = 4): String {
        val v = weiToDouble(wei) ?: return "0 ETH"
        return trim(String.format(Locale.US, "%.${digits}f", v)) + " ETH"
    }

    fun ethFromDouble(v: Double, digits: Int = 4): String = trim(String.format(Locale.US, "%.${digits}f", v)) + " ETH"

    fun units(units: String?, digits: Int = 4): String {
        val v = weiToDouble(units) ?: return "0"
        return when {
            v >= 1_000_000 -> String.format(Locale.US, "%.2fM", v / 1_000_000)
            v >= 10_000 -> integer.format(Math.floor(v))
            else -> trim(String.format(Locale.US, "%.${digits}f", v))
        }
    }

    fun tokens(amount: Double): String {
        if (amount.isNaN() || amount.isInfinite()) return "0"
        if (Math.abs(amount) >= 1_000_000) return compactNumber(amount)
        return if (amount >= 1000) integer.format(amount) else two.format(amount).removeSuffix(".00")
    }

    fun pct(value: Double, digits: Int = 2): String {
        if (value.isNaN() || value.isInfinite()) return "0%"
        return (if (value > 0) "+" else "") + String.format(Locale.US, "%.${digits}f", value) + "%"
    }

    fun bps(bps: Int?): String = bps?.let { pct(it / 100.0) } ?: "—"

    fun timeAgo(ms: Long): String {
        val s = maxOf(0L, (System.currentTimeMillis() - ms) / 1000)
        if (s < 45) return "just now"
        val m = s / 60; if (m < 60) return "${m}m ago"
        val h = m / 60; if (h < 24) return "${h}h ago"
        val d = h / 24; if (d < 30) return "${d}d ago"
        return SimpleDateFormat("MMM d", Locale.US).format(Date(ms))
    }

    fun shortAddress(a: String): String = if (a.length < 12) a else "${a.take(6)}...${a.takeLast(4)}"

    fun isPositive(wei: String?): Boolean = wei != null && wei.all { it.isDigit() } && wei.any { it != '0' }

    private fun trim(fixed: String): String {
        if (!fixed.contains('.')) return fixed
        return fixed.trimEnd('0').trimEnd('.')
    }
}
