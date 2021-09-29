enum UnderLine {
    red,
    black
}

abstract class Trend {
    protected tradeDate!: string;
    protected lastPrice!: number;
    protected underLine!: UnderLine;

    percent(price1: string, price2: string): number {
        const p1 = parseFloat(price1);
        const p2 = parseFloat(price2);
        return (p1 / p2 - 1) * 100;
    }
}

class SecondaryRallyTrend extends Trend { }
class NaturalRallyTrend extends Trend { }
class UpwardTrendTrend extends Trend { }
class DownwardTrendTrend extends Trend { }
class NaturalReactionTrend extends Trend { }
class SecondaryReactionTrend extends Trend { }

interface Rule {
    id: string;
    trend: Trend;
}